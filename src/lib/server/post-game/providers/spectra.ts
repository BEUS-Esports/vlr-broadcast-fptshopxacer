import type { SpectraConfig } from '../config';
import type { NormalizedPostGameReport } from '#lib/post-game/types.ts';
import { setTimeout } from 'node:timers/promises';
import { envelope, object, PostGameProviderError, requestJson, text } from './http';
import { decodeV4Report } from './v4';
export function createSpectraClient(config: SpectraConfig, fetcher: typeof fetch = fetch) {
	return {
		async fetchReport(input: {
			groupCode?: string;
			externalMatchId?: string;
			signal?: AbortSignal;
		}): Promise<NormalizedPostGameReport> {
			const code = text(input.groupCode ?? config.groupCode);
			if (!code || code.length > 128) throw new PostGameProviderError('invalid-input');
			const url = `${config.baseUrl}/getStats?${new URLSearchParams({ code: code.toUpperCase() })}`;
			for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
				const response = await requestJson(url, config.timeoutMs, fetcher, input.signal);
				const body = envelope(response);
				const data = object(body.data);
				if (Array.isArray(data.players) && data.players.length) {
					const report = decodeV4Report(response, 'spectra');
					if (input.externalMatchId && report.externalMatchId !== input.externalMatchId)
						throw new PostGameProviderError('identity-mismatch');
					if (report.completed) return report;
				} else if (data.players !== undefined && !Array.isArray(data.players))
					throw new PostGameProviderError('malformed');
				if (input.signal?.aborted) throw new PostGameProviderError('cancelled');
				if (attempt + 1 < config.maxAttempts) {
					try {
						await setTimeout(config.pollIntervalMs, undefined, { signal: input.signal });
					} catch {
						throw new PostGameProviderError('cancelled');
					}
				}
			}
			throw new PostGameProviderError('pending');
		}
	};
}
