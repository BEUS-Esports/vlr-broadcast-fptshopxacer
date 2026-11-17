import { expect, it } from 'vitest';
import { directorUrl, previewUrl, pushUrl, seatId, seatIds, VDO_NINJA_ORIGIN } from './vdo-ninja';

function parts(value: string) {
	const url = new URL(value);
	expect(url.origin).toBe(VDO_NINJA_ORIGIN);
	expect(url.pathname).toBe('/');
	return [...url.searchParams];
}

it('builds a muted 720p30 push link that does not receive other feeds', () => {
	expect(parts(pushUrl('BOOTH1_S1', 'r', 'p'))).toEqual([
		['push', 'BOOTH1_S1'],
		['room', 'r'],
		['password', 'p'],
		['label', 'BOOTH1_S1'],
		['ad', '0'],
		['novideo', ''],
		['noaudio', ''],
		['width', '1280'],
		['height', '720'],
		['fps', '30']
	]);
});

it('builds a low-bitrate silent preview link for one seat', () => {
	expect(parts(previewUrl('BOOTH2_S5', 'r', 'p'))).toEqual([
		['view', 'BOOTH2_S5'],
		['room', 'r'],
		['password', 'p'],
		['scene', '0'],
		['cleanoutput', ''],
		['disablehotkeys', ''],
		['noaudio', ''],
		['codec', 'h264'],
		['vb', '200'],
		['scale', '25']
	]);
});

it('builds a director link', () => {
	expect(parts(directorUrl('r', 'p'))).toEqual([
		['director', 'r'],
		['password', 'p']
	]);
});

it('lists ten fixed seats booth by booth', () => {
	expect(seatIds).toEqual([
		'BOOTH1_S1',
		'BOOTH1_S2',
		'BOOTH1_S3',
		'BOOTH1_S4',
		'BOOTH1_S5',
		'BOOTH2_S1',
		'BOOTH2_S2',
		'BOOTH2_S3',
		'BOOTH2_S4',
		'BOOTH2_S5'
	]);
	expect(seatId(2, 3)).toBe('BOOTH2_S3');
});

it('encodes values instead of injecting parameters', () => {
	const url = new URL(pushUrl('BOOTH1_S1', 'a b&c', 'p=q'));
	expect(url.searchParams.get('room')).toBe('a b&c');
	expect(url.searchParams.get('password')).toBe('p=q');
	expect(url.searchParams.has('c')).toBe(false);
});
