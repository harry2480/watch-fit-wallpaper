#!/usr/bin/env node
// Apple Watch 実機検証用のテスト画像を生成する（要件定義 19.2）。
// 実在の人物の写真は使わず、人物の代わりに単純なシルエットを描く。
// 使い方: node scripts/generate-verification-images.mjs [出力先]（既定: docs/verification/images）
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const outDir = process.argv[2] ?? 'docs/verification/images';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
	let c = n;
	for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c >>> 0;
});

function crc32(buffer) {
	let c = 0xffffffff;
	for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
	const length = Buffer.alloc(4);
	length.writeUInt32BE(data.length);
	const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body));
	return Buffer.concat([length, body, crc]);
}

/** RGB 画像（width × height、pixel(x, y) が [r, g, b] を返す）を PNG にする */
function encodePng(width, height, pixel) {
	const raw = Buffer.alloc((width * 3 + 1) * height);
	let offset = 0;
	for (let y = 0; y < height; y += 1) {
		raw[offset++] = 0;
		for (let x = 0; x < width; x += 1) {
			const [r, g, b] = pixel(x, y);
			raw[offset++] = r;
			raw[offset++] = g;
			raw[offset++] = b;
		}
	}
	const header = Buffer.alloc(13);
	header.writeUInt32BE(width, 0);
	header.writeUInt32BE(height, 4);
	header[8] = 8;
	header[9] = 2;
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', header),
		chunk('IDAT', deflateSync(raw, { level: 9 })),
		chunk('IEND', Buffer.alloc(0)),
	]);
}

const WHITE = [255, 255, 255];
const BLACK = [0, 0, 0];
const SKY = [135, 190, 230];
const ACCENT = [230, 80, 60];
const MARKS = {
	top: [230, 60, 60],
	right: [60, 170, 80],
	bottom: [60, 110, 230],
	left: [240, 190, 40],
};

/** 人物の代わりのシルエット（頭と肩）。cx, cy は頭の中心、r は頭の半径 */
function silhouette(x, y, cx, cy, r) {
	const head = (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
	const shoulderY = cy + r * 1.3;
	const body =
		y >= shoulderY &&
		((x - cx) / (r * 2.2)) ** 2 + ((y - shoulderY - r * 1.6) / (r * 1.8)) ** 2 <= 1;
	return head || body;
}

/** 中央の十字と目盛りの線 */
function crosshair(x, y, w, h, thickness = 3) {
	return Math.abs(x - w / 2) < thickness || Math.abs(y - h / 2) < thickness;
}

const images = {
	// 中央に人物（シルエット）がいる画像
	'01-center-subject.png': [
		1200,
		1500,
		(x, y, w, h) =>
			silhouette(x, y, w / 2, h * 0.38, w * 0.12)
				? [40, 40, 50]
				: crosshair(x, y, w, h, 2)
					? ACCENT
					: SKY,
	],
	// 端に被写体がいる画像（右下）
	'02-edge-subject.png': [
		1200,
		1500,
		(x, y, w, h) => (silhouette(x, y, w * 0.82, h * 0.7, w * 0.08) ? [40, 40, 50] : SKY),
	],
	// 横長画像（16:9）。左右の端に目印
	'03-landscape.png': [
		1920,
		1080,
		(x, y, w) =>
			x < 40
				? MARKS.left
				: x >= w - 40
					? MARKS.right
					: (Math.floor(x / 120) + Math.floor(y / 120)) % 2
						? [200, 220, 240]
						: WHITE,
	],
	// 縦長画像（9:19.5 程度）。上下の端に目印
	'04-portrait.png': [
		900,
		1950,
		(x, y, _w, h) =>
			y < 40
				? MARKS.top
				: y >= h - 40
					? MARKS.bottom
					: (Math.floor(x / 100) + Math.floor(y / 100)) % 2
						? [220, 240, 200]
						: WHITE,
	],
	// 四辺に色の違う目印がある画像（どの辺が切れたかが分かる）
	'05-edge-markers.png': [
		1000,
		1200,
		(x, y, w, h) => {
			const band = 30;
			if (y < band) return MARKS.top;
			if (x >= w - band) return MARKS.right;
			if (y >= h - band) return MARKS.bottom;
			if (x < band) return MARKS.left;
			return crosshair(x, y, w, h, 2) ? BLACK : WHITE;
		},
	],
	// 黒背景に白い枠（余白と追加ズームの確認）
	'06-black-white-frame.png': [
		1000,
		1200,
		(x, y, w, h) => {
			const inset = 20;
			const width = 12;
			const onFrame =
				x >= inset &&
				x < w - inset &&
				y >= inset &&
				y < h - inset &&
				(x < inset + width ||
					x >= w - inset - width ||
					y < inset + width ||
					y >= h - inset - width);
			return onFrame ? WHITE : BLACK;
		},
	],
	// 格子（位置ずれ・拡大率の確認）。100px ごとに細線、中央に太線
	'07-grid.png': [
		1000,
		1200,
		(x, y, w, h) =>
			crosshair(x, y, w, h, 3) ? ACCENT : x % 100 < 2 || y % 100 < 2 ? [60, 60, 60] : WHITE,
	],
};

mkdirSync(outDir, { recursive: true });
for (const [name, [width, height, draw]] of Object.entries(images)) {
	const png = encodePng(width, height, (x, y) => draw(x, y, width, height));
	writeFileSync(join(outDir, name), png);
	console.log(`${name}: ${width}x${height} (${Math.round(png.length / 1024)} KB)`);
}
