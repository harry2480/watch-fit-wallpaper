import { Download, Share2 } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { Size } from '@/features/editor/geometry';
import {
	EXPORT_SCALES,
	type ExportFormat,
	type ExportScale,
	MAX_JPEG_QUALITY,
	MIN_JPEG_QUALITY,
} from '@/features/editor/reducer';
import { downloadBlob } from '@/features/export/download';
import { ExportError } from '@/features/export/errors';
import { exportFilename, MIME_TYPES } from '@/features/export/filename';
import { type ExportSnapshot, generateExportBlob } from '@/features/export/generate';
import {
	effectiveExportScale,
	isExportScaleAvailable,
	scaledOutputSize,
} from '@/features/export/scale';
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
	/**
	 * 保存できる状態のときだけ、スナップショットと、その内容から作った識別子を返す（9.4）。
	 * 識別子は editVersion と同じ方法で作ること
	 */
	getSnapshot: () => { snapshot: ExportSnapshot; version: string } | null;
	/** ファイル名に使う識別子（モデル ID など） */
	fileId: string;
	format: ExportFormat;
	quality: number;
	onFormatChange: (format: ExportFormat, quality?: number) => void;
	/** 出力サイズ（Output 座標系）。出力不可のときは null */
	output: Size | null;
	/** 選んでいる出力倍率。上限を超える場合は、使える最大の倍率で表示・保存する */
	scale: ExportScale;
	onScaleChange: (scale: ExportScale) => void;
	disabled: boolean;
	/**
	 * 現在の編集状態から作った識別子。生成済みの画像の識別子と異なる場合、その画像と保存の状態は
	 * 古いものとして扱い、表示・共有しない
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
	output,
	scale,
	onScaleChange,
	disabled,
	editVersion,
	deps = defaultDependencies,
}: ExportPanelProps) {
	const [status, setStatus] = useState<Status>({ kind: 'idle' });
	const [generated, setGenerated] = useState<Generated | null>(null);
	/** 直近の保存で使ったスナップショットの識別子 */
	const [resultVersion, setResultVersion] = useState<string | null>(null);
	const qualityId = useId();
	const formatName = useId();
	const scaleName = useId();
	const scaleHintId = useId();
	const shownScale = output ? effectiveExportScale(output, scale) : scale;

	const working = status.kind === 'working';
	// 保存の結果が現在の編集状態と一致するか。作成中に編集された場合も、完了後に不一致になる
	const fresh = resultVersion !== null && resultVersion === editVersion;

	// 古くなった生成画像と保存の状態は破棄する（作成中は完了を待つ）
	useEffect(() => {
		if (working || resultVersion === null || resultVersion === editVersion) return;
		setGenerated(null);
		setStatus({ kind: 'idle' });
		setResultVersion(null);
	}, [working, resultVersion, editVersion]);

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
		if (working || disabled) return;
		const taken = getSnapshot();
		if (!taken) return;
		const { snapshot, version } = taken;
		setResultVersion(version);
		setGenerated(null);
		setStatus({ kind: 'working' });
		try {
			const blob = await deps.generate(snapshot);
			const filename = exportFilename(fileId, snapshot.format, deps.now(), snapshot.scale);
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

	const shownStatus: Status = working || fresh ? status : { kind: 'idle' };
	const shownGenerated = fresh ? generated : null;

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

			<fieldset
				className="flex flex-col gap-2"
				disabled={disabled || working}
				aria-describedby={scaleHintId}
			>
				<legend className="mb-2 text-sm font-medium">解像度</legend>
				<div className="grid grid-cols-3 gap-2">
					{EXPORT_SCALES.map((value) => {
						const size = output ? scaledOutputSize(output, value) : null;
						const available = output ? isExportScaleAvailable(output, value) : true;
						return (
							<label
								key={value}
								className={cn(
									'relative flex min-h-11 cursor-pointer flex-col items-center justify-center rounded-md border border-input px-1 py-1.5 text-sm font-medium transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50',
									shownScale === value && 'border-primary bg-accent',
								)}
							>
								<input
									type="radio"
									name={scaleName}
									value={value}
									checked={shownScale === value}
									disabled={!available}
									onChange={() => onScaleChange(value)}
									className="sr-only"
								/>
								{value === 1 ? '標準' : `${value}倍`}
								{size && (
									<span className="text-xs font-normal tabular-nums text-muted-foreground">
										{size.width}×{size.height}
									</span>
								)}
							</label>
						);
					})}
				</div>
				<p id={scaleHintId} className="text-xs text-muted-foreground">
					構図は同じまま画素数だけを増やします。watchOS 11
					以降の写真文字盤は画像を拡大して表示することがあり、2倍・3倍にすると拡大されたときの粗さを抑えられます。元の写真より細かくはなりません。
				</p>
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

			{shownStatus.kind === 'error' && (
				<p
					role="alert"
					className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm"
				>
					{shownStatus.message}
				</p>
			)}
			<div aria-live="polite" className="flex flex-col gap-3 text-sm">
				{shownStatus.kind === 'needs-tap' && shownGenerated && (
					<div className="flex flex-col gap-2 rounded-lg border border-border p-3">
						<p>画像を作成しました。ボタンを押して共有シートから保存してください。</p>
						<Button onClick={() => share(shownGenerated.file)} disabled={disabled}>
							<Share2 aria-hidden="true" />
							共有して保存
						</Button>
					</div>
				)}
				{shownStatus.kind === 'done' && (
					<p className="rounded-lg border border-border p-3">
						{shownStatus.via === 'share'
							? '共有シートから保存しました。'
							: `${shownGenerated?.file.name ?? '画像'} のダウンロードを開始しました。保存されない場合は、下の画像を長押し（右クリック）して保存してください。`}
					</p>
				)}
			</div>

			{shownGenerated && (
				<details
					className="rounded-lg border border-border p-4 text-sm"
					open={shownStatus.kind === 'done' && shownStatus.via === 'download'}
				>
					<summary className="cursor-pointer font-medium">保存できない場合</summary>
					<p className="mt-2 text-muted-foreground">
						下の画像を長押し（PC では右クリック）して保存してください。
					</p>
					<img
						src={shownGenerated.url}
						alt="保存用に作成した画像"
						className="mx-auto mt-3 max-h-80 w-auto rounded-md border border-border"
					/>
				</details>
			)}

			<SaveGuide open={shownStatus.kind === 'done'} />
		</section>
	);
}
