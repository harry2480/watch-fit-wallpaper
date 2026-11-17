import { expect, test } from '@playwright/test';

test('トップページにサイト名が表示され、アセットを base パス配下から読み込む', async ({
	page,
}, testInfo) => {
	const failed: string[] = [];
	const assetPaths: string[] = [];
	page.on('request', (request) => {
		const { pathname } = new URL(request.url());
		if (/\.(js|css)$/.test(pathname)) {
			assetPaths.push(pathname);
		}
	});
	page.on('response', (response) => {
		if (response.status() >= 400) {
			failed.push(`${response.status()} ${response.url()}`);
		}
	});
	page.on('requestfailed', (request) => {
		failed.push(`失敗 ${request.url()}`);
	});

	// baseURL（BASE_PATH 付き）からの相対パスで開く
	await page.goto('./');
	await expect(page.getByRole('heading', { level: 1, name: 'WatchFit' })).toBeVisible();
	await page.waitForLoadState('networkidle');

	expect(failed).toEqual([]);
	// vite preview はどのパスにも index.html を返すため、アセットの取得元パスで base の効きを確認する
	const basePath = new URL(String(testInfo.project.use.baseURL)).pathname;
	expect(assetPaths.length).toBeGreaterThan(0);
	for (const assetPath of assetPaths) {
		expect(assetPath.startsWith(basePath)).toBe(true);
	}
});
