import type { Plugin } from 'vite';

/**
 * GitHub Pages ではレスポンスヘッダーを設定できないため、meta タグで CSP を設定する（要件定義 14.5）。
 * 画像は blob: で扱うため許可し、それ以外の外部通信は禁止する。
 * frame-ancestors など meta では効かないディレクティブは含めない。
 * CSP だけを画像非送信の保証手段にはしない（E2E で通信を監視する）。
 */
export const CONTENT_SECURITY_POLICY = [
	"default-src 'self'",
	"script-src 'self'",
	"style-src 'self'",
	"img-src 'self' blob: data:",
	"font-src 'self'",
	"connect-src 'self'",
	"worker-src 'none'",
	"object-src 'none'",
	"frame-src 'none'",
	"base-uri 'self'",
	"form-action 'none'",
].join('; ');

/** 本番ビルドの index.html にだけ CSP を入れる（開発サーバーの HMR を妨げないため） */
export function contentSecurityPolicy(): Plugin {
	return {
		name: 'watchfit-content-security-policy',
		apply: 'build',
		transformIndexHtml: {
			order: 'post',
			handler: () => [
				{
					tag: 'meta',
					attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
					injectTo: 'head-prepend',
				},
			],
		},
	};
}
