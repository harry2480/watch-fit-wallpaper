import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ImageTransform, Size } from '@/features/editor/geometry';
import { prepareCanvas, previewRenderScale, renderImage } from '@/features/editor/renderer';

type WatchPreviewProps = {
	source: CanvasImageSource | null;
	sourceSize: Size | null;
	output: Size;
	transform: ImageTransform;
	backgroundColor: string;
	/** スクリーンリーダー向けの説明 */
	label: string;
};

/**
 * 編集プレビュー。出力と同じ共通レンダラーで Output 座標を描き、CSS で表示サイズに縮小する（要件定義 8.3）。
 * 描画は requestAnimationFrame で 1 フレーム 1 回にまとめる（7.12）。
 */
export function WatchPreview({
	source,
	sourceSize,
	output,
	transform,
	backgroundColor,
	label,
}: WatchPreviewProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [displayWidth, setDisplayWidth] = useState(0);
	const [devicePixelRatio, setDevicePixelRatio] = useState(() =>
		typeof window === 'undefined' ? 1 : window.devicePixelRatio,
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
			const width = entries[0]?.contentRect.width ?? 0;
			setDisplayWidth(width);
		});
		observer.observe(canvas);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		const canvas = canvasRef.current;
		const ctx = canvas?.getContext('2d') ?? null;
		// 表示幅が分かるまでは描画しない
		if (!ctx || displayWidth <= 0) {
			return;
		}
		const frame = requestAnimationFrame(() => {
			const scale = previewRenderScale(output, displayWidth, devicePixelRatio);
			if (source && sourceSize) {
				renderImage(
					ctx,
					{
						source,
						sourceWidth: sourceSize.width,
						sourceHeight: sourceSize.height,
						outputWidth: output.width,
						outputHeight: output.height,
						transform,
						backgroundColor,
					},
					scale,
				);
				return;
			}
			// 画像未選択時は背景色だけを描く
			prepareCanvas(ctx, output.width, output.height, scale, backgroundColor);
		});
		return () => cancelAnimationFrame(frame);
	}, [source, sourceSize, output, transform, backgroundColor, displayWidth, devicePixelRatio]);

	return (
		<canvas
			ref={canvasRef}
			role="img"
			aria-label={label}
			className="block h-full w-full"
			data-output-width={output.width}
			data-output-height={output.height}
		/>
	);
}
