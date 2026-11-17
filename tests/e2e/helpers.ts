import type { Page } from '@playwright/test';

/** ブラウザ内の Canvas で 4 象限のテスト画像を作り、PNG のバイト列を返す */
export async function makeQuadrantPng(page: Page, width: number, height: number): Promise<Buffer> {
	const base64 = await page.evaluate(
		async ([w, h]) => {
			const canvas = document.createElement('canvas');
			canvas.width = w;
			canvas.height = h;
			const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
			const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00'];
			colors.forEach((color, i) => {
				ctx.fillStyle = color;
				ctx.fillRect((i % 2) * (w / 2), Math.floor(i / 2) * (h / 2), w / 2, h / 2);
			});
			const blob = await new Promise<Blob>((resolve) =>
				canvas.toBlob((b) => resolve(b as Blob), 'image/png'),
			);
			const bytes = new Uint8Array(await blob.arrayBuffer());
			let binary = '';
			for (const byte of bytes) binary += String.fromCharCode(byte);
			return btoa(binary);
		},
		[width, height] as const,
	);
	return Buffer.from(base64, 'base64');
}
