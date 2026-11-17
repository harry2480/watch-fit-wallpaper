import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
	scale: 1,
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

function setup(d: ExportDependencies) {
	const onFormatChange = vi.fn();
	const onScaleChange = vi.fn();
	let current = 'v1';
	const getSnapshot = () => ({ snapshot, version: current });
	const element = (editVersion: string) => (
		<ExportPanel
			getSnapshot={getSnapshot}
			fileId="series11-46mm"
			format="png"
			quality={0.92}
			onFormatChange={onFormatChange}
			output={snapshot.output}
			scale={1}
			onScaleChange={onScaleChange}
			disabled={false}
			editVersion={editVersion}
			deps={d}
		/>
	);
	const utils = render(element('v1'));
	return {
		onFormatChange,
		setVersion: (v: string) => {
			current = v;
			utils.rerender(element(v));
		},
	};
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
			await screen.findByText(
				/watchfit-series11-46mm-20261117-203000\.png のダウンロードを開始しました/,
			),
		).toBeInTheDocument();
		expect(d.download).toHaveBeenCalledWith(
			expect.any(Blob),
			'watchfit-series11-46mm-20261117-203000.png',
			'blob:generated',
		);
		// ダウンロードが効かない環境向けに、手動で保存する方法を開いて示す
		expect(screen.getByText('保存できない場合').closest('details')).toHaveAttribute('open');
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
		expect(await screen.findByText(/ダウンロードを開始しました/)).toBeInTheDocument();
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

	it('共有中はもう一度押しても共有を重ねない', async () => {
		let resolveShare!: (value: 'shared') => void;
		const share = vi
			.fn()
			.mockResolvedValueOnce('needs-user-activation')
			.mockImplementationOnce(() => new Promise((resolve) => (resolveShare = resolve)));
		const d = deps({ canShare: () => true, share });
		setup(d);
		fireEvent.click(screen.getByRole('button', { name: '画像を保存' }));
		const shareButton = await screen.findByRole('button', { name: '共有して保存' });
		fireEvent.click(shareButton);
		fireEvent.click(screen.getByRole('button', { name: /画像を作成しています|画像を保存/ }));
		expect(share).toHaveBeenCalledTimes(2);
		expect(d.generate).toHaveBeenCalledTimes(1);
		resolveShare('shared');
		expect(await screen.findByText('共有シートから保存しました。')).toBeInTheDocument();
	});

	it('2 回目も権限が切れていたら、もう一度共有ボタンを出す', async () => {
		const share = vi.fn().mockResolvedValue('needs-user-activation');
		setup(deps({ canShare: () => true, share }));
		fireEvent.click(screen.getByRole('button', { name: '画像を保存' }));
		fireEvent.click(await screen.findByRole('button', { name: '共有して保存' }));
		expect(await screen.findByRole('button', { name: '共有して保存' })).toBeEnabled();
		expect(share).toHaveBeenCalledTimes(2);
	});

	it('ダウンロードに失敗したら日本語のエラーを出し、画像を表示する', async () => {
		const d = deps({
			download: vi.fn(() => {
				throw new Error('x');
			}),
		});
		setup(d);
		fireEvent.click(screen.getByRole('button', { name: '画像を保存' }));
		expect(await screen.findByRole('alert')).toHaveTextContent('画像を保存できませんでした');
		expect(screen.getByRole('img', { name: '保存用に作成した画像' })).toBeInTheDocument();
	});

	it('編集内容が変わったら、古い生成画像と共有ボタンを破棄する', async () => {
		const share = vi.fn().mockResolvedValue('needs-user-activation');
		const { setVersion } = setup(deps({ canShare: () => true, share }));
		fireEvent.click(screen.getByRole('button', { name: '画像を保存' }));
		await screen.findByRole('button', { name: '共有して保存' });
		setVersion('v2');
		expect(screen.queryByRole('button', { name: '共有して保存' })).not.toBeInTheDocument();
		expect(screen.queryByText('保存できない場合')).not.toBeInTheDocument();
		expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:generated');
	});

	it('作成中に編集されたら、完了後に古い生成画像と共有ボタンを出さない', async () => {
		let resolveGenerate!: (blob: Blob) => void;
		const generate = vi.fn(() => new Promise<Blob>((resolve) => (resolveGenerate = resolve)));
		const share = vi.fn().mockResolvedValue('needs-user-activation');
		const { setVersion } = setup(deps({ generate, canShare: () => true, share }));
		fireEvent.click(screen.getByRole('button', { name: '画像を保存' }));
		await screen.findByRole('button', { name: '画像を作成しています…' });
		setVersion('v2');
		resolveGenerate(new Blob(['x']));
		await waitFor(() => expect(share).toHaveBeenCalled());
		await waitFor(() =>
			expect(screen.getByRole('button', { name: '画像を保存' })).not.toHaveAttribute(
				'aria-disabled',
			),
		);
		expect(screen.queryByRole('button', { name: '共有して保存' })).not.toBeInTheDocument();
		expect(screen.queryByText('保存できない場合')).not.toBeInTheDocument();
	});

	it('作成中は「画像を保存」にフォーカスを残したまま二重実行を防ぐ', async () => {
		let resolveGenerate!: (blob: Blob) => void;
		const generate = vi.fn(() => new Promise<Blob>((resolve) => (resolveGenerate = resolve)));
		setup(deps({ generate }));
		const button = screen.getByRole('button', { name: '画像を保存' });
		button.focus();
		fireEvent.click(button);
		const working = await screen.findByRole('button', { name: '画像を作成しています…' });
		expect(working).toHaveAttribute('aria-disabled', 'true');
		expect(working).toHaveFocus();
		fireEvent.click(working);
		expect(generate).toHaveBeenCalledTimes(1);
		resolveGenerate(new Blob(['x']));
		expect(await screen.findByText(/ダウンロードを開始しました/)).toBeInTheDocument();
	});

	it('JPEG を選ぶと品質を 50〜100% で指定できる', () => {
		const onFormatChange = vi.fn();
		render(
			<ExportPanel
				getSnapshot={() => ({ snapshot, version: 'v1' })}
				fileId="x"
				format="jpeg"
				quality={0.92}
				onFormatChange={onFormatChange}
				output={snapshot.output}
				scale={1}
				onScaleChange={vi.fn()}
				disabled={false}
				editVersion="v1"
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

	it('解像度は 標準・2倍・3倍 から選べ、それぞれの画素数を示す', () => {
		const onScaleChange = vi.fn();
		render(
			<ExportPanel
				getSnapshot={() => ({ snapshot, version: 'v1' })}
				fileId="x"
				format="png"
				quality={0.92}
				onFormatChange={vi.fn()}
				output={{ width: 368, height: 448 }}
				scale={1}
				onScaleChange={onScaleChange}
				disabled={false}
				editVersion="v1"
				deps={deps()}
			/>,
		);
		expect(screen.getByRole('radio', { name: /標準/ })).toBeChecked();
		expect(screen.getByText('1104×1344')).toBeInTheDocument();
		fireEvent.click(screen.getByRole('radio', { name: /3倍/ }));
		expect(onScaleChange).toHaveBeenCalledWith(3);
	});

	it('上限を超える倍率は選べず、使える最大の倍率を選択中として示す', () => {
		render(
			<ExportPanel
				getSnapshot={() => ({ snapshot, version: 'v1' })}
				fileId="x"
				format="png"
				quality={0.92}
				onFormatChange={vi.fn()}
				output={{ width: 2048, height: 2048 }}
				scale={3}
				onScaleChange={vi.fn()}
				disabled={false}
				editVersion="v1"
				deps={deps()}
			/>,
		);
		expect(screen.getByRole('radio', { name: /3倍/ })).toBeDisabled();
		expect(screen.getByRole('radio', { name: /2倍/ })).toBeChecked();
	});

	it('2 倍以上で保存したファイル名には倍率が付く', async () => {
		const d = deps();
		render(
			<ExportPanel
				getSnapshot={() => ({ snapshot: { ...snapshot, scale: 2 }, version: 'v1' })}
				fileId="se3-44mm"
				format="png"
				quality={0.92}
				onFormatChange={vi.fn()}
				output={snapshot.output}
				scale={2}
				onScaleChange={vi.fn()}
				disabled={false}
				editVersion="v1"
				deps={d}
			/>,
		);
		fireEvent.click(screen.getByRole('button', { name: '画像を保存' }));
		await waitFor(() =>
			expect(d.download).toHaveBeenCalledWith(
				expect.any(Blob),
				'watchfit-se3-44mm-2x-20261117-203000.png',
				'blob:generated',
			),
		);
		expect(d.generate).toHaveBeenCalledWith({ ...snapshot, scale: 2 });
	});
});
