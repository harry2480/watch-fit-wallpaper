import type { ExportFormat, ExportScale } from '@/features/editor/reducer';

const EXTENSIONS: Record<ExportFormat, string> = { png: 'png', jpeg: 'jpg' };
export const MIME_TYPES: Record<ExportFormat, string> = { png: 'image/png', jpeg: 'image/jpeg' };

function pad(value: number, length = 2): string {
	return String(value).padStart(length, '0');
}

/**
 * 出力ファイル名（要件定義 9.6）: watchfit-{modelId}[-{scale}x]-{YYYYMMDD-HHmmss}.{ext}
 * 倍率は 2 倍以上のときだけ付ける。日時はローカル時刻。元画像のファイル名は含めない。
 */
export function exportFilename(
	modelId: string,
	format: ExportFormat,
	date: Date,
	scale: ExportScale = 1,
): string {
	const safeId =
		modelId
			.toLowerCase()
			.replace(/[^a-z0-9-]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'custom';
	const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
	const scaleSuffix = scale === 1 ? '' : `-${scale}x`;
	return `watchfit-${safeId}${scaleSuffix}-${stamp}.${EXTENSIONS[format]}`;
}
