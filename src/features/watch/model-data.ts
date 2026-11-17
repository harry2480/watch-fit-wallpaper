import type { WatchModel } from './schema';

/**
 * 登録済みの Apple Watch モデル（新しい順）。
 * 解像度は Apple 公式の技術仕様・比較ページで確認したものだけを登録する（要件定義 4.3）。
 *
 * 確認元は Apple 公式の技術仕様ページ（support.apple.com）を優先し、そこに画面解像度の記載が無い
 * モデル（Series 9）と技術仕様ページが未公開のモデル（Series 12・Ultra 4）は比較ページで確認した。
 * 比較ページは掲載モデルが入れ替わるため、確認時点は verifiedAt で示す。Series 12・Ultra 4 は
 * support.apple.com の技術仕様ページが公開されたら sourceUrl を差し替える。
 *
 * cornerRadiusRatio（プレビューの角丸）は Apple が数値を公開していないため、
 * 全モデル共通の近似値 0.2（画面幅に対する比率）を使う。出力画像には影響しない（要件定義 8.5）。
 */
const VERIFIED_AT = '2026-11-17';
const APPROX_CORNER_RADIUS_RATIO = 0.2;
const COMPARE_URL = 'https://www.apple.com/watch/compare/';

type Entry = [
	id: string,
	series: string,
	caseSizeMm: number,
	widthPx: number,
	heightPx: number,
	sourceUrl: string,
];

const ENTRIES: readonly Entry[] = [
	['ultra4-49mm', 'Apple Watch Ultra 4', 49, 422, 514, COMPARE_URL],
	['ultra3-49mm', 'Apple Watch Ultra 3', 49, 422, 514, 'https://support.apple.com/en-us/125095'],
	['ultra2-49mm', 'Apple Watch Ultra 2', 49, 410, 502, 'https://support.apple.com/en-us/111832'],
	['ultra-49mm', 'Apple Watch Ultra', 49, 410, 502, 'https://support.apple.com/en-us/111852'],
	['series12-46mm', 'Apple Watch Series 12', 46, 416, 496, COMPARE_URL],
	['series12-42mm', 'Apple Watch Series 12', 42, 374, 446, COMPARE_URL],
	[
		'series11-46mm',
		'Apple Watch Series 11',
		46,
		416,
		496,
		'https://support.apple.com/en-us/125093',
	],
	[
		'series11-42mm',
		'Apple Watch Series 11',
		42,
		374,
		446,
		'https://support.apple.com/en-us/125093',
	],
	[
		'series10-46mm',
		'Apple Watch Series 10',
		46,
		416,
		496,
		'https://support.apple.com/en-us/121202',
	],
	[
		'series10-42mm',
		'Apple Watch Series 10',
		42,
		374,
		446,
		'https://support.apple.com/en-us/121202',
	],
	['series9-45mm', 'Apple Watch Series 9', 45, 396, 484, COMPARE_URL],
	['series9-41mm', 'Apple Watch Series 9', 41, 352, 430, COMPARE_URL],
	['series8-45mm', 'Apple Watch Series 8', 45, 396, 484, 'https://support.apple.com/en-us/111848'],
	['series8-41mm', 'Apple Watch Series 8', 41, 352, 430, 'https://support.apple.com/en-us/111848'],
	['series7-45mm', 'Apple Watch Series 7', 45, 396, 484, 'https://support.apple.com/en-us/111909'],
	['series7-41mm', 'Apple Watch Series 7', 41, 352, 430, 'https://support.apple.com/en-us/111909'],
	['se3-44mm', 'Apple Watch SE 3', 44, 368, 448, 'https://support.apple.com/en-us/125094'],
	['se3-40mm', 'Apple Watch SE 3', 40, 324, 394, 'https://support.apple.com/en-us/125094'],
	['se2-44mm', 'Apple Watch SE（第2世代）', 44, 368, 448, 'https://support.apple.com/en-us/111853'],
	['se2-40mm', 'Apple Watch SE（第2世代）', 40, 324, 394, 'https://support.apple.com/en-us/111853'],
	['se-44mm', 'Apple Watch SE（第1世代）', 44, 368, 448, 'https://support.apple.com/en-us/111862'],
	['se-40mm', 'Apple Watch SE（第1世代）', 40, 324, 394, 'https://support.apple.com/en-us/111862'],
];

export const WATCH_MODEL_DATA: readonly WatchModel[] = ENTRIES.map(
	([id, series, caseSizeMm, widthPx, heightPx, sourceUrl]) => ({
		id,
		series,
		label: `${caseSizeMm}mm`,
		caseSizeMm,
		widthPx,
		heightPx,
		cornerRadiusRatio: APPROX_CORNER_RADIUS_RATIO,
		verified: true,
		sourceUrl,
		verifiedAt: VERIFIED_AT,
	}),
);
