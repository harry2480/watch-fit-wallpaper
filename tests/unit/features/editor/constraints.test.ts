import { describe, expect, it } from 'vitest';
import {
	CONTAIN_MIN_VISIBLE_PX,
	constrainTransform,
	panTransform,
	resizeOutput,
	switchFitMode,
	zoomTransformAt,
} from '@/features/editor/constraints';
import {
	centeredTransform,
	containScale,
	coverScale,
	type FitMode,
	type ImageTransform,
	type Size,
} from '@/features/editor/geometry';

const output: Size = { width: 416, height: 496 };

/** 画像の表示矩形（Output 座標） */
function rect(t: ImageTransform, image: Size) {
	const w = image.width * t.scale;
	const h = image.height * t.scale;
	return {
		left: t.centerX - w / 2,
		right: t.centerX + w / 2,
		top: t.centerY - h / 2,
		bottom: t.centerY + h / 2,
	};
}

/** Cover で出力全体が覆われていること（余白なし） */
function expectCovers(t: ImageTransform, image: Size, out: Size = output) {
	const r = rect(t, image);
	expect(r.left).toBeLessThanOrEqual(1e-9);
	expect(r.top).toBeLessThanOrEqual(1e-9);
	expect(r.right).toBeGreaterThanOrEqual(out.width - 1e-9);
	expect(r.bottom).toBeGreaterThanOrEqual(out.height - 1e-9);
}

/** Contain で各軸 visible 以上が出力内に残ること */
function expectVisible(t: ImageTransform, image: Size, out: Size = output) {
	const r = rect(t, image);
	const visibleX = Math.min(r.right, out.width) - Math.max(r.left, 0);
	const visibleY = Math.min(r.bottom, out.height) - Math.max(r.top, 0);
	const minX = Math.min(CONTAIN_MIN_VISIBLE_PX, r.right - r.left, out.width);
	const minY = Math.min(CONTAIN_MIN_VISIBLE_PX, r.bottom - r.top, out.height);
	expect(visibleX).toBeGreaterThanOrEqual(minX - 1e-9);
	expect(visibleY).toBeGreaterThanOrEqual(minY - 1e-9);
}

const images: [string, Size][] = [
	['極端な横長', { width: 10000, height: 100 }],
	['極端な縦長', { width: 100, height: 10000 }],
	['正方形', { width: 1000, height: 1000 }],
	['小さい画像', { width: 7, height: 13 }],
	['高解像度', { width: 8192, height: 6144 }],
	['出力と同じ比率', { width: 832, height: 992 }],
];

describe('Cover の位置制約', () => {
	it.each(images)('%s: どの方向に大きく動かしても余白が出ない', (_n, image) => {
		const base = centeredTransform('cover', image, output);
		for (const [dx, dy] of [
			[1e6, 0],
			[-1e6, 0],
			[0, 1e6],
			[0, -1e6],
			[1e6, -1e6],
		] as const) {
			const moved = panTransform(base, { x: dx, y: dy }, 'cover', image, output);
			expectCovers(moved, image);
		}
	});

	it.each(images)('%s: 最小倍率で端に寄せても余白が出ない（浮動小数点の境界）', (_n, image) => {
		const t = constrainTransform(
			{ centerX: -1e9, centerY: 1e9, scale: coverScale(image, output) * 0.999, rotationDeg: 0 },
			'cover',
			image,
			output,
		);
		expect(t.scale).toBe(coverScale(image, output));
		expectCovers(t, image);
	});

	it('端までのドラッグは画像端が出力端に一致する位置で止まる', () => {
		const image = { width: 2000, height: 1000 };
		const base = centeredTransform('cover', image, output);
		const right = panTransform(base, { x: 1e6, y: 0 }, 'cover', image, output);
		expect(rect(right, image).left).toBeCloseTo(0, 9);
		const left = panTransform(base, { x: -1e6, y: 0 }, 'cover', image, output);
		expect(rect(left, image).right).toBeCloseTo(output.width, 9);
	});
});

describe('Contain の位置制約', () => {
	it.each(images)('%s: 画面外へ動かしても一部が残る', (_n, image) => {
		const base = centeredTransform('contain', image, output);
		for (const scaleRatio of [0.25, 1, 4]) {
			const scaled = { ...base, scale: base.scale * scaleRatio };
			for (const [dx, dy] of [
				[1e6, 0],
				[-1e6, 0],
				[0, 1e6],
				[0, -1e6],
			] as const) {
				const moved = panTransform(scaled, { x: dx, y: dy }, 'contain', image, output);
				expectVisible(moved, image);
			}
		}
	});

	it('範囲内の移動はそのまま反映され、余白を許可する', () => {
		const image = { width: 1000, height: 1000 };
		const base = centeredTransform('contain', image, output);
		const moved = panTransform(base, { x: 30, y: -20 }, 'contain', image, output);
		expect(moved.centerX).toBe(base.centerX + 30);
		expect(moved.centerY).toBe(base.centerY - 20);
	});
});

describe('不正値の防止', () => {
	it.each([
		['NaN の中心', { centerX: Number.NaN, centerY: 0, scale: 1, rotationDeg: 0 }],
		[
			'Infinity の倍率',
			{ centerX: 0, centerY: 0, scale: Number.POSITIVE_INFINITY, rotationDeg: 0 },
		],
		['0 の倍率', { centerX: 0, centerY: 0, scale: 0, rotationDeg: 0 }],
		['負の倍率', { centerX: 0, centerY: 0, scale: -1, rotationDeg: 0 }],
	])('%s は中央配置に戻す', (_n, transform) => {
		const image = { width: 1000, height: 800 };
		for (const mode of ['cover', 'contain'] as FitMode[]) {
			expect(constrainTransform(transform, mode, image, output)).toEqual(
				centeredTransform(mode, image, output),
			);
		}
	});

	it('回転は MVP では 0 に固定する', () => {
		const image = { width: 1000, height: 800 };
		const t = { ...centeredTransform('cover', image, output), rotationDeg: 45 };
		expect(constrainTransform(t, 'cover', image, output).rotationDeg).toBe(0);
	});
});

describe('点を中心にしたズーム', () => {
	const image = { width: 1000, height: 1000 };

	it('ズーム中心にある画像上の点が同じ位置に残る', () => {
		const base = { ...centeredTransform('contain', image, output), scale: 0.5 };
		const anchor = { x: 100, y: 150 };
		const sourceX = (anchor.x - base.centerX) / base.scale;
		const zoomed = zoomTransformAt(base, 0.8, anchor, 'contain', image, output);
		expect(zoomed.scale).toBe(0.8);
		expect(zoomed.centerX + sourceX * zoomed.scale).toBeCloseTo(anchor.x, 9);
	});

	it('最大倍率を超える要求は最大倍率に制限する', () => {
		const base = centeredTransform('cover', image, output);
		const zoomed = zoomTransformAt(base, 100, { x: 0, y: 0 }, 'cover', image, output);
		expect(zoomed.scale).toBe(coverScale(image, output) * 4);
		expectCovers(zoomed, image);
	});

	it('最小倍率を下回る要求は最小倍率に制限し、Cover の余白を出さない', () => {
		const base = {
			...centeredTransform('cover', image, output),
			scale: coverScale(image, output) * 3,
		};
		const zoomed = zoomTransformAt(base, 0.0001, { x: 400, y: 10 }, 'cover', image, output);
		expect(zoomed.scale).toBe(coverScale(image, output));
		expectCovers(zoomed, image);
	});
});

describe('モード切り替え', () => {
	const image = { width: 2000, height: 1000 };

	it('Cover → Contain は位置と倍率を維持する', () => {
		const cover = panTransform(
			{ ...centeredTransform('cover', image, output), scale: coverScale(image, output) * 1.5 },
			{ x: 40, y: 0 },
			'cover',
			image,
			output,
		);
		expect(switchFitMode(cover, 'contain', image, output)).toEqual(cover);
	});

	it('Cover → Contain で Contain の最大倍率を超える場合だけ補正する', () => {
		const cover = {
			...centeredTransform('cover', image, output),
			scale: coverScale(image, output) * 4,
		};
		const contain = switchFitMode(cover, 'contain', image, output);
		expect(contain.scale).toBe(containScale(image, output) * 4);
	});

	it('Contain → Cover は Cover 最小倍率まで拡大し余白をなくす', () => {
		const contain = panTransform(
			centeredTransform('contain', image, output),
			{ x: 0, y: -100 },
			'contain',
			image,
			output,
		);
		const cover = switchFitMode(contain, 'cover', image, output);
		expect(cover.scale).toBe(coverScale(image, output));
		expectCovers(cover, image);
	});

	it('無条件に中央へ戻さない', () => {
		const contain = {
			...centeredTransform('contain', image, output),
			scale: coverScale(image, output) * 2,
			centerX: 300,
		};
		const cover = switchFitMode(contain, 'cover', image, output);
		expect(cover.centerX).toBe(300);
	});
});

describe('出力サイズ変更（モデル変更）', () => {
	const image = { width: 1200, height: 1600 };
	const small = { width: 324, height: 394 };

	it('中心の相対位置と見た目の相対サイズを維持する', () => {
		const t = { centerX: 200, centerY: 260, scale: 0.4, rotationDeg: 0 };
		const resized = resizeOutput(t, output, small, 'contain', image);
		expect(resized.centerX).toBeCloseTo((200 * 324) / 416, 9);
		expect(resized.centerY).toBeCloseTo((260 * 394) / 496, 9);
		expect(resized.scale).toBeCloseTo(0.4 * Math.min(324 / 416, 394 / 496), 9);
	});

	it('Cover では制約を再適用して余白を出さない', () => {
		const t = panTransform(
			centeredTransform('cover', image, output),
			{ x: 1e6, y: 1e6 },
			'cover',
			image,
			output,
		);
		const resized = resizeOutput(t, output, { width: 422, height: 514 }, 'cover', image);
		expectCovers(resized, image, { width: 422, height: 514 });
	});
});

describe('フィットとリセット', () => {
	it('現在モードの基準倍率で中央配置する', () => {
		const image = { width: 1000, height: 3000 };
		for (const mode of ['cover', 'contain'] as FitMode[]) {
			const t = centeredTransform(mode, image, output);
			expect(t.centerX).toBe(output.width / 2);
			expect(t.centerY).toBe(output.height / 2);
			expect(constrainTransform(t, mode, image, output)).toEqual(t);
		}
	});
});
