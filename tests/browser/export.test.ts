import { describe, expect, it } from 'vitest';
import { panTransform } from '@/features/editor/constraints';
import { centeredTransform } from '@/features/editor/geometry';
import { renderImage } from '@/features/editor/renderer';
import { generateExportBlob } from '@/features/export/generate';
import { decodeImageFile } from '@/features/image/decode';
import { buildExifSegment, EXIF_DATETIME, EXIF_MAKE, includesAscii, insertExif } from './exif';

/** EXIF 付きの JPEG を読み込んだ想定の画像（Canvas で作るので EXIF は無い）。4 象限の色で構図を確かめる */
function quadrant(width: number, height: number): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
	['#ff0000', '#00ff00', '#0000ff', '#ffff00'].forEach((color, i) => {
		ctx.fillStyle = color;
		ctx.fillRect((i % 2) * (width / 2), Math.floor(i / 2) * (height / 2), width / 2, height / 2);
	});
	return canvas;
}

const image = quadrant(1200, 800);
const imageSize = { width: 1200, height: 800 };
const output = { width: 416, height: 496 };

describe('generateExportBlob（実ブラウザ）', () => {
	it.each(['png', 'jpeg'] as const)('%s を出力解像度で生成する', async (format) => {
		const blob = await generateExportBlob({
			source: image,
			sourceSize: imageSize,
			output,
			transform: centeredTransform('cover', imageSize, output),
			backgroundColor: '#000000',
			format,
			quality: 0.92,
		});
		expect(blob.type).toBe(format === 'png' ? 'image/png' : 'image/jpeg');
		const bitmap = await createImageBitmap(blob);
		expect([bitmap.width, bitmap.height]).toEqual([416, 496]);
		bitmap.close();
	});

	it.each(['png', 'jpeg'] as const)(
		'EXIF（位置情報・機器名・撮影日時）付きの JPEG から作った %s に、メタデータと元のファイル名を含めない',
		async (format) => {
			const plain = await new Promise<Blob>((resolve) =>
				image.toBlob((blob) => resolve(blob as Blob), 'image/jpeg', 0.9),
			);
			const withExif = insertExif(new Uint8Array(await plain.arrayBuffer()), buildExifSegment());
			// 入力側に実際にメタデータが入っていることを先に確かめる
			expect(includesAscii(withExif, 'Exif')).toBe(true);
			expect(includesAscii(withExif, EXIF_MAKE)).toBe(true);
			expect(includesAscii(withExif, EXIF_DATETIME)).toBe(true);

			const file = new File([new Uint8Array(withExif)], 'secret-original-name.jpg', {
				type: 'image/jpeg',
			});
			const decoded = await decodeImageFile(file);
			const blob = await generateExportBlob({
				source: decoded.source,
				sourceSize: decoded,
				output,
				transform: centeredTransform('cover', decoded, output),
				backgroundColor: '#000000',
				format,
				quality: 0.92,
			});
			decoded.release();
			const bytes = new Uint8Array(await blob.arrayBuffer());
			for (const text of [
				'Exif',
				'eXIf',
				'tEXt',
				'iTXt',
				EXIF_MAKE,
				EXIF_DATETIME,
				'secret-original-name',
			]) {
				expect(includesAscii(bytes, text), text).toBe(false);
			}
		},
	);

	it('PNG でも背景は不透明', async () => {
		const blob = await generateExportBlob({
			source: image,
			sourceSize: imageSize,
			output,
			transform: { ...centeredTransform('contain', imageSize, output), scale: 0.05 },
			backgroundColor: '#123456',
			format: 'png',
			quality: 0.92,
		});
		const bitmap = await createImageBitmap(blob);
		const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
		const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
		ctx.drawImage(bitmap, 0, 0);
		expect([...ctx.getImageData(1, 1, 1, 1).data]).toEqual([0x12, 0x34, 0x56, 255]);
		bitmap.close();
	});

	it('プレビューと同じ構図の画像を出力する', async () => {
		const transform = panTransform(
			{ ...centeredTransform('contain', imageSize, output), scale: 0.5 },
			{ x: 37, y: -21 },
			'contain',
			imageSize,
			output,
		);
		const preview = document.createElement('canvas');
		const previewCtx = preview.getContext('2d') as CanvasRenderingContext2D;
		renderImage(
			previewCtx,
			{
				source: image,
				sourceWidth: 1200,
				sourceHeight: 800,
				outputWidth: 416,
				outputHeight: 496,
				transform,
				backgroundColor: '#000000',
			},
			1,
		);
		const blob = await generateExportBlob({
			source: image,
			sourceSize: imageSize,
			output,
			transform,
			backgroundColor: '#000000',
			format: 'png',
			quality: 0.92,
		});
		const bitmap = await createImageBitmap(blob);
		const exported = new OffscreenCanvas(416, 496);
		const exportedCtx = exported.getContext('2d') as OffscreenCanvasRenderingContext2D;
		exportedCtx.drawImage(bitmap, 0, 0);
		const a = previewCtx.getImageData(0, 0, 416, 496).data;
		const b = exportedCtx.getImageData(0, 0, 416, 496).data;
		let diff = 0;
		for (let i = 0; i < a.length; i += 1) {
			diff = Math.max(diff, Math.abs((a[i] ?? 0) - (b[i] ?? 0)));
		}
		expect(diff).toBeLessThanOrEqual(2);
		bitmap.close();
	});
});
