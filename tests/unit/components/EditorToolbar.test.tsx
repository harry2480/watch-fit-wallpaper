import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EditorToolbar } from '@/components/editor/EditorToolbar';

const all = { up: true, down: true, left: true, right: true };

describe('EditorToolbar', () => {
	it('方向ボタンは向きに応じた移動量を渡す', () => {
		const onMove = vi.fn();
		render(
			<EditorToolbar
				onFit={vi.fn()}
				onReset={vi.fn()}
				onMove={onMove}
				step={{ x: 8, y: 10 }}
				canMove={all}
				disabled={false}
			/>,
		);
		for (const name of ['右へ移動', '左へ移動', '上へ移動', '下へ移動']) {
			fireEvent.click(screen.getByRole('button', { name }));
		}
		expect(onMove.mock.calls).toEqual([
			[{ x: 8, y: 0 }],
			[{ x: -8, y: 0 }],
			[{ x: 0, y: -10 }],
			[{ x: 0, y: 10 }],
		]);
	});

	it('動かせない方向のボタンは無効にする', () => {
		render(
			<EditorToolbar
				onFit={vi.fn()}
				onReset={vi.fn()}
				onMove={vi.fn()}
				step={{ x: 8, y: 10 }}
				canMove={{ up: false, down: false, left: true, right: true }}
				disabled={false}
			/>,
		);
		expect(screen.getByRole('button', { name: '上へ移動' })).toBeDisabled();
		expect(screen.getByRole('button', { name: '下へ移動' })).toBeDisabled();
		expect(screen.getByRole('button', { name: '右へ移動' })).toBeEnabled();
	});

	it('フィット・リセットを呼び出す', () => {
		const onFit = vi.fn();
		const onReset = vi.fn();
		render(
			<EditorToolbar
				onFit={onFit}
				onReset={onReset}
				onMove={vi.fn()}
				step={{ x: 8, y: 10 }}
				canMove={all}
				disabled={false}
			/>,
		);
		fireEvent.click(screen.getByRole('button', { name: 'フィット' }));
		fireEvent.click(screen.getByRole('button', { name: 'リセット' }));
		expect(onFit).toHaveBeenCalledTimes(1);
		expect(onReset).toHaveBeenCalledTimes(1);
	});
});
