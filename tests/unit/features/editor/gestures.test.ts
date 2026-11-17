import { describe, expect, it } from 'vitest';
import { centeredTransform, containScale, coverScale } from '@/features/editor/geometry';
import {
	clientPointToOutput,
	normalizeWheelDelta,
	pinchTransform,
	viewportDeltaToOutput,
	wheelZoomFactor,
} from '@/features/editor/gestures';

const output = { width: 416, height: 496 };
const image = { width: 1000, height: 1000 };

describe('Viewport → Output 座標変換', () => {
	const rect = { left: 30, top: 100, width: 208, height: 248 };

	it('移動量を描画矩形と出力サイズの比で変換する', () => {
		expect(viewportDeltaToOutput({ x: 10, y: -5 }, rect, output)).toEqual({ x: 20, y: -10 });
	});

	it('クライアント座標から描画矩形のオフセットを引いて変換する', () => {
		expect(clientPointToOutput({ x: 30, y: 100 }, rect, output)).toEqual({ x: 0, y: 0 });
		expect(clientPointToOutput({ x: 238, y: 348 }, rect, output)).toEqual({ x: 416, y: 496 });
	});

	it('描画矩形の幅が 0 ならゼロ除算せず移動しない', () => {
		const empty = { left: 0, top: 0, width: 0, height: 0 };
		expect(viewportDeltaToOutput({ x: 10, y: 10 }, empty, output)).toEqual({ x: 0, y: 0 });
		expect(clientPointToOutput({ x: 10, y: 10 }, empty, output)).toEqual({ x: 208, y: 248 });
	});
});

describe('pinchTransform', () => {
	const start = {
		transform: { ...centeredTransform('contain', image, output), scale: 0.4 },
		distance: 100,
		midpoint: { x: 150, y: 200 },
	};

	it('倍率は開始倍率 × 距離の比', () => {
		const t = pinchTransform(start, 150, start.midpoint, 'contain', image, output);
		expect(t.scale).toBeCloseTo(0.6, 12);
	});

	it('開始時の中心にあった画像上の点が、現在の中心に来る（パンも反映）', () => {
		const current = { x: 170, y: 190 };
		const t = pinchTransform(start, 130, current, 'contain', image, output);
		const sourceX = (start.midpoint.x - start.transform.centerX) / start.transform.scale;
		const sourceY = (start.midpoint.y - start.transform.centerY) / start.transform.scale;
		expect(t.centerX + sourceX * t.scale).toBeCloseTo(current.x, 9);
		expect(t.centerY + sourceY * t.scale).toBeCloseTo(current.y, 9);
	});

	it('倍率はモード別の範囲に制限する', () => {
		expect(pinchTransform(start, 10000, start.midpoint, 'contain', image, output).scale).toBe(
			containScale(image, output) * 4,
		);
		const cover = { ...start, transform: centeredTransform('cover', image, output) };
		expect(pinchTransform(cover, 1, cover.midpoint, 'cover', image, output).scale).toBe(
			coverScale(image, output),
		);
	});

	it('開始距離が 0（2 本の指が同じ位置）なら倍率を変えずパンだけ反映する', () => {
		const zero = { ...start, distance: 0 };
		const t = pinchTransform(zero, 50, { x: 160, y: 200 }, 'contain', image, output);
		expect(t.scale).toBe(0.4);
		expect(t.centerX).toBeCloseTo(start.transform.centerX + 10, 9);
	});
});

describe('ホイール', () => {
	it.each([
		[10, 0, 10],
		[3, 1, 48],
		[1, 2, 120],
		[1000, 0, 120],
		[-1000, 0, -120],
		[Number.NaN, 0, 0],
	])('deltaY=%d, deltaMode=%d → %d px', (deltaY, deltaMode, expected) => {
		expect(normalizeWheelDelta(deltaY, deltaMode, 800)).toBe(expected);
	});

	it('下方向で縮小、上方向で拡大し、逆操作で元に戻る（指数関数）', () => {
		expect(wheelZoomFactor(100)).toBeLessThan(1);
		expect(wheelZoomFactor(-100)).toBeGreaterThan(1);
		expect(wheelZoomFactor(100) * wheelZoomFactor(-100)).toBeCloseTo(1, 12);
		expect(wheelZoomFactor(0)).toBe(1);
	});

	it('1 回のイベントで急激に変化しない', () => {
		const factor = wheelZoomFactor(normalizeWheelDelta(100000, 0, 800));
		expect(factor).toBeGreaterThan(0.8);
	});
});
