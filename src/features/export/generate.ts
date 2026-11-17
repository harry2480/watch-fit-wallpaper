import type { ImageTransform, Size } from '@/features/editor/geometry';
import type { ExportFormat, ExportScale } from '@/features/editor/reducer';
import { renderImage } from '@/features/editor/renderer';
import { ExportError } from './errors';
import { MIME_TYPES } from './filename';
import { isExportScaleAvailable } from './scale';

export type ExportSnapshot = {
	source: CanvasImageSource;
	sourceSize: Size;
	output: Size;
	transform: ImageTransform;
	backgroundColor: string;
	format: ExportFormat;
	/** JPEG の品質（0.5〜1.0） */
	quality: number;
	/** 出力倍率。output（Output 座標系）× scale の画素数で書き出す */
	scale: ExportScale;
};

function isValidOutput(output: Size): boolean {
	return (
		Number.isInteger(output.width) &&
		Number.isInteger(output.height) &&
		output.width > 0 &&
		output.height > 0
	);
}

/**
 * 出力画像を生成する（要件定義 9.2〜9.5）。
 * 出力用 Canvas を別に作り、編集状態のスナップショットから共通レンダラーで描く。
 * Canvas から作るため、元画像の EXIF（位置情報など）は含まれない。
 */
export async function generateExportBlob(
	snapshot: ExportSnapshot,
	createCanvas: () => HTMLCanvasElement = () => document.createElement('canvas'),
): Promise<Blob> {
	if (!isValidOutput(snapshot.output) || !isExportScaleAvailable(snapshot.output, snapshot.scale)) {
		throw new ExportError('invalid-output');
	}
	const canvas = createCanvas();
	try {
		const ctx = canvas.getContext('2d');
		if (!ctx) {
			throw new ExportError('canvas-failed');
		}
		try {
			renderImage(
				ctx,
				{
					source: snapshot.source,
					sourceWidth: snapshot.sourceSize.width,
					sourceHeight: snapshot.sourceSize.height,
					outputWidth: snapshot.output.width,
					outputHeight: snapshot.output.height,
					transform: snapshot.transform,
					backgroundColor: snapshot.backgroundColor,
				},
				// 構図は Output 座標系のまま、プレビューと同じレンダラーで画素数だけ増やす
				snapshot.scale,
			);
		} catch (error) {
			throw error instanceof RangeError
				? new ExportError('out-of-memory')
				: new ExportError('canvas-failed');
		}
		const blob = await new Promise<Blob | null>((resolve) => {
			try {
				canvas.toBlob(
					resolve,
					MIME_TYPES[snapshot.format],
					snapshot.format === 'jpeg' ? snapshot.quality : undefined,
				);
			} catch {
				resolve(null);
			}
		});
		if (!blob || blob.size === 0) {
			throw new ExportError('blob-failed');
		}
		return blob;
	} finally {
		// 出力用 Canvas のメモリを解放する（9.4）
		canvas.width = 0;
		canvas.height = 0;
	}
}
