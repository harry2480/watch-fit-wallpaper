# WatchFit

**好きな写真を、好きな位置で、Apple Watch に。**

WatchFit は、Apple Watch の「写真」文字盤に使う画像の位置と大きさを、Apple Watch の画面を模したプレビューで調整し、モデルに合った解像度で保存できる Web アプリです。iPhone のブラウザだけで使えます。ログイン・インストール・課金は不要です。

公開 URL: https://harry2480.github.io/watch-fit-wallpaper/

> **プライバシー**: 選択した画像はブラウザ内で処理され、サーバーへアップロードされません。

## 主な機能

- 画像の選択（ファイル選択・iPhone の写真ライブラリ・PC のドラッグ＆ドロップ）
- Apple Watch モデルの選択と、カスタム解像度（100〜2048px）の指定
- 表示モードの切り替え
  - **Cover**: 画面全体を画像で覆う（余白なし）
  - **Contain**: 画像全体が収まる大きさから始める（余白あり）
- 位置・大きさの調整（ドラッグ、ピンチ、マウスホイール、ズームスライダー、方向ボタン）
- 背景色の変更、フィット、リセット
- PNG / JPEG での保存（JPEG は品質を調整可能）。ファイル共有に対応したブラウザ（iPhone の Safari など）では共有シート、それ以外ではダウンロード
- ダークモード（OS の設定に連動）

## 使い方

1. 「画像を選ぶ」から画像を選びます（PC ではドラッグ＆ドロップでも選べます）。
2. 「シリーズ」と「ケースサイズ」で、お使いの Apple Watch を選びます。
3. プレビューを見ながら、ドラッグ・ピンチ・ズームスライダーで位置と大きさを調整します。
4. 保存形式を選び、「画像を保存」を押します。

### Apple Watch への設定手順

1. 保存した画像を iPhone の「写真」アプリに保存します。
2. iPhone の「Watch」アプリを開きます。
3. 「文字盤ギャラリー」で「写真」文字盤を選びます。
4. 写真の選択で、保存した画像を指定します。
5. 「追加」をタップして、Apple Watch に文字盤を追加します。

watchOS のバージョンによって操作や名称が異なる場合があります。

## 対応画像形式

| 形式 | 対応 |
|---|---|
| JPEG / PNG / WebP | 対応 |
| HEIC / HEIF | ブラウザがデコードできる場合のみ（iPhone の Safari で写真ライブラリから選ぶと、通常は JPEG として渡されます） |
| GIF（静止画を含む）/ AVIF / SVG / 動画 / PDF / RAW | 非対応 |

ファイルサイズは 30MB まで、画素数は 5,000 万画素までです。

## 対応 Apple Watch モデル

解像度は Apple 公式の技術仕様ページ・比較ページで確認した値です（2026-11-17 確認）。

| モデル | ケースサイズ | 保存サイズ（px） |
|---|---|---|
| Apple Watch Ultra 4 / Ultra 3 | 49mm | 422 × 514 |
| Apple Watch Ultra 2 / Ultra | 49mm | 410 × 502 |
| Apple Watch Series 12 / 11 / 10 | 46mm | 416 × 496 |
| Apple Watch Series 12 / 11 / 10 | 42mm | 374 × 446 |
| Apple Watch Series 9 / 8 / 7 | 45mm | 396 × 484 |
| Apple Watch Series 9 / 8 / 7 | 41mm | 352 × 430 |
| Apple Watch SE 3 / SE（第2世代）/ SE（第1世代） | 44mm | 368 × 448 |
| Apple Watch SE 3 / SE（第2世代）/ SE（第1世代） | 40mm | 324 × 394 |

一覧にないモデルは「カスタム解像度」で幅と高さを指定してください。

## 既知の制限事項

- Apple Watch の写真文字盤では、watchOS 側で表示位置や拡大率が調整される場合があります。本アプリが保証するのは「プレビューと保存画像の構図の一致」までで、Apple Watch 実機での表示の完全な一致は保証しません。実機での検証手順と結果は [docs/実機検証.md](docs/実機検証.md) に記録します。
- プレビューの角丸は見た目の目安です（Apple は角丸の寸法を公開していないため近似値です）。保存画像は通常の長方形で、角丸は付きません。
- 時計の表示位置のガイド、画像の回転、Undo / Redo、背景ぼかし、オフライン対応は未対応です。
- 画像の向き（EXIF Orientation）はブラウザの処理に従います。Display P3 などの色空間の画像は、ブラウザによって色が変わる場合があります。
- 一部のアプリ内ブラウザでは保存できない場合があります。その場合は、表示される画像を長押しして保存してください。

## 技術スタック

| 分野 | 技術 |
|---|---|
| 言語 | TypeScript（strict） |
| UI | React 19、Tailwind CSS v4、shadcn/ui、Lucide React |
| ビルド | Vite |
| 画像処理 | Canvas 2D API、createImageBitmap |
| 操作 | Pointer Events API |
| 状態管理 | React Hooks + useReducer |
| 設定の検証 | Zod |
| テスト | Vitest、React Testing Library、Vitest ブラウザモード、Playwright |
| Lint / Format | Biome |
| CI / ホスティング | GitHub Actions、GitHub Pages |

バックエンド・データベース・外部 API は使いません。

## 開発

前提: Node.js 24（`.node-version`）、pnpm 10

```sh
pnpm install
pnpm dev            # 開発サーバー（http://localhost:5173/）
```

### テスト

```sh
pnpm verify         # Biome lint → 型チェック → 単体テスト
pnpm test:unit      # 単体テスト（Vitest + React Testing Library）
pnpm test:browser   # 描画テスト（実ブラウザでのピクセル比較）
pnpm test:e2e       # E2E テスト（Playwright。Chromium と WebKit〈iPhone・macOS の Safari 相当〉。ビルドとプレビューサーバーの起動は自動）
BASE_PATH=/watch-fit-wallpaper/ pnpm test:e2e   # GitHub Pages と同じサブパスで確認（CI と同じ条件）
```

初回は `pnpm exec playwright install chromium webkit` でブラウザを入れてください。

### ビルド

```sh
pnpm build && pnpm preview     # / で配信する前提でビルドして確認

# GitHub Pages と同じサブパスで確認する場合は、build と preview の両方に同じ BASE_PATH を指定する
BASE_PATH=/watch-fit-wallpaper/ pnpm build
BASE_PATH=/watch-fit-wallpaper/ pnpm preview
```

`BASE_PATH` を指定しない場合は `/` で配信する前提のビルドになります。

### GitHub Pages へのデプロイ

`main` ブランチに push すると、`.github/workflows/deploy.yml` が lint・型チェック・単体テスト・ビルドを行い、GitHub Pages にデプロイします。公開パスはリポジトリ名（`/<リポジトリ名>/`）です。

初回のみ、リポジトリの Settings → Pages で Source を「GitHub Actions」にしてください。

## プライバシー方針

- 選択した画像はブラウザ内で処理され、サーバーへアップロードされません。
- 画像・編集内容・ファイル名を外部へ送信しません。解析ツールや外部 CDN も使いません。
- 保存画像は Canvas から作り直すため、元画像の EXIF（位置情報・撮影機器・撮影日時など）は含まれません。ファイル名にも元画像の名前は含めません。
- 画像や編集状態をブラウザに保存しません。ページを再読み込みすると編集内容は消えます。
- Content Security Policy で外部への通信を制限し、E2E テストで画像の外部送信がないことを検証しています。

## ドキュメント

- [要件定義](docs/要件定義.md)
- [開発規約](docs/開発規約.md)
- [実機検証](docs/実機検証.md)

## ライセンス

[LICENSE](LICENSE) を参照してください。
