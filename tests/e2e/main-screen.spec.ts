import { expect, test } from '@playwright/test';
import { makeQuadrantPng, near, previewColorAt } from './helpers';

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

	// Cover の中央配置なので、プレビューの左上は赤、右下は黄になる。
	// 描画は requestAnimationFrame で行うため、描かれるまで待つ（色管理による小さな差は許容する）
	await expect
		.poll(async () => near(await previewColorAt(page, 0.1, 0.1), [255, 0, 0], 12))
		.toBe(true);
	expect(near(await previewColorAt(page, 0.9, 0.9), [255, 255, 0], 12)).toBe(true);
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
