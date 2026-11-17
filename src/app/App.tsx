import { AlertCircle, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { BackgroundPicker } from '@/components/editor/BackgroundPicker';
import { EditorToolbar } from '@/components/editor/EditorToolbar';
import { FitModeSelector } from '@/components/editor/FitModeSelector';
import { ImageUploader } from '@/components/editor/ImageUploader';
import { WatchPreview, type WatchPreviewHandle } from '@/components/editor/WatchPreview';
import { ZoomSlider } from '@/components/editor/ZoomSlider';
import { ExportPanel } from '@/components/export/ExportPanel';
import { Button } from '@/components/ui/button';
import { GENERIC_CORNER_RADIUS_RATIO, WatchFrame } from '@/components/watch/WatchFrame';
import { WatchModelSelector } from '@/components/watch/WatchModelSelector';
import {
	CUSTOM_MODEL_ID,
	canPan,
	getRelativeZoom,
	getZoomRange,
	relativeToAbsoluteScale,
} from '@/features/editor/reducer';
import { exportVersion } from '@/features/export/version';
import { findWatchModel } from '@/features/watch/models';
import { useImageEditor } from '@/hooks/useImageEditor';

const FALLBACK_OUTPUT = { width: 416, height: 496 };
/** 方向ボタン 1 回の移動量（出力サイズに対する比率） */
const MOVE_STEP_RATIO = 0.02;

export function App() {
	const editor = useImageEditor();
	const { state, dispatch, decoded, models } = editor;
	const model = findWatchModel(models, state.modelId);
	const frameOutput = editor.previewOutput ?? editor.output ?? FALLBACK_OUTPUT;
	const hasImage = decoded !== null && state.image !== null;
	const { loadFile } = editor;
	const previewRef = useRef<WatchPreviewHandle>(null);
	// 編集操作は、画像があり出力サイズが有効なときだけ行える（10.3）
	const editable = hasImage && editor.canExport;
	const zoomRange = getZoomRange(state, models);
	const step = {
		x: frameOutput.width * MOVE_STEP_RATIO,
		y: frameOutput.height * MOVE_STEP_RATIO,
	};
	const canMove = {
		up: canPan(state, models, { x: 0, y: -step.y }),
		down: canPan(state, models, { x: 0, y: step.y }),
		left: canPan(state, models, { x: -step.x, y: 0 }),
		right: canPan(state, models, { x: step.x, y: 0 }),
	};

	// ページのどこにファイルを落としても、ブラウザがファイルを開いて編集内容を失わないようにし、
	// 画像として読み込む（ドロップ領域が処理済みのものは除く）
	useEffect(() => {
		const hasFiles = (event: DragEvent) =>
			Array.from(event.dataTransfer?.types ?? []).includes('Files');
		const onDragOver = (event: DragEvent) => {
			if (hasFiles(event)) event.preventDefault();
		};
		const onDrop = (event: DragEvent) => {
			if (!hasFiles(event) || event.defaultPrevented) return;
			event.preventDefault();
			const file = event.dataTransfer?.files[0];
			if (file) void loadFile(file);
		};
		window.addEventListener('dragover', onDragOver);
		window.addEventListener('drop', onDrop);
		return () => {
			window.removeEventListener('dragover', onDragOver);
			window.removeEventListener('drop', onDrop);
		};
	}, [loadFile]);

	return (
		<div className="min-h-dvh bg-background text-foreground">
			<header className="mx-auto max-w-5xl px-4 pt-6 pb-4">
				<h1 className="text-2xl font-bold tracking-tight">WatchFit</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					好きな写真を、好きな位置で。Apple Watch
					の写真文字盤に合わせて画像の位置と大きさを調整し、保存できます。
				</p>
			</header>

			<main className="mx-auto grid max-w-5xl gap-8 px-4 pb-12 md:grid-cols-2 md:items-start">
				<section aria-label="プレビュー" className="md:sticky md:top-6">
					{hasImage ? (
						<div className="mx-auto w-full max-w-xs">
							<WatchFrame
								output={frameOutput}
								cornerRadiusRatio={model?.cornerRadiusRatio ?? GENERIC_CORNER_RADIUS_RATIO}
							>
								<WatchPreview
									ref={previewRef}
									source={decoded.source}
									sourceSize={decoded}
									output={frameOutput}
									transform={state.transform}
									backgroundColor={state.background.color}
									label="Apple Watch での表示プレビュー。ドラッグで移動、ピンチやホイールで拡大縮小できます。"
									interaction={
										editor.canExport
											? {
													fitMode: state.fitMode,
													onTransformCommit: (transform) =>
														dispatch({ type: 'SET_TRANSFORM', transform }),
												}
											: undefined
									}
								/>
							</WatchFrame>
						</div>
					) : (
						<ImageUploader onSelect={editor.loadFile} hasImage={false} loading={editor.loading} />
					)}
				</section>

				<section aria-label="設定" className="flex flex-col gap-6">
					{editor.loading && (
						<p role="status" className="text-sm text-muted-foreground">
							画像を読み込んでいます…
						</p>
					)}
					{editor.error && (
						<div
							role="alert"
							className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm"
						>
							<AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
							<p className="flex-1">{editor.error}</p>
							<Button
								variant="ghost"
								size="icon"
								className="-m-2"
								aria-label="エラーを閉じる"
								onClick={editor.clearError}
							>
								<X aria-hidden="true" />
							</Button>
						</div>
					)}
					{hasImage && (
						<ImageUploader onSelect={editor.loadFile} hasImage loading={editor.loading} />
					)}
					<WatchModelSelector models={models} state={state} dispatch={dispatch} />

					<section aria-label="編集" className="flex flex-col gap-6">
						<FitModeSelector
							value={state.fitMode}
							onChange={(fitMode) => dispatch({ type: 'SET_FIT_MODE', fitMode })}
							disabled={!editable}
						/>
						<ZoomSlider
							value={getRelativeZoom(state, models)}
							min={zoomRange.min}
							max={zoomRange.max}
							disabled={!editable}
							onChange={(relative) => {
								const scale = relativeToAbsoluteScale(state, models, relative);
								if (scale !== null) dispatch({ type: 'SET_ZOOM', scale });
							}}
						/>
						<BackgroundPicker
							value={state.background.color}
							onChange={(color) => dispatch({ type: 'SET_BACKGROUND', color })}
							disabled={!editable}
						/>
						<EditorToolbar
							disabled={!editable}
							onFit={() => dispatch({ type: 'FIT_IMAGE' })}
							onReset={() => dispatch({ type: 'RESET_TRANSFORM' })}
							onMove={(delta) => dispatch({ type: 'PAN_BY', delta })}
							step={step}
							canMove={canMove}
						/>
					</section>

					<ExportPanel
						disabled={!editable}
						editVersion={exportVersion({
							imageId: editor.imageId,
							transform: state.transform,
							output: editor.output,
							backgroundColor: state.background.color,
							format: state.exportOptions.format,
							quality: state.exportOptions.quality,
						})}
						fileId={
							state.modelId === CUSTOM_MODEL_ID && editor.output
								? `custom-${editor.output.width}x${editor.output.height}`
								: state.modelId
						}
						format={state.exportOptions.format}
						quality={state.exportOptions.quality}
						onFormatChange={(format, quality) =>
							dispatch({ type: 'SET_EXPORT_FORMAT', format, quality })
						}
						getSnapshot={() => {
							if (!decoded || !editor.output || !state.image) return null;
							// 確定前の操作も含めて、表示中の構図で出力する（9.4）
							const transform = previewRef.current?.getDisplayedTransform() ?? state.transform;
							const snapshot = {
								source: decoded.source,
								sourceSize: state.image,
								output: editor.output,
								transform,
								backgroundColor: state.background.color,
								format: state.exportOptions.format,
								quality: state.exportOptions.quality,
							};
							return {
								snapshot,
								version: exportVersion({ ...snapshot, imageId: editor.imageId }),
							};
						}}
					/>
				</section>
			</main>
		</div>
	);
}
