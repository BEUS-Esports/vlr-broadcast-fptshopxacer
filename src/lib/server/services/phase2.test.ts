import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { eq } from 'drizzle-orm';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import * as schema from '#lib/server/db/schema/index.ts';
import { removeTestDatabase } from '#lib/server/testing/management-fixture.ts';

it('validates uploads, protects references, and refreshes resources without changing IDs or local images', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'vlr-phase2-'));
	const previousAssetDir = process.env.ASSET_DIR;
	process.env.ASSET_DIR = join(directory, 'assets');
	const client = createClient({ url: `file:${join(directory, 'app.db')}` });
	try {
		const database = drizzle(client, { schema });
		await migrate(database, { migrationsFolder: join(process.cwd(), 'drizzle') });
		vi.doMock('#lib/server/db/index.ts', () => ({ db: database }));
		const { saveUpload, readAsset } = await import('#lib/server/assets.ts');
		const { saveTeam, savePlayer, removeProfile } = await import('./profiles.ts');
		const { saveResource, removeResource, refreshCatalogue } = await import('./resources.ts');
		const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
		await expect(saveUpload(new File([], ''))).resolves.toBeNull();
		await expect(
			saveUpload(new File(['<svg/>'], 'fake.png', { type: 'image/png' }))
		).rejects.toMatchObject({ code: 'invalid' });
		await expect(readAsset('../app.db')).rejects.toMatchObject({ code: 'not-found' });
		const logoPath = await saveUpload(new File([png], 'logo.png', { type: 'image/png' }));
		expect(logoPath).toMatch(/^\/assets\/[0-9a-f-]+\.png$/);
		expect((await readAsset(logoPath!.split('/').at(-1)!)).bytes).toEqual(Buffer.from(png));

		const team = await saveTeam({ name: 'Sample Team', tag: 'ST', logoPath });
		const player = await savePlayer({ displayName: 'Alpha', fullName: '', riotId: '' });
		await expect(
			saveTeam({ id: team.id, revision: 0, name: 'Wrong', tag: 'W' })
		).rejects.toMatchObject({ code: 'invalid' });
		await database.insert(schema.tournaments).values({ id: 'event', name: 'Event', slug: 'event' });
		await database
			.insert(schema.tournamentEntries)
			.values({ id: 'entry', tournamentId: 'event', teamId: team.id });
		await database
			.insert(schema.tournamentEntryPlayers)
			.values({ entryId: 'entry', playerId: player.id });
		await expect(removeProfile('team', team.id, team.revision)).rejects.toMatchObject({
			code: 'blocked'
		});
		await expect(removeProfile('player', player.id, player.revision)).rejects.toMatchObject({
			code: 'blocked'
		});

		const resource = await saveResource({
			kind: 'agent',
			key: 'manual-agent',
			displayName: 'Manual Agent',
			isActive: true
		});
		await removeResource('agent', resource.id, resource.revision);
		await expect(
			database.select().from(schema.agents).where(eq(schema.agents.id, resource.id))
		).resolves.toHaveLength(0);

		const mapUuid = '7eaecc1b-4337-bbf6-6ab9-04b8f06b3319';
		const agentUuid = 'e370fa57-4757-3604-3648-499e1f642d3f';
		const weaponUuid = '9c82e19d-4575-0200-1a81-3eacf00cf872';
		const imageUrl = 'https://media.valorant-api.com/test.png';
		let mapName = 'Ascent';
		let invalidCatalogue = false;
		vi.stubGlobal(
			'fetch',
			vi.fn(async (value: URL | string) => {
				const url = String(value);
				if (url.includes('/v1/maps'))
					return Response.json({
						data: invalidCatalogue
							? [null]
							: [
									{
										uuid: mapUuid,
										displayName: mapName,
										displayIcon: imageUrl,
										mapUrl: '/Game/Maps/Ascent/Ascent',
										splash: imageUrl
									},
									{
										uuid: '11111111-1111-1111-1111-111111111111',
										displayName: 'District',
										displayIcon: imageUrl,
										mapUrl: '/Game/Maps/HURM/HURM_Alley/HURM_Alley'
									}
								]
					});
				if (url.includes('/v1/agents'))
					return Response.json({
						data: [
							{
								uuid: agentUuid,
								displayName: 'Gekko',
								displayIcon: imageUrl,
								fullPortrait: imageUrl,
								isPlayableCharacter: true,
								role: { displayName: 'Initiator' }
							}
						]
					});
				if (url.includes('/v1/weapons'))
					return Response.json({
						data: [
							{
								uuid: weaponUuid,
								displayName: 'Vandal',
								displayIcon: imageUrl,
								killStreamIcon: imageUrl,
								category: 'EEquippableCategory::Rifle'
							}
						]
					});
				if (url === imageUrl)
					return new Response(png, { headers: { 'content-type': 'image/png' } });
				throw new Error(`Unexpected URL ${url}`);
			})
		);
		await expect(refreshCatalogue()).resolves.toEqual({ maps: 1, agents: 1, weapons: 1 });
		const [first] = await database
			.select()
			.from(schema.maps)
			.where(eq(schema.maps.valorantApiUuid, mapUuid));
		await database
			.insert(schema.tournamentMapPool)
			.values({ tournamentId: 'event', mapId: first.id });
		await saveResource({
			kind: 'map',
			id: first.id,
			revision: first.revision,
			key: first.key,
			displayName: first.displayName,
			isActive: false
		});
		mapName = 'Ascent Updated';
		await refreshCatalogue();
		const [second] = await database
			.select()
			.from(schema.maps)
			.where(eq(schema.maps.valorantApiUuid, mapUuid));
		expect(second).toMatchObject({
			id: first.id,
			displayName: 'Ascent Updated',
			isActive: false,
			displayIconPath: first.displayIconPath,
			splashPath: first.splashPath
		});
		expect(await database.select().from(schema.tournamentMapPool)).toMatchObject([
			{ mapId: first.id }
		]);
		await expect(removeResource('map', second.id, second.revision)).rejects.toMatchObject({
			code: 'blocked'
		});
		const [agent] = await database
			.select()
			.from(schema.agents)
			.where(eq(schema.agents.valorantApiUuid, agentUuid));
		expect(agent.fullPortraitPath).toMatch(/^\/assets\//);
		const [weapon] = await database
			.select()
			.from(schema.weapons)
			.where(eq(schema.weapons.valorantApiUuid, weaponUuid));
		expect(weapon).toMatchObject({ displayName: 'Vandal', category: 'Rifle' });
		expect(weapon.displayIconPath).toMatch(/^\/assets\//);
		expect(weapon.killStreamIconPath).toMatch(/^\/assets\//);
		invalidCatalogue = true;
		await expect(refreshCatalogue()).rejects.toMatchObject({ code: 'invalid' });
		expect(await database.select().from(schema.maps)).toHaveLength(1);
	} finally {
		vi.unstubAllGlobals();
		vi.doUnmock('#lib/server/db/index.ts');
		client.close();
		if (previousAssetDir === undefined) delete process.env.ASSET_DIR;
		else process.env.ASSET_DIR = previousAssetDir;
		await removeTestDatabase(directory, client);
	}
});
