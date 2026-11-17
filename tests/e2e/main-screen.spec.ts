import { expect, test } from '@playwright/test';
import { makeQuadrantPng, near } from './helpers';

test('画像を選ぶと Apple Watch のプレビューに描画される', async ({ page }) => {
	await page.goto('./');
	const png = await makeQuadrantPng(page, 800, 600);
	await page.getByTestId('image-input').setInputFiles({
		name: 'sample.png',
		mimeType: 'image/png',
		buffer: png,
	});
	const preview = page.getByRole('img', { name: /表示プレビュー/ });
	await expect(preview).toBeVisible();
	await expect(page.getByRole('button', { name: '別の画像を選ぶ' })).toBeVisible();

	// Cover の中央配置なので、プレビューの左上は赤、右下は黄になる
	const colors = await preview.evaluate((canvas: HTMLCanvasElement) => {
		const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
		const at = (x: number, y: number) => [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3);
		return {
			topLeft: at(Math.floor(canvas.width * 0.1), Math.floor(canvas.height * 0.1)),
			bottomRight: at(Math.floor(canvas.width * 0.9), Math.floor(canvas.height * 0.9)),
		};
	});
	// ブラウザの色管理による小さな差は許容する
	expect(near(colors.topLeft, [255, 0, 0], 12)).toBe(true);
	expect(near(colors.bottomRight, [255, 255, 0], 12)).toBe(true);
});

test('対応していないファイルではエラーを表示し、選び直せる', async ({ page }) => {
	await page.goto('./');
	await page.getByTestId('image-input').setInputFiles({
		name: 'note.txt',
		mimeType: 'text/plain',
		buffer: Buffer.from('not an image'),
	});
	await expect(page.getByRole('alert')).toContainText('対応していない形式です');
	await expect(page.getByRole('button', { name: '画像を選ぶ' })).toBeEnabled();
});
