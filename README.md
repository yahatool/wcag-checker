# WCAG Checker

Chromium 系ブラウザの DevTools にパネルを追加する、アクセシビリティ開発支援拡張です。WCAG 2.0 / 2.1 / 2.2 と適合レベル A / AA / AAA を選べ、初期値は WCAG 2.2・AA です。選択した基準でコントラスト不足のテキストを背景と同じ色で表示します。レベル A にはテキストのコントラスト達成基準がないため、可視化は実行しません。

## 開発環境

Nix（flakes が使えること）と direnv をインストールしてください。リポジトリ内で以下を実行します。

```sh
direnv allow
pnpm install --frozen-lockfile
pnpm check
pnpm build
```

direnv を使わない場合は `nix develop` に入り、同じ pnpm コマンドを実行します。Nix シェルが Node.js、pnpm、Git、direnv を提供します。pnpm の依存パッケージもロックファイルで固定します。

## Chromium での確認

1. `pnpm build` を実行する。ソース変更後にも再実行する。
2. `chrome://extensions` を開き、デベロッパーモードを有効にする。
3. 「パッケージ化されていない拡張機能を読み込む」からこのリポジトリの `dist/` を選ぶ。
4. 検査するページで DevTools を開き、「WCAG Checker」タブを選ぶ。
5. ソースを変更した後は拡張機能を再読み込みし、必要に応じて DevTools も開き直す。

「検査して可視化」を押すと、対象サイトへのアクセス許可を求めます。判定結果と未判定の理由がパネルに表示され、「停止して元に戻す」で表示変更を解除できます。検査条件を変えると表示変更と古い結果が消えます。開発用の確認ページは `node fixtures/server.mjs` で起動し、`http://127.0.0.1:4173` を開いてください。

現在の検査は main frame の通常 DOM にあるテキストを対象とします。背景画像・グラデーション・フィルター等は未判定です。iframe、Shadow DOM、画像内の文字、装飾・ロゴなどの例外判定には未対応です。結果は WCAG 適合の保証ではありません。

`chrome://` などブラウザの保護ページは将来の検査対象に含めません。

## 開発計画

- [MVP と後続の開発ステップ](docs/ROADMAP.md)
- [コンポーネント構成と判断事項](docs/ARCHITECTURE.md)
