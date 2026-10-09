# 証拠と判断基準

Addy Osmaniのaccessibility guidanceをRSS用に改変。上流の点検観点を使い、ツールの導入・実行手順は除いた。コントラストのlarge text条件をCSS pxとpointの区別に合わせて修正した。出典は [skill-sources.md](../../../../docs/design/skill-sources.md)。

## キーボードと名前

- button/link/summary等のnative semanticsを優先する。装飾アイコンは名前を重複させず、アイコンだけの操作は目的が分かるaccessible nameを持つ。
- TabとShift+Tabで関連操作に到達し、native Enter/Spaceが一度だけ動くことを確認する。本文のSpace/Shift+Space、入力、メニュー、trusted reader overlayの所有権を分ける。
- メニュー・モーダルをEscapeで閉じ、可視の入口へfocusを戻す。dialogのfocus trap、背景との操作分離、閉じる操作を確認する。
- disclosureの開閉、選択中、押下状態、無効状態を適切なsemanticsで伝える。native disabledは操作不能、aria-disabledにはcallback guardも必要。
- 設定検索の結果は正しいtabpanel内へ案内する。説明のみの項目には操作を作らず、状態説明へfocusできるようにする。

## コントラストとサイズ

[WCAG 2.2 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) の通常の文字・placeholderは4.5:1以上。large textは18pt（24 CSS px）以上、または14pt（約18.67 CSS px）以上のboldで3:1以上。18 CSS pxや14 CSS pxをlarge textの境界としない。判定に使う比率は丸めない。

computed colorと実際の背景・opacity・重ね合わせを確認する。セマンティックトークン名だけ、画像のアンチエイリアス画素だけ、別テーマの測定だけで合格にしない。[1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) のUI境界・状態・必要なグラフィックのコントラストも関連範囲で確認する。

[WCAG 2.2 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) のAA基準は原則24×24 CSS pxで、spacing・inline等の例外がある。RSSのfine 32px / coarse 44pxは製品の操作性規則として別に守る。24pxを全touch UIの目標とせず、44pxをすべての高密度mouse UIへ機械的に適用しない。

実ブラウザーでpointer条件とbounding boxを確認する。viewport幅だけでタッチ入力を判定しない。隣り合う同種操作は高さをそろえ、最小ペイン幅でも領域をクリップしない。

## Reflowと動き

[1.4.4](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html) の200%文字拡大、[1.4.10](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) の320 CSS px相当のreflowを関連画面で確認する。小さいviewportの画像だけを文字拡大の検証と呼ばない。長い日本語ラベル・URL、最小のsidebar/list幅、モーダルの内容と操作を確認する。

reduced motionでも選択・進行・読み込み状態が伝わることを確認する。色だけで意味を伝えず、文字・アイコン・境界・semanticsを併用する。

## 検証範囲の記録

同じ合成データ・フォント・テーマ・viewport・状態でbefore/afterを描画し、tested SHAまたはpatch digestを結び付ける。実アカウントのprivate feedを公開のfixtureや画像へコピーしない。

自動チェックが使える場合も、キーボード・focus復帰・読み順・状態変化は別に確認する。screen readerを使っていなければ支援技術で確認済みとしない。結果は合格した対象と未検証の対象を分けて記録する。
