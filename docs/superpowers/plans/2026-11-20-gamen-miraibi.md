# 画面側の期限計算が、未来の完了日を「完了」と数えないようにする　実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `lastDone` に「今日まで」の上限をかけ、未来の完了日を持つ区域を、既存の「前回の記録なし」の一覧と点検で係に知らせる。

**Architecture:** 計算の直しは `schedule.js` の `lastDone` 1か所だけ。`dueInfo`・`coverInfo`・点検・カルテはすべてそこを通るので自動で揃う。知らせは既存の一覧と点検に足すだけで、新しいタイル・画面は作らない。`t.paperDone` の書き込みと S-13 の表示は触らない（間違った日付が見えなくなると係が直せないため）。

**Tech Stack:** 素の JavaScript（kuiki-map・ビルドなし）／試験は Node + Playwright（auto/tests）

**Spec:** `docs/superpowers/specs/2026-11-20-gamen-miraibi-design.md`

## Global Constraints

- **既存の機能を無くさない。** `syncPaperDone`・`t.paperDone` の書き込み・S-13 の表示・`paperDoneIn` は**触らない**
- 新しいタイル・画面・設定を作らない。既存の「前回の記録なし」の一覧と点検に足すだけ
- 「今日」は端末の日付。既存の `ymd(new Date())` を使う。**今日は含める**（`> 今日` だけを除く）
- 幅375px・390px で横のはみ出し0px。**色だけで意味を伝えない**（文字で区別する）
- 版は **2026.13.172**（`index.html`・`app.js` の `APP_JS_VER`・`sw.js` の `APP_CACHE='kuiki-app-v172'` の3点をそろえる）
- スペイン語の訳を `i18n-es.js` に足す
- ブランチは `fix/s13-naosu-miraibi-20261120`（両リポジトリ）。**切り替えない**。開いている PR に積む
- 素の JavaScript。周りの書き方に合わせる
- 試験を実行していない項目は「未検証」と明記する

## Review Focus

1. **未来日しか完了日がない区域** — `lastDone` が空を返し、`dueInfo` が `st:'none'`、`coverInfo().covered` に数えない（Task 1）
2. **未来日とひとつ前の本物の完了日が両方ある区域**（区域61-7 がこれ：`kind:'p'` の 2026/4/5 がある）— 本物の方に落ちる。`st` はその日付から計算される（Task 1）
3. **境目：完了日がちょうど今日** — 今までどおり完了として数える（Task 1）
4. **知らせの見分け** — ふつうの「前回の記録なし」と「完了日が未来」が、文字で区別できる（色だけに頼らない）（Task 2）
5. **`lastDone` を使うほかの場所** — おすすめ・区域カードの優先・カルテ（schedule.js:1613 の `di.st === 'none'` など）が壊れていない（Task 2 の回帰）

---

### Task 1: `lastDone` に上限をかけ、未来の完了日を持つ区域を取り出せるようにする

**Files:**
- Modify: `kuiki-map/schedule.js`（`lastDone`。関数名で探すこと）
- Test: `auto/tests/site/kigen-logic.test.js`（新規）

**Interfaces:**
- Consumes: `ymd(new Date())`（端末の今日・`YYYY-MM-DD`）、`D().territories`、`D().s13`、`t.completedAt`、`t.paperDone`
- Produces:
  - `lastDone(t)` — 返り値の形は今までどおり `YYYY-MM-DD` の文字列、無ければ `''`
  - `futureDone(t)` — 新規。その区域が持つ**今日より後の完了日のうち、いちばん新しいもの**を返す。無ければ `''`。Task 2 が知らせに使う

- [ ] **Step 1: 失敗する試験を書く**

`auto/tests/site/kigen-logic.test.js` を新規に作る。**土台は `auto/tests/site/mamori-b-logic.test.js`**（`schedule.js` を読み込む既存の唯一の site 試験）。既存の書き方（`check(id, 条件, 説明, 実際)` / 最後に `report('<題名>')` の戻り値で終了コードを決める）に合わせること。日付は実行日からの相対で作り、直書きしない。

```js
// K-1：完了日が明日だけ → lastDone は '' を返す
// K-2：完了日が明日と、その前の本物の完了日（例：200日前）→ lastDone は200日前を返す
// K-3：完了日がちょうど今日 → lastDone は今日を返す（境目を落とさない）
// K-4：t.completedAt が未来 → 除く。t.paperDone が未来 → 除く。s13 の x.c が未来 → 除く（3つの候補すべて）
// K-5：futureDone は、未来の完了日のうちいちばん新しいものを返す。無ければ ''
// K-6：dueInfo：未来日だけの区域は st:'none'（'ok' にならない）
// K-7：coverInfo：未来日だけの区域は covered に数えない
```

- [ ] **Step 2: 試験を動かして失敗を確かめる**

Run: `cd /home/claude/auto && KUIKI_MAP_DIR=/home/claude/kuiki-map node tests/site/kigen-logic.test.js`
Expected: K-1・K-2・K-4・K-5・K-6・K-7 が不合格（今は未来日が最大値として採用される。K-5 は `futureDone` が無い）

- [ ] **Step 3: `lastDone` に上限を足し、`futureDone` を作る**

`lastDone` が候補を集める3か所（`t.completedAt`・`t.paperDone`・`D().s13` の `x.c`）で、`今日` より後の値を候補に入れない。今日は含める。
同じ候補の集め方を使って `futureDone(t)` を作る（今日より後のものだけを集め、いちばん新しいものを返す）。候補を集める処理は1つにまとめ、重複させないこと。

- [ ] **Step 4: 試験を動かして合格を確かめる**

Run: `cd /home/claude/auto && KUIKI_MAP_DIR=/home/claude/kuiki-map node tests/site/kigen-logic.test.js`
Expected: K-1〜K-7 すべて合格・終了コード0

- [ ] **Step 5: コミット**

```bash
cd kuiki-map && git add schedule.js && git commit -m "fix(schedule): 未来の完了日を、前回回り終えた日に数えない"
cd ../auto && git add tests/site/kigen-logic.test.js && git commit -m "test(kigen): lastDone の未来日の上限と futureDone"
```

---

### Task 2: 未来の完了日を持つ区域を、既存の「前回の記録なし」の一覧と点検に出す

**Files:**
- Modify: `kuiki-map/schedule.js`（`monthStats` の返り値・`dueTile` を使う画面・`key === 'none'` の一覧・点検の `add('s13', …)`。すべて**関数名と既存の文字列で探すこと**）
- Modify: `kuiki-map/i18n-es.js`、`kuiki-map/index.html`（版）、`kuiki-map/app.js`（`APP_JS_VER`）、`kuiki-map/sw.js`
- Test: `auto/tests/e2e/kigen-miraibi.e2e.js`（新規）

**Interfaces:**
- Consumes: Task 1 の `futureDone(t)`、既存の `monthStats()`・`dueTile(key, n, title, sub, warn)`・`coverInfo()`・`add(key, title, state, text)`
- Produces: なし（画面の表示だけ）

- [ ] **Step 1: 失敗する試験を書く**

`auto/tests/e2e/kigen-miraibi.e2e.js` を新規に作る。土台は `auto/tests/e2e/s13-naosu.e2e.js`（区域と紙の記録を仕込み、係として開く形が同じ）。日付は実行日からの相対で作る。

```js
// G-1：完了日が未来の区域があると、「前回の記録なし」の一覧にその区域が出る
// G-2：その行には「完了した日付が未来になっています」と、ふつうの「前回の記録なし」と区別できる文字が出る
// G-3：ふつうの記録なしの区域は、今までどおりの文言のまま（区別できている）
// G-4：点検に、未来の完了日の区域の項目が出る（0件のときは出ない、または「ありません」）
// G-5：未来日の区域がゼロなら、画面は今までと同じ（余計な文字が出ない）
```

- [ ] **Step 2: 試験を動かして失敗を確かめる**

Run: `cd /home/claude/auto && KUIKI_MAP_DIR=/home/claude/kuiki-map node tests/e2e/kigen-miraibi.e2e.js`
Expected: G-1・G-2・G-4 が不合格

- [ ] **Step 3: 一覧と点検に足す**

`monthStats()` の返り値に、未来の完了日を持つ区域（`futureDone(t)` が空でないもの）を足す。
`key === 'none'` の一覧（schedule.js:427 あたり）で、その区域の行に「完了した日付が未来になっています（◯年◯月◯日）」と出す。既存の「S-13を開く」ボタンはそのまま使う。
点検（schedule.js:1757 あたりの `add('s13', …)` の近く）に1項目足す：件数と「S-13で直してください」。
**新しいタイルは作らない。** 文字で区別し、色だけに頼らない。

- [ ] **Step 4: 試験を動かして合格を確かめる**

Run: `cd /home/claude/auto && KUIKI_MAP_DIR=/home/claude/kuiki-map node tests/e2e/kigen-miraibi.e2e.js`
Expected: G-1〜G-5 すべて合格・終了コード0

- [ ] **Step 5: 回帰を動かす**

それぞれ別に動かし、**すべて合格するまで次に進まない**：
```
cd /home/claude/auto
KUIKI_MAP_DIR=/home/claude/kuiki-map node tests/e2e/kaiki.e2e.js
KUIKI_MAP_DIR=/home/claude/kuiki-map node tests/e2e/s13-naosu.e2e.js
KUIKI_MAP_DIR=/home/claude/kuiki-map node tests/e2e/tsuzuki-p6.e2e.js
KUIKI_MAP_DIR=/home/claude/kuiki-map node tests/e2e/autofree.e2e.js
KUIKI_MAP_DIR=/home/claude/kuiki-map node tests/site/low-logic.test.js
KUIKI_MAP_DIR=/home/claude/kuiki-map node tests/site/obi-logic.test.js
KUIKI_MAP_DIR=/home/claude/kuiki-map node tests/site/mamori-b-logic.test.js
KUIKI_MAP_DIR=/home/claude/kuiki-map node tests/site/kigen-logic.test.js
```
既に落ちているもの（`insatsu.e2e.js` は合否が逆で終了コード1・`autofree` の `OLD_SITE_DIR` 置き札・`joukyou-graph` と `card-mark-flow`）は、この変更の前からのもの。`joukyou-graph` と `card-mark-flow` は動かさない。

- [ ] **Step 6: スペイン語・版を上げて、コミット**

新しい文言を `i18n-es.js` に足す。`index.html` の版・`app.js` の `APP_JS_VER`・`sw.js` の `APP_CACHE` を **2026.13.172 / kuiki-app-v172** にそろえる。`app.js` の CHANGELOG に1行（この直しは係に見える）。

```bash
cd kuiki-map && git add schedule.js i18n-es.js index.html app.js sw.js
git commit -m "feat(schedule): 完了日が未来の区域を、前回の記録なしの一覧と点検に出す"
cd ../auto && git add tests/e2e/kigen-miraibi.e2e.js && git commit -m "test(kigen): 完了日が未来の区域の知らせ"
```
