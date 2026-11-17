import { validateCustomResolution } from '@/features/watch/custom-resolution';
import { findWatchModel } from '@/features/watch/models';
import type { WatchModel } from '@/features/watch/schema';
import {
	constrainTransform,
	panTransform,
	resizeOutput,
	switchFitMode,
	zoomTransformAt,
} from './constraints';
import {
	baseScale,
	centeredTransform,
	type FitMode,
	type ImageTransform,
	isValidSize,
	type Point,
	relativeZoom,
	type Size,
	scaleRange,
} from './geometry';

/** カスタム解像度を選んでいることを表す modelId */
export const CUSTOM_MODEL_ID = 'custom';

export const DEFAULT_BACKGROUND_COLOR = '#000000';
export const DEFAULT_JPEG_QUALITY = 0.92;
export const MIN_JPEG_QUALITY = 0.5;
export const MAX_JPEG_QUALITY = 1;

export type ExportFormat = 'png' | 'jpeg';

/**
 * 出力倍率。1 はモデルの解像度ちょうど。2・3 は同じ構図を縦横 2・3 倍の画素数で書き出す。
 * watchOS 11 以降の写真文字盤は画像を拡大して表示することがあり、その際の粗さを抑えるために使う。
 */
export type ExportScale = 1 | 2 | 3;
export const EXPORT_SCALES: readonly ExportScale[] = [1, 2, 3];
export const DEFAULT_EXPORT_SCALE: ExportScale = 1;

export type EditorImage = { width: number; height: number; filename: string };

/** 要件定義 11.1。画像リソース（ImageBitmap 等）は含めない（11.2） */
export type EditorState = {
	modelId: string;
	/** カスタム解像度の入力値。不正値もそのまま保持し、出力不可として扱う */
	customResolution: { width: number; height: number };
	fitMode: FitMode;
	image: EditorImage | null;
	transform: ImageTransform;
	/**
	 * transform が表されている出力サイズ（Output 座標系の基準）。画像が無い・配置前は null。
	 * 不正なカスタム解像度を経由しても、直前の有効な出力サイズから構図を変換するために使う。
	 */
	transformOutput: Size | null;
	background: { type: 'solid' | 'blur'; color: string };
	exportOptions: { format: ExportFormat; quality: number; scale: ExportScale };
};

export type EditorAction =
	| { type: 'LOAD_IMAGE'; image: EditorImage }
	| { type: 'SELECT_MODEL'; modelId: string }
	| { type: 'SET_CUSTOM_RESOLUTION'; width: number; height: number }
	| { type: 'SET_FIT_MODE'; fitMode: FitMode }
	| { type: 'SET_TRANSFORM'; transform: ImageTransform }
	| { type: 'PAN_BY'; delta: Point }
	| { type: 'SET_ZOOM'; scale: number; anchor?: Point }
	| { type: 'SET_BACKGROUND'; color: string }
	| { type: 'SET_EXPORT_FORMAT'; format: ExportFormat; quality?: number }
	| { type: 'SET_EXPORT_SCALE'; scale: ExportScale }
	| { type: 'FIT_IMAGE' }
	| { type: 'RESET_TRANSFORM' }
	| { type: 'CLEAR_IMAGE' };

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const IDENTITY_TRANSFORM: ImageTransform = { centerX: 0, centerY: 0, scale: 1, rotationDeg: 0 };

/** 現在の出力サイズ。カスタム解像度が不正・モデルが見つからない場合は null（出力不可） */
export function getOutputSize(state: EditorState, models: readonly WatchModel[]): Size | null {
	if (state.modelId === CUSTOM_MODEL_ID) {
		const result = validateCustomResolution(
			state.customResolution.width,
			state.customResolution.height,
		);
		return result.ok ? result.value : null;
	}
	const model = findWatchModel(models, state.modelId);
	return model ? { width: model.widthPx, height: model.heightPx } : null;
}

/**
 * プレビュー表示に使う出力サイズ。出力不可（不正なカスタム解像度）の間は、
 * 構図の基準になっている直前の有効サイズで表示を続ける。
 */
export function getPreviewOutputSize(
	state: EditorState,
	models: readonly WatchModel[],
): Size | null {
	return getOutputSize(state, models) ?? state.transformOutput;
}

/** スライダー表示用の相対倍率（現在モードの基準倍率を 1 とする）。画像が無ければ null */
export function getRelativeZoom(state: EditorState, models: readonly WatchModel[]): number | null {
	const output = getPreviewOutputSize(state, models);
	if (!state.image || !output) {
		return null;
	}
	return relativeZoom(state.transform, state.fitMode, state.image, output);
}

/** スライダーの範囲（相対倍率）。Cover は 1〜4、Contain は 0.25〜4（要件定義 6.2・6.3） */
export function getZoomRange(
	state: EditorState,
	models: readonly WatchModel[],
): { min: number; max: number } {
	const output = getPreviewOutputSize(state, models);
	if (!state.image || !output) {
		return { min: 1, max: 4 };
	}
	const range = scaleRange(state.fitMode, state.image, output);
	const base = baseScale(state.fitMode, state.image, output);
	return { min: range.min / base, max: range.max / base };
}

/** delta 方向に実際に動かせるか（Cover で画像端に達していれば false）。方向ボタンの有効・無効に使う */
export function canPan(state: EditorState, models: readonly WatchModel[], delta: Point): boolean {
	const output = getOutputSize(state, models);
	if (!state.image || !output) {
		return false;
	}
	const moved = panTransform(state.transform, delta, state.fitMode, state.image, output);
	return (
		Math.abs(moved.centerX - state.transform.centerX) > 1e-9 ||
		Math.abs(moved.centerY - state.transform.centerY) > 1e-9
	);
}

/** 相対倍率を SET_ZOOM に渡す絶対倍率に変換する。画像が無ければ null */
export function relativeToAbsoluteScale(
	state: EditorState,
	models: readonly WatchModel[],
	relative: number,
): number | null {
	const output = getPreviewOutputSize(state, models);
	if (!state.image || !output) {
		return null;
	}
	return relative * baseScale(state.fitMode, state.image, output);
}

/** 画像があり、出力サイズが有効なときだけ保存できる */
export function canExport(state: EditorState, models: readonly WatchModel[]): boolean {
	return state.image !== null && getOutputSize(state, models) !== null;
}

function clampQuality(quality: number): number {
	if (!Number.isFinite(quality)) {
		return DEFAULT_JPEG_QUALITY;
	}
	return Math.min(MAX_JPEG_QUALITY, Math.max(MIN_JPEG_QUALITY, quality));
}

export function createInitialEditorState(models: readonly WatchModel[]): EditorState {
	const first = models[0];
	return {
		modelId: first?.id ?? CUSTOM_MODEL_ID,
		customResolution: first
			? { width: first.widthPx, height: first.heightPx }
			: { width: 416, height: 496 },
		fitMode: 'cover',
		image: null,
		transform: IDENTITY_TRANSFORM,
		transformOutput: null,
		background: { type: 'solid', color: DEFAULT_BACKGROUND_COLOR },
		exportOptions: { format: 'png', quality: DEFAULT_JPEG_QUALITY, scale: DEFAULT_EXPORT_SCALE },
	};
}

/** 編集操作を、画像と有効な出力サイズがある場合だけ適用する */
function withImage(
	state: EditorState,
	models: readonly WatchModel[],
	update: (image: Size, output: Size) => ImageTransform,
): EditorState {
	const output = getOutputSize(state, models);
	if (!state.image || !output) {
		return state;
	}
	return { ...state, transform: update(state.image, output), transformOutput: output };
}

/** モデル・カスタム解像度の変更。構図の相対位置を維持する（4.6） */
function changeOutput(next: EditorState, models: readonly WatchModel[]): EditorState {
	const nextOutput = getOutputSize(next, models);
	if (!next.image || !nextOutput) {
		// 出力不可の間は構図とその基準サイズをそのまま残す
		return next;
	}
	const image = next.image;
	const transform = next.transformOutput
		? resizeOutput(next.transform, next.transformOutput, nextOutput, next.fitMode, image)
		: centeredTransform(next.fitMode, image, nextOutput);
	return { ...next, transform, transformOutput: nextOutput };
}

/**
 * モデル一覧を束縛した reducer を作る。
 * UI ではモジュールのトップレベルで 1 回だけ作るか useMemo で固定すること。
 */
export function createEditorReducer(models: readonly WatchModel[]) {
	return function editorReducer(state: EditorState, action: EditorAction): EditorState {
		switch (action.type) {
			case 'LOAD_IMAGE': {
				// デコード結果は外部からの値なので、不正なサイズは例外にせず無視する
				if (!isValidSize(action.image)) {
					return state;
				}
				const next = { ...state, image: action.image };
				const output = getOutputSize(next, models);
				return output
					? {
							...next,
							transform: centeredTransform(next.fitMode, action.image, output),
							transformOutput: output,
						}
					: { ...next, transform: IDENTITY_TRANSFORM, transformOutput: null };
			}
			case 'SELECT_MODEL': {
				if (
					action.modelId === state.modelId ||
					(action.modelId !== CUSTOM_MODEL_ID && !findWatchModel(models, action.modelId))
				) {
					return state;
				}
				return changeOutput({ ...state, modelId: action.modelId }, models);
			}
			case 'SET_CUSTOM_RESOLUTION':
				if (
					state.modelId === CUSTOM_MODEL_ID &&
					Object.is(state.customResolution.width, action.width) &&
					Object.is(state.customResolution.height, action.height)
				) {
					return state;
				}
				return changeOutput(
					{
						...state,
						modelId: CUSTOM_MODEL_ID,
						customResolution: { width: action.width, height: action.height },
					},
					models,
				);
			case 'SET_FIT_MODE':
				return withImage({ ...state, fitMode: action.fitMode }, models, (image, output) =>
					switchFitMode(state.transform, action.fitMode, image, output),
				);
			case 'SET_TRANSFORM':
				return withImage(state, models, (image, output) =>
					constrainTransform(action.transform, state.fitMode, image, output),
				);
			case 'PAN_BY':
				return withImage(state, models, (image, output) =>
					panTransform(state.transform, action.delta, state.fitMode, image, output),
				);
			case 'SET_ZOOM':
				return withImage(state, models, (image, output) =>
					zoomTransformAt(
						state.transform,
						action.scale,
						action.anchor ?? { x: output.width / 2, y: output.height / 2 },
						state.fitMode,
						image,
						output,
					),
				);
			case 'SET_BACKGROUND':
				if (!HEX_COLOR.test(action.color)) {
					return state;
				}
				return { ...state, background: { type: 'solid', color: action.color.toLowerCase() } };
			case 'SET_EXPORT_FORMAT':
				return {
					...state,
					exportOptions: {
						...state.exportOptions,
						format: action.format,
						quality:
							action.quality === undefined
								? state.exportOptions.quality
								: clampQuality(action.quality),
					},
				};
			case 'SET_EXPORT_SCALE':
				if (!EXPORT_SCALES.includes(action.scale) || action.scale === state.exportOptions.scale) {
					return state;
				}
				return { ...state, exportOptions: { ...state.exportOptions, scale: action.scale } };
			case 'FIT_IMAGE':
			case 'RESET_TRANSFORM':
				// フィット（6.5）とリセット（6.6）はどちらも現在モードの基準倍率で中央配置する。
				// 背景色・モデル・モードは維持する。
				return withImage(state, models, (image, output) =>
					centeredTransform(state.fitMode, image, output),
				);
			case 'CLEAR_IMAGE':
				return { ...state, image: null, transform: IDENTITY_TRANSFORM, transformOutput: null };
		}
	};
}
