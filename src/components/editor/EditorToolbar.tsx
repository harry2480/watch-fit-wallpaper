import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Maximize, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Point } from '@/features/editor/geometry';

type EditorToolbarProps = {
	onFit: () => void;
	onReset: () => void;
	/** 方向ボタン。Output 座標での移動量を渡す */
	onMove: (delta: Point) => void;
	/** 1 回の移動量（Output px） */
	step: Point;
	/** 方向ごとに動かせるか（Cover で画像端に達した方向は無効にする） */
	canMove: { up: boolean; down: boolean; left: boolean; right: boolean };
	disabled: boolean;
};

/**
 * フィット・リセット（要件定義 6.5・6.6）と、ドラッグに依存しない位置調整（10.8）。
 */
export function EditorToolbar({
	onFit,
	onReset,
	onMove,
	step,
	canMove,
	disabled,
}: EditorToolbarProps) {
	return (
		<div className="flex flex-col gap-4">
			<div className="grid grid-cols-2 gap-2">
				<Button variant="outline" onClick={onFit} disabled={disabled}>
					<Maximize aria-hidden="true" />
					フィット
				</Button>
				<Button variant="outline" onClick={onReset} disabled={disabled}>
					<RotateCcw aria-hidden="true" />
					リセット
				</Button>
			</div>
			<fieldset className="flex flex-col items-center gap-1" disabled={disabled}>
				<legend className="mb-2 self-start text-sm font-medium">位置の微調整</legend>
				<Button
					variant="outline"
					size="icon"
					aria-label="上へ移動"
					disabled={!canMove.up}
					onClick={() => onMove({ x: 0, y: -step.y })}
				>
					<ArrowUp aria-hidden="true" />
				</Button>
				<div className="flex gap-1">
					<Button
						variant="outline"
						size="icon"
						aria-label="左へ移動"
						disabled={!canMove.left}
						onClick={() => onMove({ x: -step.x, y: 0 })}
					>
						<ArrowLeft aria-hidden="true" />
					</Button>
					<span className="size-11" aria-hidden="true" />
					<Button
						variant="outline"
						size="icon"
						aria-label="右へ移動"
						disabled={!canMove.right}
						onClick={() => onMove({ x: step.x, y: 0 })}
					>
						<ArrowRight aria-hidden="true" />
					</Button>
				</div>
				<Button
					variant="outline"
					size="icon"
					aria-label="下へ移動"
					disabled={!canMove.down}
					onClick={() => onMove({ x: 0, y: step.y })}
				>
					<ArrowDown aria-hidden="true" />
				</Button>
			</fieldset>
		</div>
	);
}
