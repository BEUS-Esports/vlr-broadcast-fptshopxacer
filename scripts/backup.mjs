import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import sqlite from 'node:sqlite';
import { fileURLToPath } from 'node:url';

// Node 26 renamed DatabaseSync to Database; the project's Node 24 typings retain the old name.
const { Database, backup } =
	/** @type {typeof sqlite & { Database: typeof sqlite.DatabaseSync }} */ (sqlite);

/** @param {import('node:crypto').BinaryLike} bytes */
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
/** @param {string} parent @param {string} child */
const inside = (parent, child) => {
	const path = relative(parent, child);
	return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`));
};

/** @param {unknown} error @param {string} code */
function hasCode(error, code) {
	return error instanceof Error && 'code' in error && error.code === code;
}

/** @param {string} path */
async function optionalFile(path) {
	try {
		return await readFile(path);
	} catch (error) {
		if (hasCode(error, 'ENOENT')) return null;
		throw error;
	}
}

/** @param {string} directory @returns {Promise<string[]>} */
async function filesIn(directory) {
	const paths = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile()))
			throw new Error('Asset/build stores must contain regular files and directories, not links.');
		if (entry.isDirectory()) paths.push(...(await filesIn(path)));
		else paths.push(path);
	}
	return paths.sort();
}

/** @param {string} cwd @param {string[]} args */
function git(cwd, args) {
	try {
		return execFileSync('git', args, {
			cwd,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
			windowsHide: true
		}).trim();
	} catch {
		return null;
	}
}

/**
 * The acknowledgement is an operator assertion: this command never stops the live app.
 * @param {{ output?: string, appStopped: boolean, env?: NodeJS.ProcessEnv, cwd?: string }} options
 */
export async function createBackup({ output, appStopped, env = process.env, cwd = process.cwd() }) {
	if (!appStopped) throw new Error('Stop the application first, then supply --app-stopped.');
	if (!output) throw new Error('Supply --output <new-directory>.');
	const url = env.DATABASE_URL;
	if (!url?.startsWith('file:') || url.includes(':memory:') || /[?#]/.test(url))
		throw new Error('DATABASE_URL must be a local file: SQLite database without query parameters.');
	const databasePath = url.startsWith('file://') ? fileURLToPath(url) : resolve(cwd, url.slice(5));
	await lstat(databasePath); // Never create an empty source database by accident.
	const assetPath = resolve(cwd, env.ASSET_DIR ?? 'data/assets');
	let assetRoot;
	try {
		assetRoot = await realpath(assetPath);
		if (!(await lstat(assetPath)).isDirectory()) throw new Error('Not a directory');
	} catch {
		throw new Error(
			'Asset store is missing or is not a directory. Verify ASSET_DIR; create an empty store only if no artwork exists.'
		);
	}
	const target = resolve(cwd, output);
	const targetParent = await realpath(dirname(target));
	const resolvedTarget = join(targetParent, relative(dirname(target), target));
	if (inside(assetRoot, resolvedTarget))
		throw new Error('Backup destination must be outside the asset store.');
	const keyPath = resolve(cwd, env.SETTINGS_ENCRYPTION_KEY_FILE ?? 'data/settings.key');
	let resolvedKey = keyPath;
	try {
		resolvedKey = await realpath(keyPath);
	} catch (error) {
		if (!hasCode(error, 'ENOENT')) throw error;
	}
	if (inside(assetRoot, resolvedKey))
		throw new Error('The encryption key must be stored separately, outside the asset store.');
	const assetFiles = await filesIn(assetRoot);
	const environmentKey = Boolean(env.SETTINGS_ENCRYPTION_KEY);
	const keyExists = environmentKey || (await optionalFile(keyPath)) !== null;
	const encryption = {
		source: environmentKey ? 'environment' : 'file',
		included: false,
		available: keyExists,
		...(environmentKey ? {} : { file: keyPath }),
		instructions: environmentKey
			? 'Protect the active SETTINGS_ENCRYPTION_KEY separately and supply the same value on restore. Its value is not included.'
			: `${keyExists ? 'Protect' : 'MISSING: locate and protect'} the active encryption key file separately; restore it before starting the app. This backup alone cannot decrypt saved secrets.`
	};
	try {
		await mkdir(target, { mode: 0o700 });
	} catch (error) {
		if (hasCode(error, 'EEXIST'))
			throw new Error(
				'Backup output must be a new directory; existing destinations are never overwritten.',
				{ cause: error }
			);
		throw error;
	}
	await writeFile(
		join(target, 'INCOMPLETE'),
		'Do not restore this backup unless manifest.json exists and complete is true.\n'
	);
	const source = new Database(databasePath, { readOnly: true });
	let schema;
	let migrations;
	try {
		schema = source
			.prepare(
				"SELECT name, type, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY name"
			)
			.all();
		migrations = schema.some((entry) => entry.name === '__drizzle_migrations')
			? source.prepare('SELECT * FROM __drizzle_migrations ORDER BY id').all()
			: [];
		await backup(source, join(target, 'database.db'));
	} finally {
		source.close();
	}
	const files = [];
	await mkdir(join(target, 'assets'));
	for (const path of assetFiles) {
		const assetRelative = relative(assetRoot, path);
		const destination = join(target, 'assets', assetRelative);
		await mkdir(dirname(destination), { recursive: true });
		await copyFile(path, destination);
		files.push({
			path: `assets/${assetRelative.split(sep).join('/')}`,
			sha256: hash(await readFile(destination))
		});
	}
	files.unshift({ path: 'database.db', sha256: hash(await readFile(join(target, 'database.db'))) });
	const packageFile = await optionalFile(join(cwd, 'package.json'));
	const pkg = packageFile ? JSON.parse(packageFile.toString('utf8')) : {};
	const lock = await optionalFile(join(cwd, 'pnpm-lock.yaml'));
	const buildIndex = await optionalFile(join(cwd, 'build/index.js'));
	let buildHash = null;
	if (buildIndex) {
		const buildFiles = await filesIn(join(cwd, 'build'));
		const digest = createHash('sha256');
		for (const path of buildFiles)
			digest
				.update(relative(join(cwd, 'build'), path).split(sep).join('/'))
				.update('\0')
				.update(await readFile(path))
				.update('\0');
		buildHash = digest.digest('hex');
	}
	const manifest = {
		version: 1,
		complete: true,
		createdAt: new Date().toISOString(),
		runtime: { node: process.version, packageManager: pkg.packageManager ?? null },
		build: {
			commit: git(cwd, ['rev-parse', 'HEAD']),
			dirty: git(cwd, ['status', '--porcelain']) !== '',
			sha256: buildHash,
			lockSha256: lock ? hash(lock) : null
		},
		schema,
		migrations,
		files,
		encryption
	};
	await writeFile(join(target, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', {
		flag: 'wx'
	});
	return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		const args = process.argv.slice(2).filter((value) => value !== '--');
		let output;
		let appStopped = false;
		for (let index = 0; index < args.length; index++) {
			if (args[index] === '--app-stopped') appStopped = true;
			else if (args[index] === '--output' && args[index + 1] && !args[index + 1].startsWith('--'))
				output = args[++index];
			else throw new Error('Usage: pnpm backup -- --output <new-directory> --app-stopped');
		}
		if (!output) throw new Error('Supply --output <new-directory>.');
		const result = await createBackup({ output, appStopped });
		console.log(`Backup complete: ${resolve(output)}\n${result.encryption.instructions}`);
	} catch (error) {
		console.error(
			`Backup failed: ${error instanceof Error ? error.message : 'Unknown error'}. No complete backup was declared.`
		);
		process.exitCode = 1;
	}
}
