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

	const rangeError = '幅は100〜2048pxの範囲で入力してください';
	it.each([
		['0', 0, rangeError],
		['負数', -100, rangeError],
		['下限未満', 99, rangeError],
		['上限超過', 2049, rangeError],
		['小数', 100.5, '幅は整数で入力してください'],
		['NaN', Number.NaN, '幅を数値で入力してください'],
		['Infinity', Number.POSITIVE_INFINITY, '幅に有限の数値を入力してください'],
		['文字列', '200', '幅を数値で入力してください'],
		['undefined', undefined, '幅を数値で入力してください'],
	])('幅が %s なら理由付きで拒否する', (_name, width, message) => {
		expect(validateCustomResolution(width, 200)).toEqual({ ok: false, errors: { width: message } });
	});

	it('高さだけが不正なら高さの理由だけを返す', () => {
		expect(validateCustomResolution(200, 100.5)).toEqual({
			ok: false,
			errors: { height: '高さは整数で入力してください' },
		});
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
		['416.', 416],
		['+100', 100],
		['-100', -100],
		['４１６', 416],
	])('"%s" を %d にする', (input, expected) => {
		expect(parseDimensionInput(input)).toBe(expected);
	});

	it.each(['', '  ', 'abc', '1e3', '0x10', '416px', '4 16'])('"%s" は NaN にする', (input) => {
		expect(parseDimensionInput(input)).toBeNaN();
	});
});
