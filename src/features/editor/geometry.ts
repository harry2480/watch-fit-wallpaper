/**
 * 画像編集のジオメトリ計算（要件定義 6章・7章）。
 * 編集状態はすべて Output 座標系で扱い、プレビューと出力で共通に使う。
 */

export type Size = { width: number; height: number };

export type Point = { x: number; y: number };

export type FitMode = 'cover' | 'contain';

export type ImageTransform = {
	/** Output 座標上の画像中心 */
	centerX: number;
	centerY: number;
	/** Source 座標から Output 座標への絶対倍率 */
	scale: number;
	/** MVP では常に 0 */
	rotationDeg: number;
};

/** Cover の最大倍率（Cover 倍率に対する比） */
export const COVER_MAX_RATIO = 4;
/** Contain の最小・最大倍率（Contain 倍率に対する比） */
export const CONTAIN_MIN_RATIO = 0.25;
export const CONTAIN_MAX_RATIO = 4;

export function isValidSize(size: Size): boolean {
	return (
		Number.isFinite(size.width) && Number.isFinite(size.height) && size.width > 0 && size.height > 0
	);
}

function assertValidSize(size: Size, label: string): void {
	if (!isValidSize(size)) {
		throw new RangeError(`${label}のサイズが不正です: ${size.width}x${size.height}`);
	}
}

/** coverScale = max(W / Iw, H / Ih) */
export function coverScale(image: Size, output: Size): number {
	assertValidSize(image, '画像');
	assertValidSize(output, '出力');
	return Math.max(output.width / image.width, output.height / image.height);
}

/** containScale = min(W / Iw, H / Ih) */
export function containScale(image: Size, output: Size): number {
	assertValidSize(image, '画像');
	assertValidSize(output, '出力');
	return Math.min(output.width / image.width, output.height / image.height);
}

/** 現在モードの基準倍率（スライダーの 100%） */
export function baseScale(mode: FitMode, image: Size, output: Size): number {
	return mode === 'cover' ? coverScale(image, output) : containScale(image, output);
}

/** モード別の倍率範囲 */
export function scaleRange(mode: FitMode, image: Size, output: Size): { min: number; max: number } {
	if (mode === 'cover') {
		const cover = coverScale(image, output);
		return { min: cover, max: cover * COVER_MAX_RATIO };
	}
	const contain = containScale(image, output);
	return { min: contain * CONTAIN_MIN_RATIO, max: contain * CONTAIN_MAX_RATIO };
}

export function clampScale(scale: number, mode: FitMode, image: Size, output: Size): number {
	const { min, max } = scaleRange(mode, image, output);
	if (!Number.isFinite(scale)) {
		return baseScale(mode, image, output);
	}
	return Math.min(max, Math.max(min, scale));
}

/** 現在モードの基準倍率で中央配置した Transform（初期配置・フィット・リセットで共通） */
export function centeredTransform(mode: FitMode, image: Size, output: Size): ImageTransform {
	return {
		centerX: output.width / 2,
		centerY: output.height / 2,
		scale: baseScale(mode, image, output),
		rotationDeg: 0,
	};
}

/** 相対倍率（基準倍率を 1 とした比） */
export function relativeZoom(
	transform: ImageTransform,
	mode: FitMode,
	image: Size,
	output: Size,
): number {
	return transform.scale / baseScale(mode, image, output);
}
