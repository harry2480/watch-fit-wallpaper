# WatchFit

Apple Watch の写真文字盤向けに、画像の位置・大きさを調整して保存する Web アプリ。
完全クライアントサイドの SPA として GitHub Pages で公開する。

## 使い方（利用者向け）

```sh
pnpm dev          # 開発サーバー起動
pnpm verify       # 品質チェック（変更後に必ず実行）
pnpm build        # 本番ビルド（dist/ に静的ファイルを出力）
pnpm test:unit    # 単体テスト（Vitest）
pnpm test:e2e     # E2E テスト（Playwright）
pnpm lint:fix     # 自動フォーマット
```

---

## Claude Code への指示（利用者は読まなくてOK）

### 正本

- 仕様の正本は [docs/要件定義.md](docs/要件定義.md)。実装判断に迷ったら 0.1「優先順位」と 24章「実装判断ルール」に従う
- 構成・命名・テストの規約は [docs/開発規約.md](docs/開発規約.md) を読む

### 出力言語

- ユーザーへの応答・説明・質問・作業報告はすべて日本語で書く
- コードコメント、コミットメッセージ、PR タイトル・本文、Issue、ドキュメントも日本語で書く
- コード識別子（変数名・関数名・ファイル名）、コマンド、ライブラリ名、エラーメッセージの引用は原文のまま残す
- Conventional Commits のプレフィックス（`feat:` `fix:` など）は英語のまま、説明部分を日本語にする

### アーキテクチャ

- Vite + React 19 + TypeScript（strict）の単一ページ SPA。単一パッケージ（リポジトリ直下）
- バックエンド・DB・API Route・認証は存在しない。Next.js / Prisma / Supabase / Vercel を導入しない
- 画像処理は Canvas 2D API、ジェスチャーは Pointer Events API、状態は React Hooks + `useReducer`
- UI は Tailwind CSS v4 + shadcn/ui + Lucide React
- 計算ロジック（`src/features/`）は React に依存しない純粋関数として書き、UI（`src/components/`, `src/hooks/`）から呼ぶ

### 絶対に守ること

- ユーザー画像・編集状態を外部へ送信しない。実行時に外部 CDN・外部 API に依存しない
- プレビューと出力は同じ座標計算・同じレンダラーを使う
- Apple Watch の解像度を推測で登録しない（確認元と確認日を記録する）
- 要件定義 3.2 の不採用技術や、不要なライブラリを追加しない
- 未実装の機能を動作するように見せかけない

### 品質チェック

`pnpm verify` は Biome lint → typecheck → 単体テストを順に実行する。
コード変更後は必ず `pnpm verify` を実行し、全パスすることを確認する。

### ブランチ運用

- 統合ブランチは `main`。作業は専用ブランチで行い、PR 経由でマージする
- Loop（`docs/loop-engineering.md`）は現在無効。有効化する場合は同文書の初期設定に従う
