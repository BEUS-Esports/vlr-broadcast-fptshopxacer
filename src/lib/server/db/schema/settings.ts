import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createdAtColumn, revisionColumn, updatedAtColumn } from './common';

export const providerSettings = sqliteTable(
	'provider_settings',
	{
		id: integer('id').primaryKey().default(1),
		revision: revisionColumn(),
		spectraRegion: text('spectra_region', { enum: ['eu', 'na', 'custom'] })
			.notNull()
			.default('eu'),
		spectraHost: text('spectra_host').notNull().default('https://eu.valospectra.com'),
		spectraAccessKeyEncrypted: text('spectra_access_key_encrypted'),
		spectraGroupCode: text('spectra_group_code').notNull().default(''),
		gstackUrl: text('gstack_url').notNull().default('http://localhost:57780/'),
		henrikdevBaseUrl: text('henrikdev_base_url')
			.notNull()
			.default('https://api.henrikdev.xyz'),
		henrikdevApiKeyEncrypted: text('henrikdev_api_key_encrypted'),
		henrikdevAffinity: text('henrikdev_affinity', {
			enum: ['ap', 'br', 'eu', 'kr', 'latam', 'na']
		})
			.notNull()
			.default('ap'),
		henrikdevPlatform: text('henrikdev_platform', { enum: ['pc', 'console'] })
			.notNull()
			.default('pc'),
		henrikdevCandidateLimit: integer('henrikdev_candidate_limit').notNull().default(5),
		postGameRequestTimeoutMs: integer('post_game_request_timeout_ms').notNull().default(15000),
		spectraPostGameBaseUrl: text('spectra_post_game_base_url')
			.notNull()
			.default('https://stats.valospectra.com'),
		spectraPostGamePollIntervalMs: integer('spectra_post_game_poll_interval_ms')
			.notNull()
			.default(15000),
		spectraPostGameMaxAttempts: integer('spectra_post_game_max_attempts').notNull().default(3),
		createdAt: createdAtColumn(),
		updatedAt: updatedAtColumn()
	},
	(table) => [
		check('provider_settings_singleton_check', sql`${table.id} = 1`),
		check('provider_settings_revision_check', sql`${table.revision} > 0`),
		check(
			'provider_settings_henrikdev_candidate_limit_check',
			sql`${table.henrikdevCandidateLimit} between 1 and 10`
		),
		check(
			'provider_settings_post_game_timeout_check',
			sql`${table.postGameRequestTimeoutMs} between 1 and 30000`
		),
		check(
			'provider_settings_spectra_poll_interval_check',
			sql`${table.spectraPostGamePollIntervalMs} between 1 and 15000`
		),
		check(
			'provider_settings_spectra_max_attempts_check',
			sql`${table.spectraPostGameMaxAttempts} between 1 and 4`
		)
	]
);
