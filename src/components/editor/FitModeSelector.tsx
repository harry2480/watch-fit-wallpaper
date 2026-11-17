import type { FitMode } from '@/features/editor/geometry';
import { cn } from '@/lib/utils';

const OPTIONS: { value: FitMode; label: string; description: string }[] = [
	{ value: 'cover', label: 'Cover', description: '画面全体を画像で覆う（余白なし）' },
	{ value: 'contain', label: 'Contain', description: '画像全体を収める（余白あり）' },
];

type FitModeSelectorProps = {
	value: FitMode;
	onChange: (mode: FitMode) => void;
	disabled: boolean;
};

/** 表示モードの切り替え（要件定義 6章）。切り替えても構図は中央へ戻さない */
export function FitModeSelector({ value, onChange, disabled }: FitModeSelectorProps) {
	return (
		<fieldset className="flex flex-col gap-2" disabled={disabled}>
			<legend className="mb-2 text-sm font-medium">表示モード</legend>
			<div className="grid grid-cols-2 gap-2">
				{OPTIONS.map((option) => (
					<label
						key={option.value}
						className={cn(
							'flex min-h-11 cursor-pointer flex-col gap-0.5 rounded-md border border-input px-3 py-2 text-sm transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50',
							value === option.value && 'border-primary bg-accent',
						)}
					>
						<input
							type="radio"
							name="fit-mode"
							value={option.value}
							checked={value === option.value}
							onChange={() => onChange(option.value)}
							className="sr-only"
						/>
						<span className="font-medium">{option.label}</span>
						<span className="text-xs text-muted-foreground">{option.description}</span>
					</label>
				))}
			</div>
		</fieldset>
	);
}
