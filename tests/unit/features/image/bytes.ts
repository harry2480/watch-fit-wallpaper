/** テスト用に各形式のヘッダーバイト列を組み立てる */

function u32be(n: number): number[] {
	return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

function u16be(n: number): number[] {
	return [(n >>> 8) & 0xff, n & 0xff];
}

function u24le(n: number): number[] {
	return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff];
}

function text(s: string): number[] {
	return [...s].map((c) => c.charCodeAt(0));
}

export function pngHeader(width: number, height: number): Uint8Array {
	return new Uint8Array([
		0x89,
		0x50,
		0x4e,
		0x47,
		0x0d,
		0x0a,
		0x1a,
		0x0a,
		...u32be(13),
		...text('IHDR'),
		...u32be(width),
		...u32be(height),
		8,
		6,
		0,
		0,
		0,
	]);
}

/** APP1（EXIF 相当）を挟んでから SOF0 を置いた JPEG */
export function jpegHeader(width: number, height: number, app1Length = 1000): Uint8Array {
	return new Uint8Array([
		0xff,
		0xd8,
		0xff,
		0xe1,
		...u16be(app1Length),
		...new Array(app1Length - 2).fill(0),
		0xff,
		0xc0,
		...u16be(17),
		8,
		...u16be(height),
		...u16be(width),
		3,
		...new Array(9).fill(0),
	]);
}

export function webpVp8xHeader(width: number, height: number): Uint8Array {
	return new Uint8Array([
		...text('RIFF'),
		...u32be(0),
		...text('WEBP'),
		...text('VP8X'),
		...u32be(10),
		0,
		0,
		0,
		0,
		...u24le(width - 1),
		...u24le(height - 1),
	]);
}

export function webpVp8lHeader(width: number, height: number): Uint8Array {
	const w = width - 1;
	const h = height - 1;
	return new Uint8Array([
		...text('RIFF'),
		...u32be(0),
		...text('WEBP'),
		...text('VP8L'),
		...u32be(10),
		0x2f,
		w & 0xff,
		((w >> 8) & 0x3f) | ((h & 0x03) << 6),
		(h >> 2) & 0xff,
		(h >> 10) & 0x0f,
	]);
}

export function webpVp8Header(width: number, height: number): Uint8Array {
	return new Uint8Array([
		...text('RIFF'),
		...u32be(0),
		...text('WEBP'),
		...text('VP8 '),
		...u32be(10),
		0,
		0,
		0,
		0x9d,
		0x01,
		0x2a,
		width & 0xff,
		(width >> 8) & 0x3f,
		height & 0xff,
		(height >> 8) & 0x3f,
	]);
}

export function ftypHeader(brand: string): Uint8Array {
	return new Uint8Array([
		...u32be(24),
		...text('ftyp'),
		...text(brand),
		...u32be(0),
		...text('mif1heic'),
	]);
}

export const GIF = new Uint8Array(text('GIF89a\u0001\u0000\u0001\u0000'));
export const PDF = new Uint8Array(text('%PDF-1.7\n'));
export const SVG = new TextEncoder().encode(
	'  <?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"></svg>',
);
