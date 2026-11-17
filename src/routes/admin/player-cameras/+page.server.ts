import type { Actions, PageServerLoad } from './$types';
import { boothViews } from '#lib/cameras/booths.ts';
import { buildBroadcastSnapshot } from '#lib/server/broadcast/snapshot.ts';
import { updateBroadcastState } from '#lib/server/services/broadcast.ts';
import { formError, readPayload } from '#lib/server/services/form-error.ts';
import { loadCameraSettings, saveCameraSettings } from '#lib/server/settings/cameras.ts';

export const load: PageServerLoad = async () => {
	// Sequential: the first-load camera insert must not race the snapshot's write transaction.
	const cameras = await loadCameraSettings();
	const snapshot = await buildBroadcastSnapshot();
	return {
		cameras,
		controlRevision: snapshot.controlRevision,
		boothsSwapped: snapshot.liveControls.boothsSwapped,
		booths: boothViews(snapshot)
	};
};

export const actions: Actions = {
	room: async ({ request }) => {
		const form = await request.formData();
		let draft: Record<string, unknown> = {};
		try {
			draft = readPayload(form);
			await saveCameraSettings(
				{ room: draft.room, password: draft.password },
				draft.expectedRevision as number
			);
			return { saved: true };
		} catch (cause) {
			return formError(cause, form, draft);
		}
	},
	booths: async ({ request }) => {
		const form = await request.formData();
		let draft: Record<string, unknown> = {};
		try {
			draft = readPayload(form);
			await updateBroadcastState({
				expectedRevision: draft.expectedRevision as number,
				boothsSwapped: draft.boothsSwapped as boolean
			});
			return { saved: true };
		} catch (cause) {
			return formError(cause, form, draft);
		}
	}
};
