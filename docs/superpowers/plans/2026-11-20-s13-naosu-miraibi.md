# S-13の記録を直す（ポップ）／未来日を止める　実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 区域係がS-13の紙の記録をポップで直せるようにし、未来の完了日が「入る・数えられる・確かめをすり抜ける」のを3段で止める。

**Architecture:** 画面は既存の `setSheet`（下から出るシート）を1枚足すだけ。新しいタブ・新しい部品は作らない。未来日は、入力（app.js）・集計（gas/hagemashi.gs）・自動の確かめ（app.js）の3か所で独立に弾く。

**Tech Stack:** 素の JavaScript（kuiki-map・ビルドなし）／Google Apps Script（auto/gas）／試験は Node + Playwright（auto/tests）

**Spec:** `docs/superpowers/specs/2026-11-20-s13-naosu-miraibi-design.md`

## Global Constraints

- 既存の機能を無くさない。転記の欄・枝番一括・前回完了日・アプリの記録の「完了にする」「消す」はそのまま残す
- 新しいタブ・画面・設定は作らない。既存の `setSheet`・`ask`・`toast` を再利用する
- `s13` の記録の形 `{ id, kind, terrId, name, a, c }` を変えない。サーバーの列も変えない
- 本番反映の順は **auto（サーバー）が先 → kuiki-map（画面）**。Task 1 と Task 2〜4 は別リポジトリ
- 幅375px・390px で横のはみ出し0px
- 「今日」は端末の日付。画面側は既存の `ymd(new Date())`（app.js:13049）を使う
- スペイン語の訳を `i18n-es.js` に足す（S-13 の既存の訳と同じファイル）
- 画面を変えたら `index.html` の版と `sw.js` を上げる
- 試験を実行していない項目は「未検証」と明記する。実機（iPhone）とスペイン語の目視は実行できない

## Review Focus

1. **完了日が空のまま直す** — まだ回り終えていない紙の記録の名前だけを直したい。空の完了日で保存でき、「貸出中」のまま残る（Task 4）
2. **名前を空にして保存** — 名前が空なら保存せず「伝道者の名前を入れてください」。既存の転記の欄と同じ扱い（Task 4）
3. **完了日＜割り当て日** — 既存の確かめ（app.js:15839）が、ポップでも生きている（Task 4）
4. **未来日を弾いたあと、帯が0%になる** — 未来日を数えないことで `done` が0になった日は、S5 の文を出さない（R11）。0%の文が出てはいけない（Task 1）
5. **端末の日付とサーバーのJSTのずれ** — 画面は端末の日付、サーバーはJSTで「今日」を決める。日付変更の前後で、入力は通るが集計に入らない日が出うる。集計側は「今日」を**含める**ことで、ずれても完了が落ちないようにする（Task 1）

---

### Task 1: 帯の集計が、未来の完了日を数えない（サーバー）

**Files:**
- Modify: `auto/gas/hagemashi.gs:143-164`（`obiCover_`）
- Test: `auto/tests/server/hagemashi.test.js`

**Interfaces:**
- Consumes: `obiDayStr_(idx)`（hagemashi.gs:46）＝JSTの日付文字列 `YYYY-MM-DD`
- Produces: `obiCover_(today)` の返り値は今までどおり `{ y, done, all } | null`

- [ ] **Step 1: 失敗する試験を書く**

`auto/tests/server/hagemashi.test.js` に足す。既存の試験の書き方（`check(id, 条件, 説明, 実際)`）に合わせる。

```js
// C-1：未来の完了日（s13 kind:'a'）は、回り終えた数に入れない
// C-2：未来の返却（returns の at）も入れない
// C-3：今日の完了は入れる（境目を落とさない）
// C-4：未来日しか無い日は done=0 になり、画面は S5 を出さない（R11）
```

区域3つ・完了を「今日」「明日」「きのう」で1つずつ入れ、`obiCover_(today)` の `done` が 2 になること。

- [ ] **Step 2: 試験を動かして失敗を確かめる**

Run: `cd auto && node tests/server/hagemashi.test.js`
Expected: C-1・C-2 が不合格（`done` が 3 になる）

- [ ] **Step 3: `obiCover_` に上限を足す**

`S <= 日付 < Z` の判定に、`日付 <= obiDayStr_(today)` を加える。`returns`（`r.at` から作る `d`）と `s13`（`p.c`）の両方。
今日は**含める**（Global Constraints の「ずれても完了が落ちない」ため）。

- [ ] **Step 4: 試験を動かして合格を確かめる**

Run: `cd auto && node tests/server/hagemashi.test.js`
Expected: すべて合格（既存の38項目も含む）

- [ ] **Step 5: コミット**

```bash
cd auto && git add gas/hagemashi.gs tests/server/hagemashi.test.js
git commit -m "fix(hagemashi): 未来の完了日を、全区域の進み具合に数えない"
```

---

### Task 2: 自動の確かめが、未来日の返却をすり抜けさせない

**Files:**
- Modify: `kuiki-map/app.js:9542`（`lowSweep` の待ち時間の判定）
- Test: `auto/tests/site/low-logic.test.js`

**Interfaces:**
- Consumes: `lowSweep()` の `wait = lowWaitDays() * DAY`、`r.at`（返却の時刻・ISO）
- Produces: なし（内部の判定だけ）

- [ ] **Step 1: 失敗する試験を書く**

`auto/tests/site/low-logic.test.js` に足す。

```js
// L-1：r.at が未来の正式返却も、待ち日数がすぎていれば確かめの対象になる
// L-2：r.at が今日・待ち日数の中なら、今までどおり対象にしない
```

- [ ] **Step 2: 試験を動かして失敗を確かめる**

Run: `cd auto && KUIKI_MAP_DIR=/path/to/kuiki-map node tests/site/low-logic.test.js`
Expected: L-1 が不合格（未来日の記録が対象に入らない）

- [ ] **Step 3: 待ち時間の起点を、今日より後にしない**

`now - Date.parse(r.at)` の `r.at` を、今日を超えないように丸めてから引く。未来日の記録は「今日返却された」として待ち日数を数える。

- [ ] **Step 4: 試験を動かして合格を確かめる**

Run: `cd auto && KUIKI_MAP_DIR=/path/to/kuiki-map node tests/site/low-logic.test.js`
Expected: すべて合格

- [ ] **Step 5: コミット**

```bash
cd kuiki-map && git add app.js && git commit -m "fix(lowSweep): 未来日の正式返却が、自動の確かめをすり抜けないようにする"
cd ../auto && git add tests/site/low-logic.test.js && git commit -m "test(low-logic): 未来日の正式返却の確かめ"
```

---

### Task 3: 紙の記録を入れるとき、未来日を止める

**Files:**
- Modify: `kuiki-map/app.js:15836-15840`（`#s13Add` の確かめ）
- Modify: `kuiki-map/i18n-es.js`
- Test: `auto/tests/e2e/s13-naosu.e2e.js`（新規。Task 4 でも使う）

**Interfaces:**
- Consumes: `ymd(new Date())`（app.js:13049）、`toast(msg)`
- Produces: なし

- [ ] **Step 1: 失敗する試験を書く**

`auto/tests/e2e/s13-naosu.e2e.js` を作る。土台は `/home/claude/repro/s13-naosu.e2e.js`（再現に使ったもの）。

```js
// F-1：完了した日付に明日を入れて「この記録を入れる」→ 記録が増えず、
//      「完了した日付が、今日より後になっています」と出る
// F-2：割り当てた日付に明日を入れる →「割り当てた日付が、今日より後になっています」
// F-3：今日の日付なら入る（境目を止めない）
```

- [ ] **Step 2: 試験を動かして失敗を確かめる**

Run: `cd auto && KUIKI_MAP_DIR=/path/to/kuiki-map node tests/e2e/s13-naosu.e2e.js`
Expected: F-1・F-2 が不合格（明日の日付で記録が入る）

- [ ] **Step 3: 確かめを足す**

`if (c && c < a)` の次に、`a` と `c` それぞれが `ymd(new Date())` より後なら `toast` して `return`。文面は Step 1 のとおり。
グループに渡す経路（app.js の `if (a > ymd(new Date()))`）は既にあるので触らない。

- [ ] **Step 4: 試験を動かして合格を確かめる**

Run: `cd auto && KUIKI_MAP_DIR=/path/to/kuiki-map node tests/e2e/s13-naosu.e2e.js`
Expected: F-1〜F-3 合格

- [ ] **Step 5: スペイン語の訳を足して、コミット**

2つの文面を `i18n-es.js` に足す。

```bash
cd kuiki-map && git add app.js i18n-es.js && git commit -m "fix(s13): 紙の記録に、今日より後の日付を入れられないようにする"
cd ../auto && git add tests/e2e/s13-naosu.e2e.js && git commit -m "test(s13): 未来日を止める試験"
```

---

### Task 4: 紙の記録を直すポップ

**Files:**
- Modify: `kuiki-map/app.js`（`openS13Edit` の `ed` の分岐を外し、`openS13RowEdit` を足す。15794-15910 あたり）
- Modify: `kuiki-map/i18n-es.js`、`kuiki-map/index.html`（版）、`kuiki-map/sw.js`
- Test: `auto/tests/e2e/s13-naosu.e2e.js`（Task 3 で作ったものに足す）

**Interfaces:**
- Consumes: `setSheet(html)`、`headHtml(t, title, sub)`、`ask(msg, o)`、`commit(msg, fn)`、`s13Fmt(d)`、`toast`、`openS13(y)`、`openS13Edit(tid)`
- Produces: `openS13RowEdit(tid, editId)` — 紙の記録1件だけのシートを出す。保存・やめるのあとは `openS13(s13Y); openS13Edit(tid)` に戻る

- [ ] **Step 1: 失敗する試験を書く**

`auto/tests/e2e/s13-naosu.e2e.js` に足す。

```js
// P-1：「直す」を押すと、その記録だけのシートが出る（見出しに区域番号・名前/割当日/完了日が埋まっている）
// P-2：完了日を 2026-12-31 → 2026-10-31 に直して「保存する」→ 上書きの確認が出て、
//      前後（2026/12/31 → 2026/10/31）が文に入っている
// P-3：確認で「上書きする」→ S-13 の表の完了日が 2026/10/31 になる
// P-4：確認で「やめる」→ 記録は変わらない
// P-5：枝番（61-1・61-3〜61-6）の記録は、どれも変わらない
// P-6：完了日を空にして保存 → 空で保存でき、表は「貸出中」になる（Review Focus 1）
// P-7：名前を空にして保存 →「伝道者の名前を入れてください」。記録は変わらない（Review Focus 2）
// P-8：完了日に割り当て日より前の日 →「完了した日付が、割り当てた日付より前になっています」（Review Focus 3）
// P-9：完了日に明日 →「完了した日付が、今日より後になっています」（Task 3 の確かめがポップでも効く）
// P-10：「やめる」で元の区域の画面に戻る
```

- [ ] **Step 2: 試験を動かして失敗を確かめる**

Run: `cd auto && KUIKI_MAP_DIR=/path/to/kuiki-map node tests/e2e/s13-naosu.e2e.js`
Expected: P-1 から不合格（今は同じシートの下の欄が埋まるだけ）

- [ ] **Step 3: `openS13RowEdit(tid, editId)` を足す**

`setSheet` で、その記録だけのシートを出す。中身は上から順に：
見出し（`headHtml` で「区域◯◯の記録を直す」）／伝道者の名前／割り当てた日付／完了した日付（まだ回り終えていなければ空）／「保存する」／「やめる」。
**枝番すべてに入れるチェックは出さない**（直すのはその区域だけ）。
確かめの順は、名前が空 → 完了日＜割り当て日 → 未来日（Task 3 と同じ文面）。
保存は `ask()` で上書きの確認を出し、文に**前後**を入れる（例：`赤嶺みな子 2026/10/8 〜 2026/12/31` → `2026/10/8 〜 2026/10/31`）。
`ask` が true なら `commit()` の中で `D().s13` のその1件の `name`・`a`・`c` を書きかえ、`openS13(s13Y); openS13Edit(tid)` に戻る。

- [ ] **Step 4: 「直す」の行き先を差し替える**

app.js:15905 の `openS13Edit(tid, b.dataset.s13ed)` を `openS13RowEdit(tid, b.dataset.s13ed)` にする。
`openS13Edit` から編集モード（`ed` の分岐・`#s13EdCancel`・見出しの出し分け）を外し、転記の欄は**新しく入れる専用**に戻す。

- [ ] **Step 5: 試験を動かして合格を確かめる**

Run: `cd auto && KUIKI_MAP_DIR=/path/to/kuiki-map node tests/e2e/s13-naosu.e2e.js`
Expected: P-1〜P-10・F-1〜F-3 すべて合格

- [ ] **Step 6: 回帰を動かす**

Run（それぞれ別に）: `cd auto && KUIKI_MAP_DIR=/path/to/kuiki-map node tests/e2e/kaiki.e2e.js` ／ `insatsu.e2e.js` ／ `m1m2.e2e.js` ／ `tsuzuki-p6.e2e.js` ／ `node tests/server/hagemashi.test.js` ／ `KUIKI_MAP_DIR=... node tests/site/low-logic.test.js` ／ `tests/site/obi-logic.test.js`
Expected: すべて合格。合格しないものがあれば、直すまで次に進まない

- [ ] **Step 7: スペイン語・版を上げて、コミット**

ポップの文言を `i18n-es.js` に足す。`index.html` の版と `sw.js` の `APP_CACHE`・`app-version` を上げる。

```bash
cd kuiki-map && git add app.js i18n-es.js index.html sw.js
git commit -m "feat(s13): 紙の記録を、1件だけのポップで直せるようにする"
cd ../auto && git add tests/e2e/s13-naosu.e2e.js && git commit -m "test(s13): 記録を直すポップの試験"
```
