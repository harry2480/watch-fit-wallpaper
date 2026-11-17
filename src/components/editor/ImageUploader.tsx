import { ImagePlus, Upload } from 'lucide-react';
import { type DragEvent, useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ImageUploaderProps = {
	onSelect: (file: File) => void;
	/** 画像を編集中か。編集中は小さく表示し、選び直すと編集内容が失われることを案内する */
	hasImage: boolean;
	loading: boolean;
};

export const SUPPORTED_FORMATS_TEXT =
	'JPEG・PNG・WebP（HEIC / HEIF は対応ブラウザのみ）、30MB・5,000 万画素まで';

/**
 * 画像選択（要件定義 5.2）。ファイル選択ダイアログ・iPhone の写真ライブラリ・PC のドラッグ＆ドロップに対応する。
 */
export function ImageUploader({ onSelect, hasImage, loading }: ImageUploaderProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const changeButtonRef = useRef<HTMLButtonElement>(null);
	const [dragging, setDragging] = useState(false);

	// 最初の画像を読み込むと「画像を選ぶ」ボタンが消えるため、置き換わったボタンへフォーカスを移す
	useEffect(() => {
		if (hasImage) {
			changeButtonRef.current?.focus();
		}
	}, [hasImage]);
	const hintId = useId();

	const openDialog = () => inputRef.current?.click();

	const handleFiles = (files: FileList | null) => {
		const file = files?.[0];
		if (file) {
			onSelect(file);
		}
	};

	const onDrop = (event: DragEvent<HTMLDivElement>) => {
		event.preventDefault();
		setDragging(false);
		handleFiles(event.dataTransfer.files);
	};

	const input = (
		<input
			ref={inputRef}
			type="file"
			// image/* にすると iPhone では写真ライブラリから選べ、HEIC は Safari が JPEG に変換して渡す
			accept="image/*"
			className="sr-only"
			tabIndex={-1}
			aria-hidden="true"
			data-testid="image-input"
			onChange={(event) => {
				handleFiles(event.currentTarget.files);
				// 同じファイルを選び直しても change が発火するようにする
				event.currentTarget.value = '';
			}}
		/>
	);

	if (hasImage) {
		return (
			<div className="flex flex-col gap-1.5">
				<Button
					ref={changeButtonRef}
					variant="outline"
					onClick={openDialog}
					disabled={loading}
					aria-describedby={hintId}
				>
					<ImagePlus aria-hidden="true" />
					別の画像を選ぶ
				</Button>
				<p id={hintId} className="text-xs text-muted-foreground">
					選び直すと、現在の位置・大きさの調整は失われます。
				</p>
				{input}
			</div>
		);
	}

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: ドロップ領域。キーボード操作は内側のボタンで行う
		<div
			className={cn(
				'flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-border p-8 text-center transition-colors',
				dragging && 'border-primary bg-accent',
			)}
			onDragOver={(event) => {
				event.preventDefault();
				setDragging(true);
			}}
			onDragLeave={(event) => {
				// 子要素の上に移動しただけなら強調表示を消さない
				if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
					setDragging(false);
				}
			}}
			onDrop={onDrop}
			data-testid="drop-zone"
		>
			<Upload className="size-10 text-muted-foreground" aria-hidden="true" />
			<div className="flex flex-col gap-1">
				<p className="font-medium">画像を選ぶか、ここにドラッグ＆ドロップ</p>
				<p id={hintId} className="text-sm text-muted-foreground">
					{SUPPORTED_FORMATS_TEXT}
				</p>
			</div>
			<Button onClick={openDialog} disabled={loading} aria-describedby={hintId}>
				<ImagePlus aria-hidden="true" />
				画像を選ぶ
			</Button>
			{input}
		</div>
	);
}
