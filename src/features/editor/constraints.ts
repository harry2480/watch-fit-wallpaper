import {
	centeredTransform,
	clampScale,
	type FitMode,
	type ImageTransform,
	type Point,
	type Size,
} from './geometry';

/** Contain で出力範囲内に残す画像領域の基準値（Output px、要件定義 7.6） */
export const CONTAIN_MIN_VISIBLE_PX = 16;

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

/**
 * 1 軸の中心位置を制約する。
 * displayed: 表示中の画像の長さ、outputLength: 出力の長さ。
 */
function constrainAxis(
	center: number,
	displayed: number,
	outputLength: number,
	mode: FitMode,
): number {
	if (mode === 'cover') {
		// 7.5: outputLength - displayed / 2 <= center <= displayed / 2
		const min = outputLength - displayed / 2;
		const max = displayed / 2;
		// 浮動小数点誤差で displayed がわずかに出力より小さい場合は中央に置く
		if (min > max) {
			return outputLength / 2;
		}
		return clamp(center, min, max);
	}
	// 7.6: 画像と出力の重なりが visible 以上になるよう制約する。
	// 小さい画像・小さい出力では 16px が過大にならないよう、画像長と出力長で上限を設ける。
	const visible = Math.min(CONTAIN_MIN_VISIBLE_PX, displayed, outputLength);
	const min = visible - displayed / 2;
	const max = outputLength - visible + displayed / 2;
	return clamp(center, min, max);
}

/**
 * 倍率をモード別の範囲に収め、位置制約を適用する。
 * 不正な値（NaN・Infinity）が混入した場合は中央配置に戻す。
 */
export function constrainTransform(
	transform: ImageTransform,
	mode: FitMode,
	image: Size,
	output: Size,
): ImageTransform {
	if (
		!Number.isFinite(transform.centerX) ||
		!Number.isFinite(transform.centerY) ||
		!Number.isFinite(transform.scale) ||
		transform.scale <= 0
	) {
		return centeredTransform(mode, image, output);
	}
	const scale = clampScale(transform.scale, mode, image, output);
	return {
		centerX: constrainAxis(transform.centerX, image.width * scale, output.width, mode),
		centerY: constrainAxis(transform.centerY, image.height * scale, output.height, mode),
		scale,
		rotationDeg: 0,
	};
}

/** Output 座標で平行移動する（ドラッグ・方向キー） */
export function panTransform(
	transform: ImageTransform,
	delta: Point,
	mode: FitMode,
	image: Size,
	output: Size,
): ImageTransform {
	return constrainTransform(
		{ ...transform, centerX: transform.centerX + delta.x, centerY: transform.centerY + delta.y },
		mode,
		image,
		output,
	);
}

/**
 * anchor（Output 座標）にある画像上の点が動かないように倍率を変える（7.9・7.10）。
 * 倍率は範囲内に制限し、制限後の倍率で中心を補正する。
 */
export function zoomTransformAt(
	transform: ImageTransform,
	requestedScale: number,
	anchor: Point,
	mode: FitMode,
	image: Size,
	output: Size,
): ImageTransform {
	const scale = clampScale(requestedScale, mode, image, output);
	const ratio = scale / transform.scale;
	return constrainTransform(
		{
			...transform,
			centerX: anchor.x - (anchor.x - transform.centerX) * ratio,
			centerY: anchor.y - (anchor.y - transform.centerY) * ratio,
			scale,
		},
		mode,
		image,
		output,
	);
}

/** モード切り替え（6.4）。構図を維持し、新しいモードの範囲外の場合だけ補正する */
export function switchFitMode(
	transform: ImageTransform,
	nextMode: FitMode,
	image: Size,
	output: Size,
): ImageTransform {
	return constrainTransform(transform, nextMode, image, output);
}

/**
 * 出力サイズ変更（モデル変更、4.6）。
 * 中心の相対位置と見た目の相対サイズを維持し、制約を再適用する。
 */
export function resizeOutput(
	transform: ImageTransform,
	previousOutput: Size,
	nextOutput: Size,
	mode: FitMode,
	image: Size,
): ImageTransform {
	const ratioX = nextOutput.width / previousOutput.width;
	const ratioY = nextOutput.height / previousOutput.height;
	return constrainTransform(
		{
			...transform,
			centerX: transform.centerX * ratioX,
			centerY: transform.centerY * ratioY,
			scale: transform.scale * Math.min(ratioX, ratioY),
		},
		mode,
		image,
		nextOutput,
	);
}
