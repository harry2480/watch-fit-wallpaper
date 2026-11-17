import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef, StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WatchPreview, type WatchPreviewHandle } from '@/components/editor/WatchPreview';
import { centeredTransform, type ImageTransform } from '@/features/editor/geometry';
import { contentRect } from '@/hooks/usePointerGestures';

const output = { width: 416, height: 496 };
const image = { width: 1000, height: 1000 };

function setup(onTransformCommit = vi.fn()) {
	const transform = centeredTransform('contain', image, output);
	// 実アプリと同じく、画像リソースは同じオブジェクトを渡し続ける
	const source = {} as CanvasImageSource;
	const utils = render(
		<WatchPreview
			source={source}
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
	const rerender = (next: ImageTransform) =>
		utils.rerender(
			<WatchPreview
				source={source}
				sourceSize={image}
				output={output}
				transform={next}
				backgroundColor="#000000"
				label="プレビュー"
				interaction={{ fitMode: 'contain', onTransformCommit }}
			/>,
		);
	return { canvas, transform, onTransformCommit, rerender };
}

function pointer(
	type: string,
	canvas: HTMLElement,
	id: number,
	x: number,
	y: number,
	isPrimary = false,
) {
	fireEvent(
		canvas,
		Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
			pointerId: id,
			pointerType: 'touch',
			button: 0,
			clientX: x,
			clientY: y,
			isPrimary,
		}),
	);
}

function wheel(canvas: HTMLElement, deltaY: number, x: number, y: number) {
	const event = new WheelEvent('wheel', {
		deltaY,
		deltaMode: 0,
		clientX: x,
		clientY: y,
		bubbles: true,
		cancelable: true,
	});
	canvas.dispatchEvent(event);
	return event;
}

/** Output 座標 p にある画像上の点（Source 座標） */
function sourcePointAt(t: ImageTransform, p: { x: number; y: number }) {
	return { x: (p.x - t.centerX) / t.scale, y: (p.y - t.centerY) / t.scale };
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

	it('2 本指のピンチで拡大し、開始時の中心にあった点が現在の中心に来る', () => {
		const { canvas, transform, onTransformCommit } = setup();
		pointer('pointerdown', canvas, 1, 100, 140, true);
		pointer('pointerdown', canvas, 2, 120, 140);
		pointer('pointermove', canvas, 2, 140, 150);
		pointer('pointerup', canvas, 2, 140, 150);
		expect(onTransformCommit).not.toHaveBeenCalled();
		pointer('pointerup', canvas, 1, 100, 140);
		const committed = onTransformCommit.mock.calls[0]?.[0] as ImageTransform;
		const startDistance = 20;
		const currentDistance = Math.hypot(40, 10);
		expect(committed.scale).toBeCloseTo((transform.scale * currentDistance) / startDistance, 9);
		// 開始時の中心 (110,140) → Output (200,240)、現在の中心 (120,145) → Output (220,250)
		const before = sourcePointAt(transform, { x: 200, y: 240 });
		const after = sourcePointAt(committed, { x: 220, y: 250 });
		expect(after.x).toBeCloseTo(before.x, 9);
		expect(after.y).toBeCloseTo(before.y, 9);
	});

	it('ピンチ中に 1 本離して残りの指でドラッグを続けても位置が飛ばない', () => {
		const { canvas, onTransformCommit } = setup();
		pointer('pointerdown', canvas, 1, 100, 140, true);
		pointer('pointerdown', canvas, 2, 120, 140);
		pointer('pointermove', canvas, 2, 140, 140);
		pointer('pointerup', canvas, 2, 140, 140);
		pointer('pointerup', canvas, 1, 100, 140);
		const afterPinch = onTransformCommit.mock.calls[0]?.[0] as ImageTransform;
		onTransformCommit.mockClear();
		// 別の操作: ピンチ → 1 本離す → 動かさずに離す
		pointer('pointerdown', canvas, 3, 100, 140, true);
		pointer('pointerdown', canvas, 4, 120, 140);
		pointer('pointerup', canvas, 4, 120, 140);
		pointer('pointermove', canvas, 3, 100, 140);
		pointer('pointerup', canvas, 3, 100, 140);
		const committed = onTransformCommit.mock.calls[0]?.[0] as ImageTransform | undefined;
		if (committed) {
			expect(committed.scale).toBeCloseTo(afterPinch.scale, 9);
		}
	});

	it('終了イベントを取りこぼした指が残っていても、次の 1 本指はドラッグになり確定する', () => {
		const { canvas, transform, onTransformCommit } = setup();
		pointer('pointerdown', canvas, 1, 100, 100, true);
		// id=1 の pointerup が来ないまま、新しい操作が始まる
		onTransformCommit.mockClear();
		pointer('pointerdown', canvas, 2, 100, 100, true);
		pointer('pointermove', canvas, 2, 110, 100);
		pointer('pointerup', canvas, 2, 110, 100);
		const committed = onTransformCommit.mock.calls.at(-1)?.[0] as ImageTransform;
		expect(committed.scale).toBe(transform.scale);
		expect(committed.centerX).toBeCloseTo(transform.centerX + 20, 9);
	});

	it('pointerup の後の lostpointercapture で二重に確定しない', () => {
		const { canvas, onTransformCommit } = setup();
		pointer('pointerdown', canvas, 1, 100, 100, true);
		pointer('pointermove', canvas, 1, 110, 100);
		pointer('pointerup', canvas, 1, 110, 100);
		pointer('lostpointercapture', canvas, 1, 110, 100);
		expect(onTransformCommit).toHaveBeenCalledTimes(1);
	});

	it('ボタンを押さないマウス移動では何もしない', () => {
		const { canvas, onTransformCommit } = setup();
		pointer('pointermove', canvas, 1, 110, 100);
		vi.advanceTimersByTime(500);
		expect(onTransformCommit).not.toHaveBeenCalled();
	});

	it('devicePixelRatio に関係なく CSS px で変換する', () => {
		const original = window.devicePixelRatio;
		Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });
		try {
			const { canvas, transform, onTransformCommit } = setup();
			pointer('pointerdown', canvas, 1, 100, 100, true);
			pointer('pointermove', canvas, 1, 110, 100);
			pointer('pointerup', canvas, 1, 110, 100);
			const committed = onTransformCommit.mock.calls[0]?.[0] as ImageTransform;
			expect(committed.centerX).toBeCloseTo(transform.centerX + 20, 9);
		} finally {
			Object.defineProperty(window, 'devicePixelRatio', { value: original, configurable: true });
		}
	});

	it('ホイールはスクロールを止め、カーソル位置を中心にズームし、止まってから確定する', () => {
		const { canvas, transform, onTransformCommit } = setup();
		// クライアント (60, 70) → Output (100, 100)
		const event = wheel(canvas, -100, 60, 70);
		expect(event.defaultPrevented).toBe(true);
		expect(onTransformCommit).not.toHaveBeenCalled();
		vi.advanceTimersByTime(200);
		const committed = onTransformCommit.mock.calls[0]?.[0] as ImageTransform;
		expect(committed.scale).toBeGreaterThan(transform.scale);
		const before = sourcePointAt(transform, { x: 100, y: 100 });
		const after = sourcePointAt(committed, { x: 100, y: 100 });
		expect(after.x).toBeCloseTo(before.x, 9);
		expect(after.y).toBeCloseTo(before.y, 9);
	});

	it('ドラッグ中のホイールはスクロールだけ止めて無視する', () => {
		const { canvas, transform, onTransformCommit } = setup();
		pointer('pointerdown', canvas, 1, 100, 100, true);
		expect(wheel(canvas, -100, 60, 70).defaultPrevented).toBe(true);
		vi.advanceTimersByTime(500);
		expect(onTransformCommit).not.toHaveBeenCalled();
		pointer('pointerup', canvas, 1, 100, 100);
		vi.advanceTimersByTime(500);
		for (const [committed] of onTransformCommit.mock.calls) {
			expect((committed as ImageTransform).scale).toBe(transform.scale);
		}
	});

	it('親が同じ値のオブジェクトを作り直して再描画しても、進行中の操作は続く', () => {
		const { canvas, transform, onTransformCommit, rerender } = setup();
		pointer('pointerdown', canvas, 1, 100, 100, true);
		pointer('pointermove', canvas, 1, 105, 100);
		rerender({ ...transform });
		pointer('pointermove', canvas, 1, 110, 100);
		pointer('pointerup', canvas, 1, 110, 100);
		const committed = onTransformCommit.mock.calls[0]?.[0] as ImageTransform;
		expect(committed.centerX).toBeCloseTo(transform.centerX + 20, 9);
	});

	it('確定待ちの間に親から別の構図が届いたら、古い操作を確定しない', () => {
		const { canvas, transform, onTransformCommit, rerender } = setup();
		wheel(canvas, -100, 60, 70);
		rerender({ ...transform, centerX: transform.centerX + 1 });
		vi.advanceTimersByTime(500);
		expect(onTransformCommit).not.toHaveBeenCalled();
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

describe('表示中の構図の取得（保存用）', () => {
	it('確定待ちのホイール操作を確定し、表示中の構図を返す', () => {
		vi.useFakeTimers();
		try {
			const ref = createRef<WatchPreviewHandle>();
			const onTransformCommit = vi.fn();
			const transform = centeredTransform('contain', image, output);
			render(
				<WatchPreview
					ref={ref}
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
			canvas.getBoundingClientRect = () =>
				({ left: 10, top: 20, width: 208, height: 248 }) as DOMRect;
			wheel(canvas, -100, 60, 70);
			const displayed = ref.current?.getDisplayedTransform() as ImageTransform;
			expect(displayed.scale).toBeGreaterThan(transform.scale);
			// 150ms 待たずに確定される
			expect(onTransformCommit).toHaveBeenCalledWith(displayed);
		} finally {
			vi.useRealTimers();
		}
	});

	it('操作していなければ確定値を返す', () => {
		const ref = createRef<WatchPreviewHandle>();
		const transform = centeredTransform('cover', image, output);
		render(
			<WatchPreview
				ref={ref}
				source={null}
				sourceSize={null}
				output={output}
				transform={transform}
				backgroundColor="#000000"
				label="読み取り専用"
			/>,
		);
		expect(ref.current?.getDisplayedTransform()).toEqual(transform);
	});
});

describe('Safari のジェスチャーイベント', () => {
	function gesture(canvas: HTMLElement, type: string, scale = 1) {
		const event = Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
			scale,
			clientX: 60,
			clientY: 70,
		});
		canvas.dispatchEvent(event);
		return event;
	}

	it('操作できるときはページのピンチズームを止め、トラックパッドのピンチでズームする', () => {
		const { canvas, transform, onTransformCommit } = setup();
		expect(gesture(canvas, 'gesturestart').defaultPrevented).toBe(true);
		expect(gesture(canvas, 'gesturechange', 1.5).defaultPrevented).toBe(true);
		gesture(canvas, 'gestureend', 1.5);
		const committed = onTransformCommit.mock.calls[0]?.[0] as ImageTransform;
		expect(committed.scale).toBeCloseTo(transform.scale * 1.5, 9);
	});

	it('ホイール操作の直後にトラックパッドのピンチを始めても、ピンチでズームできる', () => {
		vi.useFakeTimers();
		try {
			const { canvas, onTransformCommit } = setup();
			wheel(canvas, -100, 60, 70);
			gesture(canvas, 'gesturestart');
			const afterWheel = onTransformCommit.mock.calls[0]?.[0] as ImageTransform;
			expect(afterWheel).toBeDefined();
			gesture(canvas, 'gesturechange', 2);
			gesture(canvas, 'gestureend', 2);
			const afterPinch = onTransformCommit.mock.calls[1]?.[0] as ImageTransform;
			expect(afterPinch.scale).toBeCloseTo(afterWheel.scale * 2, 9);
		} finally {
			vi.useRealTimers();
		}
	});

	it('操作できないプレビューではページの標準動作を妨げない', () => {
		render(
			<WatchPreview
				source={null}
				sourceSize={null}
				output={output}
				transform={centeredTransform('cover', image, output)}
				backgroundColor="#000000"
				label="読み取り専用"
			/>,
		);
		const canvas = screen.getByRole('img', { name: '読み取り専用' });
		expect(gesture(canvas, 'gesturestart').defaultPrevented).toBe(false);
		expect(gesture(canvas, 'gesturechange', 2).defaultPrevented).toBe(false);
		expect(gesture(canvas, 'gestureend', 2).defaultPrevented).toBe(false);
	});
});

describe('contentRect', () => {
	it('border と padding を除いた矩形を返す', () => {
		const element = document.createElement('div');
		element.style.padding = '4px 6px';
		element.style.borderWidth = '2px';
		element.style.borderStyle = 'solid';
		element.getBoundingClientRect = () =>
			({ left: 10, top: 20, width: 120, height: 80 }) as DOMRect;
		document.body.append(element);
		expect(contentRect(element)).toEqual({ left: 18, top: 26, width: 104, height: 68 });
		element.remove();
	});
});

describe('StrictMode での描画', () => {
	it('再マウント後もプレビューを描画する', async () => {
		const fillRect = vi.fn();
		const getContext = vi
			.spyOn(HTMLCanvasElement.prototype, 'getContext')
			.mockImplementation(function (this: HTMLCanvasElement) {
				return {
					canvas: this,
					setTransform: vi.fn(),
					fillRect,
					save: vi.fn(),
					restore: vi.fn(),
					scale: vi.fn(),
					translate: vi.fn(),
					drawImage: vi.fn(),
				} as unknown as CanvasRenderingContext2D;
			} as never);
		const rect = vi
			.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
			.mockReturnValue({ left: 0, top: 0, width: 208, height: 248 } as DOMRect);
		try {
			render(
				<StrictMode>
					<WatchPreview
						source={{} as CanvasImageSource}
						sourceSize={image}
						output={output}
						transform={centeredTransform('cover', image, output)}
						backgroundColor="#000000"
						label="プレビュー"
					/>
				</StrictMode>,
			);
			await waitFor(() => expect(fillRect).toHaveBeenCalled());
		} finally {
			getContext.mockRestore();
			rect.mockRestore();
		}
	});
});
