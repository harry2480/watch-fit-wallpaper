import { expect, test } from '@playwright/test';
import { CONTENT_SECURITY_POLICY } from '../../config/csp';
import { makeQuadrantPng } from './helpers';

test('画像の読み込みから保存まで、配信元以外への通信と画像データを含む通信が発生しない', async ({
	page,
	baseURL,
}) => {
	const origin = new URL(String(baseURL)).origin;
	const requests: { url: string; method: string; postData: string | null }[] = [];
	page.on('request', (request) => {
		requests.push({ url: request.url(), method: request.method(), postData: request.postData() });
	});
	const cspViolations: string[] = [];
	page.on('console', (message) => {
		if (message.type() === 'error' && /Content Security Policy/i.test(message.text())) {
			cspViolations.push(message.text());
		}
	});

	await page.goto('./');
	await page.getByTestId('image-input').setInputFiles({
		name: 'private-photo.png',
		mimeType: 'image/png',
		buffer: await makeQuadrantPng(page, 1200, 900),
	});
	await expect(page.getByRole('img', { name: /表示プレビュー/ })).toBeVisible();
	const box = await page.getByRole('img', { name: /表示プレビュー/ }).boundingBox();
	if (box) {
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
		await page.mouse.down();
		await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2, { steps: 5 });
		await page.mouse.up();
		await page.mouse.wheel(0, -200);
	}
	await page.getByLabel('背景色').fill('#ff0000');
	const [download] = await Promise.all([
		page.waitForEvent('download'),
		page.getByRole('button', { name: '画像を保存' }).click(),
	]);
	await download.path();
	await page.waitForLoadState('networkidle');

	expect(requests.length).toBeGreaterThan(0);
	for (const request of requests) {
		const url = new URL(request.url);
		// blob: / data: はブラウザ内で完結する
		if (url.protocol === 'blob:' || url.protocol === 'data:') continue;
		expect(url.origin, request.url).toBe(origin);
		expect(request.method, request.url).toBe('GET');
		expect(request.postData, request.url).toBeNull();
		// 画像データ・元のファイル名を URL に含めない
		expect(request.url).not.toContain('private-photo');
		expect(request.url.length, request.url).toBeLessThan(500);
	}
	expect(cspViolations).toEqual([]);
});

test('本番ビルドには CSP が設定され、外部への接続を許可していない', async ({ page }) => {
	await page.goto('./');
	const csp = await page
		.locator('meta[http-equiv="Content-Security-Policy"]')
		.getAttribute('content');
	expect(csp).toBe(CONTENT_SECURITY_POLICY);
	expect(csp).toContain("connect-src 'self'");
	expect(csp).not.toMatch(/https?:/);
});
