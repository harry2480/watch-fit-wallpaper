import { type WatchModel, watchModelListSchema } from './schema';

/**
 * 登録済みの Apple Watch モデル。
 * 解像度は確認元（sourceUrl）と確認日（verifiedAt）を記録したものだけを登録する（要件定義 4.3）。
 */
const WATCH_MODEL_DATA: readonly WatchModel[] = [];

/** モデル一覧を検証して返す。不正な定義が混ざっていれば例外にする（実装ミスの検出） */
export function loadWatchModels(data: readonly unknown[]): WatchModel[] {
	return watchModelListSchema.parse(data);
}

/** 登録済みモデル。読み込み時に 1 回だけ検証し、同じ参照を返す */
export const WATCH_MODELS: readonly WatchModel[] = Object.freeze(loadWatchModels(WATCH_MODEL_DATA));

export function findWatchModel(models: readonly WatchModel[], id: string): WatchModel | undefined {
	return models.find((model) => model.id === id);
}

export type WatchSeriesGroup = { series: string; models: WatchModel[] };

/** シリーズ → ケースサイズの順で選択できるよう、登録順を保ったままシリーズごとにまとめる */
export function groupWatchModelsBySeries(models: readonly WatchModel[]): WatchSeriesGroup[] {
	const groups = new Map<string, WatchModel[]>();
	for (const model of models) {
		const group = groups.get(model.series);
		if (group) {
			group.push(model);
		} else {
			groups.set(model.series, [model]);
		}
	}
	return [...groups].map(([series, grouped]) => ({ series, models: grouped }));
}
