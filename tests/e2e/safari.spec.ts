import { expect, type Page, test } from '@playwright/test';
import { buildExifSegment, insertExif } from '../fixtures/exif';
import { makeQuadrantJpeg, makeQuadrantPng, near, previewBox, previewColorAt } from './helpers';

/**
 * WebKit エンジン（Playwright 版。CI では Linux 版）での確認。Safari そのものではない。
 * iPhone の Safari が主要ターゲット（要件定義 25章）だが、実機の共有シートやタッチ操作は Playwright では扱えないため、
 * 共有はスタブに差し替え、タッチは Pointer Events を合成して確かめる。
 * 実機での最終確認は docs/実機検証.md の手順で人が行う。
 */

type SharedFile = { name: string; type: string; width: number; height: number };

/**
 * navigator.share を記録用のスタブに差し替える。
 * 実機と同じく、ユーザー操作の有効期限（userActivation）が切れていれば NotAllowedError にする。
 * rejectFirst で 1 回目を強制的に権限切れにできる。
 */
async function stubShare(page: Page, rejectFirst = false) {
	await page.addInitScript((reject) => {
		const shared: SharedFile[] = [];
		let calls = 0;
		Object.assign(window, { __shared: shared });
		// ブラウザ本来の canShare があればそれを使う（形式の判定を隠さない）
		if (typeof navigator.canShare !== 'function') {
			Object.defineProperty(navigator, 'canShare', {
				configurable: true,
				value: (data: { files?: File[] }) => Array.isArray(data.files) && data.files.length > 0,
			});
		}
		Object.defineProperty(navigator, 'share', {
			configurable: true,
			value: async (data: { files: File[] }) => {
				calls += 1;
				const activation = (navigator as Navigator & { userActivation?: { isActive: boolean } })
					.userActivation;
				if ((reject && calls === 1) || (activation && !activation.isActive)) {
					throw new DOMException('ユーザー操作が必要', 'NotAllowedError');
				}
				const file = data.files[0] as File;
				const bitmap = await createImageBitmap(file);
				shared.push({
					name: file.name,
					type: file.type,
					width: bitmap.width,
					height: bitmap.height,
				});
				bitmap.close();
			},
		});
	}, rejectFirst);
}

async function shared(page: Page): Promise<SharedFile[]> {
	return page.evaluate(() => (window as unknown as { __shared: SharedFile[] }).__shared);
}

/**
 * タッチの Pointer Events を合成してプレビューに送る。
 * 合成イベントでは pointer capture は失敗し（アプリ側で無視する）、touch-action によるスクロール抑止も
 * 確かめられない。ここで確かめるのは、ドラッグ・ピンチの計算が WebKit で正しく動くことだけ。
 */
async function touch(page: Page, type: string, id: number, x: number, y: number, primary: boolean) {
	await page.getByRole('img', { name: /表示プレビュー/ }).evaluate(
		(canvas, args) => {
			canvas.dispatchEvent(
				new PointerEvent(args.type, {
					pointerId: args.id,
					pointerType: 'touch',
					isPrimary: args.primary,
					clientX: args.x,
					clientY: args.y,
					button: 0,
					bubbles: true,
					cancelable: true,
				}),
			);
		},
		{ type, id, x, y, primary },
	);
}

async function loadPhoto(page: Page) {
	await page.goto('./');
	await page.getByTestId('image-input').setInputFiles({
		name: 'photo.png',
		mimeType: 'image/png',
		buffer: await makeQuadrantPng(page, 1600, 900),
	});
	await expect(page.getByRole('img', { name: /表示プレビュー/ })).toBeVisible();
}

test('タッチのドラッグとピンチで位置と大きさを調整できる', async ({ page, isMobile }) => {
	test.skip(!isMobile, 'タッチ操作は iPhone のエミュレーションだけで確かめる');
	await loadPhoto(page);
	const box = await previewBox(page);
	const cx = box.x + box.width / 2;
	const cy = box.y + box.height / 2;
	expect(near(await previewColorAt(page, 0.6, 0.25), [0, 255, 0])).toBe(true);

	// 1 本指で右へドラッグすると、左側の赤が右へ広がる
	await touch(page, 'pointerdown', 1, cx, cy, true);
	await touch(page, 'pointermove', 1, cx + box.width * 0.2, cy, true);
	await touch(page, 'pointermove', 1, cx + box.width * 0.4, cy, true);
	await touch(page, 'pointerup', 1, cx + box.width * 0.4, cy, true);
	await expect.poll(() => previewColorAt(page, 0.6, 0.25)).toEqual([255, 0, 0]);

	// 2 本指で広げると拡大する
	const slider = page.getByRole('slider', { name: 'ズーム' });
	await expect(slider).toHaveValue('100');
	await touch(page, 'pointerdown', 2, cx - 10, cy, true);
	await touch(page, 'pointerdown', 3, cx + 10, cy, false);
	await touch(page, 'pointermove', 3, cx + 40, cy, false);
	await touch(page, 'pointerup', 3, cx + 40, cy, false);
	await touch(page, 'pointerup', 2, cx - 10, cy, true);
	await expect.poll(async () => Number(await slider.inputValue())).toBeGreaterThan(150);
});

test('共有に対応した Safari では、出力解像度の画像を共有シートに渡す', async ({ page }) => {
	await stubShare(page);
	await loadPhoto(page);
	await page.getByLabel('シリーズ').selectOption('Apple Watch Ultra 3');
	await page.getByRole('button', { name: '画像を保存' }).click();
	await expect(page.getByText('共有シートから保存しました。')).toBeVisible();
	const files = await shared(page);
	expect(files).toHaveLength(1);
	expect(files[0]?.name).toMatch(/^watchfit-ultra3-49mm-\d{8}-\d{6}\.png$/);
	expect([files[0]?.width, files[0]?.height]).toEqual([422, 514]);

	await page.getByRole('radio', { name: 'JPEG' }).check({ force: true });
	await page.getByRole('button', { name: '画像を保存' }).click();
	await expect.poll(async () => (await shared(page)).length).toBe(2);
	const jpeg = (await shared(page))[1];
	expect(jpeg?.type).toBe('image/jpeg');
	expect([jpeg?.width, jpeg?.height]).toEqual([422, 514]);
});

test('画像生成の待ち時間で共有の権限が切れても、ボタンから共有し直せる', async ({ page }) => {
	await stubShare(page, true);
	await loadPhoto(page);
	await page.getByRole('button', { name: '画像を保存' }).click();
	await page.getByRole('button', { name: '共有して保存' }).click();
	await expect(page.getByText('共有シートから保存しました。')).toBeVisible();
	expect(await shared(page)).toHaveLength(1);
});

test('EXIF の向き（Orientation 6）を Safari でも一度だけ適用する', async ({ page }) => {
	await page.goto('./');
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
	expect(near(await previewColorAt(page, 0.7, 0.7), [0, 255, 0])).toBe(true);
});

test('Safari でも CSP 違反が起きず、配信元以外へ通信しない', async ({ page, context, baseURL }) => {
	await page.addInitScript(() => {
		const violations: string[] = [];
		Object.assign(window, { __cspViolations: violations });
		document.addEventListener('securitypolicyviolation', (event) => {
			violations.push(`${event.violatedDirective} ${event.blockedURI}`);
		});
	});
	await stubShare(page);
	const origin = new URL(String(baseURL)).origin;
	const outside: string[] = [];
	context.on('request', (request) => {
		const url = new URL(request.url());
		if (url.protocol !== 'blob:' && url.protocol !== 'data:' && url.origin !== origin) {
			outside.push(request.url());
		}
	});
	await loadPhoto(page);
	await page.getByRole('button', { name: '画像を保存' }).click();
	await expect(page.getByText('共有シートから保存しました。')).toBeVisible();
	expect(outside).toEqual([]);
	expect(
		await page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations),
	).toEqual([]);
});
