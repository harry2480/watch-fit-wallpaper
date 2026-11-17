import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { CONTENT_SECURITY_POLICY } from '../../config/csp';
import { makeQuadrantPng, previewBox } from './helpers';

type Observed = {
	requests: { url: string; method: string; postData: string | null }[];
	websockets: string[];
	consoleCspErrors: string[];
};

/** ブラウザのコンテキスト全体（別ウィンドウを含む）の通信と WebSocket を記録する */
function observe(context: BrowserContext, page: Page): Observed {
	const observed: Observed = { requests: [], websockets: [], consoleCspErrors: [] };
	context.on('request', (request) => {
		observed.requests.push({
			url: request.url(),
			method: request.method(),
			postData: request.postData(),
		});
	});
	context.on('page', (opened) => {
		opened.on('websocket', (ws) => observed.websockets.push(ws.url()));
	});
	page.on('websocket', (ws) => observed.websockets.push(ws.url()));
	page.on('console', (message) => {
		if (message.type() === 'error' && /Content Security Policy/i.test(message.text())) {
			observed.consoleCspErrors.push(message.text());
		}
	});
	return observed;
}

/** 画像の読み込みから、ドラッグ・ズーム・背景色の変更、保存までを行う */
async function editAndSave(page: Page) {
	await page.goto('./');
	await page.getByTestId('image-input').setInputFiles({
		name: 'private-photo.png',
		mimeType: 'image/png',
		buffer: await makeQuadrantPng(page, 1200, 900),
	});
	await expect(page.getByRole('img', { name: /表示プレビュー/ })).toBeVisible();
	const box = await previewBox(page);
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2, { steps: 5 });
	await page.mouse.up();
	await page.mouse.wheel(0, -200);
	await page.getByLabel('背景色').fill('#ff0000');
	const [download] = await Promise.all([
		page.waitForEvent('download'),
		page.getByRole('button', { name: '画像を保存' }).click(),
	]);
	await download.path();
	await page.waitForLoadState('networkidle');
}

function expectOnlySameOrigin(observed: Observed, origin: string) {
	expect(observed.requests.length).toBeGreaterThan(0);
	for (const request of observed.requests) {
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
	expect(observed.websockets).toEqual([]);
}

test.describe('CSP あり（本番と同じ）', () => {
	test('配信元以外への通信・画像データを含む通信がなく、CSP 違反も起きない', async ({
		page,
		context,
		baseURL,
	}) => {
		// Chrome は一部の違反（eval 等）を console に出さないため、イベントでも集める
		await page.addInitScript(() => {
			const violations: string[] = [];
			(window as unknown as { __cspViolations: string[] }).__cspViolations = violations;
			document.addEventListener('securitypolicyviolation', (event) => {
				violations.push(`${event.violatedDirective} ${event.blockedURI}`);
			});
		});
		const observed = observe(context, page);
		await editAndSave(page);
		expectOnlySameOrigin(observed, new URL(String(baseURL)).origin);
		expect(observed.consoleCspErrors).toEqual([]);
		expect(
			await page.evaluate(
				() => (window as unknown as { __cspViolations: string[] }).__cspViolations,
			),
		).toEqual([]);
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
});

test.describe('CSP を外した状態', () => {
	// CSP だけを非送信の保証手段にしない（要件定義 14.5）。CSP が無くてもアプリ自体が外部へ送らないことを確かめる
	test.use({ bypassCSP: true });

	test('アプリ自体が配信元以外へ通信しない', async ({ page, context, baseURL }) => {
		const observed = observe(context, page);
		await editAndSave(page);
		expectOnlySameOrigin(observed, new URL(String(baseURL)).origin);
	});
});
