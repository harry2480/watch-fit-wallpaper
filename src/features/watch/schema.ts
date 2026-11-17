import { z } from 'zod';

/** 要件定義 4.4 の Apple Watch モデル定義 */
export const watchModelSchema = z
	.object({
		/** 例: "series11-46mm"。出力ファイル名にも使うため英小文字・数字・ハイフンのみ */
		id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'id は英小文字・数字・ハイフンのみ'),
		/** 例: "Apple Watch Series 11" */
		series: z.string().min(1),
		/** 例: "46mm" */
		label: z.string().min(1),
		caseSizeMm: z.number().int().positive(),
		widthPx: z.number().int().positive(),
		heightPx: z.number().int().positive(),
		/** プレビューの角丸半径を画面幅に対する比率で表す（0〜0.5） */
		cornerRadiusRatio: z.number().min(0).max(0.5),
		verified: z.boolean(),
		sourceUrl: z.url({ protocol: /^https$/ }).optional(),
		/** 確認日（YYYY-MM-DD） */
		verifiedAt: z.iso.date().optional(),
	})
	.strict()
	.refine((model) => !model.verified || (model.sourceUrl && model.verifiedAt), {
		message: '確認済みのモデルには sourceUrl と verifiedAt が必要です',
		path: ['verified'],
	});

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
