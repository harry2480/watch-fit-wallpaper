import { describe, expect, it, vi } from 'vitest';
import { MAX_PREVIEW_PIXELS, previewRenderScale, renderImage } from '@/features/editor/renderer';

describe('previewRenderScale', () => {
	const output = { width: 416, height: 496 };

	it('表示幅 × devicePixelRatio に合わせて縮小する', () => {
		expect(previewRenderScale(output, 104, 2)).toBeCloseTo(0.5, 12);
	});

	it('出力解像度を超えて描かない', () => {
		expect(previewRenderScale(output, 1000, 3)).toBe(1);
	});

	it('メモリ上限を超えない', () => {
		const big = { width: 2048, height: 2048 * 2 };
		const scale = previewRenderScale(big, 10000, 3);
		expect(big.width * big.height * scale * scale).toBeLessThanOrEqual(MAX_PREVIEW_PIXELS + 1);
	});

	it.each([
		[0, 2],
		[Number.NaN, 2],
		[100, Number.NaN],
		[100, 0],
	])('不正な表示幅 %d・DPR %d でも有限の値を返す', (width, dpr) => {
		const scale = previewRenderScale(output, width, dpr);
		expect(Number.isFinite(scale)).toBe(true);
		expect(scale).toBeGreaterThan(0);
	});
});

describe('renderImage の描画順序', () => {
	it('サイズ設定 → 行列初期化 → 背景 → 中心へ移動 → 倍率 → 描画 → 復元 の順に呼ぶ', () => {
		const calls: string[] = [];
		const canvas = { width: 0, height: 0 };
		const record =
			(name: string) =>
			(...args: unknown[]) =>
				calls.push(`${name}(${args.map((a) => (typeof a === 'number' ? a : '_')).join(',')})`);
		const ctx = {
			canvas,
			setTransform: vi.fn(record('setTransform')),
			fillRect: vi.fn(record('fillRect')),
			save: vi.fn(record('save')),
			scale: vi.fn(record('scale')),
			translate: vi.fn(record('translate')),
			rotate: vi.fn(record('rotate')),
			drawImage: vi.fn(record('drawImage')),
			restore: vi.fn(record('restore')),
			set fillStyle(value: string) {
				calls.push(`fillStyle=${value}`);
			},
		} as unknown as CanvasRenderingContext2D;
		renderImage(
			ctx,
			{
				source: {} as CanvasImageSource,
				sourceWidth: 200,
				sourceHeight: 100,
				outputWidth: 400,
				outputHeight: 300,
				transform: { centerX: 150, centerY: 120, scale: 2, rotationDeg: 0 },
				backgroundColor: '#123456',
			},
			0.5,
		);
		expect(canvas).toEqual({ width: 200, height: 150 });
		expect(calls).toEqual([
			'setTransform(1,0,0,1,0,0)',
			'fillStyle=#123456',
			'fillRect(0,0,200,150)',
			'save()',
			'scale(0.5,0.5)',
			'translate(150,120)',
			'scale(2,2)',
			'drawImage(_,-100,-50,200,100)',
			'restore()',
		]);
	});

	it('Canvas サイズの丸めで縦横の比率がずれる分を描画行列で補正する', () => {
		const scales: number[][] = [];
		const ctx = {
			canvas: { width: 0, height: 0 },
			setTransform: vi.fn(),
			fillRect: vi.fn(),
			save: vi.fn(),
			restore: vi.fn(),
			translate: vi.fn(),
			drawImage: vi.fn(),
			scale: vi.fn((x: number, y: number) => scales.push([x, y])),
		} as unknown as CanvasRenderingContext2D;
		renderImage(
			ctx,
			{
				source: {} as CanvasImageSource,
				sourceWidth: 100,
				sourceHeight: 100,
				outputWidth: 416,
				outputHeight: 496,
				transform: { centerX: 208, centerY: 248, scale: 1, rotationDeg: 0 },
				backgroundColor: '#000000',
			},
			0.37,
		);
		// 416×0.37=153.92→154、496×0.37=183.52→184
		expect(ctx.canvas).toEqual({ width: 154, height: 184 });
		expect(scales[0]).toEqual([154 / 416, 184 / 496]);
	});
});
