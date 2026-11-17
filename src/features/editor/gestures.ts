import { constrainTransform } from './constraints';
import { clampScale, type FitMode, type ImageTransform, type Point, type Size } from './geometry';

/** 画面上の描画矩形（getBoundingClientRect の値、CSS px） */
export type ViewportRect = { left: number; top: number; width: number; height: number };

function isUsableRect(rect: ViewportRect): boolean {
	return (
		Number.isFinite(rect.width) && Number.isFinite(rect.height) && rect.width > 0 && rect.height > 0
	);
}

/**
 * Viewport（CSS px）の移動量を Output 座標の移動量に変換する（要件定義 7.8）。
 * rect は CSS の余白・オフセットを除いた実際の描画矩形を渡す。devicePixelRatio は関係しない。
 */
export function viewportDeltaToOutput(delta: Point, rect: ViewportRect, output: Size): Point {
	if (!isUsableRect(rect)) {
		return { x: 0, y: 0 };
	}
	return {
		x: (delta.x * output.width) / rect.width,
		y: (delta.y * output.height) / rect.height,
	};
}

/** クライアント座標を Output 座標に変換する */
export function clientPointToOutput(point: Point, rect: ViewportRect, output: Size): Point {
	if (!isUsableRect(rect)) {
		return { x: output.width / 2, y: output.height / 2 };
	}
	return {
		x: ((point.x - rect.left) * output.width) / rect.width,
		y: ((point.y - rect.top) * output.height) / rect.height,
	};
}

export function distance(a: Point, b: Point): number {
	return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpoint(a: Point, b: Point): Point {
	return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** ピンチ開始時の状態（すべて Output 座標） */
export type PinchStart = {
	transform: ImageTransform;
	distance: number;
	midpoint: Point;
};

/**
 * ピンチ（要件定義 7.9）。開始時の状態から計算し、位置制約は最後に 1 回だけ適用する。
 * - 倍率 = 開始倍率 × 現在の距離 / 開始距離（モード別の範囲に制限）
 * - 開始時に 2 本指の中心にあった画像上の点が、現在の 2 本指の中心に来るよう中心を補正する（パンも反映）
 * 開始距離が 0 の場合は倍率を変えず、パンだけを反映する。
 */
export function pinchTransform(
	start: PinchStart,
	currentDistance: number,
	currentMidpoint: Point,
	mode: FitMode,
	image: Size,
	output: Size,
): ImageTransform {
	const canZoom =
		Number.isFinite(start.distance) &&
		start.distance > 0 &&
		Number.isFinite(currentDistance) &&
		currentDistance > 0;
	const scale = canZoom
		? clampScale((start.transform.scale * currentDistance) / start.distance, mode, image, output)
		: start.transform.scale;
	const ratio = scale / start.transform.scale;
	return constrainTransform(
		{
			...start.transform,
			centerX: currentMidpoint.x - (start.midpoint.x - start.transform.centerX) * ratio,
			centerY: currentMidpoint.y - (start.midpoint.y - start.transform.centerY) * ratio,
			scale,
		},
		mode,
		image,
		output,
	);
}

const LINE_HEIGHT_PX = 16;
/** 1 回のホイールイベントで扱う最大移動量（急激な拡大縮小を防ぐ） */
const MAX_WHEEL_DELTA_PX = 120;
/** 100px のスクロールで約 16% 拡大縮小する */
const WHEEL_ZOOM_SPEED = 0.0015;

/** WheelEvent.deltaMode（0: px、1: 行、2: ページ）を px に正規化する（要件定義 7.10） */
export function normalizeWheelDelta(
	deltaY: number,
	deltaMode: number,
	pageHeightPx: number,
): number {
	if (!Number.isFinite(deltaY)) {
		return 0;
	}
	const px =
		deltaMode === 1 ? deltaY * LINE_HEIGHT_PX : deltaMode === 2 ? deltaY * pageHeightPx : deltaY;
	return Math.max(-MAX_WHEEL_DELTA_PX, Math.min(MAX_WHEEL_DELTA_PX, px));
}

/** ホイール移動量（px）からズーム倍率を求める。指数関数で滑らかに変化させる */
export function wheelZoomFactor(deltaPx: number): number {
	return Math.exp(-deltaPx * WHEEL_ZOOM_SPEED);
}
