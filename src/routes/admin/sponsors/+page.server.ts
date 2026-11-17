import {
	sponsorBannerSlots,
	type SponsorBannerSlot,
	type SponsorConfig
} from '#lib/broadcast/sponsor.ts';
import { removeAsset, saveUpload } from '#lib/server/assets.ts';
import { field, formError } from '#lib/server/services/form-error.ts';
import { SaveError } from '#lib/server/services/save-error.ts';
import { loadSponsorSettings, saveSponsorSettings } from '#lib/server/settings/sponsors.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({ sponsor: await loadSponsorSettings() });

type Upload = (file: FormDataEntryValue | null) => Promise<string | null>;

/** Applies one change to the current settings and saves the whole config once. */
async function update(
	request: Request,
	change: (config: SponsorConfig, form: FormData, upload: Upload) => Promise<void> | void
) {
	const form = await request.formData();
	const uploaded: string[] = [];
	const upload: Upload = async (file) => {
		const path = await saveUpload(file);
		if (path) uploaded.push(path);
		return path;
	};
	try {
		// Replaced and removed paths stay on disk: the cleanup job owns deletion.
		const { banners, loopLogos, loopIntervalMs } = await loadSponsorSettings();
		const config: SponsorConfig = { banners, loopLogos, loopIntervalMs };
		await change(config, form, upload);
		await saveSponsorSettings(config, Number(field(form, 'revision')));
		return { saved: true };
	} catch (cause) {
		await Promise.all(uploaded.map(removeAsset));
		return formError(cause, form);
	}
}

function loopIndex(config: SponsorConfig, form: FormData) {
	const index = Number(field(form, 'index'));
	if (!Number.isInteger(index) || index < 0 || index >= config.loopLogos.length)
		throw new SaveError('invalid', 'That sponsor logo no longer exists. Reload and try again.');
	return index;
}

export const actions: Actions = {
	banner: ({ request }) =>
		update(request, async (config, form, upload) => {
			const slot = field(form, 'slot') as SponsorBannerSlot;
			if (!sponsorBannerSlots.includes(slot))
				throw new SaveError('invalid', 'Unknown sponsor banner.');
			const art = config.banners[slot];
			const background = await upload(form.get('background'));
			const logo = await upload(form.get('logo'));
			art.backgroundPath =
				background ?? (field(form, 'clearBackground') ? null : art.backgroundPath);
			art.logoPath = logo ?? (field(form, 'clearLogo') ? null : art.logoPath);
		}),
	loopAdd: ({ request }) =>
		update(request, async (config, form, upload) => {
			for (const file of form.getAll('logos')) {
				const path = await upload(file);
				if (path) config.loopLogos.push(path);
			}
		}),
	loopRemove: ({ request }) =>
		update(request, (config, form) => {
			config.loopLogos.splice(loopIndex(config, form), 1);
		}),
	loopMove: ({ request }) =>
		update(request, (config, form) => {
			const index = loopIndex(config, form);
			const target = index + (field(form, 'direction') === 'up' ? -1 : 1);
			if (target < 0 || target >= config.loopLogos.length) return;
			[config.loopLogos[index], config.loopLogos[target]] = [
				config.loopLogos[target],
				config.loopLogos[index]
			];
		}),
	interval: ({ request }) =>
		update(request, (config, form) => {
			config.loopIntervalMs = Math.round(Number(field(form, 'seconds')) * 1000);
		})
};
