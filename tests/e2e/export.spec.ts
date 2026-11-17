import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { makeQuadrantPng } from './helpers';

/** PNG の IHDR から幅・高さを読む */
function pngSize(bytes: Buffer): [number, number] {
	return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

test('PC では PNG・JPEG をモデルの解像度でダウンロードできる', async ({ page }) => {
	await page.goto('./');
	await page.getByLabel('シリーズ').selectOption('Apple Watch Series 11');
	await page.getByLabel('ケースサイズ').selectOption('series11-46mm');
	await page.getByTestId('image-input').setInputFiles({
		name: 'my-private-photo.png',
		mimeType: 'image/png',
		buffer: await makeQuadrantPng(page, 900, 700),
	});
	await expect(page.getByRole('img', { name: /表示プレビュー/ })).toBeVisible();

	const [png] = await Promise.all([
		page.waitForEvent('download'),
		page.getByRole('button', { name: '画像を保存' }).click(),
	]);
	expect(png.suggestedFilename()).toMatch(/^watchfit-series11-46mm-\d{8}-\d{6}\.png$/);
	expect(png.suggestedFilename()).not.toContain('my-private-photo');
	const pngBytes = await readFile(await png.path());
	expect(pngSize(pngBytes)).toEqual([416, 496]);

	await page.getByText('JPEG', { exact: true }).click();
	const [jpeg] = await Promise.all([
		page.waitForEvent('download'),
		page.getByRole('button', { name: '画像を保存' }).click(),
	]);
	expect(jpeg.suggestedFilename()).toMatch(/\.jpg$/);
	const jpegBytes = await readFile(await jpeg.path());
	expect([jpegBytes[0], jpegBytes[1]]).toEqual([0xff, 0xd8]);
	await expect(page.getByText(/を保存しました/)).toBeVisible();
});
