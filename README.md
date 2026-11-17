# WatchFit

Apple Watch の写真文字盤に合わせて、画像の位置と大きさを調整して保存できる Web アプリです（開発中）。

選択した画像はブラウザ内で処理され、サーバーへアップロードされません。

## 開発

```sh
pnpm install
pnpm dev          # 開発サーバー
pnpm verify       # lint → typecheck → 単体テスト
pnpm build        # 本番ビルド（dist/）
pnpm test:e2e     # E2E テスト（Playwright）
```

仕様は [docs/要件定義.md](docs/要件定義.md)、開発規約は [docs/開発規約.md](docs/開発規約.md) を参照してください。
