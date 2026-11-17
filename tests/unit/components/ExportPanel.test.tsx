import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type ExportDependencies, ExportPanel } from '@/components/export/ExportPanel';
import { ExportError } from '@/features/export/errors';
import type { ExportSnapshot } from '@/features/export/generate';

const snapshot: ExportSnapshot = {
	source: {} as CanvasImageSource,
	sourceSize: { width: 100, height: 100 },
	output: { width: 416, height: 496 },
	transform: { centerX: 208, centerY: 248, scale: 5, rotationDeg: 0 },
	backgroundColor: '#000000',
	format: 'png',
	quality: 0.92,
};

function deps(overrides: Partial<ExportDependencies> = {}): ExportDependencies {
	return {
		generate: vi.fn(async () => new Blob(['png'], { type: 'image/png' })),
		canShare: vi.fn(() => false),
		share: vi.fn(async () => 'shared' as const),
		download: vi.fn(),
		now: () => new Date(2026, 10, 17, 20, 30, 0),
		...overrides,
	};
}

function setup(d: ExportDependencies, getSnapshot = () => snapshot as ExportSnapshot | null) {
	const onFormatChange = vi.fn();
	render(
		<ExportPanel
			getSnapshot={getSnapshot}
			fileId="series11-46mm"
			format="png"
			quality={0.92}
			onFormatChange={onFormatChange}
			disabled={false}
			deps={d}
		/>,
	);
	return { onFormatChange };
}

describe('ExportPanel', () => {
	beforeEach(() => {
		vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:generated');
		vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
	});

	it('共有できない環境（PC）ではダウンロードし、ファイル名に元画像名を含めない', async () => {
		const d = deps();
		setup(d);
		fireEvent.click(screen.getByRole('button', { name: '画像を保存' }));
		expect(
			await screen.findByText('watchfit-series11-46mm-20261117-203000.png を保存しました。'),
		).toBeInTheDocument();
		expect(d.download).toHaveBeenCalledWith(
			expect.any(Blob),
			'watchfit-series11-46mm-20261117-203000.png',
		);
		expect(d.share).not.toHaveBeenCalled();
	});

	it('共有できる環境（iPhone）では共有シートを開き、保存後に手順を案内する', async () => {
		const d = deps({ canShare: vi.fn(() => true) });
		setup(d);
		fireEvent.click(screen.getByRole('button', { name: '画像を保存' }));
		expect(await screen.findByText('共有シートから保存しました。')).toBeInTheDocument();
		const file = (d.share as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as File;
		expect(file.name).toBe('watchfit-series11-46mm-20261117-203000.png');
		expect(file.type).toBe('image/png');
		expect(d.download).not.toHaveBeenCalled();
		expect(screen.getByText('Apple Watch に設定する手順').closest('details')).toHaveAttribute(
			'open',
		);
	});

	it('共有のキャンセルはエラーにしない', async () => {
		const d = deps({ canShare: () => true, share: vi.fn(async () => 'cancelled' as const) });
		setup(d);
		fireEvent.click(screen.getByRole('button', { name: '画像を保存' }));
		await screen.findByText('保存できない場合');
		expect(screen.queryByRole('alert')).not.toBeInTheDocument();
		expect(screen.getByRole('button', { name: '画像を保存' })).toBeEnabled();
	});

	it('生成の待ち時間で共有の権限が切れたら、生成済み画像を明示的なボタンから共有できる', async () => {
		const share = vi
			.fn()
			.mockResolvedValueOnce('needs-user-activation')
			.mockResolvedValueOnce('shared');
		const d = deps({ canShare: () => true, share, generate: vi.fn(async () => new Blob(['x'])) });
		setup(d);
		fireEvent.click(screen.getByRole('button', { name: '画像を保存' }));
		fireEvent.click(await screen.findByRole('button', { name: '共有して保存' }));
		expect(await screen.findByText('共有シートから保存しました。')).toBeInTheDocument();
		expect(d.generate).toHaveBeenCalledTimes(1);
		expect(share.mock.calls[1]?.[0]).toBe(share.mock.calls[0]?.[0]);
	});

	it('生成に失敗したら日本語のエラーを出し、もう一度保存できる', async () => {
		const generate = vi
			.fn()
			.mockRejectedValueOnce(new ExportError('out-of-memory'))
			.mockResolvedValueOnce(new Blob(['x']));
		const d = deps({ generate });
		setup(d);
		fireEvent.click(screen.getByRole('button', { name: '画像を保存' }));
		expect(await screen.findByRole('alert')).toHaveTextContent('メモリが不足して');
		fireEvent.click(screen.getByRole('button', { name: '画像を保存' }));
		expect(await screen.findByText(/を保存しました/)).toBeInTheDocument();
	});

	it('共有に失敗したらエラーを出し、画像を表示して手動で保存できるようにする', async () => {
		const d = deps({
			canShare: () => true,
			share: vi.fn(async () => {
				throw new DOMException('x', 'DataError');
			}),
		});
		setup(d);
		fireEvent.click(screen.getByRole('button', { name: '画像を保存' }));
		expect(await screen.findByRole('alert')).toHaveTextContent('共有できませんでした');
		expect(screen.getByRole('img', { name: '保存用に作成した画像' })).toHaveAttribute(
			'src',
			'blob:generated',
		);
	});

	it('JPEG を選ぶと品質を 50〜100% で指定できる', () => {
		const onFormatChange = vi.fn();
		render(
			<ExportPanel
				getSnapshot={() => snapshot}
				fileId="x"
				format="jpeg"
				quality={0.92}
				onFormatChange={onFormatChange}
				disabled={false}
				deps={deps()}
			/>,
		);
		const slider = screen.getByRole('slider', { name: 'JPEG の品質' }) as HTMLInputElement;
		expect([slider.min, slider.max, slider.value]).toEqual(['50', '100', '92']);
		fireEvent.change(slider, { target: { value: '75' } });
		expect(onFormatChange).toHaveBeenCalledWith('jpeg', 0.75);
		fireEvent.click(screen.getByRole('radio', { name: 'PNG' }));
		expect(onFormatChange).toHaveBeenCalledWith('png');
	});
});
