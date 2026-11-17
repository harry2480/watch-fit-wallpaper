import type { ReactNode } from 'react';
import type { Size } from '@/features/editor/geometry';
import { cn } from '@/lib/utils';

/** カスタム解像度など、モデル固有の角丸が無い場合の汎用の角丸比率 */
export const GENERIC_CORNER_RADIUS_RATIO = 0.12;

type WatchFrameProps = {
	/** 画面（出力）のサイズ。縦横比だけを使う */
	output: Size;
	/** 画面の角丸半径（画面幅に対する比率） */
	cornerRadiusRatio: number;
	children: ReactNode;
	className?: string;
};

/**
 * Apple Watch のケースと画面の外形（要件定義 8.4）。画像描画とは分離し、CSS だけで描く。
 * 角丸はプレビューにのみ適用し、出力画像には影響しない（8.5）。
 */
export function WatchFrame({ output, cornerRadiusRatio, children, className }: WatchFrameProps) {
	const ratio = Math.min(0.5, Math.max(0, cornerRadiusRatio));
	// 横方向の半径は幅に対する %、縦方向は高さに対する % で指定し、同じ px の円弧にする
	const screenRadius = `${ratio * 100}% / ${((ratio * output.width) / output.height) * 100}%`;
	return (
		<div
			className={cn(
				'relative mx-auto w-full rounded-[22%/18%] bg-neutral-900 p-[7%] shadow-xl ring-1 ring-black/40 dark:bg-neutral-800 dark:ring-white/10',
				className,
			)}
			data-testid="watch-frame"
		>
			<div
				className="relative w-full overflow-hidden bg-black"
				style={{ aspectRatio: `${output.width} / ${output.height}`, borderRadius: screenRadius }}
				data-testid="watch-screen"
			>
				{children}
			</div>
		</div>
	);
}
