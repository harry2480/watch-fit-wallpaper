import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/app/App';

const load = vi.fn();

vi.mock('@/features/image/decode', () => ({
	createLatestImageLoader: () => ({ load, cancel: vi.fn() }),
}));

/** 横長画像（Cover では横がはみ出し、Contain では上下に余白が出る） */
async function loadImage() {
	load.mockResolvedValue({
		status: 'loaded',
		image: { source: {} as ImageBitmap, width: 2000, height: 1000, release: vi.fn() },
	});
	render(<App />);
	fireEvent.change(screen.getByTestId('image-input'), {
		target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] },
	});
	await screen.findByRole('img', { name: /表示プレビュー/ });
}

function zoom() {
	return screen.getByRole('slider', { name: 'ズーム' }) as HTMLInputElement;
}

/** プレビューの描画で画像中心へ移動した位置（Output 座標 × 描画倍率）を記録する */
const translations: [number, number][] = [];

function lastTranslation() {
	return translations.at(-1);
}

describe('編集パネル', () => {
	beforeEach(() => {
		load.mockReset();
		translations.length = 0;
		vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
			this: HTMLCanvasElement,
		) {
			return {
				canvas: this,
				setTransform: vi.fn(),
				fillRect: vi.fn(),
				save: vi.fn(),
				restore: vi.fn(),
				scale: vi.fn(),
				translate: (x: number, y: number) => translations.push([x, y]),
				drawImage: vi.fn(),
			} as unknown as CanvasRenderingContext2D;
		} as never);
		vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
			left: 0,
			top: 0,
			width: 211,
			height: 257,
		} as DOMRect);
	});
	afterEach(() => vi.restoreAllMocks());

	it('画像未選択時はすべての編集操作が無効', () => {
		render(<App />);
		expect(screen.getByRole('radio', { name: 'Cover' })).toBeDisabled();
		expect(screen.getByRole('radio', { name: 'Contain' })).toBeDisabled();
		expect(zoom()).toBeDisabled();
		expect(screen.getByLabelText('背景色')).toBeDisabled();
		for (const name of ['フィット', 'リセット', '上へ移動', '下へ移動', '左へ移動', '右へ移動']) {
			expect(screen.getByRole('button', { name })).toBeDisabled();
		}
	});

	it('画像を読み込むと操作でき、ズームは 100%（Cover の基準倍率）から始まる', async () => {
		await loadImage();
		expect(screen.getByRole('radio', { name: 'Cover' })).toBeChecked();
		expect(zoom()).toBeEnabled();
		expect(zoom().value).toBe('100');
		expect(zoom().min).toBe('100');
		expect(zoom().max).toBe('400');
	});

	it('スライダーで拡大し、リセットで 100% に戻る（モードは維持）', async () => {
		await loadImage();
		fireEvent.change(zoom(), { target: { value: '250' } });
		expect(zoom().value).toBe('250');
		expect(screen.getByText('250%')).toBeInTheDocument();
		fireEvent.click(screen.getByRole('button', { name: 'リセット' }));
		expect(zoom().value).toBe('100');
		expect(screen.getByRole('radio', { name: 'Cover' })).toBeChecked();
	});

	it('Contain に切り替えると実倍率は維持され、スライダーの表示が変わる', async () => {
		await loadImage();
		fireEvent.click(screen.getByRole('radio', { name: 'Contain' }));
		expect(screen.getByRole('radio', { name: 'Contain' })).toBeChecked();
		// 既定モデル（422×514）に 2000×1000: Cover=0.514、Contain=0.211 → 実倍率維持で約 244%
		expect(screen.getByText('244%')).toBeInTheDocument();
		expect(zoom().min).toBe('25');
		fireEvent.click(screen.getByRole('button', { name: 'フィット' }));
		expect(zoom().value).toBe('100');
	});

	it('背景色を変更でき、リセットしても背景色は維持する', async () => {
		await loadImage();
		fireEvent.input(screen.getByLabelText('背景色'), { target: { value: '#ff8800' } });
		fireEvent.change(screen.getByLabelText('背景色'), { target: { value: '#ff8800' } });
		expect(screen.getByText('#ff8800')).toBeInTheDocument();
		fireEvent.click(screen.getByRole('button', { name: 'リセット' }));
		expect(screen.getByText('#ff8800')).toBeInTheDocument();
	});

	it('方向ボタンで移動すると描画位置が変わり、Cover で動かせない方向は無効になる', async () => {
		await loadImage();
		// 横長画像の Cover・100%: 縦は画面いっぱいで動かせず、横は動かせる
		expect(screen.getByRole('button', { name: '上へ移動' })).toBeDisabled();
		expect(screen.getByRole('button', { name: '下へ移動' })).toBeDisabled();
		await waitFor(() => expect(lastTranslation()).toBeDefined());
		const before = lastTranslation() as [number, number];
		fireEvent.click(screen.getByRole('button', { name: '右へ移動' }));
		await waitFor(() => expect(lastTranslation()?.[0]).toBeGreaterThan(before[0]));
		expect(lastTranslation()?.[1]).toBeCloseTo(before[1], 9);
	});

	it('移動した構図は Contain に切り替えても中央へ戻らない', async () => {
		await loadImage();
		await waitFor(() => expect(lastTranslation()).toBeDefined());
		const center = lastTranslation() as [number, number];
		fireEvent.click(screen.getByRole('button', { name: '右へ移動' }));
		fireEvent.click(screen.getByRole('button', { name: '右へ移動' }));
		await waitFor(() => expect(lastTranslation()?.[0]).toBeGreaterThan(center[0]));
		const moved = lastTranslation() as [number, number];
		fireEvent.click(screen.getByRole('radio', { name: 'Contain' }));
		await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
		expect(lastTranslation()?.[0]).toBeCloseTo(moved[0], 9);
		expect(lastTranslation()?.[0]).not.toBeCloseTo(center[0], 3);
	});
});
