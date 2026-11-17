export type ShareResult = 'shared' | 'cancelled' | 'needs-user-activation';

type ShareNavigator = Pick<Navigator, 'share' | 'canShare'>;

/** ファイルを共有シートで共有できるか（要件定義 9.7） */
export function canShareFile(file: File, nav: Partial<ShareNavigator> = navigator): boolean {
	if (typeof nav.share !== 'function' || typeof nav.canShare !== 'function') {
		return false;
	}
	try {
		return nav.canShare({ files: [file] });
	} catch {
		return false;
	}
}

/**
 * 共有シートを開く。
 * - キャンセル（AbortError）はエラーにしない（12.3）
 * - 画像生成の待ち時間でユーザー操作の権限が切れた場合（NotAllowedError）は、
 *   生成済み画像を明示的なボタンから共有できるよう needs-user-activation を返す
 * それ以外の失敗は例外として呼び出し側に任せる。
 */
export async function shareFile(file: File, nav: ShareNavigator = navigator): Promise<ShareResult> {
	try {
		await nav.share({ files: [file] });
		return 'shared';
	} catch (error) {
		const name = error instanceof Error || error instanceof DOMException ? error.name : '';
		if (name === 'AbortError') {
			return 'cancelled';
		}
		if (name === 'NotAllowedError') {
			return 'needs-user-activation';
		}
		throw error;
	}
}
