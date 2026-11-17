import type { Size } from '@/features/editor/geometry';
import { EXPORT_SCALES, type ExportScale } from '@/features/editor/reducer';

/**
 * 出力 Canvas の上限。iOS Safari の Canvas は 1 枚あたり約 1,677 万画素（4096×4096）を超えると
 * 描画できないため、それを超える倍率は選べないようにする。
 */
export const MAX_EXPORT_PIXELS = 4096 * 4096;

/** 出力倍率を掛けた、実際に書き出す画素数 */
export function scaledOutputSize(output: Size, scale: ExportScale): Size {
	return { width: output.width * scale, height: output.height * scale };
}

/** その出力サイズで選べる倍率か */
export function isExportScaleAvailable(output: Size, scale: ExportScale): boolean {
	const size = scaledOutputSize(output, scale);
	return size.width * size.height <= MAX_EXPORT_PIXELS;
}

/**
 * 実際に使う倍率。選んだ倍率が上限を超える場合（大きなカスタム解像度に切り替えた場合など）は、
 * 選べる中で最も大きい倍率に下げる。1 倍は常に使える。
 */
export function effectiveExportScale(output: Size, scale: ExportScale): ExportScale {
	let result: ExportScale = 1;
	for (const candidate of EXPORT_SCALES) {
		if (candidate <= scale && isExportScaleAvailable(output, candidate)) {
			result = candidate;
		}
	}
	return result;
}
