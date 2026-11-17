import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FitMode, ImageTransform, Size } from '@/features/editor/geometry';
import { prepareCanvas, previewRenderScale, renderImage } from '@/features/editor/renderer';
import { usePointerGestures } from '@/hooks/usePointerGestures';
import { cn } from '@/lib/utils';

type WatchPreviewProps = {
	source: CanvasImageSource | null;
	sourceSize: Size | null;
	output: Size;
	transform: ImageTransform;
	backgroundColor: string;
	/** スクリーンリーダー向けの説明 */
	label: string;
	/** 指定するとドラッグ・ピンチ・ホイールで操作できる */
	interaction?: {
		fitMode: FitMode;
		onTransformCommit: (transform: ImageTransform) => void;
	};
};

/**
 * 編集プレビュー。出力と同じ共通レンダラーで Output 座標を描き、CSS で表示サイズに縮小する（要件定義 8.3）。
 * 描画は requestAnimationFrame で 1 フレーム 1 回にまとめ、操作中の中間値は React の状態にしない（7.12）。
 */
export function WatchPreview({
	source,
	sourceSize,
	output,
	transform,
	backgroundColor,
	label,
	interaction,
}: WatchPreviewProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [displayWidth, setDisplayWidth] = useState(0);
	const [devicePixelRatio, setDevicePixelRatio] = useState(() =>
		typeof window === 'undefined' ? 1 : window.devicePixelRatio,
	);

	/** 描画に使う最新の値。操作中は liveTransform を優先する */
	const drawStateRef = useRef({ source, sourceSize, output, transform, backgroundColor });
	drawStateRef.current = { source, sourceSize, output, transform, backgroundColor };
	const viewRef = useRef({ displayWidth, devicePixelRatio });
	viewRef.current = { displayWidth, devicePixelRatio };
	const liveTransformRef = useRef<ImageTransform | null>(null);
	const frameRef = useRef<number | null>(null);

	const scheduleDraw = useCallback(() => {
		if (frameRef.current !== null) {
			return;
		}
		frameRef.current = requestAnimationFrame(() => {
			frameRef.current = null;
			const ctx = canvasRef.current?.getContext('2d') ?? null;
			const view = viewRef.current;
			// 表示幅が分かるまでは描画しない
			if (!ctx || view.displayWidth <= 0) {
				return;
			}
			const state = drawStateRef.current;
			const scale = previewRenderScale(state.output, view.displayWidth, view.devicePixelRatio);
			if (state.source && state.sourceSize) {
				renderImage(
					ctx,
					{
						source: state.source,
						sourceWidth: state.sourceSize.width,
						sourceHeight: state.sourceSize.height,
						outputWidth: state.output.width,
						outputHeight: state.output.height,
						transform: liveTransformRef.current ?? state.transform,
						backgroundColor: state.backgroundColor,
					},
					scale,
				);
				return;
			}
			// 画像未選択時は背景色だけを描く
			prepareCanvas(ctx, state.output.width, state.output.height, scale, state.backgroundColor);
		});
	}, []);

	useEffect(
		() => () => {
			if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
		},
		[],
	);

	// 初回描画の前に表示幅を取得し、出力解像度で一度描いてから縮小し直す無駄を避ける
	useLayoutEffect(() => {
		const width = canvasRef.current?.getBoundingClientRect().width ?? 0;
		if (width > 0) {
			setDisplayWidth(width);
		}
	}, []);

	// 別の DPI のモニターへの移動やブラウザのズームに追従する
	useEffect(() => {
		if (typeof window.matchMedia !== 'function') {
			return;
		}
		const query = window.matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
		const onChange = () => setDevicePixelRatio(window.devicePixelRatio);
		query.addEventListener('change', onChange);
		return () => query.removeEventListener('change', onChange);
	}, [devicePixelRatio]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas || typeof ResizeObserver === 'undefined') {
			return;
		}
		const observer = new ResizeObserver((entries) => {
			setDisplayWidth(entries[0]?.contentRect.width ?? 0);
		});
		observer.observe(canvas);
		return () => observer.disconnect();
	}, []);

	// 確定値が親から届いたら、操作中の値を捨てて確定値で描く
	// biome-ignore lint/correctness/useExhaustiveDependencies: transform の変化だけをきっかけにする
	useEffect(() => {
		liveTransformRef.current = null;
	}, [transform]);

	// 確定値・表示サイズが変わったら描き直す
	// biome-ignore lint/correctness/useExhaustiveDependencies: 描画は drawStateRef 経由で最新値を読む。依存は再描画のきっかけとして列挙している
	useEffect(() => {
		scheduleDraw();
	}, [
		scheduleDraw,
		source,
		sourceSize,
		output,
		transform,
		backgroundColor,
		displayWidth,
		devicePixelRatio,
	]);

	const interactionRef = useRef(interaction);
	interactionRef.current = interaction;
	usePointerGestures(canvasRef, {
		getContext: () => {
			const current = interactionRef.current;
			const state = drawStateRef.current;
			if (!current || !state.sourceSize) {
				return null;
			}
			return {
				// 確定直後で親の更新がまだ届いていない間も、表示中の状態を起点にする
				transform: liveTransformRef.current ?? state.transform,
				fitMode: current.fitMode,
				image: state.sourceSize,
				output: state.output,
			};
		},
		onPreview: (next) => {
			liveTransformRef.current = next;
			scheduleDraw();
		},
		onCommit: (next) => {
			// 親の確定値が届くまで表示を保つ（1 フレームだけ古い状態が描かれるのを防ぐ）
			liveTransformRef.current = next;
			interactionRef.current?.onTransformCommit(next);
			scheduleDraw();
		},
	});

	const interactive = interaction !== undefined && source !== null;
	return (
		<canvas
			ref={canvasRef}
			role="img"
			aria-label={label}
			className={cn(
				'block h-full w-full',
				// プレビュー領域ではブラウザのジェスチャーを止め、外側は通常どおりスクロールできる（10.5）
				interactive && 'cursor-grab touch-none select-none active:cursor-grabbing',
			)}
			data-output-width={output.width}
			data-output-height={output.height}
		/>
	);
}
