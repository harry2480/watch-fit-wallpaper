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
		// WebKit エンジン（Playwright 版）。Safari そのものではなく、iPhone は画面サイズ・UA・タッチ有無のエミュレーションのみ。
		// WebKit は共有シートを開くため、PC 前提のダウンロードとホイール操作を使うテストは除く
		{
			name: 'iphone-safari',
			use: { ...devices['iPhone 15'] },
			testIgnore: /(export|full-flow|privacy)\.spec\.ts$/,
		},
		{
			name: 'desktop-safari',
			use: { ...devices['Desktop Safari'] },
			testIgnore: /(export|full-flow|privacy)\.spec\.ts$/,
		},
	],
	webServer: {
		command: `pnpm build && pnpm preview --port ${port} --strictPort`,
		url: `${origin}${basePath}`,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
});
