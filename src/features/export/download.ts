/** Object URL を解放するまでの猶予（ダウンロード開始前に解放しないため） */
const REVOKE_DELAY_MS = 10_000;

/**
 * Blob URL と download 属性でダウンロードする（要件定義 9.8）。保存後に Object URL を解放する。
 */
export function downloadBlob(blob: Blob, filename: string, doc: Document = document): void {
	const url = URL.createObjectURL(blob);
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
		setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
	}
}
