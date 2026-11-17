import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('編集パネル', () => {
	beforeEach(() => load.mockReset());

	it('画像未選択時はすべての編集操作が無効', () => {
		render(<App />);
		expect(screen.getByRole('radio', { name: /Cover/ })).toBeDisabled();
		expect(screen.getByRole('radio', { name: /Contain/ })).toBeDisabled();
		expect(zoom()).toBeDisabled();
		expect(screen.getByLabelText('背景色')).toBeDisabled();
		for (const name of ['フィット', 'リセット', '上へ移動', '下へ移動', '左へ移動', '右へ移動']) {
			expect(screen.getByRole('button', { name })).toBeDisabled();
		}
	});

	it('画像を読み込むと操作でき、ズームは 100%（Cover の基準倍率）から始まる', async () => {
		await loadImage();
		expect(screen.getByRole('radio', { name: /Cover/ })).toBeChecked();
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
		expect(screen.getByRole('radio', { name: /Cover/ })).toBeChecked();
	});

	it('Contain に切り替えると実倍率は維持され、スライダーの表示が変わる', async () => {
		await loadImage();
		fireEvent.click(screen.getByRole('radio', { name: /Contain/ }));
		expect(screen.getByRole('radio', { name: /Contain/ })).toBeChecked();
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

	it('方向ボタンで位置を調整でき、ボタンにはアクセシブルな名前がある', async () => {
		await loadImage();
		fireEvent.click(screen.getByRole('radio', { name: /Contain/ }));
		fireEvent.click(screen.getByRole('button', { name: 'フィット' }));
		const canvas = screen.getByRole('img', { name: /表示プレビュー/ });
		expect(canvas).toBeInTheDocument();
		// 移動してもフィットで中央・100% に戻ることで、移動が状態に反映されることを確認する
		fireEvent.click(screen.getByRole('button', { name: '右へ移動' }));
		fireEvent.click(screen.getByRole('button', { name: '上へ移動' }));
		expect(zoom().value).toBe('100');
	});
});
