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

	// Apple 公式の技術仕様ページで確認した値（2026-11-17）
	it.each([
		['series11-46mm', 416, 496],
		['series11-42mm', 374, 446],
		['series7-45mm', 396, 484],
		['series7-41mm', 352, 430],
		['se3-44mm', 368, 448],
		['se3-40mm', 324, 394],
		['ultra2-49mm', 410, 502],
		['ultra3-49mm', 422, 514],
	])('%s は %d x %d px', (id, width, height) => {
		const model = findWatchModel(WATCH_MODELS, id);
		expect(model?.widthPx).toBe(width);
		expect(model?.heightPx).toBe(height);
	});

	it('ラベルはケースサイズと一致する', () => {
		for (const model of WATCH_MODELS) {
			expect(model.label).toBe(`${model.caseSizeMm}mm`);
		}
	});
});
