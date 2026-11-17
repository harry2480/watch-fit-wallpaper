import { describe, expect, it } from 'vitest';
import {
	IMAGE_LOAD_ERROR_MESSAGES,
	MAX_PIXELS,
	readHeaderDimensions,
	sniffImageFormat,
	validateDimensions,
} from '@/features/image/validate';
import {
	ftypHeader,
	GIF,
	jpegHeader,
	PDF,
	pngHeader,
	SVG,
	webpVp8Header,
	webpVp8lHeader,
	webpVp8xHeader,
} from './bytes';

describe('sniffImageFormat', () => {
	it.each([
		['JPEG', jpegHeader(10, 10), 'jpeg'],
		['PNG', pngHeader(10, 10), 'png'],
		['WebP', webpVp8xHeader(10, 10), 'webp'],
		['HEIC', ftypHeader('heic'), 'heic'],
		['HEIF(mif1)', ftypHeader('mif1'), 'heic'],
		['AVIF', ftypHeader('avif'), 'avif'],
		['mif1 が先頭の AVIF', ftypHeader('mif1', ['mif1', 'avif', 'miaf']), 'avif'],
		['HEIF の画像シーケンス', ftypHeader('msf1', ['msf1', 'hevc']), 'unknown'],
		['MP4 等の動画', ftypHeader('isom'), 'unknown'],
		['GIF', GIF, 'gif'],
		['PDF', PDF, 'pdf'],
		['SVG', SVG, 'svg'],
		['空', new Uint8Array(), 'unknown'],
		['テキスト', new TextEncoder().encode('hello'), 'unknown'],
	])('%s を判定する', (_n, bytes, expected) => {
		expect(sniffImageFormat(bytes)).toBe(expected);
	});
});

describe('readHeaderDimensions', () => {
	it.each([
		['PNG', pngHeader(4032, 3024), 'png'],
		['JPEG（EXIF の後ろの SOF）', jpegHeader(4032, 3024, 60000), 'jpeg'],
		['WebP VP8X', webpVp8xHeader(4032, 3024), 'webp'],
		['WebP VP8L', webpVp8lHeader(4032, 3024), 'webp'],
		['WebP VP8', webpVp8Header(4032, 3024), 'webp'],
	] as const)('%s の寸法を読む', (_n, bytes, format) => {
		expect(readHeaderDimensions(bytes, format)).toEqual({ width: 4032, height: 3024 });
	});

	it.each([
		['長さ 0 のセグメント', new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 0, 0, 0, 0, 0, 0, 0])],
		['0xFF の連続', new Uint8Array([0xff, 0xd8, ...new Array(40).fill(0xff)])],
		['0xFF 以外のバイト', new Uint8Array([0xff, 0xd8, 0x12, 0x34, ...new Array(20).fill(0)])],
		['途中で切れた SOF', jpegHeader(100, 100).subarray(0, 1006)],
		['RST マーカーを挟む', new Uint8Array([0xff, 0xd8, 0xff, 0xd0, ...new Array(20).fill(0)])],
	])('壊れた JPEG（%s）でも停止して null を返す', (_n, bytes) => {
		expect(readHeaderDimensions(bytes, 'jpeg')).toBeNull();
	});

	it.each([
		['VP8 の途中で切れたもの', webpVp8Header(100, 100).subarray(0, 26)],
		[
			'VP8L の署名が違うもの',
			Uint8Array.from(webpVp8lHeader(100, 100), (b, i) => (i === 20 ? 0 : b)),
		],
		[
			'VP8 の開始コードが違うもの',
			Uint8Array.from(webpVp8Header(100, 100), (b, i) => (i === 23 ? 0 : b)),
		],
	])('WebP（%s）は null', (_n, bytes) => {
		expect(readHeaderDimensions(bytes, 'webp')).toBeNull();
	});

	it('WebP ヘッダーの寸法で 5,000 万画素超を検出できる', () => {
		const dimensions = readHeaderDimensions(webpVp8xHeader(10000, 6000), 'webp');
		expect(dimensions && validateDimensions(dimensions)).toBe('too-many-pixels');
	});

	it('読めない場合は null', () => {
		expect(readHeaderDimensions(pngHeader(1, 1).subarray(0, 10), 'png')).toBeNull();
		expect(readHeaderDimensions(jpegHeader(1, 1).subarray(0, 20), 'jpeg')).toBeNull();
		expect(readHeaderDimensions(ftypHeader('heic'), 'heic')).toBeNull();
	});
});

describe('validateDimensions', () => {
	it.each([
		[{ width: 0, height: 10 }, 'invalid-dimensions'],
		[{ width: Number.NaN, height: 10 }, 'invalid-dimensions'],
		[{ width: 10.5, height: 10 }, 'invalid-dimensions'],
		[{ width: 10000, height: 5001 }, 'too-many-pixels'],
		[{ width: 10000, height: 5000 }, null],
		[{ width: 1, height: 1 }, null],
	])('%o → %s', (dimensions, expected) => {
		expect(validateDimensions(dimensions)).toBe(expected);
	});

	it('上限は 5,000 万画素', () => {
		expect(MAX_PIXELS).toBe(50_000_000);
	});
});

describe('エラーメッセージ', () => {
	it('すべて日本語で、技術的な詳細を含まない', () => {
		for (const message of Object.values(IMAGE_LOAD_ERROR_MESSAGES)) {
			expect(message).toMatch(/[ぁ-んァ-ヶ]/);
			expect(message).not.toMatch(/Error|undefined|stack/);
		}
	});
});
