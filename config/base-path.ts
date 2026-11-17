/**
 * Vite の base（公開パス）を環境変数の値から決める。
 * 未指定・空文字は "/"。指定時は先頭と末尾に "/" を補い、"/" 区切りの安全な文字だけを許可する。
 */
export function resolveBasePath(value: string | undefined): string {
	const trimmed = value?.trim() ?? '';
	if (trimmed === '' || trimmed === '/') {
		return '/';
	}
	const segments = trimmed.split('/').filter((segment) => segment !== '');
	for (const segment of segments) {
		if (!/^[A-Za-z0-9._-]+$/.test(segment) || segment === '.' || segment === '..') {
			throw new Error(`BASE_PATH に使えない値です: ${value}`);
		}
	}
	return `/${segments.join('/')}/`;
}
