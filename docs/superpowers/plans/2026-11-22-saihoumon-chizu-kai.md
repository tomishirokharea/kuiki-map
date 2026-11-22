# 再訪問の地図の印・紙のS-13の「今回」 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 再訪問の地図の印を一覧と同じ決め方にし、アプリの日付がない区域では紙のS-13の日付を「今回」の始まりにする。

**Architecture:** 画面（GitHub Pages）だけの変更。`houseIcon` の一軒家の状態を、再訪問の地図のときだけ全期間で決める。`periodStart`（app.js と、本番で使われる tsuzuki.js の上書きの両方）の最後に `paperStart(t)` を足す。

**Tech Stack:** 素の JavaScript、Leaflet、Playwright（tools/*.mjs の試験）

**Spec:** `docs/superpowers/specs/2026-11-22-saihoumon-chizu-kai-design.md`

## Global Constraints
- 版：2026.13.177（index.html の app-version・app.js の `APP_JS_VER`・sw.js の `APP_CACHE = 'kuiki-app-v177'`）
- CHANGELOG の 2026.13.177 には news の印を付けない
- 既存の機能を消さない。ふつうの地図の印・おすすめ・進み具合・S-13 は変えない

## Review Focus
- 紙の日付が今日（`paperDone` が今日）：始まりは明日の0時 → 今日の記録は白い丸のまま（T5b）
- 紙の日付の形がくずれている（空・`2026-7-1` など）：使わず、今までどおり（T5c）
- 再訪問の地図を出たあと（`followMap` が false）：ふつうの地図の印にもどる（T3）
- 再訪問の家が拒否：再訪問の地図でも「拒」（T2c）
- アプリの日付がある区域に紙の日付もある：アプリの日付のまま（T7）

---

### Task 1: 試験を書く（失敗を確かめる）

**Files:**
- Create: `tools/saihoumon-chizu-test.mjs`（rusu-hyouji-test.mjs と同じ作り。iPad の幅・架空のデータ）

- [ ] T1：再訪問の家・会えたのが区域の返却より前 → `followMap=true` の `houseIcon(h, k=>'hl', false)` に `>会<`。直す前は失敗する
- [ ] T2a：留守だけ → `>留<`／T2b：記録なし → 字なし（st-plain）／T2c：拒否 → `拒`
- [ ] T3：T1 の家を `followMap=false` で → 字なし（今までどおり）
- [ ] T4：アプリの日付なし・`paperDone`＝10日前：9日前より後の会えた → `pinState(k, periodStart(h))==='met'`、11日前の会えた → `'plain'`
- [ ] T5a：`paperDone`＝明日 → `periodStart(h)===''`／T5b：今日 → 明日の0時／T5c：形がくずれている → `''`
- [ ] T6：`paperDone`＝10日前・`paperLentAt`＝3日前 → 始まりは3日前の0時
- [ ] T7：`returnedAt` がある区域に `paperDone`（後の日付）→ `periodStart` は `returnedAt`
- [ ] T8：集合住宅の部屋（アプリの日付なし・紙のあとに会えた）→ 建物の残りの数が減る（`aptTodo`）
- [ ] T9：実際に `openFollowMap()` で開いた地図の、その家の印の html に `>会<`
- [ ] 実行して、T1・T4・T5b・T6・T8・T9 が失敗することを確かめる：`node tools/saihoumon-chizu-test.mjs 8765`

### Task 2: 作る

**Files:**
- Modify: `app.js`（`periodStart` の近く・`houseIcon`）、`tsuzuki.js`（`window.periodStart` の最後の行）

- [ ] `function paperStart(t)`（app.js・`periodStart` の直前）：`paperLentAt` はその日の0時、`paperDone` は翌日の0時の ISO。`YYYY-MM-DD` で始まらない値と、今より先の日付は使わない。新しいほうを返す。なければ `''`。`dstr`・`ymd`（後ろで const 定義）は使わない
- [ ] app.js `periodStart`・tsuzuki.js の上書きの最後：`… || t.completedAt || paperStart(t)`
- [ ] `houseIcon` の一軒家：`pinState(k, followMap ? FOLLOW_SINCE : since)`（`const FOLLOW_SINCE = '0'`、全期間の意味のコメント）
- [ ] 試験がすべて通る：`node tools/saihoumon-chizu-test.mjs 8765` → 「すべて OK」

### Task 3: 版と変更の一覧・回帰
- [ ] 版を 2026.13.177 に（3か所）。sw.js に v176 の控えの行を残す。CHANGELOG に1件（news なし）
- [ ] 回帰：tools の地図・印の試験（rusu-hyouji・map-default・lead-mapview・swipe-tap・hyouji-5ken・namae-kasanari・osusume-kf・henkou-ichiran ほか、動かせるもの全部）
- [ ] 独立した監査（別のエージェント）→ 指摘を直す → PR → マージ → 公開の確認（GitHub Pages の版）
