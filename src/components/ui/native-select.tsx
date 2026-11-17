import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** ネイティブの select。iPhone では OS 標準のピッカーで選べる */
export function NativeSelect({ className, ...props }: ComponentProps<'select'>) {
	return (
		<select
			data-slot="native-select"
			className={cn(
				'h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring disabled:opacity-50 md:text-sm',
				className,
			)}
			{...props}
		/>
	);
}
