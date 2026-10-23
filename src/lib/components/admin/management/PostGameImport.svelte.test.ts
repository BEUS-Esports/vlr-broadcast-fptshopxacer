import { afterEach, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { refreshAll } from '$app/navigation';
import PostGameImport from './PostGameImport.svelte';
import type { PostGameReview } from '#lib/post-game/review.ts';

vi.mock('$app/forms', () => ({ deserialize: JSON.parse }));
vi.mock('$app/navigation', () => ({ refreshAll: vi.fn(async () => {}) }));
afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	vi.clearAllMocks();
});

const props = {
	revision: 1,
	entries: [{ id: 'a', name: 'Alpha' }],
	controls: {
		gameId: 'g',
		anchors: [{ id: 'p0', displayName: 'Player 0', riotId: 'Player 0#EVENT' }],
		groupCode: 'EVENT',
		availability: {
			henrikdev: { available: true, message: null },
			spectra: { available: true, message: null }
		}
	}
};
const metrics = {
	kills: 1,
	deaths: 0,
	assists: 0,
	performanceScore: null,
	trades: null,
	firstBloods: null,
	plants: null,
	defuses: null
};
function preview(): PostGameReview {
	return {
		token: 'token',
		expiresAt: '2099-01-01',
		gameId: 'g',
		gameRevision: 1,
		provider: 'henrikdev',
		externalMatchId: 'match',
		startedAt: null,
		map: { current: 'Ascent', proposed: 'Ascent' },
		score: {
			local: { teamA: null, teamB: null },
			provider: [{ teamKey: 'Blue', entryId: 'a', score: 1 }]
		},
		provenance: { importSource: null, externalMatchId: null, importedAt: null },
		replacement: false,
		validation: [],
		teamMappings: [{ teamKey: 'Blue', entryId: 'a' }],
		mappings: {},
		localPlayers: Array.from({ length: 10 }, (_, i) => ({
			playerId: `p${i}`,
			entryId: 'a',
			displayName: `Player ${i}`,
			riotId: `Player ${i}#EVENT`
		})),
		players: Array.from({ length: 10 }, (_, i) => ({
			providerIndex: i,
			providerIdentity: { externalPlayerId: `e${i}`, riotId: `Player ${i}#EVENT`, teamKey: 'Blue' },
			mappingState: 'exact',
			playerId: `p${i}`,
			entryId: 'a',
			localIdentity: { displayName: `Player ${i}`, riotId: `Player ${i}#EVENT` },
			current: { ...metrics, agentId: null, agentName: null },
			proposed: { ...metrics, agentId: null, agentName: null },
			availability: {
				kills: true,
				deaths: true,
				assists: true,
				performanceScore: false,
				trades: false,
				firstBloods: false,
				plants: false,
				defuses: false,
				agent: false
			},
			conflicts: { statistics: false, agent: false },
			manual: { statistics: false, agent: false, statisticsEditedAt: null, agentEditedAt: null }
		})),
		canConfirm: true
	};
}
const response = (data: unknown) =>
	new Response(JSON.stringify({ type: 'success', status: 200, data }));

it.each(['import', 'discard'] as const)(
	'preserves delayed %s completion through attempted cancellation, input invalidation and a manual-save revision update',
	async (operation) => {
		const review = preview();
		review.players[0].manual.statistics = true;
		review.players[0].conflicts.statistics = true;
		review.replacement = true;
		let release: ((value: Response) => void) | undefined;
		let writeSignal: AbortSignal | null | undefined;
		vi.spyOn(window, 'confirm').mockReturnValue(true);
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_url: string, init: RequestInit) => {
				const input = JSON.parse((init.body as FormData).get('payload') as string);
				if (input.operation === operation) {
					writeSignal = init.signal;
					return new Promise<Response>((resolve) => {
						release = resolve;
					});
				}
				return response({ review });
			})
		);
		const renderProps =
			operation === 'discard'
				? {
						...props,
						controls: {
							...props.controls,
							discardablePlayers: [{ id: 'p0', displayName: 'Player 0' }]
						}
					}
				: props;
		const view = render(PostGameImport, renderProps);
		await page.getByRole('button', { name: 'Fetch Report', exact: true }).click();
		await page.getByLabelText('Player 0 statistics conflict').selectOptions('keep-local');
		await page.getByRole('checkbox').click();
		await page
			.getByRole('button', {
				name: operation === 'import' ? 'Confirm Import' : 'Discard Player 0 cleared row',
				exact: true
			})
			.click();
		await expect.poll(() => release).toBeDefined();
		expect.soft(view.container.querySelector('button')?.disabled).toBe(true);
		for (const control of view.container.querySelectorAll('input, select, button')) {
			expect.soft((control as HTMLInputElement).disabled).toBe(true);
		}
		const cancel = Array.from(view.container.querySelectorAll('button')).find((button) =>
			button.textContent?.includes('Stop / Cancel')
		);
		expect.soft(cancel).toBeUndefined();
		cancel?.click();
		// Queued input events must not retire a write even when a control is disabled.
		view.container.querySelector('select')!.dispatchEvent(new Event('change', { bubbles: true }));
		view.container.querySelector('input')!.dispatchEvent(new Event('input', { bubbles: true }));
		await view.rerender({ ...renderProps, revision: 2 });
		expect.soft(writeSignal?.aborted ?? false).toBe(false);
		release!(response({ [operation === 'import' ? 'imported' : 'discarded']: true }));
		await expect
			.element(
				page.getByText(
					operation === 'import'
						? 'Report imported into saved statistics.'
						: 'Player statistics discarded. Correct the lineup before fetching again.'
				)
			)
			.toBeVisible();
		expect(refreshAll).toHaveBeenCalledExactlyOnceWith();
		await expect
			.element(page.getByRole('region', { name: 'Post-game import review' }))
			.not.toBeInTheDocument();
	}
);

it('allows an imported cleared row to be discarded without either provider', async () => {
	vi.spyOn(window, 'confirm').mockReturnValue(true);
	const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
		const input = JSON.parse((init.body as FormData).get('payload') as string);
		expect(input).toMatchObject({
			operation: 'discard',
			playerId: 'p0',
			confirmation: true,
			expectedGameRevision: 1
		});
		return response({ discarded: true });
	});
	vi.stubGlobal('fetch', fetcher);
	render(PostGameImport, {
		...props,
		controls: {
			...props.controls,
			availability: {
				henrikdev: { available: false, message: 'HenrikDev unavailable.' },
				spectra: { available: false, message: 'Spectra unavailable.' }
			},
			discardablePlayers: [{ id: 'p0', displayName: 'Player 0' }]
		}
	});
	await expect.element(page.getByRole('region', { name: 'Lineup correction' })).toBeVisible();
	await page.getByRole('button', { name: 'Discard Player 0 cleared row' }).click();
	await expect
		.element(
			page.getByText('Player statistics discarded. Correct the lineup before fetching again.')
		)
		.toBeVisible();
	expect(fetcher).toHaveBeenCalledTimes(1);
	expect(refreshAll).toHaveBeenCalledExactlyOnceWith();
});

it('still aborts read-only requests and ignores their late review after Stop / Cancel', async () => {
	let release: ((value: Response) => void) | undefined;
	let signal: AbortSignal | null | undefined;
	vi.stubGlobal(
		'fetch',
		vi.fn((_url: string, init: RequestInit) => {
			signal = init.signal;
			return new Promise<Response>((resolve) => {
				release = resolve;
			});
		})
	);
	render(PostGameImport, props);
	await page.getByRole('button', { name: 'Fetch Report', exact: true }).click();
	await page.getByRole('button', { name: 'Stop / Cancel' }).click();
	expect(signal?.aborted).toBe(true);
	release!(response({ review: preview() }));
	await expect.element(page.getByText('Request stopped. Fetch again when ready.')).toBeVisible();
	await expect
		.element(page.getByRole('region', { name: 'Post-game import review' }))
		.not.toBeInTheDocument();
	expect(refreshAll).not.toHaveBeenCalled();
});

it('keeps source order, candidates, ten-player diff and scoped conflicts; saved revision invalidates confirmation', async () => {
	const review = preview();
	review.mappings = Object.fromEntries(
		review.players.map((row) => [String(row.providerIndex), row.playerId!])
	);
	review.players[0].conflicts.statistics = true;
	vi.stubGlobal(
		'fetch',
		vi.fn(async (_url: string, init: RequestInit) => {
			const input = JSON.parse((init.body as FormData).get('payload') as string);
			return response(
				input.operation === 'discover'
					? {
							candidates: [
								{
									provider: 'henrikdev',
									ref: 'match',
									externalMatchId: 'match',
									startedAt: null,
									map: { externalId: null, name: 'Ascent' },
									score: null,
									participants: []
								}
							]
						}
					: { review }
			);
		})
	);
	const view = render(PostGameImport, props);
	expect(
		Array.from(view.container.querySelectorAll('h3'), (heading) => heading.textContent)
	).toEqual(['HenrikDev · Recommended', 'ValoSpectra']);
	await page.getByLabelText('Anchor player').selectOptions('p0');
	await page.getByRole('button', { name: 'Fetch Recent Matches', exact: true }).click();
	await page.getByRole('button', { name: 'Select Match match', exact: true }).click();
	await expect.element(page.getByRole('button', { name: 'Confirm Import' })).toBeDisabled();
	expect(view.container.querySelectorAll('table')).toHaveLength(10);
	await expect
		.element(page.getByText('Manual statistics conflict for Player 0. Choose what to keep.'))
		.toBeVisible();
	await page.getByLabelText('Player 0 statistics conflict').selectOptions('keep-local');
	await expect.element(page.getByRole('button', { name: 'Confirm Import' })).toBeEnabled();
	await view.rerender({ ...props, revision: 2 });
	await expect.element(page.getByRole('button', { name: 'Confirm Import' })).toBeDisabled();
	await expect
		.element(
			page.getByText('This review is stale. Fetch and review the report again before confirming.')
		)
		.toBeVisible();
	await expect
		.element(page.getByRole('heading', { name: 'Review HenrikDev · match' }))
		.toBeVisible();
});

it('requires a revised preview after manual mapping and ignores a late fetch from an older revision', async () => {
	const review = preview();
	review.players[0].playerId = null;
	review.players[0].mappingState = 'unresolved';
	review.validation = ['Choose a local player.'];
	let release: ((value: Response) => void) | undefined;
	vi.stubGlobal(
		'fetch',
		vi.fn(async (_url: string, init: RequestInit) => {
			const input = JSON.parse((init.body as FormData).get('payload') as string);
			if (input.operation === 'discover')
				return new Promise<Response>((resolve) => {
					release = resolve;
				});
			if (input.operation === 'revise') {
				review.mappings = input.mappings;
				review.players[0].playerId = 'p0';
				review.players[0].mappingState = 'manual';
				review.validation = [];
			}
			return response({ review });
		})
	);
	const view = render(PostGameImport, props);
	await page.getByRole('button', { name: 'Fetch Report', exact: true }).click();
	await page.getByLabelText('Map provider player 1', { exact: true }).selectOptions('p0');
	await expect.element(page.getByRole('button', { name: 'Confirm Import' })).toBeDisabled();
	await page.getByRole('button', { name: 'Review updated mappings' }).click();
	await expect.element(page.getByRole('button', { name: 'Confirm Import' })).toBeEnabled();
	await page.getByLabelText('Anchor player').selectOptions('p0');
	await page.getByRole('button', { name: 'Fetch Recent Matches', exact: true }).click();
	await view.rerender({ ...props, revision: 2 });
	release!(
		response({
			candidates: [
				{ ref: 'late', externalMatchId: 'late', map: { name: 'Ascent' }, participants: [] }
			]
		})
	);
	await expect
		.element(page.getByRole('button', { name: 'Select Match late' }))
		.not.toBeInTheDocument();
	await expect
		.element(page.getByRole('heading', { name: 'Review HenrikDev · match' }))
		.toBeVisible();
});
