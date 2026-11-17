import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { buildExifSegment, insertExif } from '../fixtures/exif';
import { makeQuadrantJpeg, makeQuadrantPng, near, previewBox, previewColorAt } from './helpers';

function pngSize(bytes: Buffer): [number, number] {
	return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

/** JPEG の SOF から幅・高さを読む */
function jpegSize(bytes: Buffer): [number, number] {
	let offset = 2;
	while (offset < bytes.length) {
		const marker = bytes[offset + 1] ?? 0;
		if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
			return [bytes.readUInt16BE(offset + 7), bytes.readUInt16BE(offset + 5)];
		}
		offset += 2 + bytes.readUInt16BE(offset + 2);
	}
	throw new Error('SOF が見つかりません');
}

test('要件定義 18.4 の一連の操作で、PNG と JPEG を正しい解像度で保存できる', async ({ page }) => {
	// 1. サイトを開く
	await page.goto('./');
	// 2. 画像を読み込む
	await page.getByTestId('image-input').setInputFiles({
		name: 'photo.png',
		mimeType: 'image/png',
		buffer: await makeQuadrantPng(page, 1600, 900),
	});
	await expect(page.getByRole('img', { name: /表示プレビュー/ })).toBeVisible();
	// 3. Watch モデルを変更する
	await page.getByLabel('シリーズ').selectOption('Apple Watch SE 3');
	await page.getByLabel('ケースサイズ').selectOption('se3-40mm');
	await expect(page.getByText('保存サイズ: 324 × 394 px')).toBeVisible();
	// 4. Cover に切り替える（初期値が Cover なので、いったん Contain にしてから戻す）
	// モードを切り替えても構図は中央へ戻らず、実倍率も維持される（要件定義 6.4）
	const sample = await previewColorAt(page, 0.6, 0.25);
	await page.getByRole('radio', { name: 'Contain' }).check({ force: true });
	await expect(page.getByRole('radio', { name: 'Contain' })).toBeChecked();
	await page.getByRole('radio', { name: 'Cover' }).check({ force: true });
	await expect.poll(() => previewColorAt(page, 0.6, 0.25)).toEqual(sample);
	await expect(page.getByRole('radio', { name: 'Cover' })).toBeChecked();
	// Cover では四隅まで画像で覆われ、背景色（黒）の余白が無い
	for (const [x, y] of [
		[0.01, 0.01],
		[0.99, 0.01],
		[0.01, 0.99],
		[0.99, 0.99],
	] as const) {
		await expect.poll(() => previewColorAt(page, x, y)).not.toEqual([0, 0, 0]);
	}
	// 5. 画像をドラッグする（右へ動かすと左上の赤が広がる）
	const box = await previewBox(page);
	const before = await previewColorAt(page, 0.6, 0.25);
	expect(near(before, [0, 255, 0])).toBe(true);
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width * 0.9, box.y + box.height / 2, { steps: 8 });
	await page.mouse.up();
	await expect.poll(() => previewColorAt(page, 0.6, 0.25)).toEqual([255, 0, 0]);
	// 6. ズームする（ホイール）
	await expect(page.getByRole('slider', { name: 'ズーム' })).toHaveValue('100');
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.wheel(0, -300);
	await expect
		.poll(async () => Number(await page.getByRole('slider', { name: 'ズーム' }).inputValue()))
		.toBeGreaterThan(100);
	// 7. Contain に切り替える
	await page.getByRole('radio', { name: 'Contain' }).check({ force: true });
	await expect(page.getByRole('radio', { name: 'Contain' })).toBeChecked();
	// ズーム後の実倍率は維持されるため画面が画像で覆われたままになる。
	// 背景色（手順 8）を確かめられるよう、Contain の基準倍率に戻して余白を出す
	await page.getByRole('button', { name: 'フィット' }).click();
	// 8. 背景色を変更する（Contain の余白に反映される）
	await page.getByLabel('背景色').fill('#336699');
	await expect.poll(() => previewColorAt(page, 0.5, 0.05)).toEqual([0x33, 0x66, 0x99]);
	// 9. PNG を保存する
	const [png] = await Promise.all([
		page.waitForEvent('download'),
		page.getByRole('button', { name: '画像を保存' }).click(),
	]);
	expect(png.suggestedFilename()).toMatch(/^watchfit-se3-40mm-\d{8}-\d{6}\.png$/);
	// 11. 出力解像度を確認する
	expect(pngSize(await readFile(await png.path()))).toEqual([324, 394]);
	// 10. JPEG を保存する
	await page.getByRole('radio', { name: 'JPEG' }).check({ force: true });
	await expect(page.getByRole('radio', { name: 'JPEG' })).toBeChecked();
	const [jpeg] = await Promise.all([
		page.waitForEvent('download'),
		page.getByRole('button', { name: '画像を保存' }).click(),
	]);
	expect(jpeg.suggestedFilename()).toMatch(/^watchfit-se3-40mm-\d{8}-\d{6}\.jpg$/);
	expect(jpegSize(await readFile(await jpeg.path()))).toEqual([324, 394]);
});

test('EXIF の向き（Orientation 6）を一度だけ適用して表示する', async ({ page }) => {
	await page.goto('./');
	// 横長 400×200 の画像に「90° 回転して表示」の EXIF を付ける → 正しくは縦長で、左上が元の左下（青）
	const jpeg = insertExif(await makeQuadrantJpeg(page, 400, 200), buildExifSegment(6));
	await page.getByTestId('image-input').setInputFiles({
		name: 'rotated.jpg',
		mimeType: 'image/jpeg',
		buffer: Buffer.from(jpeg),
	});
	await expect(page.getByRole('img', { name: /表示プレビュー/ })).toBeVisible();
	await page.getByRole('radio', { name: 'Contain' }).check({ force: true });
	await page.getByRole('button', { name: 'フィット' }).click();
	await expect.poll(async () => near(await previewColorAt(page, 0.3, 0.3), [0, 0, 255])).toBe(true);
	expect(near(await previewColorAt(page, 0.7, 0.3), [255, 0, 0])).toBe(true);
	expect(near(await previewColorAt(page, 0.3, 0.7), [255, 255, 0])).toBe(true);
	expect(near(await previewColorAt(page, 0.7, 0.7), [0, 255, 0])).toBe(true);
});
