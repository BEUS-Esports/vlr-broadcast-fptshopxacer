import { defineEnvVars } from '@sveltejs/kit/env';

const optionalString = (value: string | undefined) => value;

export const variables = defineEnvVars({
	DATABASE_URL: { description: 'The database connection string.' },
	SETTINGS_ENCRYPTION_KEY: { schema: optionalString },
	SETTINGS_ENCRYPTION_KEY_FILE: { schema: optionalString },
	HENRIKDEV_API_KEY: { schema: optionalString },
	HENRIKDEV_BASE_URL: { schema: optionalString },
	HENRIKDEV_AFFINITY: { schema: optionalString },
	HENRIKDEV_PLATFORM: { schema: optionalString },
	HENRIKDEV_CANDIDATE_LIMIT: { schema: optionalString },
	POST_GAME_REQUEST_TIMEOUT_MS: { schema: optionalString },
	SPECTRA_POST_GAME_BASE_URL: { schema: optionalString },
	SPECTRA_POST_GAME_GROUP_CODE: { schema: optionalString },
	SPECTRA_POST_GAME_POLL_INTERVAL_MS: { schema: optionalString },
	SPECTRA_POST_GAME_MAX_ATTEMPTS: { schema: optionalString }
});
