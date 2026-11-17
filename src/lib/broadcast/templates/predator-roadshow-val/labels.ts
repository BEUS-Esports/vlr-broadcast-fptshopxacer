import type { StatisticField } from '#lib/statistics/fields.ts';

export const statLabels: Record<StatisticField, { en: string; vi: string }> = {
	kills: { en: 'KILLS', vi: 'Hạ gục' },
	deaths: { en: 'DEATHS', vi: 'Chết' },
	assists: { en: 'ASSISTS', vi: 'Hỗ trợ' },
	performanceScore: { en: 'ACS', vi: 'Điểm chiến đấu trung bình' },
	trades: { en: 'TRADES', vi: 'Hạ gục đổi mạng' },
	firstBloods: { en: 'FIRST BLOODS', vi: 'Hạ gục đầu tiên' },
	plants: { en: 'PLANTS', vi: 'Cài Spike' },
	defuses: { en: 'DEFUSES', vi: 'Gỡ Spike' }
};

export const vetoLabels = {
	ban: 'CẤM BẢN ĐỒ',
	pick: 'CHỌN BẢN ĐỒ',
	decider: 'BẢN ĐỒ QUYẾT ĐỊNH'
} as const;

export const sideLabels = { attack: 'CÔNG', defense: 'THỦ' } as const;
