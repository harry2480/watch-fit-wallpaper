import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
	canExport,
	createEditorReducer,
	createInitialEditorState,
	getOutputSize,
	getPreviewOutputSize,
} from '@/features/editor/reducer';
import { createLatestImageLoader, type DecodedImage } from '@/features/image/decode';
import { WATCH_MODELS } from '@/features/watch/models';

const editorReducer = createEditorReducer(WATCH_MODELS);

type ImageLoader = ReturnType<typeof createLatestImageLoader>;

/**
 * 画面全体の編集状態。Reducer の状態（11.1）と、デコード済み画像リソース（11.2）を分けて持つ。
 */
export function useImageEditor(createLoader: () => ImageLoader = createLatestImageLoader) {
	const [state, dispatch] = useReducer(editorReducer, WATCH_MODELS, createInitialEditorState);
	const [decoded, setDecoded] = useState<DecodedImage | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const loaderRef = useRef<ImageLoader | null>(null);
	const decodedRef = useRef<DecodedImage | null>(null);

	if (loaderRef.current === null) {
		loaderRef.current = createLoader();
	}

	useEffect(() => {
		const loader = loaderRef.current;
		return () => {
			// 画面の破棄時は進行中の読み込みを捨て、画像リソースを解放する（5.7）
			loader?.cancel();
			decodedRef.current?.release();
			decodedRef.current = null;
		};
	}, []);

	const loadFile = useCallback(async (file: File | null | undefined) => {
		const loader = loaderRef.current;
		if (!loader) return;
		setLoading(true);
		const result = await loader.load(file);
		if (result.status === 'stale') {
			return;
		}
		setLoading(false);
		if (result.status === 'failed') {
			// 失敗しても編集中の画像と状態は残し、選び直せるようにする（12.4）
			setError(result.error.message);
			return;
		}
		decodedRef.current?.release();
		decodedRef.current = result.image;
		setDecoded(result.image);
		setError(null);
		dispatch({
			type: 'LOAD_IMAGE',
			image: {
				width: result.image.width,
				height: result.image.height,
				filename: file?.name ?? '',
			},
		});
	}, []);

	const clearError = useCallback(() => setError(null), []);

	return {
		state,
		dispatch,
		models: WATCH_MODELS,
		decoded,
		loading,
		error,
		loadFile,
		clearError,
		output: getOutputSize(state, WATCH_MODELS),
		previewOutput: getPreviewOutputSize(state, WATCH_MODELS),
		canExport: canExport(state, WATCH_MODELS),
	};
}
