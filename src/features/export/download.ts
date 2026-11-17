/** Object URL を解放するまでの猶予（ダウンロード開始前に解放しないため） */
const REVOKE_DELAY_MS = 60_000;

/**
 * Blob URL と download 属性でダウンロードする（要件定義 9.8）。
 * existingUrl を渡した場合はそれを使い、解放は呼び出し側に任せる。
 * 渡さない場合は自分で Object URL を作り、時間をおいて解放する。
 */
export function downloadBlob(
	blob: Blob,
	filename: string,
	existingUrl?: string,
	doc: Document = document,
): void {
	const url = existingUrl ?? URL.createObjectURL(blob);
	try {
		const anchor = doc.createElement('a');
		anchor.href = url;
		anchor.download = filename;
		anchor.rel = 'noopener';
		anchor.style.display = 'none';
		doc.body.append(anchor);
		anchor.click();
		anchor.remove();
	} finally {
		if (!existingUrl) {
			setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
		}
	}
}
