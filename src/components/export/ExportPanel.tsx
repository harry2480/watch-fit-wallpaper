import { Download, Share2 } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { type ExportFormat, MAX_JPEG_QUALITY, MIN_JPEG_QUALITY } from '@/features/editor/reducer';
import { downloadBlob } from '@/features/export/download';
import { ExportError } from '@/features/export/errors';
import { exportFilename, MIME_TYPES } from '@/features/export/filename';
import { type ExportSnapshot, generateExportBlob } from '@/features/export/generate';
import { canShareFile, shareFile } from '@/features/export/share';
import { cn } from '@/lib/utils';
import { SaveGuide } from './SaveGuide';

export type ExportDependencies = {
	generate: (snapshot: ExportSnapshot) => Promise<Blob>;
	canShare: (file: File) => boolean;
	share: (file: File) => ReturnType<typeof shareFile>;
	download: (blob: Blob, filename: string) => void;
	now: () => Date;
};

const defaultDependencies: ExportDependencies = {
	generate: (snapshot) => generateExportBlob(snapshot),
	canShare: (file) => canShareFile(file),
	share: (file) => shareFile(file),
	download: (blob, filename) => downloadBlob(blob, filename),
	now: () => new Date(),
};

type ExportPanelProps = {
	/** 保存できる状態のときだけスナップショットを返す（9.4） */
	getSnapshot: () => ExportSnapshot | null;
	/** ファイル名に使う識別子（モデル ID など） */
	fileId: string;
	format: ExportFormat;
	quality: number;
	onFormatChange: (format: ExportFormat, quality?: number) => void;
	disabled: boolean;
	deps?: ExportDependencies;
};

type Generated = { file: File; url: string };

type Status =
	| { kind: 'idle' }
	| { kind: 'working' }
	| { kind: 'needs-tap' }
	| { kind: 'done'; via: 'share' | 'download' }
	| { kind: 'error'; message: string };

const FORMATS: { value: ExportFormat; label: string }[] = [
	{ value: 'png', label: 'PNG' },
	{ value: 'jpeg', label: 'JPEG' },
];

/**
 * 保存（要件定義 9章）。共有できる環境（iPhone）では共有シート、それ以外はダウンロード。
 * どちらも使えない場合に備えて、生成した画像を表示して手動で保存できるようにする。
 */
export function ExportPanel({
	getSnapshot,
	fileId,
	format,
	quality,
	onFormatChange,
	disabled,
	deps = defaultDependencies,
}: ExportPanelProps) {
	const [status, setStatus] = useState<Status>({ kind: 'idle' });
	const [generated, setGenerated] = useState<Generated | null>(null);
	const qualityId = useId();
	const formatName = useId();

	// 生成済み画像の Object URL は、作り直したとき・画面を閉じるときに解放する
	useEffect(() => {
		if (!generated) return;
		return () => URL.revokeObjectURL(generated.url);
	}, [generated]);

	const share = async (file: File) => {
		try {
			const result = await deps.share(file);
			if (result === 'shared') setStatus({ kind: 'done', via: 'share' });
			// キャンセルは通常の操作として扱い、エラーにしない（12.3）
			else if (result === 'cancelled') setStatus({ kind: 'idle' });
			else setStatus({ kind: 'needs-tap' });
		} catch {
			setStatus({ kind: 'error', message: new ExportError('share-failed').message });
		}
	};

	const save = async () => {
		const snapshot = getSnapshot();
		if (!snapshot) return;
		setStatus({ kind: 'working' });
		try {
			const blob = await deps.generate(snapshot);
			const filename = exportFilename(fileId, snapshot.format, deps.now());
			const file = new File([blob], filename, { type: MIME_TYPES[snapshot.format] });
			setGenerated({ file, url: URL.createObjectURL(blob) });
			if (deps.canShare(file)) {
				await share(file);
				return;
			}
			try {
				deps.download(blob, filename);
				setStatus({ kind: 'done', via: 'download' });
			} catch {
				setStatus({ kind: 'error', message: new ExportError('download-failed').message });
			}
		} catch (error) {
			// 失敗しても編集状態はそのまま。もう一度保存ボタンを押せる（12.2）
			const message =
				error instanceof ExportError ? error.message : new ExportError('blob-failed').message;
			setStatus({ kind: 'error', message });
		}
	};

	const working = status.kind === 'working';

	return (
		<section aria-label="保存" className="flex flex-col gap-4">
			<fieldset className="flex flex-col gap-2" disabled={disabled || working}>
				<legend className="mb-2 text-sm font-medium">保存形式</legend>
				<div className="grid grid-cols-2 gap-2">
					{FORMATS.map((option) => (
						<label
							key={option.value}
							className={cn(
								'relative flex min-h-11 cursor-pointer items-center justify-center rounded-md border border-input text-sm font-medium transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50',
								format === option.value && 'border-primary bg-accent',
							)}
						>
							<input
								type="radio"
								name={formatName}
								value={option.value}
								checked={format === option.value}
								onChange={() => onFormatChange(option.value)}
								className="sr-only"
							/>
							{option.label}
						</label>
					))}
				</div>
				{format === 'jpeg' && (
					<div className="mt-2 flex flex-col gap-2">
						<div className="flex items-center justify-between">
							<Label htmlFor={qualityId}>JPEG の品質</Label>
							<span aria-hidden="true" className="text-sm tabular-nums text-muted-foreground">
								{Math.round(quality * 100)}%
							</span>
						</div>
						<input
							id={qualityId}
							type="range"
							min={MIN_JPEG_QUALITY * 100}
							max={MAX_JPEG_QUALITY * 100}
							step={1}
							value={Math.round(quality * 100)}
							aria-valuetext={`${Math.round(quality * 100)}%`}
							onChange={(event) => onFormatChange('jpeg', Number(event.currentTarget.value) / 100)}
							className="h-11 w-full cursor-pointer accent-primary"
						/>
					</div>
				)}
			</fieldset>

			<Button onClick={save} disabled={disabled || working} className="h-12 text-base">
				<Download aria-hidden="true" />
				{working ? '画像を作成しています…' : '画像を保存'}
			</Button>

			<div aria-live="polite" className="flex flex-col gap-3 text-sm">
				{status.kind === 'error' && (
					<p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3">
						{status.message}
					</p>
				)}
				{status.kind === 'needs-tap' && generated && (
					<div className="flex flex-col gap-2 rounded-lg border border-border p-3">
						<p>画像を作成しました。ボタンを押して共有シートから保存してください。</p>
						<Button onClick={() => share(generated.file)}>
							<Share2 aria-hidden="true" />
							共有して保存
						</Button>
					</div>
				)}
				{status.kind === 'done' && (
					<p className="rounded-lg border border-border p-3">
						{status.via === 'share'
							? '共有シートから保存しました。'
							: `${generated?.file.name ?? '画像'} を保存しました。`}
					</p>
				)}
			</div>

			{generated && (
				<details className="rounded-lg border border-border p-4 text-sm">
					<summary className="cursor-pointer font-medium">保存できない場合</summary>
					<p className="mt-2 text-muted-foreground">
						下の画像を長押し（PC では右クリック）して保存してください。
					</p>
					<img
						src={generated.url}
						alt="保存用に作成した画像"
						className="mx-auto mt-3 max-h-80 w-auto rounded-md border border-border"
					/>
				</details>
			)}

			<SaveGuide open={status.kind === 'done'} />
		</section>
	);
}
