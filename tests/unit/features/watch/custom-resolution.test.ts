import { describe, expect, it } from 'vitest';
import { parseDimensionInput, validateCustomResolution } from '@/features/watch/custom-resolution';

describe('validateCustomResolution', () => {
	it.each([
		[100, 100],
		[2048, 2048],
		[396, 484],
	])('%d x %d を受け付ける', (width, height) => {
		expect(validateCustomResolution(width, height)).toEqual({
			ok: true,
			value: { width, height },
		});
	});

	it.each([
		['0', 0],
		['負数', -100],
		['下限未満', 99],
		['上限超過', 2049],
		['小数', 100.5],
		['NaN', Number.NaN],
		['Infinity', Number.POSITIVE_INFINITY],
		['文字列', '200'],
		['undefined', undefined],
	])('幅が %s なら理由付きで拒否する', (_name, width) => {
		const result = validateCustomResolution(width, 200);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.errors.width).toMatch(/幅/);
			expect(result.errors.height).toBeUndefined();
		}
	});

	it('幅と高さの両方の理由を返す', () => {
		const result = validateCustomResolution(0, 3000);
		expect(result).toEqual({
			ok: false,
			errors: {
				width: '幅は100〜2048pxの範囲で入力してください',
				height: '高さは100〜2048pxの範囲で入力してください',
			},
		});
	});
});

describe('parseDimensionInput', () => {
	it.each([
		['416', 416],
		[' 416 ', 416],
		['416.5', 416.5],
	])('"%s" を %d にする', (input, expected) => {
		expect(parseDimensionInput(input)).toBe(expected);
	});

	it.each(['', '  ', 'abc', '1e3', '0x10', '416px', '4 16'])('"%s" は NaN にする', (input) => {
		expect(parseDimensionInput(input)).toBeNaN();
	});
});
