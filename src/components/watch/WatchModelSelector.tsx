import { type Dispatch, useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { CUSTOM_MODEL_ID, type EditorAction, type EditorState } from '@/features/editor/reducer';
import {
	CUSTOM_RESOLUTION_MAX_PX,
	CUSTOM_RESOLUTION_MIN_PX,
	parseDimensionInput,
	validateCustomResolution,
} from '@/features/watch/custom-resolution';
import { findWatchModel, groupWatchModelsBySeries } from '@/features/watch/models';
import type { WatchModel } from '@/features/watch/schema';

const CUSTOM_SERIES = '__custom__';

type WatchModelSelectorProps = {
	models: readonly WatchModel[];
	state: EditorState;
	dispatch: Dispatch<EditorAction>;
};

function formatNumber(value: number): string {
	return Number.isFinite(value) ? String(value) : '';
}

/** シリーズ → ケースサイズの順で選ぶ（要件定義 4.1）。カスタム解像度も入力できる（4.5） */
export function WatchModelSelector({ models, state, dispatch }: WatchModelSelectorProps) {
	const groups = groupWatchModelsBySeries(models);
	const isCustom = state.modelId === CUSTOM_MODEL_ID;
	const currentModel = findWatchModel(models, state.modelId);
	const currentSeries = isCustom ? CUSTOM_SERIES : (currentModel?.series ?? '');
	const sizes = groups.find((group) => group.series === currentSeries)?.models ?? [];

	const [widthText, setWidthText] = useState(() => formatNumber(state.customResolution.width));
	const [heightText, setHeightText] = useState(() => formatNumber(state.customResolution.height));
	const validation = validateCustomResolution(
		state.customResolution.width,
		state.customResolution.height,
	);
	const errors = validation.ok ? {} : validation.errors;

	const seriesId = useId();
	const sizeId = useId();
	const widthId = useId();
	const heightId = useId();
	const widthErrorId = useId();
	const heightErrorId = useId();
	const resolutionId = useId();

	const selectSeries = (series: string) => {
		if (series === CUSTOM_SERIES) {
			dispatch({
				type: 'SET_CUSTOM_RESOLUTION',
				width: parseDimensionInput(widthText),
				height: parseDimensionInput(heightText),
			});
			return;
		}
		const first = groups.find((group) => group.series === series)?.models[0];
		if (first) {
			dispatch({ type: 'SELECT_MODEL', modelId: first.id });
		}
	};

	const updateCustom = (nextWidth: string, nextHeight: string) => {
		setWidthText(nextWidth);
		setHeightText(nextHeight);
		dispatch({
			type: 'SET_CUSTOM_RESOLUTION',
			width: parseDimensionInput(nextWidth),
			height: parseDimensionInput(nextHeight),
		});
	};

	return (
		<fieldset className="flex flex-col gap-4">
			<legend className="mb-2 text-base font-semibold">Apple Watch のモデル</legend>
			<div className="flex flex-col gap-2">
				<Label htmlFor={seriesId}>シリーズ</Label>
				<NativeSelect
					id={seriesId}
					value={currentSeries}
					onChange={(event) => selectSeries(event.currentTarget.value)}
				>
					{groups.map((group) => (
						<option key={group.series} value={group.series}>
							{group.series}
						</option>
					))}
					<option value={CUSTOM_SERIES}>カスタム解像度</option>
				</NativeSelect>
			</div>

			{isCustom ? (
				<div className="grid grid-cols-2 gap-3">
					<div className="flex flex-col gap-2">
						<Label htmlFor={widthId}>幅（px）</Label>
						<Input
							id={widthId}
							inputMode="numeric"
							autoComplete="off"
							value={widthText}
							aria-invalid={errors.width ? true : undefined}
							aria-describedby={errors.width ? widthErrorId : undefined}
							onChange={(event) => updateCustom(event.currentTarget.value, heightText)}
						/>
						{errors.width && (
							<p id={widthErrorId} className="text-sm text-destructive">
								{errors.width}
							</p>
						)}
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor={heightId}>高さ（px）</Label>
						<Input
							id={heightId}
							inputMode="numeric"
							autoComplete="off"
							value={heightText}
							aria-invalid={errors.height ? true : undefined}
							aria-describedby={errors.height ? heightErrorId : undefined}
							onChange={(event) => updateCustom(widthText, event.currentTarget.value)}
						/>
						{errors.height && (
							<p id={heightErrorId} className="text-sm text-destructive">
								{errors.height}
							</p>
						)}
					</div>
					<p className="col-span-2 text-xs text-muted-foreground">
						{CUSTOM_RESOLUTION_MIN_PX}〜{CUSTOM_RESOLUTION_MAX_PX}px の整数で指定します。
					</p>
				</div>
			) : (
				<div className="flex flex-col gap-2">
					<Label htmlFor={sizeId}>ケースサイズ</Label>
					<NativeSelect
						id={sizeId}
						value={state.modelId}
						aria-describedby={resolutionId}
						onChange={(event) =>
							dispatch({ type: 'SELECT_MODEL', modelId: event.currentTarget.value })
						}
					>
						{sizes.map((model) => (
							<option key={model.id} value={model.id}>
								{model.label}
							</option>
						))}
					</NativeSelect>
					{currentModel && (
						<p id={resolutionId} className="text-xs text-muted-foreground">
							保存サイズ: {currentModel.widthPx} × {currentModel.heightPx} px
						</p>
					)}
				</div>
			)}
		</fieldset>
	);
}
