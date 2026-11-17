import { expect, test } from '@playwright/test';

test('トップページにサイト名が表示される', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { level: 1, name: 'WatchFit' })).toBeVisible();
});
