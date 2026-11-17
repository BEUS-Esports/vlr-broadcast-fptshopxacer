/** Browser-safe VDO.Ninja link builders for the ten fixed booth seats. */
export const VDO_NINJA_ORIGIN = 'https://vdo.ninja';

export type Booth = 1 | 2;
export type Seat = 1 | 2 | 3 | 4 | 5;
export type SeatId = `BOOTH${Booth}_S${Seat}`;

export const booths: readonly Booth[] = [1, 2];
export const seats: readonly Seat[] = [1, 2, 3, 4, 5];

export function seatId(booth: Booth, seat: Seat): SeatId {
	return `BOOTH${booth}_S${seat}`;
}

export const seatIds: readonly SeatId[] = booths.flatMap((booth) =>
	seats.map((seat) => seatId(booth, seat))
);

/** Sender capture default; revisit after the live spike. */
export const pushCapture = { width: 1280, height: 720, fps: 30 } as const;
/** Operator preview quality (P2P viewer-side requests). */
export const previewQuality = { codec: 'h264', vb: 200, scale: 25 } as const;

function link(params: Array<[string, string | number]>) {
	const url = new URL(`${VDO_NINJA_ORIGIN}/`);
	url.search = new URLSearchParams(params.map(([key, value]) => [key, String(value)])).toString();
	return url.toString();
}

export function pushUrl(seat: SeatId, room: string, password: string) {
	return link([
		['push', seat],
		['room', room],
		['password', password],
		['label', seat],
		['ad', 0],
		['novideo', ''],
		['noaudio', ''],
		['width', pushCapture.width],
		['height', pushCapture.height],
		['fps', pushCapture.fps]
	]);
}

export function previewUrl(seat: SeatId, room: string, password: string) {
	return link([
		['view', seat],
		['room', room],
		['password', password],
		['scene', 0],
		['cleanoutput', ''],
		['disablehotkeys', ''],
		['noaudio', ''],
		['codec', previewQuality.codec],
		['vb', previewQuality.vb],
		['scale', previewQuality.scale]
	]);
}

export function directorUrl(room: string, password: string) {
	return link([
		['director', room],
		['password', password]
	]);
}
