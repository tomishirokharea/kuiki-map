# お知らせを大きな変更だけに・版を押すと変更の一覧 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 起動時のお知らせを `news: 1` の変更だけにし、設定の版のボタンから全部の変更を見られるようにする。

**Architecture:** app.js の CHANGELOG はそのまま。見せる条件を `clShow(c)` にまとめ、起動時（showNewsIfAny）は `c.news` も見る。設定（openUiSheet）に page 'ver' を足し、版の行を `data-page="ver"` のボタンにする。

**Tech Stack:** 素の JS（app.js）・index.html の CSS・i18n の辞書・Playwright の試験（tools/）

**Spec:** `docs/superpowers/specs/2026-11-21-oshirase-henkou-ichiran-design.md`

## Global Constraints
- 版：index.html `app-version`＝2026.13.174、app.js `APP_JS_VER`＝'2026.13.174'、sw.js `APP_CACHE`＝'kuiki-app-v174'
- 見出しの文言：「変更の一覧」。版の見出し：「版 2026.13.xxx」。戻る：「‹ 設定」。閉じる：「閉じる」
- 試験は試作モード（apiUrl:''）で、ネットにつながない

## Review Focus
- 係でない人に role:'admin' の変更が一覧に出ない（R5）
- かんたんモードで版を押しても最初の画面にもどってしまわない（R4）
- 他のファイル（kantan.js など）が unshift した変更も、版の順に並ぶ（R5）
- スペイン語で版のボタン・見出しが訳される（R6）
- 前に見た版が古い端末でも、印のない変更ではお知らせが出ない（R1）

---

### Task 1: お知らせの絞りこみと変更の一覧

**Files:**
- Modify: `app.js`（CHANGELOG の先頭・showNewsIfAny・openUiSheet の tail と page の分岐）
- Modify: `index.html`（`button.appver` の CSS）
- Modify: `i18n-es-tenken.js`（新しい文言）
- Modify: `index.html`・`app.js`・`sw.js`（版 13.174）
- Test: `tools/henkou-ichiran-test.mjs`（新規）

**Interfaces:**
- Produces: `clShow(c) -> boolean`（role・only の条件）、`changelogHtml() -> string`（一覧の HTML）

- [ ] **Step 1: 試験を書く** `tools/henkou-ichiran-test.mjs`
  - N1：SEEN_VER＝'2026.13.170'、印なしの変更だけ → `#news` が出ない
  - N2：CHANGELOG に `{v:'2026.13.999', news:1, items:[['試','大きな変更']]}` を足して開く → `#news` に「大きな変更」だけ、171〜174 の項目は出ない
  - V1（かんたん・くわしく）：歯車 → `.appver` を押す → 見出し「変更の一覧」、`.cl-ver` の最初が「版 2026.13.174」、版が新しい順
  - V2：伝道者（u1）に role:'admin' の文が出ない／係（u3）には出る
  - V3：「‹ 設定」で最初の画面に戻り、`.appver` にフォーカス
  - V4：スペイン語で「Lista de cambios」と「Versión 2026.13.174」
  - V5：pageerror が0
- [ ] **Step 2: 試験を動かし、失敗することを確かめる**（`.appver` がボタンでないため V1 が NG、N2 は 171〜 も出て NG）
- [ ] **Step 3: 実装する**
  - `clShow(c)`：showNewsIfAny の filter の role・only 部分を移す
  - showNewsIfAny：`c.news && verCmp(c.v, seen) > 0 && clShow(c)`
  - tail の `<p class="muted appver">` を `<button type="button" class="appver" data-page="ver">区域マップ 版 ${APP_VERSION}<span aria-hidden="true"> ›</span></button>`（aria-label「変更の一覧を見る」）
  - paint：`if (!det && page !== 'ver') page = 'top'`、page==='ver' の本文に `changelogHtml()`、見出しは「変更の一覧」
  - `changelogHtml()`：`CHANGELOG.filter(clShow)` を verCmp の新しい順（同じ版は元の順）にまとめ、`<h3 class="sub cl-ver">版 …</h3><ul class="newslist">…</ul>`
  - CSS：`button.appver`（枠・背景なし、muted の色、幅100%、min-height 44px、下線で押せることを示す）
  - 辞書：「変更の一覧」「版 {0}」「変更の一覧を見る」と 13.174 の項目
  - 版を 13.174 に、CHANGELOG の先頭に 13.174（印なし）
- [ ] **Step 4: 試験を動かし、すべて OK を確かめる**
- [ ] **Step 5: 回帰**：`node --check`（変えた js）・`node tools/haguruma-tanaoroshi.mjs --check tools/haguruma-tanaoroshi-before.json`
- [ ] **Step 6: コミット・PR**（マージは R A さんの「はい」のあと）
