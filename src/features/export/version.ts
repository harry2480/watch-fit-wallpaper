import type { ImageTransform, Size } from '@/features/editor/geometry';
import type { ExportFormat, ExportScale } from '@/features/editor/reducer';

export type ExportVersionInput = {
	/** 読み込んだ画像ごとに変わる識別子 */
	imageId: number;
	transform: ImageTransform;
	output: Size | null;
	backgroundColor: string;
	format: ExportFormat;
	quality: number;
	scale: ExportScale;
};

/**
 * 出力内容を決める値から作る識別子。
 * 生成済みの画像が、現在の編集状態と同じ内容かどうかの判定に使う。
 */
export function exportVersion(input: ExportVersionInput): string {
	const { transform, output } = input;
	return JSON.stringify([
		input.imageId,
		transform.centerX,
		transform.centerY,
		transform.scale,
		transform.rotationDeg,
		output?.width ?? null,
		output?.height ?? null,
		input.backgroundColor,
		input.format,
		input.quality,
		input.scale,
	]);
}
