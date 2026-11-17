import { describe, expect, it, vi } from 'vitest';
import {
	createLatestImageLoader,
	type DecodeDependencies,
	type DecodedImage,
	decodeImageFile,
	loadImageElement,
} from '@/features/image/decode';
import { ImageLoadError, MAX_FILE_BYTES } from '@/features/image/validate';
import { ftypHeader, GIF, jpegHeader, PDF, pngHeader, SVG } from './bytes';

function fileOf(bytes: Uint8Array, name = 'image.bin', type = ''): File {
	return new File([new Uint8Array(bytes)], name, { type });
}

function bitmap(width: number, height: number) {
	return { width, height, close: vi.fn() } as unknown as ImageBitmap & {
		close: ReturnType<typeof vi.fn>;
	};
}

function deps(result: ImageBitmap | Error): DecodeDependencies & {
	createImageBitmap: ReturnType<typeof vi.fn>;
} {
	return {
		createImageBitmap: vi.fn(async () => {
			if (result instanceof Error) throw result;
			return result;
		}),
		loadImageElement: vi.fn(async () => {
			throw result instanceof Error ? result : new Error('未使用');
		}),
	};
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
	try {
		await promise;
	} catch (error) {
		if (error instanceof ImageLoadError) return error.code;
		throw error;
	}
	throw new Error('失敗しませんでした');
}

describe('decodeImageFile の検証順序', () => {
	it('ファイルが無い・空なら no-file', async () => {
		expect(await codeOf(decodeImageFile(null, deps(bitmap(1, 1))))).toBe('no-file');
		expect(await codeOf(decodeImageFile(fileOf(new Uint8Array()), deps(bitmap(1, 1))))).toBe(
			'no-file',
		);
	});

	it('30MiB を超えるとデコードせず file-too-large', async () => {
		const d = deps(bitmap(1, 1));
		const big = { size: MAX_FILE_BYTES + 1, slice: vi.fn() } as unknown as Blob;
		expect(await codeOf(decodeImageFile(big, d))).toBe('file-too-large');
		expect(d.createImageBitmap).not.toHaveBeenCalled();
	});

	it.each([
		['GIF', GIF],
		['PDF', PDF],
		['SVG', SVG],
		['AVIF', ftypHeader('avif')],
		['不明', new TextEncoder().encode('not an image')],
	])('%s は MIME type や拡張子に関係なく unsupported-format', async (_n, bytes) => {
		const d = deps(bitmap(1, 1));
		const file = fileOf(bytes, 'photo.jpg', 'image/jpeg');
		expect(await codeOf(decodeImageFile(file, d))).toBe('unsupported-format');
		expect(d.createImageBitmap).not.toHaveBeenCalled();
	});

	it('拡張子が違っても中身が PNG なら読み込める', async () => {
		const d = deps(bitmap(400, 300));
		const decoded = await decodeImageFile(
			fileOf(pngHeader(400, 300), 'photo.txt', 'text/plain'),
			d,
		);
		expect(decoded).toMatchObject({ width: 400, height: 300 });
	});

	it('ヘッダーの寸法が上限超過ならデコードせず too-many-pixels', async () => {
		const d = deps(bitmap(1, 1));
		expect(await codeOf(decodeImageFile(fileOf(pngHeader(10000, 6000)), d))).toBe(
			'too-many-pixels',
		);
		expect(d.createImageBitmap).not.toHaveBeenCalled();
	});

	it('デコード後の寸法が上限超過なら解放して too-many-pixels', async () => {
		const b = bitmap(10000, 6000);
		expect(await codeOf(decodeImageFile(fileOf(ftypHeader('heic')), deps(b)))).toBe(
			'too-many-pixels',
		);
		expect(b.close).toHaveBeenCalled();
	});

	it('デコード後の寸法が 0 なら invalid-dimensions', async () => {
		const b = bitmap(0, 10);
		expect(await codeOf(decodeImageFile(fileOf(jpegHeader(10, 10)), deps(b)))).toBe(
			'invalid-dimensions',
		);
		expect(b.close).toHaveBeenCalled();
	});

	it('デコードに失敗したら corrupted、メモリ不足（RangeError）なら out-of-memory', async () => {
		expect(await codeOf(decodeImageFile(fileOf(pngHeader(10, 10)), deps(new Error('x'))))).toBe(
			'corrupted',
		);
		expect(
			await codeOf(decodeImageFile(fileOf(pngHeader(10, 10)), deps(new RangeError('x')))),
		).toBe('out-of-memory');
	});

	it('HEIC をデコードできない環境では heic-unsupported（変換案内）', async () => {
		expect(await codeOf(decodeImageFile(fileOf(ftypHeader('heic')), deps(new Error('x'))))).toBe(
			'heic-unsupported',
		);
	});
});

describe('decodeImageFile のデコード', () => {
	it('createImageBitmap に EXIF の向きを任せ、デコード後の寸法を正本にする', async () => {
		// ヘッダー上は横長でも、Orientation 適用後の縦長の寸法を採用する（二重回転しない）
		const d = deps(bitmap(3024, 4032));
		const decoded = await decodeImageFile(fileOf(jpegHeader(4032, 3024)), d);
		expect(d.createImageBitmap).toHaveBeenCalledWith(expect.any(Blob), {
			imageOrientation: 'from-image',
		});
		expect(decoded).toMatchObject({ width: 3024, height: 4032 });
	});

	it('createImageBitmap が無ければ HTMLImageElement で読み込む', async () => {
		const image = Object.assign(new Image(), {});
		Object.defineProperty(image, 'naturalWidth', { value: 640 });
		Object.defineProperty(image, 'naturalHeight', { value: 480 });
		const release = vi.fn();
		const loadImageElement = vi.fn(async () => ({ image, release }));
		const decoded = await decodeImageFile(fileOf(pngHeader(640, 480)), {
			createImageBitmap: undefined,
			loadImageElement,
		});
		expect(decoded).toMatchObject({ width: 640, height: 480, source: image });
		expect(release).not.toHaveBeenCalled();
		decoded.release();
		expect(release).toHaveBeenCalledTimes(1);
	});

	it('createImageBitmap が失敗したら HTMLImageElement で読み直す', async () => {
		const image = new Image();
		Object.defineProperty(image, 'naturalWidth', { value: 300 });
		Object.defineProperty(image, 'naturalHeight', { value: 200 });
		const loadImageElement = vi.fn(async () => ({ image, release: vi.fn() }));
		const decoded = await decodeImageFile(fileOf(ftypHeader('heic')), {
			createImageBitmap: vi.fn(async () => {
				throw new TypeError('imageOrientation に未対応');
			}),
			loadImageElement,
		});
		expect(loadImageElement).toHaveBeenCalled();
		expect(decoded).toMatchObject({ width: 300, height: 200, source: image });
	});

	it('createImageBitmap がメモリ不足で失敗したら読み直さず out-of-memory', async () => {
		const loadImageElement = vi.fn();
		expect(
			await codeOf(
				decodeImageFile(fileOf(ftypHeader('heic')), {
					createImageBitmap: vi.fn(async () => {
						throw new DOMException('quota', 'QuotaExceededError');
					}),
					loadImageElement,
				}),
			),
		).toBe('out-of-memory');
		expect(loadImageElement).not.toHaveBeenCalled();
	});

	it('release は ImageBitmap.close() を 1 回だけ呼ぶ', async () => {
		const b = bitmap(10, 10);
		const decoded = await decodeImageFile(fileOf(pngHeader(10, 10)), deps(b));
		decoded.release();
		decoded.release();
		expect(b.close).toHaveBeenCalledTimes(1);
	});
});

describe('createLatestImageLoader', () => {
	function deferred() {
		let resolve!: (value: DecodedImage) => void;
		let reject!: (error: unknown) => void;
		const promise = new Promise<DecodedImage>((res, rej) => {
			resolve = res;
			reject = rej;
		});
		return { promise, resolve, reject };
	}

	function decoded(): DecodedImage {
		return { source: {} as ImageBitmap, width: 1, height: 1, release: vi.fn() };
	}

	it('古い読み込みが後から完了しても採用せず、リソースを解放する', async () => {
		const first = deferred();
		const second = deferred();
		const queue = [first, second];
		const loader = createLatestImageLoader(
			() => (queue.shift() as ReturnType<typeof deferred>).promise,
		);
		const p1 = loader.load(new Blob(['a']));
		const p2 = loader.load(new Blob(['b']));
		const newer = decoded();
		second.resolve(newer);
		const older = decoded();
		first.resolve(older);
		expect(await p2).toEqual({ status: 'loaded', image: newer });
		expect(await p1).toEqual({ status: 'stale' });
		expect(older.release).toHaveBeenCalled();
		expect(newer.release).not.toHaveBeenCalled();
	});

	it('古い読み込みの失敗は報告しない', async () => {
		const first = deferred();
		const second = deferred();
		const queue = [first, second];
		const loader = createLatestImageLoader(
			() => (queue.shift() as ReturnType<typeof deferred>).promise,
		);
		const p1 = loader.load(new Blob(['a']));
		const p2 = loader.load(new Blob(['b']));
		first.reject(new ImageLoadError('corrupted'));
		second.resolve(decoded());
		expect(await p1).toEqual({ status: 'stale' });
		expect((await p2).status).toBe('loaded');
	});

	it('最新の読み込みの失敗はエラーとして返す', async () => {
		const loader = createLatestImageLoader(async () => {
			throw new ImageLoadError('heic-unsupported');
		});
		const result = await loader.load(new Blob(['a']));
		expect(result.status).toBe('failed');
		if (result.status === 'failed') expect(result.error.code).toBe('heic-unsupported');
	});

	it('cancel 後に完了した読み込みは解放する', async () => {
		const pending = deferred();
		const loader = createLatestImageLoader(() => pending.promise);
		const p = loader.load(new Blob(['a']));
		loader.cancel();
		const image = decoded();
		pending.resolve(image);
		expect(await p).toEqual({ status: 'stale' });
		expect(image.release).toHaveBeenCalled();
	});
});

describe('loadImageElement', () => {
	// jsdom の HTMLImageElement には decode() が無いため、テスト中だけ定義する
	function stubDecode(impl: () => Promise<void>) {
		Object.defineProperty(HTMLImageElement.prototype, 'decode', {
			value: impl,
			configurable: true,
			writable: true,
		});
		return () => {
			Reflect.deleteProperty(HTMLImageElement.prototype, 'decode');
		};
	}

	it('失敗したら src を外して Object URL を解放する', async () => {
		const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
		const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
		const restore = stubDecode(() => Promise.reject(new DOMException('x', 'EncodingError')));
		try {
			await expect(loadImageElement(new Blob(['x']))).rejects.toThrow();
			expect(revoke).toHaveBeenCalledWith('blob:test');
		} finally {
			restore();
			create.mockRestore();
			revoke.mockRestore();
		}
	});

	it('成功時は解放まで Object URL を保持する', async () => {
		const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
		const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:ok');
		const restore = stubDecode(() => Promise.resolve());
		try {
			const loaded = await loadImageElement(new Blob(['x']));
			expect(revoke).not.toHaveBeenCalled();
			loaded.release();
			expect(revoke).toHaveBeenCalledWith('blob:ok');
			expect(loaded.image.hasAttribute('src')).toBe(false);
		} finally {
			restore();
			create.mockRestore();
			revoke.mockRestore();
		}
	});
});
