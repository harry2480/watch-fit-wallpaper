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
	centeredTransform,
	type FitMode,
	type ImageTransform,
	type Point,
	type Size,
} from './geometry';

/** カスタム解像度を選んでいることを表す modelId */
export const CUSTOM_MODEL_ID = 'custom';

export const DEFAULT_BACKGROUND_COLOR = '#000000';
export const DEFAULT_JPEG_QUALITY = 0.92;
export const MIN_JPEG_QUALITY = 0.5;
export const MAX_JPEG_QUALITY = 1;

export type ExportFormat = 'png' | 'jpeg';

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
	exportOptions: { format: ExportFormat; quality: number };
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
		exportOptions: { format: 'png', quality: DEFAULT_JPEG_QUALITY },
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

export function createEditorReducer(models: readonly WatchModel[]) {
	return function editorReducer(state: EditorState, action: EditorAction): EditorState {
		switch (action.type) {
			case 'LOAD_IMAGE': {
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
				if (action.modelId !== CUSTOM_MODEL_ID && !findWatchModel(models, action.modelId)) {
					return state;
				}
				return changeOutput({ ...state, modelId: action.modelId }, models);
			}
			case 'SET_CUSTOM_RESOLUTION':
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
						format: action.format,
						quality:
							action.quality === undefined
								? state.exportOptions.quality
								: clampQuality(action.quality),
					},
				};
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
