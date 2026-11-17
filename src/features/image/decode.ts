import {
	type Dimensions,
	ImageLoadError,
	isSupportedFormat,
	MAX_FILE_BYTES,
	readHeaderDimensions,
	sniffImageFormat,
	validateDimensions,
} from './validate';

/** JPEG の寸法（SOF）は EXIF の後ろにあるため、先頭から多めに読む */
const HEADER_READ_BYTES = 512 * 1024;

export type DecodedImage = {
	source: ImageBitmap | HTMLImageElement;
	width: number;
	height: number;
	/** 画像リソースを解放する。何度呼んでもよい */
	release: () => void;
};

export type DecodeDependencies = {
	createImageBitmap?:
		| ((blob: Blob, options?: ImageBitmapOptions) => Promise<ImageBitmap>)
		| undefined;
	loadImageElement: (blob: Blob) => Promise<HTMLImageElement>;
};

/** createImageBitmap が使えない環境向け。Object URL はデコード完了後すぐに解放する */
export function loadImageElement(blob: Blob): Promise<HTMLImageElement> {
	const url = URL.createObjectURL(blob);
	const image = new Image();
	image.decoding = 'async';
	image.src = url;
	return image
		.decode()
		.then(() => image)
		.finally(() => URL.revokeObjectURL(url));
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

function toDecodeError(error: unknown): ImageLoadError {
	if (error instanceof ImageLoadError) {
		return error;
	}
	if (error instanceof RangeError) {
		return new ImageLoadError('out-of-memory');
	}
	return new ImageLoadError('corrupted');
}

function releaseSource(source: ImageBitmap | HTMLImageElement): void {
	if ('close' in source && typeof source.close === 'function') {
		source.close();
		return;
	}
	if (source instanceof HTMLImageElement) {
		source.removeAttribute('src');
	}
}

async function decodeSource(
	file: Blob,
	deps: DecodeDependencies,
): Promise<{ source: ImageBitmap | HTMLImageElement; dimensions: Dimensions }> {
	if (deps.createImageBitmap) {
		// EXIF Orientation はブラウザに適用させ、デコード後の寸法を正本にする（二重適用しない）
		const bitmap = await deps.createImageBitmap(file, { imageOrientation: 'from-image' });
		return { source: bitmap, dimensions: { width: bitmap.width, height: bitmap.height } };
	}
	const image = await deps.loadImageElement(file);
	return {
		source: image,
		dimensions: { width: image.naturalWidth, height: image.naturalHeight },
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
	let decoded: Awaited<ReturnType<typeof decodeSource>>;
	try {
		decoded = await decodeSource(file, deps);
	} catch (error) {
		throw format === 'heic' ? new ImageLoadError('heic-unsupported') : toDecodeError(error);
	}
	// 5・6. デコード後の寸法を正本として検証
	const dimensionError = validateDimensions(decoded.dimensions);
	if (dimensionError) {
		releaseSource(decoded.source);
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
				releaseSource(decoded.source);
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
