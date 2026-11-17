import type { ImageTransform, Size } from './geometry';

/** 要件定義 8.2 の共通レンダラーの入力。プレビューと出力で同じものを使う */
export type RenderParams = {
	source: CanvasImageSource;
	/** Source 座標系での画像サイズ（縮小した編集用画像を使う場合も元画像の寸法） */
	sourceWidth: number;
	sourceHeight: number;
	outputWidth: number;
	outputHeight: number;
	transform: ImageTransform;
	backgroundColor: string;
};

/**
 * 画像を Output 座標系で描画する（要件定義 8.1 の順序）。
 * renderScale は Output 1px あたりの Canvas ピクセル数。出力は 1、プレビューは表示サイズに合わせて縮小する。
 * 高 DPI などの追加スケーリングはこの値だけで扱い、描画行列で一元管理する。
 */
export function renderImage(
	ctx: CanvasRenderingContext2D,
	params: RenderParams,
	renderScale = 1,
): void {
	const canvas = ctx.canvas;
	// 1. Canvas サイズを設定（サイズ変更はコンテキスト状態もリセットする）
	const pixelWidth = Math.max(1, Math.round(params.outputWidth * renderScale));
	const pixelHeight = Math.max(1, Math.round(params.outputHeight * renderScale));
	if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
	if (canvas.height !== pixelHeight) canvas.height = pixelHeight;

	// 2. 変換行列を初期化
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.globalAlpha = 1;
	ctx.globalCompositeOperation = 'source-over';

	// 3. 背景を描画（PNG でも不透明にする、8.6）
	ctx.fillStyle = params.backgroundColor;
	ctx.fillRect(0, 0, pixelWidth, pixelHeight);

	ctx.save();
	// Output 座標 → Canvas ピクセル（Canvas の丸めで生じる比率差も含めて合わせる）
	ctx.scale(pixelWidth / params.outputWidth, pixelHeight / params.outputHeight);
	// 4. 画像中心へ移動
	ctx.translate(params.transform.centerX, params.transform.centerY);
	// 5. 回転（MVP では 0）
	if (params.transform.rotationDeg !== 0) {
		ctx.rotate((params.transform.rotationDeg * Math.PI) / 180);
	}
	// 6. 倍率
	ctx.scale(params.transform.scale, params.transform.scale);
	// 7. 元画像を描画
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(
		params.source,
		-params.sourceWidth / 2,
		-params.sourceHeight / 2,
		params.sourceWidth,
		params.sourceHeight,
	);
	// 8. 描画状態を復元
	ctx.restore();
}

/** プレビュー Canvas の上限ピクセル数（過剰なメモリ消費を避ける） */
export const MAX_PREVIEW_PIXELS = 2048 * 2048;

/**
 * プレビューの描画倍率を決める（要件定義 8.3）。
 * 表示サイズ × devicePixelRatio を超えて描かず、出力解像度も超えない。
 */
export function previewRenderScale(
	output: Size,
	displayWidthCssPx: number,
	devicePixelRatio: number,
): number {
	if (
		!Number.isFinite(displayWidthCssPx) ||
		displayWidthCssPx <= 0 ||
		!(output.width > 0 && output.height > 0)
	) {
		return 1;
	}
	const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
	const byDisplay = (displayWidthCssPx * dpr) / output.width;
	const byMemory = Math.sqrt(MAX_PREVIEW_PIXELS / (output.width * output.height));
	return Math.min(1, byDisplay, byMemory);
}
