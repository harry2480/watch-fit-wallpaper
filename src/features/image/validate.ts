/** 要件定義 5.3 の入力制限 */
export const MAX_FILE_BYTES = 30 * 1024 * 1024;
export const MAX_PIXELS = 50_000_000;

export type ImageFormat = 'jpeg' | 'png' | 'webp' | 'heic';

export type SniffedFormat = ImageFormat | 'gif' | 'svg' | 'pdf' | 'avif' | 'unknown';

export type ImageLoadErrorCode =
	| 'no-file'
	| 'file-too-large'
	| 'unsupported-format'
	| 'heic-unsupported'
	| 'corrupted'
	| 'invalid-dimensions'
	| 'too-many-pixels'
	| 'out-of-memory';

/** ユーザー向けの日本語メッセージ（要件定義 12.1）。技術的な詳細は含めない */
export const IMAGE_LOAD_ERROR_MESSAGES: Record<ImageLoadErrorCode, string> = {
	'no-file': '画像ファイルが選択されていません。',
	'file-too-large': 'ファイルサイズが大きすぎます。30MB 以下の画像を選んでください。',
	'unsupported-format': '対応していない形式です。JPEG・PNG・WebP の画像を選んでください。',
	'heic-unsupported':
		'このブラウザでは HEIC / HEIF 画像を読み込めません。写真アプリで JPEG に書き出すか、iPhone の「設定 > カメラ > フォーマット」で「互換性優先」を選んでから撮影した画像を使ってください。',
	corrupted: '画像を読み込めませんでした。ファイルが壊れている可能性があります。',
	'invalid-dimensions': '画像の幅または高さを読み取れませんでした。',
	'too-many-pixels': '画像の解像度が大きすぎます。5,000 万画素以下の画像を選んでください。',
	'out-of-memory': 'メモリが不足して画像を読み込めませんでした。小さい画像を選んでください。',
};

export class ImageLoadError extends Error {
	readonly code: ImageLoadErrorCode;

	constructor(code: ImageLoadErrorCode) {
		super(IMAGE_LOAD_ERROR_MESSAGES[code]);
		this.name = 'ImageLoadError';
		this.code = code;
	}
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
	return String.fromCharCode(...bytes.subarray(start, start + length));
}

const HEIF_BRANDS = new Set([
	'heic',
	'heix',
	'hevc',
	'hevx',
	'heim',
	'heis',
	'hevm',
	'hevs',
	'mif1',
	'msf1',
]);

/** 先頭バイトから実際の形式を判定する（拡張子・MIME type は信用しない、要件定義 5.4） */
export function sniffImageFormat(bytes: Uint8Array): SniffedFormat {
	if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
		return 'jpeg';
	}
	if (
		bytes.length >= 8 &&
		[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)
	) {
		return 'png';
	}
	if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
		return 'webp';
	}
	if (bytes.length >= 12 && ascii(bytes, 4, 4) === 'ftyp') {
		const major = ascii(bytes, 8, 4);
		if (major === 'avif' || major === 'avis') {
			return 'avif';
		}
		if (HEIF_BRANDS.has(major)) {
			return 'heic';
		}
		return 'unknown';
	}
	if (bytes.length >= 4 && ascii(bytes, 0, 4) === 'GIF8') {
		return 'gif';
	}
	if (bytes.length >= 4 && ascii(bytes, 0, 4) === '%PDF') {
		return 'pdf';
	}
	const head = new TextDecoder().decode(bytes.subarray(0, 256)).trimStart().toLowerCase();
	if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) {
		return 'svg';
	}
	return 'unknown';
}

export function isSupportedFormat(format: SniffedFormat): format is ImageFormat {
	return format === 'jpeg' || format === 'png' || format === 'webp' || format === 'heic';
}

export type Dimensions = { width: number; height: number };

function readUint16BE(bytes: Uint8Array, offset: number): number {
	return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function readUint24LE(bytes: Uint8Array, offset: number): number {
	return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8) | ((bytes[offset + 2] ?? 0) << 16);
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
	return (
		(((bytes[offset] ?? 0) << 24) >>> 0) +
		((bytes[offset + 1] ?? 0) << 16) +
		((bytes[offset + 2] ?? 0) << 8) +
		(bytes[offset + 3] ?? 0)
	);
}

/**
 * ヘッダーから画像の寸法を読む（デコード前に巨大画像を弾くため）。
 * 読めない場合は null を返し、デコード後の寸法で判定する。
 */
export function readHeaderDimensions(bytes: Uint8Array, format: SniffedFormat): Dimensions | null {
	if (format === 'png' && bytes.length >= 24 && ascii(bytes, 12, 4) === 'IHDR') {
		return { width: readUint32BE(bytes, 16), height: readUint32BE(bytes, 20) };
	}
	if (format === 'webp' && bytes.length >= 16) {
		const chunk = ascii(bytes, 12, 4);
		if (chunk === 'VP8X' && bytes.length >= 30) {
			return { width: readUint24LE(bytes, 24) + 1, height: readUint24LE(bytes, 27) + 1 };
		}
		if (chunk === 'VP8 ' && bytes.length >= 30) {
			return {
				width: (bytes[26] ?? 0) | (((bytes[27] ?? 0) & 0x3f) << 8),
				height: (bytes[28] ?? 0) | (((bytes[29] ?? 0) & 0x3f) << 8),
			};
		}
		if (chunk === 'VP8L' && bytes.length >= 25) {
			const b0 = bytes[21] ?? 0;
			const b1 = bytes[22] ?? 0;
			const b2 = bytes[23] ?? 0;
			const b3 = bytes[24] ?? 0;
			return {
				width: 1 + (((b1 & 0x3f) << 8) | b0),
				height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
			};
		}
		return null;
	}
	if (format === 'jpeg') {
		let offset = 2;
		while (offset + 9 < bytes.length) {
			if (bytes[offset] !== 0xff) {
				return null;
			}
			const marker = bytes[offset + 1] ?? 0;
			if (marker === 0xff) {
				offset += 1;
				continue;
			}
			// SOF0〜SOF15（DHT=C4・JPG=C8・DAC=CC を除く）
			if (
				marker >= 0xc0 &&
				marker <= 0xcf &&
				marker !== 0xc4 &&
				marker !== 0xc8 &&
				marker !== 0xcc
			) {
				return { height: readUint16BE(bytes, offset + 5), width: readUint16BE(bytes, offset + 7) };
			}
			if (marker === 0xd9 || marker === 0xda) {
				return null;
			}
			offset += 2 + readUint16BE(bytes, offset + 2);
		}
		return null;
	}
	return null;
}

/** 寸法を検証する（要件定義 5.4 の 5・6） */
export function validateDimensions(dimensions: Dimensions): ImageLoadErrorCode | null {
	const { width, height } = dimensions;
	if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
		return 'invalid-dimensions';
	}
	if (width * height > MAX_PIXELS) {
		return 'too-many-pixels';
	}
	return null;
}
