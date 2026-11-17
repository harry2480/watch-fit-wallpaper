import { describe, expect, it } from 'vitest';
import { findWatchModel, groupWatchModelsBySeries, loadWatchModels } from '@/features/watch/models';

function model(id: string, series: string, label: string) {
	return {
		id,
		series,
		label,
		caseSizeMm: Number.parseInt(label, 10),
		widthPx: 400,
		heightPx: 480,
		cornerRadiusRatio: 0.2,
		verified: false,
	};
}

const data = [
	model('a-42mm', 'A', '42mm'),
	model('b-40mm', 'B', '40mm'),
	model('a-46mm', 'A', '46mm'),
];

describe('loadWatchModels', () => {
	it('登録済みデータがスキーマに適合する', () => {
		expect(() => loadWatchModels()).not.toThrow();
	});

	it('不正な定義があれば例外にする', () => {
		expect(() => loadWatchModels([{ ...data[0], widthPx: 0 }])).toThrow();
	});
});

describe('findWatchModel', () => {
	it('id でモデルを探す', () => {
		const models = loadWatchModels(data);
		expect(findWatchModel(models, 'b-40mm')?.series).toBe('B');
		expect(findWatchModel(models, 'none')).toBeUndefined();
	});
});

describe('groupWatchModelsBySeries', () => {
	it('登録順を保ってシリーズごとにまとめる', () => {
		const groups = groupWatchModelsBySeries(loadWatchModels(data));
		expect(groups.map((group) => group.series)).toEqual(['A', 'B']);
		expect(groups[0]?.models.map((m) => m.id)).toEqual(['a-42mm', 'a-46mm']);
	});

	it('空なら空配列', () => {
		expect(groupWatchModelsBySeries([])).toEqual([]);
	});
});
