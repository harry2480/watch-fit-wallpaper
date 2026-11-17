import { useEffect, useRef, useState } from 'react';
import type { ImageTransform, Size } from '@/features/editor/geometry';
import { previewRenderScale, renderImage } from '@/features/editor/renderer';

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
		if (!ctx) {
			return;
		}
		const frame = requestAnimationFrame(() => {
			const scale = previewRenderScale(output, displayWidth, window.devicePixelRatio);
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
			ctx.canvas.width = Math.max(1, Math.round(output.width * scale));
			ctx.canvas.height = Math.max(1, Math.round(output.height * scale));
			ctx.fillStyle = backgroundColor;
			ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
		});
		return () => cancelAnimationFrame(frame);
	}, [source, sourceSize, output, transform, backgroundColor, displayWidth]);

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
