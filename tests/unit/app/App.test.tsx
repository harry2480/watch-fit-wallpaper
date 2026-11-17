import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/app/App';
import { ImageLoadError } from '@/features/image/validate';

const load = vi.fn();
const cancel = vi.fn();

vi.mock('@/features/image/decode', () => ({
	createLatestImageLoader: () => ({ load, cancel }),
}));

function loaded(width = 1200, height = 1600) {
	return {
		status: 'loaded' as const,
		image: { source: {} as ImageBitmap, width, height, release: vi.fn() },
	};
}

function selectFile(name = 'photo.jpg') {
	const input = screen.getByTestId('image-input');
	fireEvent.change(input, { target: { files: [new File(['x'], name, { type: 'image/jpeg' })] } });
}

describe('App', () => {
	beforeEach(() => {
		load.mockReset();
		cancel.mockReset();
	});

	it('初期画面: サイト名・説明・アップロード領域・対応形式・モデル選択を表示し、プレビューは出さない', () => {
		render(<App />);
		expect(screen.getByRole('heading', { level: 1, name: 'WatchFit' })).toBeInTheDocument();
		expect(screen.getByText(/Apple Watch の写真文字盤に合わせて/)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '画像を選ぶ' })).toBeInTheDocument();
		expect(screen.getByText(/JPEG・PNG・WebP/)).toBeInTheDocument();
		expect(screen.getByRole('group', { name: 'Apple Watch のモデル' })).toBeInTheDocument();
		expect(screen.queryByRole('img', { name: /プレビュー/ })).not.toBeInTheDocument();
	});

	it('画像を読み込むとプレビューを表示し、選び直しの案内を出す', async () => {
		load.mockResolvedValue(loaded());
		render(<App />);
		selectFile();
		expect(await screen.findByRole('img', { name: /表示プレビュー/ })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '別の画像を選ぶ' })).toHaveAccessibleDescription(
			/調整は失われます/,
		);
		expect(load).toHaveBeenCalledTimes(1);
	});

	it('読み込みに失敗したら日本語のエラーを出し、選び直せる', async () => {
		load.mockResolvedValue({ status: 'failed', error: new ImageLoadError('unsupported-format') });
		render(<App />);
		selectFile('doc.pdf');
		const alert = await screen.findByRole('alert');
		expect(alert).toHaveTextContent('対応していない形式です');
		expect(alert).not.toHaveTextContent(/Error|stack/);
		expect(screen.getByRole('button', { name: '画像を選ぶ' })).toBeEnabled();
		fireEvent.click(within(alert).getByRole('button', { name: 'エラーを閉じる' }));
		expect(screen.queryByRole('alert')).not.toBeInTheDocument();
	});

	it('画像の編集中に読み込みが失敗しても、編集中の画像は残る', async () => {
		load.mockResolvedValueOnce(loaded());
		render(<App />);
		selectFile();
		await screen.findByRole('img', { name: /表示プレビュー/ });
		load.mockResolvedValueOnce({ status: 'failed', error: new ImageLoadError('corrupted') });
		selectFile('broken.jpg');
		await screen.findByRole('alert');
		expect(screen.getByRole('img', { name: /表示プレビュー/ })).toBeInTheDocument();
	});

	it('新しい画像を読み込むと前の画像リソースを解放する', async () => {
		const first = loaded();
		load.mockResolvedValueOnce(first).mockResolvedValueOnce(loaded(800, 600));
		render(<App />);
		selectFile();
		await screen.findByRole('img', { name: /表示プレビュー/ });
		selectFile('next.jpg');
		await waitFor(() => expect(first.image.release).toHaveBeenCalled());
	});

	it('シリーズ → ケースサイズの順で選択でき、保存サイズを表示する', () => {
		render(<App />);
		const series = screen.getByLabelText('シリーズ');
		fireEvent.change(series, { target: { value: 'Apple Watch SE 3' } });
		const size = screen.getByLabelText('ケースサイズ') as HTMLSelectElement;
		expect([...size.options].map((option) => option.textContent)).toEqual(['44mm', '40mm']);
		fireEvent.change(size, { target: { value: 'se3-40mm' } });
		expect(screen.getByText('保存サイズ: 324 × 394 px')).toBeInTheDocument();
	});

	it('カスタム解像度は不正値の理由を入力欄に関連付けて表示する', () => {
		render(<App />);
		fireEvent.change(screen.getByLabelText('シリーズ'), { target: { value: '__custom__' } });
		const width = screen.getByLabelText('幅（px）');
		fireEvent.change(width, { target: { value: '50' } });
		expect(width).toHaveAttribute('aria-invalid', 'true');
		expect(width).toHaveAccessibleDescription('幅は100〜2048pxの範囲で入力してください');
		fireEvent.change(width, { target: { value: '５００' } });
		expect(width).not.toHaveAttribute('aria-invalid');
	});

	it('ドラッグ＆ドロップで画像を読み込める', async () => {
		load.mockResolvedValue(loaded());
		render(<App />);
		const file = new File(['x'], 'drop.png', { type: 'image/png' });
		fireEvent.drop(screen.getByTestId('drop-zone'), { dataTransfer: { files: [file] } });
		expect(await screen.findByRole('img', { name: /表示プレビュー/ })).toBeInTheDocument();
		expect(load).toHaveBeenCalledWith(file);
	});
});
