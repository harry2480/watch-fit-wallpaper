import { describe, expect, it } from 'vitest';
import {
	baseScale,
	centeredTransform,
	clampScale,
	containScale,
	coverScale,
	relativeZoom,
	scaleRange,
} from '@/features/editor/geometry';

const output = { width: 416, height: 496 };

describe('基準倍率', () => {
	it.each([
		['横長', { width: 4000, height: 1000 }, 0.496, 0.104],
		['縦長', { width: 1000, height: 4000 }, 0.416, 0.124],
		['正方形', { width: 1000, height: 1000 }, 0.496, 0.416],
		['小さい画像', { width: 10, height: 10 }, 49.6, 41.6],
		['高解像度', { width: 8000, height: 6000 }, 0.0826666, 0.052],
	])('%s: cover = max(W/Iw, H/Ih)、contain = min(W/Iw, H/Ih)', (_n, image, cover, contain) => {
		expect(coverScale(image, output)).toBeCloseTo(cover, 6);
		expect(containScale(image, output)).toBeCloseTo(contain, 6);
		expect(baseScale('cover', image, output)).toBe(coverScale(image, output));
		expect(baseScale('contain', image, output)).toBe(containScale(image, output));
	});

	it.each([
		['幅0', { width: 0, height: 100 }],
		['負数', { width: -1, height: 100 }],
		['NaN', { width: Number.NaN, height: 100 }],
		['Infinity', { width: Number.POSITIVE_INFINITY, height: 100 }],
	])('%s の画像サイズはゼロ除算せず例外にする', (_n, image) => {
		expect(() => coverScale(image, output)).toThrow(RangeError);
		expect(() => containScale(image, output)).toThrow(RangeError);
	});

	it('出力サイズが不正なら例外にする', () => {
		expect(() => coverScale({ width: 10, height: 10 }, { width: 0, height: 10 })).toThrow(
			RangeError,
		);
	});
});

describe('倍率範囲', () => {
	const image = { width: 1000, height: 2000 };

	it('Cover は Cover 倍率の 1〜4 倍', () => {
		const cover = coverScale(image, output);
		expect(scaleRange('cover', image, output)).toEqual({ min: cover, max: cover * 4 });
	});

	it('Contain は Contain 倍率の 0.25〜4 倍', () => {
		const contain = containScale(image, output);
		expect(scaleRange('contain', image, output)).toEqual({
			min: contain * 0.25,
			max: contain * 4,
		});
	});

	it('範囲外の倍率を丸め、NaN・Infinity は基準倍率にする', () => {
		const cover = coverScale(image, output);
		expect(clampScale(cover * 10, 'cover', image, output)).toBe(cover * 4);
		expect(clampScale(cover / 10, 'cover', image, output)).toBe(cover);
		expect(clampScale(Number.NaN, 'cover', image, output)).toBe(cover);
		expect(clampScale(Number.POSITIVE_INFINITY, 'contain', image, output)).toBe(
			containScale(image, output),
		);
	});
});

describe('中央配置', () => {
	it('出力中央に基準倍率で配置し、回転は 0', () => {
		const image = { width: 3000, height: 2000 };
		expect(centeredTransform('cover', image, output)).toEqual({
			centerX: 208,
			centerY: 248,
			scale: coverScale(image, output),
			rotationDeg: 0,
		});
		expect(centeredTransform('contain', image, output).scale).toBe(containScale(image, output));
	});
});

describe('相対倍率', () => {
	it('基準倍率を 1 とした比を返す', () => {
		const image = { width: 1000, height: 1000 };
		const transform = { ...centeredTransform('cover', image, output), scale: 0.992 };
		expect(relativeZoom(transform, 'cover', image, output)).toBeCloseTo(2, 10);
	});
});
