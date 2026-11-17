import { type RefObject, useEffect, useRef } from 'react';
import { panTransform, zoomTransformAt } from '@/features/editor/constraints';
import type { FitMode, ImageTransform, Point, Size } from '@/features/editor/geometry';
import {
	clientPointToOutput,
	distance,
	midpoint,
	normalizeWheelDelta,
	type PinchStart,
	pinchTransform,
	type ViewportRect,
	viewportDeltaToOutput,
	wheelZoomFactor,
} from '@/features/editor/gestures';

export type GestureContext = {
	/** 確定済みの Transform */
	transform: ImageTransform;
	fitMode: FitMode;
	image: Size;
	output: Size;
};

export type PointerGestureOptions = {
	/** 操作できない状態（画像未選択・出力不可）では null を返す */
	getContext: () => GestureContext | null;
	/** 操作中の中間値。React の状態にせず、描画だけに使う（要件定義 7.12） */
	onPreview: (transform: ImageTransform) => void;
	/** 操作終了時の確定値 */
	onCommit: (transform: ImageTransform) => void;
};

/** ホイール操作が止まってから確定するまでの時間 */
const WHEEL_COMMIT_DELAY_MS = 150;

/**
 * ドラッグ・ピンチ・ホイールによる画像操作（要件定義 7.7〜7.10）。
 * Pointer Events と pointer capture を使い、要素外に指が出ても操作を続ける。
 */
export function usePointerGestures(
	elementRef: RefObject<HTMLElement | null>,
	options: PointerGestureOptions,
): void {
	const optionsRef = useRef(options);
	optionsRef.current = options;

	useEffect(() => {
		const element = elementRef.current;
		if (!element) {
			return;
		}
		const pointers = new Map<number, Point>();
		let rect: ViewportRect = { left: 0, top: 0, width: 0, height: 0 };
		let live: ImageTransform | null = null;
		let drag: { start: Point; transform: ImageTransform } | null = null;
		let pinch: PinchStart | null = null;
		let wheelTimer: ReturnType<typeof setTimeout> | undefined;

		const context = () => optionsRef.current.getContext();

		const preview = (transform: ImageTransform) => {
			live = transform;
			optionsRef.current.onPreview(transform);
		};

		const commit = () => {
			if (live) {
				optionsRef.current.onCommit(live);
			}
			live = null;
		};

		const flushWheel = () => {
			if (wheelTimer !== undefined) {
				clearTimeout(wheelTimer);
				wheelTimer = undefined;
				commit();
			}
		};

		/** 指の本数が変わったら、現在の表示状態を起点に操作を組み立て直す */
		const restart = (ctx: GestureContext) => {
			const base = live ?? ctx.transform;
			const points = [...pointers.values()];
			const [a, b] = points;
			if (a && b) {
				const pa = clientPointToOutput(a, rect, ctx.output);
				const pb = clientPointToOutput(b, rect, ctx.output);
				pinch = { transform: base, distance: distance(pa, pb), midpoint: midpoint(pa, pb) };
				drag = null;
			} else if (a) {
				drag = { start: a, transform: base };
				pinch = null;
			}
		};

		const onPointerDown = (event: PointerEvent) => {
			const ctx = context();
			if (!ctx || (event.pointerType === 'mouse' && event.button !== 0)) {
				return;
			}
			flushWheel();
			event.preventDefault();
			element.setPointerCapture?.(event.pointerId);
			pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
			rect = element.getBoundingClientRect();
			restart(ctx);
		};

		const onPointerMove = (event: PointerEvent) => {
			if (!pointers.has(event.pointerId)) {
				return;
			}
			const ctx = context();
			if (!ctx) {
				return;
			}
			pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
			if (pinch) {
				const [a, b] = [...pointers.values()];
				if (!a || !b) return;
				const pa = clientPointToOutput(a, rect, ctx.output);
				const pb = clientPointToOutput(b, rect, ctx.output);
				preview(
					pinchTransform(
						pinch,
						distance(pa, pb),
						midpoint(pa, pb),
						ctx.fitMode,
						ctx.image,
						ctx.output,
					),
				);
			} else if (drag) {
				const delta = viewportDeltaToOutput(
					{ x: event.clientX - drag.start.x, y: event.clientY - drag.start.y },
					rect,
					ctx.output,
				);
				preview(panTransform(drag.transform, delta, ctx.fitMode, ctx.image, ctx.output));
			}
		};

		const onPointerEnd = (event: PointerEvent) => {
			if (!pointers.delete(event.pointerId)) {
				return;
			}
			element.releasePointerCapture?.(event.pointerId);
			const ctx = context();
			if (pointers.size === 0 || !ctx) {
				// pointercancel を含め、表示中の状態で確定して操作を安全に終える
				pointers.clear();
				drag = null;
				pinch = null;
				commit();
				return;
			}
			restart(ctx);
		};

		const onWheel = (event: WheelEvent) => {
			const ctx = context();
			if (!ctx) {
				return;
			}
			// 編集領域上でズームを扱うときだけ、ブラウザのスクロールを止める
			event.preventDefault();
			const base = live ?? ctx.transform;
			const deltaPx = normalizeWheelDelta(event.deltaY, event.deltaMode, window.innerHeight);
			const anchor = clientPointToOutput(
				{ x: event.clientX, y: event.clientY },
				element.getBoundingClientRect(),
				ctx.output,
			);
			preview(
				zoomTransformAt(
					base,
					base.scale * wheelZoomFactor(deltaPx),
					anchor,
					ctx.fitMode,
					ctx.image,
					ctx.output,
				),
			);
			clearTimeout(wheelTimer);
			wheelTimer = setTimeout(() => {
				wheelTimer = undefined;
				commit();
			}, WHEEL_COMMIT_DELAY_MS);
		};

		element.addEventListener('pointerdown', onPointerDown);
		element.addEventListener('pointermove', onPointerMove);
		element.addEventListener('pointerup', onPointerEnd);
		element.addEventListener('pointercancel', onPointerEnd);
		element.addEventListener('lostpointercapture', onPointerEnd);
		element.addEventListener('wheel', onWheel, { passive: false });
		return () => {
			element.removeEventListener('pointerdown', onPointerDown);
			element.removeEventListener('pointermove', onPointerMove);
			element.removeEventListener('pointerup', onPointerEnd);
			element.removeEventListener('pointercancel', onPointerEnd);
			element.removeEventListener('lostpointercapture', onPointerEnd);
			element.removeEventListener('wheel', onWheel);
			flushWheel();
		};
	}, [elementRef]);
}
