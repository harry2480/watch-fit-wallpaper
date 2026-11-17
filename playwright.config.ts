import { defineConfig, devices } from '@playwright/test';
import { resolveBasePath } from './config/base-path';

const port = 4173;
// BASE_PATH を指定すると、そのサブパスでビルド・配信した状態をテストする
const basePath = resolveBasePath(process.env.BASE_PATH);
const origin = `http://localhost:${port}`;

export default defineConfig({
	testDir: 'tests/e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? 'github' : 'list',
	use: {
		baseURL: `${origin}${basePath}`,
		trace: 'on-first-retry',
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
			// Safari 専用の確認（共有のスタブ・合成タッチ）は WebKit だけで実行する
			testIgnore: /safari\.spec\.ts$/,
		},
		// iPhone の Safari（WebKit）向け。PC 前提のダウンロード・ホイール操作のテストは除く
		{
			name: 'iphone-safari',
			use: { ...devices['iPhone 15'] },
			testMatch: /(safari|smoke|main-screen)\.spec\.ts$/,
		},
		{
			name: 'desktop-safari',
			use: { ...devices['Desktop Safari'] },
			testMatch: /(safari|smoke|main-screen)\.spec\.ts$/,
		},
	],
	webServer: {
		command: `pnpm build && pnpm preview --port ${port} --strictPort`,
		url: `${origin}${basePath}`,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
});
