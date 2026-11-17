import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WatchPreview } from '@/components/editor/WatchPreview';
import { centeredTransform, type ImageTransform } from '@/features/editor/geometry';

const output = { width: 416, height: 496 };
const image = { width: 1000, height: 1000 };

function setup(onTransformCommit = vi.fn()) {
	const transform = centeredTransform('contain', image, output);
	render(
		<WatchPreview
			source={{} as CanvasImageSource}
			sourceSize={image}
			output={output}
			transform={transform}
			backgroundColor="#000000"
			label="プレビュー"
			interaction={{ fitMode: 'contain', onTransformCommit }}
		/>,
	);
	const canvas = screen.getByRole('img', { name: 'プレビュー' });
	// 表示上は出力の半分の大きさ（208×248）で、(10, 20) に描画されている
	canvas.getBoundingClientRect = () =>
		({
			left: 10,
			top: 20,
			width: 208,
			height: 248,
			right: 218,
			bottom: 268,
			x: 10,
			y: 20,
		}) as DOMRect;
	canvas.setPointerCapture = vi.fn();
	canvas.releasePointerCapture = vi.fn();
	return { canvas, transform, onTransformCommit };
}

function pointer(type: string, canvas: HTMLElement, id: number, x: number, y: number) {
	fireEvent(
		canvas,
		Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
			pointerId: id,
			pointerType: 'touch',
			button: 0,
			clientX: x,
			clientY: y,
		}),
	);
}

describe('WatchPreview の操作', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('ドラッグは移動中に確定せず、指を離したときに Output 座標で確定する', () => {
		const { canvas, transform, onTransformCommit } = setup();
		pointer('pointerdown', canvas, 1, 100, 100);
		expect(canvas.setPointerCapture).toHaveBeenCalledWith(1);
		pointer('pointermove', canvas, 1, 110, 95);
		pointer('pointermove', canvas, 1, 120, 90);
		expect(onTransformCommit).not.toHaveBeenCalled();
		pointer('pointerup', canvas, 1, 120, 90);
		expect(onTransformCommit).toHaveBeenCalledTimes(1);
		const committed = onTransformCommit.mock.calls[0]?.[0] as ImageTransform;
		// 表示は半分の大きさなので、20px・-10px の移動は Output で 40・-20
		expect(committed.centerX).toBeCloseTo(transform.centerX + 40, 9);
		expect(committed.centerY).toBeCloseTo(transform.centerY - 20, 9);
	});

	it('pointercancel でも表示中の状態で確定して操作を終える', () => {
		const { canvas, onTransformCommit } = setup();
		pointer('pointerdown', canvas, 1, 100, 100);
		pointer('pointermove', canvas, 1, 105, 100);
		pointer('pointercancel', canvas, 1, 105, 100);
		expect(onTransformCommit).toHaveBeenCalledTimes(1);
		pointer('pointermove', canvas, 1, 200, 200);
		expect(onTransformCommit).toHaveBeenCalledTimes(1);
	});

	it('2 本指のピンチで拡大し、両方の指を離すと確定する', () => {
		const { canvas, transform, onTransformCommit } = setup();
		pointer('pointerdown', canvas, 1, 100, 140);
		pointer('pointerdown', canvas, 2, 120, 140);
		pointer('pointermove', canvas, 2, 140, 140);
		pointer('pointerup', canvas, 2, 140, 140);
		expect(onTransformCommit).not.toHaveBeenCalled();
		pointer('pointerup', canvas, 1, 100, 140);
		const committed = onTransformCommit.mock.calls[0]?.[0] as ImageTransform;
		expect(committed.scale).toBeCloseTo(transform.scale * 2, 9);
	});

	it('ホイールはスクロールを止めてズームし、止まってから確定する', () => {
		const { canvas, transform, onTransformCommit } = setup();
		const wheel = new WheelEvent('wheel', {
			deltaY: -100,
			deltaMode: 0,
			clientX: 114,
			clientY: 144,
			bubbles: true,
			cancelable: true,
		});
		canvas.dispatchEvent(wheel);
		expect(wheel.defaultPrevented).toBe(true);
		expect(onTransformCommit).not.toHaveBeenCalled();
		vi.advanceTimersByTime(200);
		const committed = onTransformCommit.mock.calls[0]?.[0] as ImageTransform;
		expect(committed.scale).toBeGreaterThan(transform.scale);
	});

	it('マウスの右ボタンでは操作しない', () => {
		const { canvas, onTransformCommit } = setup();
		fireEvent(
			canvas,
			Object.assign(new Event('pointerdown', { bubbles: true }), {
				pointerId: 1,
				pointerType: 'mouse',
				button: 2,
				clientX: 0,
				clientY: 0,
			}),
		);
		pointer('pointerup', canvas, 1, 0, 0);
		expect(onTransformCommit).not.toHaveBeenCalled();
	});

	it('プレビュー領域ではブラウザのタッチ操作を止める', () => {
		const { canvas } = setup();
		expect(canvas.className).toContain('touch-none');
	});
});
