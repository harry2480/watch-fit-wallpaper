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
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	webServer: {
		command: `pnpm build && pnpm preview --port ${port} --strictPort`,
		url: `${origin}${basePath}`,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
});
