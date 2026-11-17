import { randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { cameraSettings } from '#lib/server/db/schema/index.ts';
import { SaveError } from '#lib/server/services/save-error.ts';
import { decryptSecret, encryptSecret } from './secrets';

const purpose = 'vdo-camera-password';

export type CameraSettings = { revision: number; room: string; password: string };

function safe(value: unknown, min: number, max: number, message: string) {
	const text = typeof value === 'string' ? value.trim() : '';
	if (text.length < min || text.length > max || !/^[A-Za-z0-9_]*$/.test(text))
		throw new SaveError('invalid', message);
	return text;
}

async function rowToSettings(row: typeof cameraSettings.$inferSelect): Promise<CameraSettings> {
	return {
		revision: row.revision,
		room: row.room,
		password: await decryptSecret(row.passwordEncrypted, purpose)
	};
}

export async function loadCameraSettings(): Promise<CameraSettings> {
	let [row] = await db.select().from(cameraSettings).where(eq(cameraSettings.id, 1));
	if (!row) {
		// A password is always present so the generic seat IDs are salted per installation.
		await db
			.insert(cameraSettings)
			.values({
				id: 1,
				passwordEncrypted: await encryptSecret(randomBytes(12).toString('hex'), purpose)
			})
			.onConflictDoNothing();
		[row] = await db.select().from(cameraSettings).where(eq(cameraSettings.id, 1));
	}
	if (!row) throw new Error('Could not initialize camera settings.');
	return rowToSettings(row);
}

export async function saveCameraSettings(
	input: { room: unknown; password: unknown },
	expectedRevision: number
): Promise<CameraSettings> {
	if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)
		throw new SaveError('invalid', 'A valid camera settings revision is required.');
	const room = safe(input.room, 1, 32, 'Room: 1–32 letters, digits or underscores.');
	const password = safe(input.password, 8, 32, 'Password: 8–32 letters, digits or underscores.');
	const [row] = await db
		.update(cameraSettings)
		.set({
			revision: expectedRevision + 1,
			room,
			passwordEncrypted: await encryptSecret(password, purpose)
		})
		.where(and(eq(cameraSettings.id, 1), eq(cameraSettings.revision, expectedRevision)))
		.returning();
	if (!row) throw new SaveError('stale', 'Camera settings changed. Reload before saving.');
	return rowToSettings(row);
}
