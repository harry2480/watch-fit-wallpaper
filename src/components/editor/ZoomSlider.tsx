import { useId } from 'react';
import { Label } from '@/components/ui/label';

type ZoomSliderProps = {
	/** 現在モードの基準倍率に対する相対倍率（1 = 100%）。画像が無ければ null */
	value: number | null;
	/** 相対倍率の範囲 */
	min: number;
	max: number;
	onChange: (relative: number) => void;
	disabled: boolean;
};

/**
 * ズームスライダー（要件定義 7.11）。100% は現在モードの基準倍率。
 * モードを切り替えても実倍率は維持するため、100% 以外の値になることがある。
 */
export function ZoomSlider({ value, min, max, onChange, disabled }: ZoomSliderProps) {
	const id = useId();
	const minPercent = Math.round(min * 100);
	const maxPercent = Math.round(max * 100);
	const percent = value === null ? 100 : Math.round(value * 100);
	const shown = Math.min(maxPercent, Math.max(minPercent, percent));
	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center justify-between">
				<Label htmlFor={id}>ズーム</Label>
				{/* 値は aria-valuetext で読み上げるため、表示用の数値は読み上げ対象から外す */}
				<span aria-hidden="true" className="text-sm tabular-nums text-muted-foreground">
					{percent}%
				</span>
			</div>
			<input
				id={id}
				type="range"
				min={minPercent}
				max={maxPercent}
				step={1}
				value={shown}
				disabled={disabled}
				aria-valuetext={`${percent}%`}
				onChange={(event) => onChange(Number(event.currentTarget.value) / 100)}
				className="h-11 w-full cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50"
			/>
		</div>
	);
}
