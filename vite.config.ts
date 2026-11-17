import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { resolveBasePath } from './config/base-path';

export default defineConfig({
	// 公開パス。プロジェクトサイトでは BASE_PATH=/<repo>/、独自ドメインやユーザーサイトでは未指定（/）
	base: resolveBasePath(process.env.BASE_PATH),
	plugins: [react(), tailwindcss()],
	resolve: {
		alias: {
			'@': fileURLToPath(new URL('./src', import.meta.url)),
		},
	},
	test: {
		environment: 'jsdom',
		include: ['tests/unit/**/*.test.{ts,tsx}'],
		setupFiles: ['tests/unit/setup.ts'],
	},
});
