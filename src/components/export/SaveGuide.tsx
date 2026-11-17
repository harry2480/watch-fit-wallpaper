/**
 * Apple Watch への設定手順（要件定義 9.9）。
 * watchOS のバージョンによって操作が異なるため、概要だけを示す。
 */
export function SaveGuide({ open = false }: { open?: boolean }) {
	return (
		<details className="rounded-lg border border-border p-4 text-sm" open={open}>
			<summary className="cursor-pointer font-medium">Apple Watch に設定する手順</summary>
			<ol className="mt-3 list-decimal space-y-1.5 pl-5 text-muted-foreground">
				<li>保存した画像を iPhone の「写真」アプリに保存します。</li>
				<li>iPhone の「Watch」アプリを開きます。</li>
				<li>「文字盤ギャラリー」で「写真」文字盤を選びます。</li>
				<li>写真の選択で、保存した画像を指定します。</li>
				<li>「追加」をタップして、Apple Watch に文字盤を追加します。</li>
			</ol>
			<p className="mt-3 text-xs text-muted-foreground">
				watchOS のバージョンによって操作や名称が異なる場合があります。また、Apple Watch
				側で表示位置や拡大率が調整されることがあり、プレビューと完全には一致しない場合があります。
			</p>
		</details>
	);
}
