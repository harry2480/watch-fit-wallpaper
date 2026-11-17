import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '@/app/App';

describe('App', () => {
	it('サイト名を見出しとして表示する', () => {
		render(<App />);
		expect(screen.getByRole('heading', { level: 1, name: 'WatchFit' })).toBeInTheDocument();
	});
});
