import { type RefObject, useCallback, useEffect, useRef } from 'react';
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
	/** 確定済み（または表示中）の Transform */
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
 * 実際に描画されている矩形（content-box、CSS px）。
 * getBoundingClientRect は border・padding を含むため、それを除く（要件定義 7.8）。
 */
export function contentRect(element: HTMLElement): ViewportRect {
	const rect = element.getBoundingClientRect();
	const style = getComputedStyle(element);
	const px = (value: string) => Number.parseFloat(value) || 0;
	const left = px(style.borderLeftWidth) + px(style.paddingLeft);
	const right = px(style.borderRightWidth) + px(style.paddingRight);
	const top = px(style.borderTopWidth) + px(style.paddingTop);
	const bottom = px(style.borderBottomWidth) + px(style.paddingBottom);
	return {
		left: rect.left + left,
		top: rect.top + top,
		width: rect.width - left - right,
		height: rect.height - top - bottom,
	};
}

/** Safari の GestureEvent（標準の型定義に無い） */
type SafariGestureEvent = Event & { scale: number; clientX: number; clientY: number };

/**
 * ドラッグ・ピンチ・ホイールによる画像操作（要件定義 7.7〜7.10）。
 * Pointer Events と pointer capture を使い、要素外に指が出ても操作を続ける。
 * 戻り値の cancel() は、進行中の操作と確定待ちを確定せずに破棄する（外部から状態が変わったとき用）。
 */
export function usePointerGestures(
	elementRef: RefObject<HTMLElement | null>,
	options: PointerGestureOptions,
): { cancel: () => void } {
	const optionsRef = useRef(options);
	optionsRef.current = options;
	const cancelRef = useRef<() => void>(() => {});

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
		let trackpad: { transform: ImageTransform } | null = null;
		/** 操作できる状態で始まった Safari のジェスチャーの間だけ true */
		let gestureActive = false;

		const context = () => optionsRef.current.getContext();

		const preview = (transform: ImageTransform) => {
			live = transform;
			optionsRef.current.onPreview(transform);
		};

		const reset = () => {
			pointers.clear();
			drag = null;
			pinch = null;
			trackpad = null;
			gestureActive = false;
			live = null;
			clearTimeout(wheelTimer);
			wheelTimer = undefined;
		};

		const commit = () => {
			const value = live;
			reset();
			if (value) {
				optionsRef.current.onCommit(value);
			}
		};

		const flushWheel = () => {
			if (wheelTimer !== undefined) {
				commit();
			}
		};

		cancelRef.current = reset;

		/** 指の本数が変わったら、現在の表示状態を起点に操作を組み立て直す */
		const restart = (ctx: GestureContext) => {
			const base = live ?? ctx.transform;
			const [a, b] = [...pointers.values()];
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
			// 新しい操作の最初の指なら、終了イベントを取りこぼして残ったポインタを捨てる
			if (event.isPrimary && pointers.size > 0) {
				commit();
			}
			event.preventDefault();
			try {
				element.setPointerCapture(event.pointerId);
			} catch {
				// キャプチャできなくても操作は続ける
			}
			pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
			rect = contentRect(element);
			restart(ctx);
		};

		const onPointerMove = (event: PointerEvent) => {
			if (!pointers.has(event.pointerId)) {
				return;
			}
			const ctx = context();
			if (!ctx) {
				reset();
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
			try {
				element.releasePointerCapture(event.pointerId);
			} catch {
				// すでに解放済み
			}
			const ctx = context();
			if (pointers.size === 0 || !ctx) {
				// pointercancel を含め、表示中の状態で確定して操作を安全に終える
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
			// ドラッグ・ピンチ中のホイールは無視する（指の操作の確定と競合させない）
			if (pointers.size > 0) {
				return;
			}
			const base = live ?? ctx.transform;
			const deltaPx = normalizeWheelDelta(event.deltaY, event.deltaMode, window.innerHeight);
			const anchor = clientPointToOutput(
				{ x: event.clientX, y: event.clientY },
				contentRect(element),
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
			wheelTimer = setTimeout(commit, WHEEL_COMMIT_DELAY_MS);
		};

		// Safari: ページ全体のピンチズームを止める。トラックパッドのピンチ（ポインタ無し）はズームに使う
		const onGestureStart = (event: Event) => {
			const ctx = context();
			// 操作できない状態（画像未選択・読み取り専用）ではページの標準動作を妨げない
			if (!ctx) {
				gestureActive = false;
				return;
			}
			event.preventDefault();
			if (pointers.size === 0) {
				// 確定待ちのホイール操作を先に確定する（reset でフラグが消えないよう、フラグより前に行う）
				flushWheel();
				trackpad = { transform: live ?? context()?.transform ?? ctx.transform };
			}
			gestureActive = true;
		};
		const onGestureChange = (event: Event) => {
			if (!gestureActive) {
				return;
			}
			event.preventDefault();
			const ctx = context();
			const gesture = event as SafariGestureEvent;
			if (!ctx || !trackpad || pointers.size > 0 || !Number.isFinite(gesture.scale)) {
				return;
			}
			const anchor = clientPointToOutput(
				{ x: gesture.clientX, y: gesture.clientY },
				contentRect(element),
				ctx.output,
			);
			preview(
				zoomTransformAt(
					trackpad.transform,
					trackpad.transform.scale * gesture.scale,
					anchor,
					ctx.fitMode,
					ctx.image,
					ctx.output,
				),
			);
		};
		const onGestureEnd = (event: Event) => {
			if (!gestureActive) {
				return;
			}
			gestureActive = false;
			event.preventDefault();
			if (trackpad) {
				commit();
			}
		};

		const nonPassive = { passive: false } as const;
		element.addEventListener('pointerdown', onPointerDown);
		element.addEventListener('pointermove', onPointerMove);
		element.addEventListener('pointerup', onPointerEnd);
		element.addEventListener('pointercancel', onPointerEnd);
		element.addEventListener('lostpointercapture', onPointerEnd);
		element.addEventListener('wheel', onWheel, nonPassive);
		element.addEventListener('gesturestart', onGestureStart, nonPassive);
		element.addEventListener('gesturechange', onGestureChange, nonPassive);
		element.addEventListener('gestureend', onGestureEnd, nonPassive);
		return () => {
			element.removeEventListener('pointerdown', onPointerDown);
			element.removeEventListener('pointermove', onPointerMove);
			element.removeEventListener('pointerup', onPointerEnd);
			element.removeEventListener('pointercancel', onPointerEnd);
			element.removeEventListener('lostpointercapture', onPointerEnd);
			element.removeEventListener('wheel', onWheel);
			element.removeEventListener('gesturestart', onGestureStart);
			element.removeEventListener('gesturechange', onGestureChange);
			element.removeEventListener('gestureend', onGestureEnd);
			// アンマウント時は確定せずに破棄する
			reset();
			cancelRef.current = () => {};
		};
	}, [elementRef]);

	const cancel = useCallback(() => cancelRef.current(), []);
	return { cancel };
}
