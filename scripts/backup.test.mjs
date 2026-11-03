import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Database } from 'node:sqlite';
import { test } from 'node:test';
import { createBackup } from './backup.mjs';

async function fixture(t) {
	const cwd = await mkdtemp(join(tmpdir(), 'vlr backup '));
	await mkdir(join(cwd, 'artwork store'));
	await writeFile(join(cwd, 'artwork store', 'team.svg'), '<svg>saved artwork</svg>');
	await writeFile(join(cwd, 'separate.key'), Buffer.alloc(32, 7).toString('base64'));
	const db = new Database(join(cwd, 'event data.db'));
	db.exec(
		"PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE event (name TEXT); INSERT INTO event VALUES ('saved event');"
	);
	t.after(async () => {
		db.close();
		assert.ok(cwd.startsWith(join(tmpdir(), 'vlr backup ')));
		await rm(cwd, { recursive: true, force: true, maxRetries: 5 });
	});
	return {
		cwd,
		db,
		options: {
			cwd,
			output: join(cwd, 'new backup'),
			appStopped: true,
			env: {
				DATABASE_URL: 'file:event data.db',
				ASSET_DIR: 'artwork store',
				SETTINGS_ENCRYPTION_KEY_FILE: 'separate.key'
			}
		}
	};
}

test('backs up committed WAL data and assets with spaces, without the separate key', async (t) => {
	const { cwd, options } = await fixture(t);
	assert.ok((await readFile(join(cwd, 'event data.db-wal'))).length > 0);
	const manifest = await createBackup(options);
	const restored = new Database(join(options.output, 'database.db'), { readOnly: true });
	try {
		assert.equal(restored.prepare('SELECT name FROM event').get().name, 'saved event');
	} finally {
		restored.close();
	}
	assert.equal(
		await readFile(join(options.output, 'assets', 'team.svg'), 'utf8'),
		'<svg>saved artwork</svg>'
	);
	assert.equal(manifest.complete, true);
	assert.equal(manifest.runtime.node, process.version);
	assert.equal(manifest.encryption.source, 'file');
	assert.equal(manifest.encryption.included, false);
	assert.match(manifest.encryption.instructions, /separate/i);
	await assert.rejects(access(join(options.output, 'separate.key')));
	assert.ok(manifest.schema.some((table) => table.name === 'event'));
	assert.ok(
		manifest.files.some((file) => file.path === 'database.db' && file.sha256.length === 64)
	);
	assert.doesNotMatch(JSON.stringify(manifest), new RegExp(Buffer.alloc(32, 7).toString('base64')));
});

test('requires stopped-app acknowledgement and refuses existing destinations', async (t) => {
	const { options } = await fixture(t);
	await assert.rejects(createBackup({ ...options, appStopped: false }), /--app-stopped/);
	await mkdir(options.output);
	await writeFile(join(options.output, 'keep'), 'untouched');
	await assert.rejects(createBackup(options), /new directory/i);
	assert.equal(await readFile(join(options.output, 'keep'), 'utf8'), 'untouched');
});

test('reports missing assets and missing encryption roots without packaging secrets', async (t) => {
	const { options } = await fixture(t);
	await assert.rejects(
		createBackup({ ...options, env: { ...options.env, ASSET_DIR: 'missing' } }),
		/asset/i
	);
	const manifest = await createBackup({
		...options,
		env: { ...options.env, SETTINGS_ENCRYPTION_KEY_FILE: 'missing.key' }
	});
	assert.equal(manifest.encryption.available, false);
	assert.match(manifest.encryption.instructions, /missing/i);
	assert.equal(manifest.encryption.included, false);
});

test('records environment-key recovery instructions without recording its value', async (t) => {
	const { options } = await fixture(t);
	const secret = Buffer.alloc(32, 8).toString('base64');
	const manifest = await createBackup({
		...options,
		env: { ...options.env, SETTINGS_ENCRYPTION_KEY: secret }
	});
	assert.equal(manifest.encryption.source, 'environment');
	assert.match(manifest.encryption.instructions, /SETTINGS_ENCRYPTION_KEY/);
	assert.equal(JSON.stringify(manifest).includes(secret), false);
});

test('refuses keys or destinations inside the asset store', async (t) => {
	const { cwd, options } = await fixture(t);
	await assert.rejects(
		createBackup({ ...options, output: join(cwd, 'artwork store', 'backup') }),
		/asset store/i
	);
	await assert.rejects(
		createBackup({
			...options,
			env: { ...options.env, SETTINGS_ENCRYPTION_KEY_FILE: 'artwork store/team.svg' }
		}),
		/key.*asset/i
	);
});

test('failed database copy never leaves a complete manifest', async (t) => {
	const { cwd, options } = await fixture(t);
	await writeFile(join(cwd, 'invalid.db'), 'not a database');
	await assert.rejects(
		createBackup({ ...options, env: { ...options.env, DATABASE_URL: 'file:invalid.db' } })
	);
	await assert.rejects(access(join(options.output, 'manifest.json')));
});
