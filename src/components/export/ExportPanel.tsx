import { Download, Share2 } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
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
	download: (blob: Blob, filename: string, url: string) => void;
	now: () => Date;
};

const defaultDependencies: ExportDependencies = {
	generate: (snapshot) => generateExportBlob(snapshot),
	canShare: (file) => canShareFile(file),
	share: (file) => shareFile(file),
	download: (blob, filename, url) => downloadBlob(blob, filename, url),
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
	/**
	 * 出力内容に関わる編集状態を表す値。変わったら生成済みの画像と状態を破棄し、
	 * 古い構図の画像を共有・表示しないようにする
	 */
	editVersion: string;
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
	editVersion,
	deps = defaultDependencies,
}: ExportPanelProps) {
	const [status, setStatus] = useState<Status>({ kind: 'idle' });
	const [generated, setGenerated] = useState<Generated | null>(null);
	const qualityId = useId();
	const formatName = useId();

	const workingRef = useRef(false);
	workingRef.current = status.kind === 'working';

	// 編集内容が変わったら、生成済みの画像と保存の状態を破棄する。
	// 作成中は除く（保存の直前に確定待ちの操作を確定すると、編集状態が変わるため）
	// biome-ignore lint/correctness/useExhaustiveDependencies: editVersion の変化だけをきっかけにする
	useEffect(() => {
		if (workingRef.current) return;
		setGenerated(null);
		setStatus({ kind: 'idle' });
	}, [editVersion]);

	// 生成済み画像の Object URL は、作り直したとき・画面を閉じるときに解放する
	useEffect(() => {
		if (!generated) return;
		return () => URL.revokeObjectURL(generated.url);
	}, [generated]);

	const share = async (file: File) => {
		// 共有シートが開くまでの間に、もう一度押されないようにする
		setStatus({ kind: 'working' });
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
		if (status.kind === 'working' || disabled) return;
		const snapshot = getSnapshot();
		if (!snapshot) return;
		setStatus({ kind: 'working' });
		try {
			const blob = await deps.generate(snapshot);
			const filename = exportFilename(fileId, snapshot.format, deps.now());
			const file = new File([blob], filename, { type: MIME_TYPES[snapshot.format] });
			const url = URL.createObjectURL(blob);
			setGenerated({ file, url });
			if (deps.canShare(file)) {
				await share(file);
				return;
			}
			try {
				deps.download(blob, filename, url);
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

			<Button
				onClick={save}
				// 作成中も disabled にはせず、フォーカスを保つ（二重実行は save 内で防ぐ）
				disabled={disabled}
				aria-disabled={working || undefined}
				className="h-12 text-base aria-disabled:opacity-60"
			>
				<Download aria-hidden="true" />
				{working ? '画像を作成しています…' : '画像を保存'}
			</Button>

			{status.kind === 'error' && (
				<p
					role="alert"
					className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm"
				>
					{status.message}
				</p>
			)}
			<div aria-live="polite" className="flex flex-col gap-3 text-sm">
				{status.kind === 'needs-tap' && generated && (
					<div className="flex flex-col gap-2 rounded-lg border border-border p-3">
						<p>画像を作成しました。ボタンを押して共有シートから保存してください。</p>
						<Button onClick={() => share(generated.file)} disabled={disabled}>
							<Share2 aria-hidden="true" />
							共有して保存
						</Button>
					</div>
				)}
				{status.kind === 'done' && (
					<p className="rounded-lg border border-border p-3">
						{status.via === 'share'
							? '共有シートから保存しました。'
							: `${generated?.file.name ?? '画像'} のダウンロードを開始しました。保存されない場合は、下の画像を長押し（右クリック）して保存してください。`}
					</p>
				)}
			</div>

			{generated && (
				<details
					className="rounded-lg border border-border p-4 text-sm"
					open={status.kind === 'done' && status.via === 'download'}
				>
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
