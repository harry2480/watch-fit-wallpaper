---
description: UIコンポーネントを作成・修正する。shadcn/ui + Tailwindでデザインを実装する
---

# UI デザインスキル

「〇〇な画面を作って」「デザインを変えて」と指示されたときに適用する。

## 使用するUIスタック

- **shadcn/ui**: `src/components/ui/` に配置
- **Tailwind CSS v4**: スタイリング
- **Lucide React**: アイコン（`lucide-react` からインポート）

shadcn/ui コンポーネントの追加:

```bash
pnpm dlx shadcn@latest add {component-name}
```

## コンポーネント配置

| 種類 | 配置先 |
|---|---|
| shadcn/ui 基本コンポーネント | `src/components/ui/` |
| 機能固有コンポーネント | `src/components/{editor,watch,export}/` |

## ルール

- モバイルファースト。十分な幅（`md:` 以上）で 2 カラムにする（要件定義 10.5、10.6）
- 高さは `h-dvh` / `min-h-dvh` を使う
- ダークモードは OS 設定に連動させ、画像の背景色設定とは独立させる
- WCAG 2.2 AA を目標に、フォーカス表示・Accessible Name・十分なタップ領域を確保する
- Apple 公式サービスと誤認されない独自のデザインにする
- フォント・アイコンは外部 CDN から読み込まない
- 計算ロジックはコンポーネントに書かず `src/features/` に置く
