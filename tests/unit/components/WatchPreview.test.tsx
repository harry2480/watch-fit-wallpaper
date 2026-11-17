import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WatchPreview } from '@/components/editor/WatchPreview';
import { WatchFrame } from '@/components/watch/WatchFrame';

const output = { width: 416, height: 496 };

describe('WatchFrame / WatchPreview', () => {
	it('画面を出力の縦横比で表示し、角丸を幅・高さそれぞれの比率で指定する', () => {
		render(
			<WatchFrame output={output} cornerRadiusRatio={0.2}>
				<WatchPreview
					source={null}
					sourceSize={null}
					output={output}
					transform={{ centerX: 0, centerY: 0, scale: 1, rotationDeg: 0 }}
					backgroundColor="#000000"
					label="Apple Watch のプレビュー"
				/>
			</WatchFrame>,
		);
		const screenElement = screen.getByTestId('watch-screen');
		expect(screenElement.style.aspectRatio).toBe('416 / 496');
		const [horizontal, vertical] = screenElement.style.borderRadius
			.split('/')
			.map((part) => Number.parseFloat(part));
		expect(horizontal).toBeCloseTo(20, 3);
		expect(vertical).toBeCloseTo(((0.2 * 416) / 496) * 100, 3);
		const canvas = screen.getByRole('img', { name: 'Apple Watch のプレビュー' });
		expect(canvas.dataset.outputWidth).toBe('416');
		expect(canvas.dataset.outputHeight).toBe('496');
	});
});
