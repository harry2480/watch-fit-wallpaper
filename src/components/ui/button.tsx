import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
	"inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
	{
		variants: {
			variant: {
				default: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90',
				outline:
					'border border-input bg-background shadow-xs hover:bg-accent hover:text-accent-foreground',
				secondary: 'bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80',
				ghost: 'hover:bg-accent hover:text-accent-foreground',
			},
			size: {
				// タップ領域は 44px 以上（要件定義 10.8）
				default: 'h-11 px-4',
				sm: 'h-11 px-3',
				icon: 'size-11',
			},
		},
		defaultVariants: { variant: 'default', size: 'default' },
	},
);

export function Button({
	className,
	variant,
	size,
	type = 'button',
	...props
}: ComponentProps<'button'> & VariantProps<typeof buttonVariants>) {
	return (
		<button
			type={type}
			data-slot="button"
			className={cn(buttonVariants({ variant, size, className }))}
			{...props}
		/>
	);
}
