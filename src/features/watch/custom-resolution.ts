/** 要件定義 4.5 カスタム解像度の入力制約 */
export const CUSTOM_RESOLUTION_MIN_PX = 100;
export const CUSTOM_RESOLUTION_MAX_PX = 2048;

export type Resolution = { width: number; height: number };

export type CustomResolutionErrors = { width?: string; height?: string };

export type CustomResolutionResult =
	| { ok: true; value: Resolution }
	| { ok: false; errors: CustomResolutionErrors };

function validateDimension(value: unknown, label: string): string | undefined {
	if (typeof value !== 'number' || Number.isNaN(value)) {
		return `${label}を数値で入力してください`;
	}
	if (!Number.isFinite(value)) {
		return `${label}に有限の数値を入力してください`;
	}
	if (!Number.isInteger(value)) {
		return `${label}は整数で入力してください`;
	}
	if (value < CUSTOM_RESOLUTION_MIN_PX || value > CUSTOM_RESOLUTION_MAX_PX) {
		return `${label}は${CUSTOM_RESOLUTION_MIN_PX}〜${CUSTOM_RESOLUTION_MAX_PX}pxの範囲で入力してください`;
	}
	return undefined;
}

/**
 * カスタム解像度を検証する。不正な場合は項目ごとの理由を返し、出力不可として扱う。
 */
export function validateCustomResolution(width: unknown, height: unknown): CustomResolutionResult {
	const errors: CustomResolutionErrors = {};
	const widthError = validateDimension(width, '幅');
	const heightError = validateDimension(height, '高さ');
	if (widthError) errors.width = widthError;
	if (heightError) errors.height = heightError;
	if (widthError || heightError) {
		return { ok: false, errors };
	}
	return { ok: true, value: { width: width as number, height: height as number } };
}

/**
 * 入力欄の文字列を数値に変換する。空欄・数字以外を含む文字列は NaN にする。
 * Number('') が 0 になる・'1e3' が 1000 になるといった暗黙変換を避ける。
 */
export function parseDimensionInput(input: string): number {
	const trimmed = input.trim();
	if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(trimmed)) {
		return Number.NaN;
	}
	return Number(trimmed);
}
