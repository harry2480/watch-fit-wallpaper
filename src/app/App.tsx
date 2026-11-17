import { AlertCircle, X } from 'lucide-react';
import { ImageUploader } from '@/components/editor/ImageUploader';
import { WatchPreview } from '@/components/editor/WatchPreview';
import { Button } from '@/components/ui/button';
import { GENERIC_CORNER_RADIUS_RATIO, WatchFrame } from '@/components/watch/WatchFrame';
import { WatchModelSelector } from '@/components/watch/WatchModelSelector';
import { findWatchModel } from '@/features/watch/models';
import { useImageEditor } from '@/hooks/useImageEditor';

const FALLBACK_OUTPUT = { width: 416, height: 496 };

export function App() {
	const editor = useImageEditor();
	const { state, dispatch, decoded, models } = editor;
	const model = findWatchModel(models, state.modelId);
	const frameOutput = editor.previewOutput ?? editor.output ?? FALLBACK_OUTPUT;
	const hasImage = decoded !== null && state.image !== null;

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
				</section>
			</main>
		</div>
	);
}
