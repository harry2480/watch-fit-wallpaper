export type ExportErrorCode =
	| 'invalid-output'
	| 'canvas-failed'
	| 'blob-failed'
	| 'out-of-memory'
	| 'download-failed'
	| 'share-failed';

/** ユーザー向けの日本語メッセージ（要件定義 12.2）。失敗しても編集状態は維持し、再試行できる */
export const EXPORT_ERROR_MESSAGES: Record<ExportErrorCode, string> = {
	'invalid-output': '保存サイズが正しくありません。モデルまたはカスタム解像度を確認してください。',
	'canvas-failed': '画像を作成できませんでした。もう一度お試しください。',
	'blob-failed': '画像ファイルを作成できませんでした。もう一度お試しください。',
	'out-of-memory':
		'メモリが不足して画像を作成できませんでした。ほかのタブを閉じてからお試しください。',
	'download-failed':
		'画像を保存できませんでした。表示された画像を長押し（右クリック）して保存してください。',
	'share-failed':
		'共有できませんでした。もう一度お試しいただくか、画像を長押しして保存してください。',
};

export class ExportError extends Error {
	readonly code: ExportErrorCode;

	constructor(code: ExportErrorCode) {
		super(EXPORT_ERROR_MESSAGES[code]);
		this.name = 'ExportError';
		this.code = code;
	}
}
