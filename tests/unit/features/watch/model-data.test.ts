import { describe, expect, it } from 'vitest';
import { WATCH_MODEL_DATA } from '@/features/watch/model-data';
import { findWatchModel, groupWatchModelsBySeries, WATCH_MODELS } from '@/features/watch/models';

describe('登録済みの Apple Watch モデル', () => {
	it('スキーマ検証を通った全モデルが読み込まれる', () => {
		expect(WATCH_MODELS).toHaveLength(WATCH_MODEL_DATA.length);
		expect(WATCH_MODELS.length).toBeGreaterThan(0);
	});

	it('推測で登録しない：すべて確認済みで、確認元は Apple 公式ドメイン', () => {
		for (const model of WATCH_MODELS) {
			expect(model.verified).toBe(true);
			expect(model.sourceUrl).toBeDefined();
			const host = new URL(model.sourceUrl ?? '').hostname;
			expect(['support.apple.com', 'www.apple.com']).toContain(host);
			expect(model.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		}
	});

	it('画面は縦長（幅 < 高さ）', () => {
		for (const model of WATCH_MODELS) {
			expect(model.widthPx).toBeLessThan(model.heightPx);
		}
	});

	it('要件定義 4.2 の対象シリーズを含む', () => {
		const series = groupWatchModelsBySeries(WATCH_MODELS).map((group) => group.series);
		expect(series).toEqual(
			expect.arrayContaining([
				'Apple Watch Series 7',
				'Apple Watch SE（第2世代）',
				'Apple Watch SE 3',
				'Apple Watch Ultra',
				'Apple Watch Ultra 3',
			]),
		);
	});

	// Apple 公式ページで確認した値（2026-11-17）。全モデルを固定し、写し間違いを検出する
	it('全モデルの解像度が確認した値と一致する', () => {
		const expected: Record<string, [number, number]> = {
			'ultra4-49mm': [422, 514],
			'ultra3-49mm': [422, 514],
			'ultra2-49mm': [410, 502],
			'ultra-49mm': [410, 502],
			'series12-46mm': [416, 496],
			'series12-42mm': [374, 446],
			'series11-46mm': [416, 496],
			'series11-42mm': [374, 446],
			'series10-46mm': [416, 496],
			'series10-42mm': [374, 446],
			'series9-45mm': [396, 484],
			'series9-41mm': [352, 430],
			'series8-45mm': [396, 484],
			'series8-41mm': [352, 430],
			'series7-45mm': [396, 484],
			'series7-41mm': [352, 430],
			'se3-44mm': [368, 448],
			'se3-40mm': [324, 394],
			'se2-44mm': [368, 448],
			'se2-40mm': [324, 394],
			'se-44mm': [368, 448],
			'se-40mm': [324, 394],
		};
		const actual = Object.fromEntries(
			WATCH_MODELS.map((model) => [model.id, [model.widthPx, model.heightPx]]),
		);
		expect(actual).toEqual(expected);
		expect(findWatchModel(WATCH_MODELS, 'series11-46mm')?.series).toBe('Apple Watch Series 11');
	});

	it('ラベルはケースサイズと一致する', () => {
		for (const model of WATCH_MODELS) {
			expect(model.label).toBe(`${model.caseSizeMm}mm`);
		}
	});
});
