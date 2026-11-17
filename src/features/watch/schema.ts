import { z } from 'zod';

// zod は高速化のために new Function を試し、厳格な CSP（unsafe-eval なし）では違反を記録する。
// CSP 下で違反を出さないよう、スキーマの評価より前に JIT を無効にする（要件定義 14.5）
z.config({ jitless: true });

const httpsUrl = z.url({ protocol: /^https$/, hostname: z.regexes.domain });

const baseWatchModelSchema = z.strictObject({
	/** 例: "series11-46mm"。出力ファイル名にも使うため英小文字・数字・ハイフンのみ */
	id: z
		.string()
		.max(64)
		.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'id は英小文字・数字・ハイフンのみ'),
	/** 例: "Apple Watch Series 11" */
	series: z.string().trim().min(1),
	/** 例: "46mm" */
	label: z.string().trim().min(1),
	caseSizeMm: z.number().int().positive(),
	widthPx: z.number().int().positive(),
	heightPx: z.number().int().positive(),
	/** プレビューの角丸半径を画面幅に対する比率で表す（0〜0.5） */
	cornerRadiusRatio: z.number().min(0).max(0.5),
});

/**
 * 要件定義 4.4 の Apple Watch モデル定義。
 * 確認済み（verified: true）のモデルは確認元 URL と確認日（YYYY-MM-DD）を必須にする。
 */
export const watchModelSchema = z.discriminatedUnion('verified', [
	baseWatchModelSchema.extend({
		verified: z.literal(true),
		sourceUrl: httpsUrl,
		verifiedAt: z.iso.date(),
	}),
	baseWatchModelSchema.extend({
		verified: z.literal(false),
		sourceUrl: httpsUrl.optional(),
		verifiedAt: z.iso.date().optional(),
	}),
]);

export type WatchModel = z.infer<typeof watchModelSchema>;

/** モデル一覧のスキーマ。id の重複を禁止する */
export const watchModelListSchema = z.array(watchModelSchema).superRefine((models, ctx) => {
	const seen = new Set<string>();
	models.forEach((model, index) => {
		if (seen.has(model.id)) {
			ctx.addIssue({
				code: 'custom',
				message: `id が重複しています: ${model.id}`,
				path: [index, 'id'],
			});
		}
		seen.add(model.id);
	});
});
