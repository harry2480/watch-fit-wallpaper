import type { ExportFormat } from '@/features/editor/reducer';

const EXTENSIONS: Record<ExportFormat, string> = { png: 'png', jpeg: 'jpg' };
export const MIME_TYPES: Record<ExportFormat, string> = { png: 'image/png', jpeg: 'image/jpeg' };

function pad(value: number, length = 2): string {
	return String(value).padStart(length, '0');
}

/**
 * 出力ファイル名（要件定義 9.6）: watchfit-{modelId}-{YYYYMMDD-HHmmss}.{ext}
 * 日時はローカル時刻。元画像のファイル名は含めない。
 */
export function exportFilename(modelId: string, format: ExportFormat, date: Date): string {
	const safeId =
		modelId
			.toLowerCase()
			.replace(/[^a-z0-9-]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'custom';
	const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
	return `watchfit-${safeId}-${stamp}.${EXTENSIONS[format]}`;
}
