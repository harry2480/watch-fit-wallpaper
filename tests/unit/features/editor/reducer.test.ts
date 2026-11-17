import { describe, expect, it } from 'vitest';
import { centeredTransform, containScale, coverScale } from '@/features/editor/geometry';
import {
	CUSTOM_MODEL_ID,
	canExport,
	createEditorReducer,
	createInitialEditorState,
	type EditorAction,
	type EditorState,
	getOutputSize,
	getPreviewOutputSize,
	getRelativeZoom,
	relativeToAbsoluteScale,
} from '@/features/editor/reducer';
import { loadWatchModels } from '@/features/watch/models';

const models = loadWatchModels([
	{
		id: 'big-46mm',
		series: 'Big',
		label: '46mm',
		caseSizeMm: 46,
		widthPx: 416,
		heightPx: 496,
		cornerRadiusRatio: 0.2,
		verified: false,
	},
	{
		id: 'small-40mm',
		series: 'Small',
		label: '40mm',
		caseSizeMm: 40,
		widthPx: 324,
		heightPx: 394,
		cornerRadiusRatio: 0.2,
		verified: false,
	},
]);
const reducer = createEditorReducer(models);
const output = { width: 416, height: 496 };
const image = { width: 2000, height: 1000, filename: 'photo.jpg' };

function run(...actions: EditorAction[]): EditorState {
	return actions.reduce(reducer, createInitialEditorState(models));
}

describe('初期状態', () => {
	it('要件定義の初期値を持つ', () => {
		const state = createInitialEditorState(models);
		expect(state.modelId).toBe('big-46mm');
		expect(state.fitMode).toBe('cover');
		expect(state.image).toBeNull();
		expect(state.background).toEqual({ type: 'solid', color: '#000000' });
		expect(state.exportOptions).toEqual({ format: 'png', quality: 0.92 });
		expect(canExport(state, models)).toBe(false);
	});

	it('モデルが無ければカスタム解像度で始まる', () => {
		const state = createInitialEditorState([]);
		expect(state.modelId).toBe(CUSTOM_MODEL_ID);
		expect(getOutputSize(state, [])).not.toBeNull();
	});
});

describe('LOAD_IMAGE / CLEAR_IMAGE', () => {
	it('現在モードの基準倍率で中央配置する', () => {
		const state = run({ type: 'LOAD_IMAGE', image });
		expect(state.image).toEqual(image);
		expect(state.transform).toEqual(centeredTransform('cover', image, output));
		expect(canExport(state, models)).toBe(true);
	});

	it('Contain 選択中なら Contain 倍率で配置する', () => {
		const state = run({ type: 'SET_FIT_MODE', fitMode: 'contain' }, { type: 'LOAD_IMAGE', image });
		expect(state.transform.scale).toBe(containScale(image, output));
	});

	it.each([
		['幅0', { width: 0, height: 100, filename: 'x.png' }],
		['NaN', { width: Number.NaN, height: 100, filename: 'x.png' }],
		['負数', { width: 100, height: -1, filename: 'x.png' }],
	])('%s の画像サイズは例外にせず無視する', (_n, bad) => {
		const state = createInitialEditorState(models);
		expect(reducer(state, { type: 'LOAD_IMAGE', image: bad })).toBe(state);
	});

	it('transformOutput は配置時の出力サイズを持ち、画像を外すと null に戻る', () => {
		const loaded = run({ type: 'LOAD_IMAGE', image });
		expect(loaded.transformOutput).toEqual(output);
		expect(reducer(loaded, { type: 'CLEAR_IMAGE' }).transformOutput).toBeNull();
	});

	it('編集後に別の画像を読み込むと中央配置に戻る', () => {
		const other = { width: 500, height: 900, filename: 'b.png' };
		const state = run(
			{ type: 'LOAD_IMAGE', image },
			{ type: 'SET_ZOOM', scale: 2 },
			{ type: 'LOAD_IMAGE', image: other },
		);
		expect(state.transform).toEqual(centeredTransform('cover', other, output));
	});

	it('画像を外すと出力不可になる', () => {
		const state = run({ type: 'LOAD_IMAGE', image }, { type: 'CLEAR_IMAGE' });
		expect(state.image).toBeNull();
		expect(canExport(state, models)).toBe(false);
	});
});

describe('編集操作は制約を通る', () => {
	it('SET_TRANSFORM は Cover の余白を作らない', () => {
		const state = run(
			{ type: 'LOAD_IMAGE', image },
			{
				type: 'SET_TRANSFORM',
				transform: { centerX: -1e6, centerY: 0, scale: 0.01, rotationDeg: 30 },
			},
		);
		expect(state.transform.scale).toBe(coverScale(image, output));
		expect(state.transform.rotationDeg).toBe(0);
		expect(state.transform.centerX - (image.width * state.transform.scale) / 2).toBeLessThanOrEqual(
			1e-9,
		);
	});

	it('PAN_BY は平行移動する', () => {
		const state = run(
			{ type: 'SET_FIT_MODE', fitMode: 'contain' },
			{ type: 'LOAD_IMAGE', image },
			{ type: 'PAN_BY', delta: { x: 10, y: -5 } },
		);
		expect(state.transform.centerX).toBe(output.width / 2 + 10);
		expect(state.transform.centerY).toBe(output.height / 2 - 5);
	});

	it('SET_ZOOM は既定で出力中心を基準にし、範囲内に制限する', () => {
		const state = run({ type: 'LOAD_IMAGE', image }, { type: 'SET_ZOOM', scale: 100 });
		expect(state.transform.scale).toBe(coverScale(image, output) * 4);
		expect(state.transform.centerX).toBeCloseTo(output.width / 2, 9);
	});

	it('SET_ZOOM で anchor を指定すると、その点が動かない', () => {
		const before = run({ type: 'SET_FIT_MODE', fitMode: 'contain' }, { type: 'LOAD_IMAGE', image });
		const anchor = { x: 120, y: 300 };
		const sourceX = (anchor.x - before.transform.centerX) / before.transform.scale;
		const sourceY = (anchor.y - before.transform.centerY) / before.transform.scale;
		const after = reducer(before, {
			type: 'SET_ZOOM',
			scale: before.transform.scale * 1.5,
			anchor,
		});
		expect(after.transform.centerX + sourceX * after.transform.scale).toBeCloseTo(anchor.x, 9);
		expect(after.transform.centerY + sourceY * after.transform.scale).toBeCloseTo(anchor.y, 9);
	});

	it('画像はあるが出力不可のときも編集操作を無視する', () => {
		const state = run(
			{ type: 'LOAD_IMAGE', image },
			{ type: 'SET_CUSTOM_RESOLUTION', width: 0, height: 0 },
		);
		for (const action of [
			{ type: 'PAN_BY', delta: { x: 1, y: 1 } },
			{ type: 'SET_ZOOM', scale: 2 },
			{ type: 'FIT_IMAGE' },
		] as EditorAction[]) {
			expect(reducer(state, action)).toBe(state);
		}
	});

	it('画像が無いときは編集操作を無視する', () => {
		const initial = createInitialEditorState(models);
		for (const action of [
			{ type: 'SET_TRANSFORM', transform: { centerX: 1, centerY: 1, scale: 2, rotationDeg: 0 } },
			{ type: 'PAN_BY', delta: { x: 1, y: 1 } },
			{ type: 'SET_ZOOM', scale: 2 },
			{ type: 'FIT_IMAGE' },
			{ type: 'RESET_TRANSFORM' },
		] as EditorAction[]) {
			expect(reducer(initial, action)).toBe(initial);
		}
	});
});

describe('SET_FIT_MODE', () => {
	it('構図を維持したまま切り替え、Cover では余白をなくす', () => {
		const contain = run(
			{ type: 'SET_FIT_MODE', fitMode: 'contain' },
			{ type: 'LOAD_IMAGE', image },
			{ type: 'PAN_BY', delta: { x: 30, y: 0 } },
		);
		const cover = reducer(contain, { type: 'SET_FIT_MODE', fitMode: 'cover' });
		expect(cover.fitMode).toBe('cover');
		expect(cover.transform.scale).toBe(coverScale(image, output));
		expect(cover.transform.centerX).toBe(contain.transform.centerX);
	});

	it('画像が無くてもモードは切り替わる', () => {
		expect(run({ type: 'SET_FIT_MODE', fitMode: 'contain' }).fitMode).toBe('contain');
	});
});

describe('モデル・カスタム解像度', () => {
	it('SELECT_MODEL で出力サイズが変わり、構図の相対位置を維持する', () => {
		const before = run(
			{ type: 'SET_FIT_MODE', fitMode: 'contain' },
			{ type: 'LOAD_IMAGE', image },
			{ type: 'PAN_BY', delta: { x: 20, y: 10 } },
		);
		const after = reducer(before, { type: 'SELECT_MODEL', modelId: 'small-40mm' });
		expect(getOutputSize(after, models)).toEqual({ width: 324, height: 394 });
		expect(after.transform.centerX).toBeCloseTo((before.transform.centerX * 324) / 416, 9);
	});

	it('未登録のモデル ID・現在と同じモデルは state を変えない', () => {
		const state = createInitialEditorState(models);
		expect(reducer(state, { type: 'SELECT_MODEL', modelId: 'unknown' })).toBe(state);
		expect(reducer(state, { type: 'SELECT_MODEL', modelId: state.modelId })).toBe(state);
	});

	it('同じカスタム解像度の再指定は state を変えない', () => {
		const state = run({ type: 'SET_CUSTOM_RESOLUTION', width: 300, height: Number.NaN });
		expect(reducer(state, { type: 'SET_CUSTOM_RESOLUTION', width: 300, height: Number.NaN })).toBe(
			state,
		);
	});

	it('出力不可の間に切り替えたモードの制約が、有効な解像度に戻すと適用される', () => {
		const state = run(
			{ type: 'SET_FIT_MODE', fitMode: 'contain' },
			{ type: 'LOAD_IMAGE', image },
			{ type: 'SET_CUSTOM_RESOLUTION', width: 0, height: 0 },
			{ type: 'SET_FIT_MODE', fitMode: 'cover' },
			{ type: 'SET_CUSTOM_RESOLUTION', width: 416, height: 496 },
		);
		expect(state.fitMode).toBe('cover');
		expect(state.transform.scale).toBe(coverScale(image, output));
	});

	it('出力不可の間もプレビュー用の出力サイズは直前の有効サイズを返す', () => {
		const state = run(
			{ type: 'LOAD_IMAGE', image },
			{ type: 'SET_CUSTOM_RESOLUTION', width: 0, height: 0 },
		);
		expect(getOutputSize(state, models)).toBeNull();
		expect(getPreviewOutputSize(state, models)).toEqual(output);
	});

	it('不正なカスタム解像度は出力不可で、構図は維持する', () => {
		const before = run({ type: 'LOAD_IMAGE', image });
		const after = reducer(before, { type: 'SET_CUSTOM_RESOLUTION', width: 50, height: Number.NaN });
		expect(after.modelId).toBe(CUSTOM_MODEL_ID);
		expect(getOutputSize(after, models)).toBeNull();
		expect(canExport(after, models)).toBe(false);
		expect(after.transform).toEqual(before.transform);
	});

	it('有効 → 不正 → 有効と変えても、直前の有効な出力サイズから構図を変換する', () => {
		const before = run(
			{ type: 'SET_FIT_MODE', fitMode: 'contain' },
			{ type: 'LOAD_IMAGE', image },
			{ type: 'PAN_BY', delta: { x: 40, y: 20 } },
		);
		const after = (
			[
				{ type: 'SET_CUSTOM_RESOLUTION', width: 0, height: 0 },
				{ type: 'SET_CUSTOM_RESOLUTION', width: 832, height: 992 },
			] as EditorAction[]
		).reduce(reducer, before);
		expect(after.transform.centerX).toBeCloseTo(before.transform.centerX * 2, 9);
		expect(after.transform.centerY).toBeCloseTo(before.transform.centerY * 2, 9);
		expect(after.transform.scale).toBeCloseTo(before.transform.scale * 2, 9);
	});

	it('出力不可のまま画像を読み込み、後から有効な解像度にすると中央配置する', () => {
		const state = run(
			{ type: 'SET_CUSTOM_RESOLUTION', width: 0, height: 0 },
			{ type: 'LOAD_IMAGE', image },
			{ type: 'SET_CUSTOM_RESOLUTION', width: 500, height: 600 },
		);
		expect(state.transform).toEqual(centeredTransform('cover', image, { width: 500, height: 600 }));
	});

	it('不正な解像度から有効な解像度に直すと、制約を適用して出力可能に戻る', () => {
		const state = run(
			{ type: 'LOAD_IMAGE', image },
			{ type: 'SET_CUSTOM_RESOLUTION', width: 0, height: 0 },
			{ type: 'SET_CUSTOM_RESOLUTION', width: 1000, height: 1000 },
		);
		expect(getOutputSize(state, models)).toEqual({ width: 1000, height: 1000 });
		expect(state.transform.scale).toBeGreaterThanOrEqual(
			coverScale(image, { width: 1000, height: 1000 }),
		);
		expect(canExport(state, models)).toBe(true);
	});
});

describe('背景色・出力形式', () => {
	it('#RRGGBB 形式の色だけを受け付ける', () => {
		expect(run({ type: 'SET_BACKGROUND', color: '#FFAA00' }).background.color).toBe('#ffaa00');
		expect(run({ type: 'SET_BACKGROUND', color: 'red' }).background.color).toBe('#000000');
		expect(run({ type: 'SET_BACKGROUND', color: 'url(x)' }).background.color).toBe('#000000');
	});

	it.each([
		[0.1, 0.5],
		[0.5, 0.5],
		[1, 1],
		[2, 1],
		[0.8, 0.8],
		[Number.NaN, 0.92],
	])('JPEG 品質 %d は %d になる', (quality, expected) => {
		expect(run({ type: 'SET_EXPORT_FORMAT', format: 'jpeg', quality }).exportOptions).toEqual({
			format: 'jpeg',
			quality: expected,
		});
	});

	it('品質を省略すると現在値を維持する', () => {
		const state = run(
			{ type: 'SET_EXPORT_FORMAT', format: 'jpeg', quality: 0.7 },
			{ type: 'SET_EXPORT_FORMAT', format: 'png' },
		);
		expect(state.exportOptions).toEqual({ format: 'png', quality: 0.7 });
	});
});

describe('FIT_IMAGE / RESET_TRANSFORM', () => {
	it('位置・倍率・回転を初期化し、背景色・モデル・モードは維持する', () => {
		const edited = run(
			{ type: 'SELECT_MODEL', modelId: 'small-40mm' },
			{ type: 'SET_FIT_MODE', fitMode: 'contain' },
			{ type: 'SET_BACKGROUND', color: '#123456' },
			{ type: 'LOAD_IMAGE', image },
			{ type: 'PAN_BY', delta: { x: 50, y: 50 } },
			{ type: 'SET_ZOOM', scale: 0.3 },
		);
		for (const type of ['FIT_IMAGE', 'RESET_TRANSFORM'] as const) {
			const reset = reducer(edited, { type });
			expect(reset.transform).toEqual(
				centeredTransform('contain', image, { width: 324, height: 394 }),
			);
			expect(reset.background.color).toBe('#123456');
			expect(reset.modelId).toBe('small-40mm');
			expect(reset.fitMode).toBe('contain');
		}
	});
});

describe('スライダー用の相対倍率', () => {
	it('基準倍率を 1 とした相対倍率と、その逆変換を返す', () => {
		const state = run(
			{ type: 'LOAD_IMAGE', image },
			{ type: 'SET_ZOOM', scale: coverScale(image, output) * 2 },
		);
		expect(getRelativeZoom(state, models)).toBeCloseTo(2, 12);
		expect(relativeToAbsoluteScale(state, models, 3)).toBeCloseTo(
			coverScale(image, output) * 3,
			12,
		);
	});

	it('Contain に切り替えると、実倍率は維持され相対倍率が変わる', () => {
		const state = run({ type: 'LOAD_IMAGE', image }, { type: 'SET_FIT_MODE', fitMode: 'contain' });
		expect(getRelativeZoom(state, models)).toBeCloseTo(
			coverScale(image, output) / containScale(image, output),
			12,
		);
	});

	it('画像が無ければ null', () => {
		const state = createInitialEditorState(models);
		expect(getRelativeZoom(state, models)).toBeNull();
		expect(relativeToAbsoluteScale(state, models, 1)).toBeNull();
	});
});
