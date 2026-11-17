import { describe, expect, it } from 'vitest';
import { watchModelListSchema, watchModelSchema } from '@/features/watch/schema';

const validModel = {
	id: 'test-46mm',
	series: 'Test Watch',
	label: '46mm',
	caseSizeMm: 46,
	widthPx: 416,
	heightPx: 496,
	cornerRadiusRatio: 0.2,
	verified: true,
	sourceUrl: 'https://example.com/specs',
	verifiedAt: '2026-11-17',
};

describe('watchModelSchema', () => {
	it('正しい定義を受け付ける', () => {
		expect(watchModelSchema.safeParse(validModel).success).toBe(true);
	});

	it('未確認モデルは sourceUrl・verifiedAt なしでも受け付ける', () => {
		const { sourceUrl: _s, verifiedAt: _v, ...rest } = validModel;
		expect(watchModelSchema.safeParse({ ...rest, verified: false }).success).toBe(true);
	});

	it.each([
		['sourceUrl', { sourceUrl: undefined }],
		['verifiedAt', { verifiedAt: undefined }],
	])('確認済みなのに %s が無ければ拒否する', (_name, patch) => {
		expect(watchModelSchema.safeParse({ ...validModel, ...patch }).success).toBe(false);
	});

	it.each([
		['幅が0', { widthPx: 0 }],
		['高さが負数', { heightPx: -1 }],
		['幅が小数', { widthPx: 416.5 }],
		['幅が NaN', { widthPx: Number.NaN }],
		['高さが Infinity', { heightPx: Number.POSITIVE_INFINITY }],
		['角丸比率が範囲外', { cornerRadiusRatio: 0.6 }],
		['id に大文字', { id: 'Series-46mm' }],
		['http の URL', { sourceUrl: 'http://example.com/specs' }],
		['日付形式が不正', { verifiedAt: '2026/11/17' }],
		['未知のキー', { extra: 1 }],
	])('%s の定義を拒否する', (_name, patch) => {
		expect(watchModelSchema.safeParse({ ...validModel, ...patch }).success).toBe(false);
	});
});

describe('watchModelListSchema', () => {
	it('id の重複を拒否する', () => {
		expect(watchModelListSchema.safeParse([validModel, validModel]).success).toBe(false);
	});

	it('空の一覧を受け付ける', () => {
		expect(watchModelListSchema.safeParse([]).success).toBe(true);
	});
});
