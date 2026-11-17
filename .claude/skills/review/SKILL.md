---
name: review
description: 現在のブランチの差分に対し、Codex レビューとコード品質レビューを同時に実行する
---

# Review

`main` との差分に対するセルフレビュー。

```
/review
/review "プライバシー面を重点的にチェックして"
```

## ワークフロー

### Step 1: 差分の確認

```bash
git branch --show-current
git diff --stat main...HEAD
```

差分も未コミット変更もなければ、その旨を伝えて終了する。

### Step 2: 2つのレビューを並列実行（同一メッセージ内で Tool call を発行）

#### 2a. Codex Review（Bash、タイムアウト 600000ms）

```bash
codex review --base main                     # 引数なし
codex review --base main "{ユーザーの指示}"   # 引数あり
```

#### 2b. コード品質レビュー（Agent）

`subagent_type: "code-reviewer"` を起動し、差分を対象にバグ・要件定義との不一致・テスト不足を確認させる。
観点として [docs/要件定義.md](../../../docs/要件定義.md) 22章「品質上の禁止事項」と [docs/開発規約.md](../../../docs/開発規約.md) を渡す。

### Step 3: 結果の報告

両方の結果をまとめ、指摘ごとに「修正する／理由付きで見送る」を明記して報告する。

## 注意事項

- `codex` CLI がインストール済みであること
- `--base` で比較対象を変更できる
