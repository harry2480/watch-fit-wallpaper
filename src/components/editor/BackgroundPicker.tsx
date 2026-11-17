import { useId } from 'react';
import { Label } from '@/components/ui/label';

type BackgroundPickerProps = {
	value: string;
	onChange: (color: string) => void;
	disabled: boolean;
};

/** 背景色（要件定義 8.6）。Contain の余白などに使い、UI のテーマとは独立している */
export function BackgroundPicker({ value, onChange, disabled }: BackgroundPickerProps) {
	const id = useId();
	return (
		<div className="flex items-center justify-between gap-3">
			<Label htmlFor={id}>背景色</Label>
			<div className="flex items-center gap-2">
				<span className="font-mono text-sm uppercase text-muted-foreground">{value}</span>
				<input
					id={id}
					type="color"
					value={value}
					disabled={disabled}
					onChange={(event) => onChange(event.currentTarget.value)}
					className="h-11 w-14 cursor-pointer rounded-md border border-input bg-transparent p-1 disabled:cursor-not-allowed disabled:opacity-50"
				/>
			</div>
		</div>
	);
}
