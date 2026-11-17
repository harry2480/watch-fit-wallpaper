import { describe, expect, it } from 'vitest';
import { constrainTransform, panTransform } from '@/features/editor/constraints';
import { centeredTransform, type ImageTransform, type Size } from '@/features/editor/geometry';
import { type RenderParams, renderImage } from '@/features/editor/renderer';

type Rgb = [number, number, number];

const RED: Rgb = [255, 0, 0];
const GREEN: Rgb = [0, 255, 0];
const BLUE: Rgb = [0, 0, 255];
const YELLOW: Rgb = [255, 255, 0];
const MAGENTA: Rgb = [255, 0, 255];
const BACKGROUND = '#ff00ff';

/** アンチエイリアス・色変換の差を許容する誤差（チャンネルごと） */
const TOLERANCE = 8;

/** 固定のフィクスチャ: 左上=赤、右上=緑、左下=青、右下=黄 の 4 象限画像 */
function quadrantImage(width: number, height: number): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
	const hw = width / 2;
	const hh = height / 2;
	ctx.fillStyle = 'rgb(255,0,0)';
	ctx.fillRect(0, 0, hw, hh);
	ctx.fillStyle = 'rgb(0,255,0)';
	ctx.fillRect(hw, 0, hw, hh);
	ctx.fillStyle = 'rgb(0,0,255)';
	ctx.fillRect(0, hh, hw, hh);
	ctx.fillStyle = 'rgb(255,255,0)';
	ctx.fillRect(hw, hh, hw, hh);
	return canvas;
}

function render(image: HTMLCanvasElement, output: Size, transform: ImageTransform, scale = 1) {
	const canvas = document.createElement('canvas');
	const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
	const params: RenderParams = {
		source: image,
		sourceWidth: image.width,
		sourceHeight: image.height,
		outputWidth: output.width,
		outputHeight: output.height,
		transform,
		backgroundColor: BACKGROUND,
	};
	renderImage(ctx, params, scale);
	return ctx;
}

function pixel(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
): [number, number, number, number] {
	const d = ctx.getImageData(x, y, 1, 1).data;
	return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0, d[3] ?? 0];
}

function expectColor(ctx: CanvasRenderingContext2D, x: number, y: number, expected: Rgb) {
	const [r, g, b, a] = pixel(ctx, x, y);
	expect(a).toBe(255);
	for (const [actual, want] of [
		[r, expected[0]],
		[g, expected[1]],
		[b, expected[2]],
	] as const) {
		expect(Math.abs(actual - want), `(${x},${y}) = ${r},${g},${b}`).toBeLessThanOrEqual(TOLERANCE);
	}
}

function isColor(ctx: CanvasRenderingContext2D, x: number, y: number, expected: Rgb): boolean {
	const [r, g, b] = pixel(ctx, x, y);
	return [r - expected[0], g - expected[1], b - expected[2]].every((d) => Math.abs(d) <= TOLERANCE);
}

const image = quadrantImage(200, 100);
const square = { width: 100, height: 100 };
const size = { width: 200, height: 100 };

describe('renderImage（実ブラウザ）', () => {
	it('出力サイズの Canvas を作る', () => {
		const ctx = render(
			image,
			{ width: 416, height: 496 },
			centeredTransform('cover', size, { width: 416, height: 496 }),
		);
		expect([ctx.canvas.width, ctx.canvas.height]).toEqual([416, 496]);
	});

	it('Cover の中央配置: 4 象限が出力の 4 隅に来る', () => {
		const ctx = render(image, square, centeredTransform('cover', size, square));
		expectColor(ctx, 25, 25, RED);
		expectColor(ctx, 75, 25, GREEN);
		expectColor(ctx, 25, 75, BLUE);
		expectColor(ctx, 75, 75, YELLOW);
	});

	it('Contain: 画像全体が収まり、上下に背景色の余白が出る', () => {
		const ctx = render(image, square, centeredTransform('contain', size, square));
		expectColor(ctx, 50, 10, MAGENTA);
		expectColor(ctx, 50, 90, MAGENTA);
		expectColor(ctx, 10, 30, RED);
		expectColor(ctx, 90, 70, YELLOW);
	});

	it('端への移動: 右端まで動かすと画像の左半分だけが見える', () => {
		const t = panTransform(
			centeredTransform('cover', size, square),
			{ x: 1e6, y: 0 },
			'cover',
			size,
			square,
		);
		const ctx = render(image, square, t);
		expectColor(ctx, 5, 25, RED);
		expectColor(ctx, 95, 25, RED);
		expectColor(ctx, 95, 75, BLUE);
	});

	it('ズーム: 2 倍にすると中央付近の 4 象限が拡大される', () => {
		const t = { ...centeredTransform('cover', size, square), scale: 2 };
		const ctx = render(image, square, t);
		expectColor(ctx, 5, 5, RED);
		expectColor(ctx, 95, 95, YELLOW);
		// 境界は x=50 のまま
		expectColor(ctx, 45, 20, RED);
		expectColor(ctx, 55, 20, GREEN);
	});

	it('背景色: Contain の余白は指定色で不透明に塗られる', () => {
		const t = { ...centeredTransform('contain', size, square), scale: 0.1 };
		const ctx = render(image, square, t);
		expectColor(ctx, 2, 2, MAGENTA);
		expect(pixel(ctx, 2, 2)[3]).toBe(255);
	});

	it.each([
		[
			{ width: 333, height: 777 },
			{ width: 416, height: 496 },
		],
		[
			{ width: 4000, height: 101 },
			{ width: 374, height: 446 },
		],
		[
			{ width: 97, height: 3001 },
			{ width: 422, height: 514 },
		],
	])('Cover は最小倍率で端に寄せても 1px の余白も出ない（%o → %o）', (imgSize, output) => {
		const solid = document.createElement('canvas');
		solid.width = imgSize.width;
		solid.height = imgSize.height;
		const sctx = solid.getContext('2d') as CanvasRenderingContext2D;
		sctx.fillStyle = 'rgb(128,128,128)';
		sctx.fillRect(0, 0, imgSize.width, imgSize.height);
		for (const delta of [
			{ x: 1e6, y: 1e6 },
			{ x: -1e6, y: -1e6 },
		]) {
			const t = panTransform(
				centeredTransform('cover', imgSize, output),
				delta,
				'cover',
				imgSize,
				output,
			);
			const ctx = render(solid, output, constrainTransform(t, 'cover', imgSize, output));
			for (let x = 0; x < output.width; x += 1) {
				expect(isColor(ctx, x, 0, MAGENTA), `上端 x=${x}`).toBe(false);
				expect(isColor(ctx, x, output.height - 1, MAGENTA), `下端 x=${x}`).toBe(false);
			}
			for (let y = 0; y < output.height; y += 1) {
				expect(isColor(ctx, 0, y, MAGENTA), `左端 y=${y}`).toBe(false);
				expect(isColor(ctx, output.width - 1, y, MAGENTA), `右端 y=${y}`).toBe(false);
			}
		}
	});

	it('プレビュー（縮小描画）と出力の構図が一致する', () => {
		const output = { width: 400, height: 400 };
		const t = panTransform(
			{ ...centeredTransform('contain', size, output), scale: 1.3 },
			{ x: 37, y: -21 },
			'contain',
			size,
			output,
		);
		const full = render(image, output, t, 1);
		const preview = render(image, output, t, 0.5);
		expect([preview.canvas.width, preview.canvas.height]).toEqual([200, 200]);
		// 色の境界から離れた点で比較する
		let compared = 0;
		for (let y = 10; y < 400; y += 20) {
			for (let x = 10; x < 400; x += 20) {
				const a = pixel(full, x, y);
				const neighbours = [
					pixel(full, Math.max(0, x - 3), y),
					pixel(full, Math.min(399, x + 3), y),
					pixel(full, x, Math.max(0, y - 3)),
					pixel(full, x, Math.min(399, y + 3)),
				];
				if (neighbours.some((n) => n.some((v, i) => Math.abs(v - (a[i] ?? 0)) > TOLERANCE))) {
					continue;
				}
				const b = pixel(preview, Math.floor(x / 2), Math.floor(y / 2));
				for (let i = 0; i < 3; i += 1) {
					expect(Math.abs((a[i] ?? 0) - (b[i] ?? 0)), `(${x},${y})`).toBeLessThanOrEqual(TOLERANCE);
				}
				compared += 1;
			}
		}
		expect(compared).toBeGreaterThan(300);
	});
});
