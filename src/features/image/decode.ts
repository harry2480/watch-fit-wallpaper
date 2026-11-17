import {
	type Dimensions,
	ImageLoadError,
	isSupportedFormat,
	MAX_FILE_BYTES,
	readHeaderDimensions,
	sniffImageFormat,
	validateDimensions,
} from './validate';

/**
 * JPEG の寸法（SOF）は EXIF 等の後ろにあるため、先頭から多めに読む。
 * この範囲で寸法を読めない画像はデコード後の寸法で判定する。
 */
const HEADER_READ_BYTES = 512 * 1024;

export type DecodedImage = {
	source: ImageBitmap | HTMLImageElement;
	width: number;
	height: number;
	/** 画像リソースを解放する。何度呼んでもよい */
	release: () => void;
};

export type LoadedImageElement = { image: HTMLImageElement; release: () => void };

export type DecodeDependencies = {
	createImageBitmap?:
		| ((blob: Blob, options?: ImageBitmapOptions) => Promise<ImageBitmap>)
		| undefined;
	loadImageElement: (blob: Blob) => Promise<LoadedImageElement>;
};

/**
 * HTMLImageElement で読み込む。Object URL はブラウザが再デコードに使う可能性があるため、
 * 画像を解放するまで保持する（要件定義 5.7）。
 */
export async function loadImageElement(blob: Blob): Promise<LoadedImageElement> {
	const url = URL.createObjectURL(blob);
	const image = new Image();
	image.decoding = 'async';
	const release = () => {
		image.removeAttribute('src');
		URL.revokeObjectURL(url);
	};
	image.src = url;
	try {
		await image.decode();
	} catch (error) {
		release();
		throw error;
	}
	return { image, release };
}

export function defaultDecodeDependencies(): DecodeDependencies {
	return {
		createImageBitmap:
			typeof globalThis.createImageBitmap === 'function'
				? globalThis.createImageBitmap.bind(globalThis)
				: undefined,
		loadImageElement,
	};
}

function isOutOfMemory(error: unknown): boolean {
	return (
		error instanceof RangeError ||
		(typeof DOMException !== 'undefined' &&
			error instanceof DOMException &&
			error.name === 'QuotaExceededError')
	);
}

function toDecodeError(error: unknown): ImageLoadError {
	if (error instanceof ImageLoadError) {
		return error;
	}
	if (isOutOfMemory(error)) {
		return new ImageLoadError('out-of-memory');
	}
	return new ImageLoadError('corrupted');
}

type DecodedSource = {
	source: ImageBitmap | HTMLImageElement;
	dimensions: Dimensions;
	release: () => void;
};

async function decodeSource(file: Blob, deps: DecodeDependencies): Promise<DecodedSource> {
	if (deps.createImageBitmap) {
		try {
			// EXIF Orientation はブラウザに適用させ、デコード後の寸法を正本にする（二重適用しない）
			const bitmap = await deps.createImageBitmap(file, { imageOrientation: 'from-image' });
			return {
				source: bitmap,
				dimensions: { width: bitmap.width, height: bitmap.height },
				release: () => bitmap.close(),
			};
		} catch (error) {
			// メモリ不足以外（オプション非対応・形式非対応など）は HTMLImageElement で読み直す
			if (isOutOfMemory(error)) {
				throw error;
			}
		}
	}
	const { image, release } = await deps.loadImageElement(file);
	return {
		source: image,
		dimensions: { width: image.naturalWidth, height: image.naturalHeight },
		release,
	};
}

/**
 * 画像ファイルを検証してデコードする（要件定義 5.4 の順）。
 * 失敗時は ImageLoadError を投げる。
 */
export async function decodeImageFile(
	file: Blob | null | undefined,
	deps: DecodeDependencies = defaultDecodeDependencies(),
): Promise<DecodedImage> {
	// 1. 存在
	if (!file || file.size === 0) {
		throw new ImageLoadError('no-file');
	}
	// 2. ファイルサイズ
	if (file.size > MAX_FILE_BYTES) {
		throw new ImageLoadError('file-too-large');
	}
	// 3. 形式（実データの先頭バイトで判定）
	let header: Uint8Array;
	try {
		header = new Uint8Array(await file.slice(0, HEADER_READ_BYTES).arrayBuffer());
	} catch (error) {
		throw toDecodeError(error);
	}
	const format = sniffImageFormat(header);
	if (!isSupportedFormat(format)) {
		throw new ImageLoadError('unsupported-format');
	}
	// 6. デコード前に読める場合はヘッダーの寸法で巨大画像を弾く
	const headerDimensions = readHeaderDimensions(header, format);
	if (headerDimensions) {
		const headerError = validateDimensions(headerDimensions);
		if (headerError === 'too-many-pixels') {
			throw new ImageLoadError(headerError);
		}
	}
	// 4. 実際にデコードできること
	let decoded: DecodedSource;
	try {
		decoded = await decodeSource(file, deps);
	} catch (error) {
		if (format === 'heic' && !isOutOfMemory(error)) {
			throw new ImageLoadError('heic-unsupported');
		}
		throw toDecodeError(error);
	}
	// 5・6. デコード後の寸法を正本として検証
	const dimensionError = validateDimensions(decoded.dimensions);
	if (dimensionError) {
		decoded.release();
		throw new ImageLoadError(dimensionError);
	}
	let released = false;
	return {
		source: decoded.source,
		width: decoded.dimensions.width,
		height: decoded.dimensions.height,
		release: () => {
			if (!released) {
				released = true;
				decoded.release();
			}
		},
	};
}

export type LatestLoadResult =
	| { status: 'loaded'; image: DecodedImage }
	| { status: 'failed'; error: ImageLoadError }
	| { status: 'stale' };

/**
 * 最後に要求した読み込みだけを採用するローダー（要件定義 5.7）。
 * 古い読み込みが後から完了しても結果を捨て、そのリソースを解放する。
 */
export function createLatestImageLoader(
	decode: (file: Blob | null | undefined) => Promise<DecodedImage> = (file) =>
		decodeImageFile(file),
) {
	let latest = 0;
	return {
		async load(file: Blob | null | undefined): Promise<LatestLoadResult> {
			latest += 1;
			const token = latest;
			try {
				const image = await decode(file);
				if (token !== latest) {
					image.release();
					return { status: 'stale' };
				}
				return { status: 'loaded', image };
			} catch (error) {
				if (token !== latest) {
					return { status: 'stale' };
				}
				return { status: 'failed', error: toDecodeError(error) };
			}
		},
		/** 進行中の読み込みをすべて古いものとして扱う（画面破棄時など） */
		cancel(): void {
			latest += 1;
		},
	};
}
