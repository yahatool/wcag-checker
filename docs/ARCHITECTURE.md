# 構成と技術方針

## 現在の構成

Manifest V3 の `devtools_page` が `devtools.html` を読み込み、`src/devtools/index.ts` が `chrome.devtools.panels.create` で `panel.html` を登録します。Vite はパネル、バックグラウンド、ページ注入用 IIFE を `dist/` にビルドし、`public/manifest.json` をコピーします。対象サイトの権限はパネルの明示操作時にそのサイトへ要求します。match pattern はポートを含まないため、URL の scheme と host から作り、バックグラウンドで対象タブの実際の origin と照合します（[Chrome Permissions API](https://developer.chrome.com/docs/extensions/reference/api/permissions)、[Match patterns](https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns)）。

Chrome の [DevTools 拡張ガイド](https://developer.chrome.com/docs/extensions/how-to/devtools/extend-devtools)に沿った構成です。

## MVP 実装時の境界

```text
DevTools パネル (操作、結果、停止)
    → バックグラウンド (対象タブ、権限、注入の仲介)
    → 検査対象ページの isolated world (走査、計測、一時的な見た目の変更)
    → パネルへ結果を返す
```

- `src/criteria/`: WCAG のバージョン、適合レベル、達成基準の対応表。選択条件から適用対象を求める。MVP ではコントラスト基準を定義する。
- `src/contrast/`: 相対輝度、アルファ合成、コントラスト比、閾値の純粋関数。DOM に依存させない。
- `src/inspected-page/`: main frame の通常 DOM にある可視テキスト、計算済みスタイルと実効背景の取得、元のスタイルの保存・復元。DOM 更新は MutationObserver で再走査する。パネルに返す情報は JSON で表せる値に限定する。
- `src/background/`: DevTools からのタブ ID を検証し、必要なサイト権限を確認して `chrome.scripting.executeScript` などで注入する。
- `src/panel/`: WCAG の対象バージョンとレベル、実行・停止、結果件数、確認が必要なケースを表示する。
- `src/shared/`: パネル、バックグラウンド、検査対象ページの通信形式。リクエスト ID で応答を対応付ける。

検査対象ページはバックグラウンドとの Port を持ち、切断された場合にも保存した色を復元します。通常の停止、条件変更、DevTools の終了時はパネルとバックグラウンドから停止を送ります。

## 検査条件の選択

- パネルに WCAG **2.0 / 2.1 / 2.2** と適合レベル **A / AA / AAA** の選択欄を置く。初期値は **2.2・AA**。現時点の最新の WCAG 2 勧告は 2.2（[W3C の概要](https://www.w3.org/WAI/standards-guidelines/wcag/)）。
- 選択したレベルまでの達成基準を累積して対象にする。AA は A と AA、AAA は A・AA・AAA を含む（[WCAG 2.2 の適合要件](https://www.w3.org/TR/WCAG22/#conformance-reqs)）。
- 達成基準ごとに導入バージョン、適合レベル、廃止状態を管理する。例えば 4.1.1 は WCAG 2.2 で削除されている（[W3C の変更点](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/)）。追加チェックでは選択条件に一致する基準だけを実行・表示する。
- 検査開始時のバージョンとレベルを結果に保持し、パネルにも表示する。選択変更時は可視化を解除し、古い結果を消して新しい条件で再検査できる状態にする。結果に別の条件の判定を混ぜない。
- 初期値の「AA」は適用する基準の選択を意味する。自動検査の結果をページ全体の「AA 準拠」と表示しない。

`chrome.devtools.inspectedWindow.eval` は使えるが、ページの実行コンテキストで動きます。Chrome の [API リファレンス](https://developer.chrome.com/docs/extensions/reference/api/devtools/inspectedWindow)は、ページの JavaScript 状態が必要ない DOM アクセスには `chrome.scripting.executeScript` を推奨しています。MVP は後者を基本に、対象サイトごとの権限を求める方針です。保護ページ、権限がないページ、クロスオリジン iframe は検査不可または一部未検査として表示します。

## コントラスト可視化の仕様

MVP では WCAG 2.0 / 2.1 / 2.2 に共通するテキストのコントラスト基準を扱います。選択レベルごとの動作は次のとおりです（[WCAG 2.2 の 1.4.3 と 1.4.6](https://www.w3.org/TR/WCAG22/#distinguishable)）。

| 選択レベル | 対象となるコントラスト基準 | 通常テキスト | 大きなテキスト | 可視化 |
| --- | --- | --- | --- | --- |
| A | 該当なし | — | — | 実行せず、理由を表示 |
| AA（初期値） | 1.4.3 Contrast (Minimum) | 4.5:1 | 3:1 | 閾値未満を 1:1 にする |
| AAA | 1.4.3 と 1.4.6 Contrast (Enhanced) | 7:1 | 4.5:1 | 閾値未満を 1:1 にする |

コントラストの閾値は選択した 2.x バージョン間で同じです。したがって MVP の可視化結果はバージョンだけを切り替えても変わりません。後続の検査ではバージョン固有の達成基準が結果に反映されます。例外条件（装飾、非アクティブ、ロゴなど）と画像内の文字を機械的に確定できない場合は、誤って「違反」と断定せず確認対象として扱います。

閾値未満と判定できたテキストだけ、前景色を背景の実効色に一時変更します。元の色、優先度、プロパティの有無を保持して停止時に復元します。結果一覧には元の比率と閾値を残します。ビジュアルで 1:1 にする操作は診断のための表示変更であり、元ページの適合状態を変えません。

背景画像、グラデーション、フィルター、ブレンドを検出した場合は未判定にします。半透明の単色背景・文字色はアルファ合成して評価します。Shadow DOM、iframe、画像内の文字、疑似要素、重なり、ロゴ・装飾などの例外は検査範囲外です。通常 DOM の追加・変更は MutationObserver で再走査します。既存の inline color と優先度を保存し、停止時に復元します。ページ側が可視化中に color を変更した場合はページの新しい値を優先します。
