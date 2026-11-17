import { expect, test } from '@playwright/test';

test('トップページにサイト名が表示され、アセットの読み込みに失敗しない', async ({ page }) => {
	const failed: string[] = [];
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
});
