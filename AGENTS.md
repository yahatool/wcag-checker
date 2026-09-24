# エージェント向け作業指針

## 目的

このリポジトリは Chromium 系ブラウザの DevTools パネルで、WCAG に基づくアクセシビリティの問題を開発者が確認するための拡張機能です。最初の価値は、基準に届かないテキストの前景色を実効背景色に合わせ、表示上のコントラストを 1:1 にして問題箇所を見つけやすくすることです。

## 最初に読むもの

1. `README.md`: 環境構築と実行方法
2. `docs/ROADMAP.md`: 優先順位、MVP の受け入れ条件、未決事項
3. `docs/ARCHITECTURE.md`: コンポーネント境界と実装上の注意

## 作業の進め方

- 依存する CLI は `flake.nix` と `.envrc` で管理する。通常は `direnv allow` 後に作業し、CI などでは `nix develop --command ...` を使う。
- パッケージは pnpm で管理し、依存関係を変えたら `pnpm-lock.yaml` を更新する。Git に `node_modules` や `dist` を含めない。
- 仕様変更や完了した作業は `docs/ROADMAP.md` のチェック項目に反映する。調査結果を採用する場合は公式仕様または実装元へのリンクを残す。
- DevTools の UI、検査ロジック、検査対象ページの DOM 操作を分離する。検査対象ページ由来の文字列を `innerHTML` に渡さない。
- WCAG の「自動判定可能」と「人手確認が必要」を区別し、このツールだけで準拠を保証する表示をしない。
- 検査条件は WCAG 2.0 / 2.1 / 2.2 と A / AA / AAA を選択可能にし、初期値を 2.2・AA とする。結果には使用したバージョンとレベルを含め、条件変更時は古い結果と可視化を解除して再検査する。レベルは A ⊂ AA ⊂ AAA として扱い、バージョン固有の達成基準を混同しない。
- 可視化は明示的な操作で開始し、停止時に元の表示へ戻す。既存の inline style を正確に復元し、ページの状態を永続化しない。
- 外部ページへの権限は必要最小限にする。ページ内のコードを信用せず、メッセージの型と送信元を検証する。
- 各変更の最後に `pnpm check` と `pnpm build` を実行する。ブラウザ動作に関わる変更は `chrome://extensions` から読み込み、DevTools パネルで手動確認する。

## 現在のディレクトリ

```text
public/manifest.json   Manifest V3。Vite が dist/ へコピーする
devtools.html          DevTools ページの入口
panel.html             DevTools パネルの入口
src/devtools/          DevTools パネルの登録
src/panel/             パネル UI
src/types/             現在使う Chrome API の最小型定義
docs/                  設計と開発順序
```

`src/criteria/` は基準、`src/contrast/` は数値計算、`src/inspected-page/` は走査と可視化、`src/background/` は権限と注入の橋渡し、`src/shared/` は通信型を扱う。`fixtures/` の確認ページは Node.js で起動する。
