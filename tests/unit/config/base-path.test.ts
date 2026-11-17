import { describe, expect, it } from 'vitest';
import { resolveBasePath } from '../../../config/base-path';

describe('resolveBasePath', () => {
	it('未指定・空文字・"/" はルートにする', () => {
		expect(resolveBasePath(undefined)).toBe('/');
		expect(resolveBasePath('')).toBe('/');
		expect(resolveBasePath('  ')).toBe('/');
		expect(resolveBasePath('/')).toBe('/');
		expect(resolveBasePath('//')).toBe('/');
		expect(resolveBasePath(' /// ')).toBe('/');
	});

	it('先頭と末尾のスラッシュを補う', () => {
		expect(resolveBasePath('watchfit')).toBe('/watchfit/');
		expect(resolveBasePath('/watch-fit-wallpaper')).toBe('/watch-fit-wallpaper/');
		expect(resolveBasePath('/a/b/')).toBe('/a/b/');
	});

	it('連続するスラッシュをまとめる', () => {
		expect(resolveBasePath('//watchfit//')).toBe('/watchfit/');
	});

	it('URL やパス操作を含む値を拒否する', () => {
		expect(() => resolveBasePath('https://example.com/')).toThrow();
		expect(() => resolveBasePath('/../x/')).toThrow();
		expect(() => resolveBasePath('/a b/')).toThrow();
	});
});
