import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadBlob } from '@/features/export/download';
import { EXPORT_ERROR_MESSAGES, ExportError } from '@/features/export/errors';
import { exportFilename } from '@/features/export/filename';
import { type ExportSnapshot, generateExportBlob } from '@/features/export/generate';
import {
	effectiveExportScale,
	isExportScaleAvailable,
	MAX_EXPORT_PIXELS,
	scaledOutputSize,
} from '@/features/export/scale';
import { canShareFile, shareFile } from '@/features/export/share';
import { exportVersion } from '@/features/export/version';

describe('exportFilename', () => {
	it('watchfit-{modelId}-{ローカル日時}.{ext} の形式で、元画像名を含まない', () => {
		const date = new Date(2026, 10, 17, 20, 30, 0);
		expect(exportFilename('series11-46mm', 'png', date)).toBe(
			'watchfit-series11-46mm-20261117-203000.png',
		);
		expect(exportFilename('se3-40mm', 'jpeg', new Date(2026, 0, 2, 3, 4, 5))).toBe(
			'watchfit-se3-40mm-20260102-030405.jpg',
		);
	});

	it('ファイル名に使えない文字を除く', () => {
		const date = new Date(2026, 10, 17, 20, 30, 0);
		expect(exportFilename('Custom 500/600', 'png', date)).toBe(
			'watchfit-custom-500-600-20261117-203000.png',
		);
		expect(exportFilename('', 'png', date)).toBe('watchfit-custom-20261117-203000.png');
	});

	it('2 倍以上では倍率を付ける。1 倍は従来どおり', () => {
		const date = new Date(2026, 10, 17, 20, 30, 0);
		expect(exportFilename('se3-44mm', 'png', date, 1)).toBe(
			'watchfit-se3-44mm-20261117-203000.png',
		);
		expect(exportFilename('se3-44mm', 'jpeg', date, 3)).toBe(
			'watchfit-se3-44mm-3x-20261117-203000.jpg',
		);
	});
});

describe('出力倍率の上限', () => {
	it('倍率を掛けた画素数を返す', () => {
		expect(scaledOutputSize({ width: 368, height: 448 }, 3)).toEqual({ width: 1104, height: 1344 });
	});

	it('Apple Watch のモデル解像度ではどの倍率も使える', () => {
		for (const scale of [1, 2, 3] as const) {
			expect(isExportScaleAvailable({ width: 502, height: 410 }, scale)).toBe(true);
		}
	});

	it('上限を超える倍率は使えず、使える最大の倍率に下げる', () => {
		// 2048×2048 は 2 倍で 4096×4096（上限ちょうど）、3 倍で超える
		const output = { width: 2048, height: 2048 };
		expect(scaledOutputSize(output, 2).width * scaledOutputSize(output, 2).height).toBe(
			MAX_EXPORT_PIXELS,
		);
		expect(isExportScaleAvailable(output, 2)).toBe(true);
		expect(isExportScaleAvailable(output, 3)).toBe(false);
		expect(effectiveExportScale(output, 3)).toBe(2);
		expect(effectiveExportScale({ width: 2048, height: 2049 }, 3)).toBe(1);
		expect(effectiveExportScale(output, 1)).toBe(1);
	});
});

describe('shareFile / canShareFile', () => {
	const file = new File(['x'], 'a.png', { type: 'image/png' });

	it('共有できない環境では false', () => {
		expect(canShareFile(file, {})).toBe(false);
		expect(canShareFile(file, { share: vi.fn(), canShare: () => false })).toBe(false);
		expect(
			canShareFile(file, {
				share: vi.fn(),
				canShare: () => {
					throw new TypeError('x');
				},
			}),
		).toBe(false);
		expect(canShareFile(file, { share: vi.fn(), canShare: () => true })).toBe(true);
	});

	it.each([
		[undefined, 'shared'],
		[new DOMException('cancel', 'AbortError'), 'cancelled'],
		[new DOMException('no activation', 'NotAllowedError'), 'needs-user-activation'],
	])('共有の結果 %s → %s', async (error, expected) => {
		const nav = {
			share: vi.fn(async () => {
				if (error) throw error;
			}),
			canShare: () => true,
		};
		expect(await shareFile(file, nav)).toBe(expected);
		expect(nav.share).toHaveBeenCalledWith({ files: [file] });
	});

	it('それ以外の失敗は例外として返す', async () => {
		const nav = {
			share: vi.fn(async () => {
				throw new DOMException('x', 'DataError');
			}),
			canShare: () => true,
		};
		await expect(shareFile(file, nav)).rejects.toThrow();
	});
});

describe('downloadBlob', () => {
	afterEach(() => vi.useRealTimers());

	it('download 属性付きのリンクで保存し、少し待ってから Object URL を解放する', () => {
		vi.useFakeTimers();
		const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
		const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
		const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
			this: HTMLAnchorElement,
		) {
			expect(this.download).toBe('watchfit.png');
			expect(this.getAttribute('href')).toBe('blob:x');
		});
		downloadBlob(new Blob(['x']), 'watchfit.png');
		expect(click).toHaveBeenCalledTimes(1);
		expect(document.querySelector('a[download]')).toBeNull();
		expect(revoke).not.toHaveBeenCalled();
		vi.advanceTimersByTime(60_000);
		expect(revoke).toHaveBeenCalledWith('blob:x');
		create.mockRestore();
		revoke.mockRestore();
		click.mockRestore();
	});
});

describe('downloadBlob（URL を渡した場合）', () => {
	it('渡された URL を使い、解放は呼び出し側に任せる', () => {
		vi.useFakeTimers();
		const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
		const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
		downloadBlob(new Blob(['x']), 'a.png', 'blob:given');
		vi.advanceTimersByTime(120_000);
		expect(revoke).not.toHaveBeenCalled();
		revoke.mockRestore();
		click.mockRestore();
		vi.useRealTimers();
	});
});

describe('generateExportBlob', () => {
	const snapshot: ExportSnapshot = {
		source: {} as CanvasImageSource,
		sourceSize: { width: 100, height: 100 },
		output: { width: 416, height: 496 },
		transform: { centerX: 208, centerY: 248, scale: 5, rotationDeg: 0 },
		backgroundColor: '#000000',
		format: 'jpeg',
		quality: 0.8,
		scale: 1,
	};

	function fakeCanvas(blob: Blob | null, expectedSize: [number, number] = [416, 496]) {
		const canvas = {
			width: 0,
			height: 0,
			getContext: () => ({
				canvas,
				setTransform: vi.fn(),
				fillRect: vi.fn(),
				save: vi.fn(),
				restore: vi.fn(),
				scale: vi.fn(),
				translate: vi.fn(),
				drawImage: vi.fn(),
			}),
			toBlob: vi.fn((callback: BlobCallback) => {
				expect([canvas.width, canvas.height]).toEqual(expectedSize);
				callback(blob);
			}),
		};
		return canvas;
	}

	it('出力解像度で描画して指定形式・品質で Blob を作り、Canvas を解放する', async () => {
		const canvas = fakeCanvas(new Blob(['jpeg'], { type: 'image/jpeg' }));
		const blob = await generateExportBlob(snapshot, () => canvas as unknown as HTMLCanvasElement);
		expect(blob.type).toBe('image/jpeg');
		expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.8);
		expect([canvas.width, canvas.height]).toEqual([0, 0]);
	});

	it('出力倍率の分だけ画素数を増やして描画する', async () => {
		const canvas = fakeCanvas(new Blob(['png'], { type: 'image/png' }), [1248, 1488]);
		await generateExportBlob(
			{ ...snapshot, format: 'png', scale: 3 },
			() => canvas as unknown as HTMLCanvasElement,
		);
		expect(canvas.toBlob).toHaveBeenCalledTimes(1);
	});

	it('上限を超える倍率は invalid-output', async () => {
		await expect(
			generateExportBlob({ ...snapshot, output: { width: 2048, height: 2048 }, scale: 3 }),
		).rejects.toMatchObject({ code: 'invalid-output' });
	});

	it('PNG では品質を渡さない', async () => {
		const canvas = fakeCanvas(new Blob(['png'], { type: 'image/png' }));
		await generateExportBlob(
			{ ...snapshot, format: 'png' },
			() => canvas as unknown as HTMLCanvasElement,
		);
		expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png', undefined);
	});

	it.each([[{ width: 0, height: 100 }], [{ width: 100.5, height: 100 }]])(
		'不正な出力サイズ %o は invalid-output',
		async (output) => {
			await expect(generateExportBlob({ ...snapshot, output })).rejects.toMatchObject({
				code: 'invalid-output',
			});
		},
	);

	it('Blob を作れなければ blob-failed で、Canvas は解放する', async () => {
		const canvas = fakeCanvas(null);
		await expect(
			generateExportBlob(snapshot, () => canvas as unknown as HTMLCanvasElement),
		).rejects.toMatchObject({ code: 'blob-failed' });
		expect([canvas.width, canvas.height]).toEqual([0, 0]);
	});

	it('2D コンテキストを取れなければ canvas-failed', async () => {
		const canvas = { width: 0, height: 0, getContext: () => null };
		await expect(
			generateExportBlob(snapshot, () => canvas as unknown as HTMLCanvasElement),
		).rejects.toMatchObject({ code: 'canvas-failed' });
	});

	it('描画中のメモリ不足（RangeError）は out-of-memory', async () => {
		const canvas = {
			width: 0,
			height: 0,
			getContext: () => ({
				canvas,
				setTransform: () => {
					throw new RangeError('x');
				},
			}),
		};
		const error = await generateExportBlob(
			snapshot,
			() => canvas as unknown as HTMLCanvasElement,
		).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(ExportError);
		expect(error).toMatchObject({ code: 'out-of-memory' });
	});

	it('エラーメッセージは日本語', () => {
		for (const message of Object.values(EXPORT_ERROR_MESSAGES)) {
			expect(message).toMatch(/[ぁ-んァ-ヶ]/);
		}
	});
});

describe('exportVersion', () => {
	const base = {
		imageId: 1,
		transform: { centerX: 1, centerY: 2, scale: 3, rotationDeg: 0 },
		output: { width: 416, height: 496 },
		backgroundColor: '#000000',
		format: 'png' as const,
		quality: 0.92,
		scale: 1 as const,
	};

	it('同じ内容なら同じ値、出力内容が変われば違う値になる', () => {
		expect(exportVersion(base)).toBe(exportVersion({ ...base, transform: { ...base.transform } }));
		for (const changed of [
			{ ...base, imageId: 2 },
			{ ...base, transform: { ...base.transform, centerX: 1.5 } },
			{ ...base, output: { width: 422, height: 514 } },
			{ ...base, output: null },
			{ ...base, backgroundColor: '#ffffff' },
			{ ...base, format: 'jpeg' as const },
			{ ...base, quality: 0.8 },
			{ ...base, scale: 2 as const },
		]) {
			expect(exportVersion(changed)).not.toBe(exportVersion(base));
		}
	});
});
