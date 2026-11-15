# 今日回る人を、えらばれた人どうしでも分かるように　実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 「今日回る人をえらぶ」でえらばれた人の画面に、同じカードを今日回るほかの人（司会・担当と仲間）を出す。

**Architecture:** app.js に、仲間を求める `fellowsOf` と、1行の HTML を作る `fellowsHtml` を足す（helpersOf・cardHelpers・leadOf のすぐ下）。今「一緒に回ります」「今日のあなたの範囲」を出している所（app.js・kantan.js）から呼ぶだけで、データ・サーバーは変えない。［ほか n人］は document への委譲クリック1つで、その場で全員に入れかえる。

**Tech Stack:** 素の JS（ビルドなし）・GitHub Pages。試験は Playwright（試作モード＝`apiUrl:''`）で `tools/*.mjs` の形（例：`tools/rusu-hyouji-test.mjs`）。

**Spec:** `docs/superpowers/specs/2026-11-15-kyou-mawaru-hito-mieru-design.md`（R1〜R7）

## Global Constraints

- 文：「今日このカードを回る人（あなたをふくめ{n}人）：」＋「司会 Xさん、Aさん、Bさん」。グループでない区域は「担当 Xさん」。
- 自分の名前は出さない。人数 n には自分を入れる。
- 名前が6人をこえたら5人まで出し、［ほか {m}人］（`btn small`）。押すとその行を全員に入れかえる。覚えない。
- 名前は `esc(uname(uid))`。名前の部分は `<span data-notr>`。日本語のときだけ「さん」を付け、スペイン語（`window.KI && window.KI.lang === 'es'`）は「, 」でつなぐ。
- 司会者（担当者・今日の司会）の画面は変えない。新しい設定・タブは作らない。
- 版：2026.13.152（index.html の app-version・app.js の APP_JS_VER・sw.js の APP_CACHE `kuiki-app-v152`）。CHANGELOG に1件。
- 作業は `feat/kyou-mawaru-hito-20261115`。main へのマージ・本番反映は R A さんが行う。

## Review Focus

1. 名簿にいない uid（転出・止めた人）が helpers に残っている → 「不明さん」を出さず、その人は名前にも人数にも入れない。（Task 1 の試験）
2. 司会者が自分を「今日回る人」に入れている、または今日の司会が helpers にも入っている → 同じ人を2回出さない。（Task 1）
3. 期限切れ（until が過ぎた）helpers・グループ機能オフ（groupOn 0）→ 行を出さない／その人を出さない（helpersOf の決まりのまま）。（Task 1）
4. 名前に HTML（`<img onerror>`）→ 文字のまま出る。（Task 1）
5. 幅375で20人 → 横にはみ出さない・［ほか n人］を押しても他の操作（地図をひらく・わかりました）がそのまま働く。（Task 2・3）

---

### Task 1: 仲間を求める部品（fellowsOf・fellowsHtml）

**Files:**
- Modify: `app.js`（`isCardHelper` の行 9411 のすぐ下に足す。document の委譲クリックは 16235 の asg のハンドラーの近く）
- Test: `tools/nakama-test.mjs`（新規。`tools/rusu-hyouji-test.mjs` と同じ起動の形・`OK`/`NG` 出力・最後に NG 数で exit code）

**Interfaces:**
- Produces:
  - `fellowsOf(t, c) -> { host: string|null, hostRole: '司会'|'担当', others: string[], n: number }`
    - c（留守宅カード）があるとき：host＝`c.by`、others＝`cardHelpers(c)` の uid、hostRole＝'司会'。
    - ないとき：host＝`leadOf(t)?.uid || t.holder`、others＝`helpersOf(t)` の uid、hostRole＝`t.group ? '司会' : '担当'`。
    - host・others から 自分（`me().id`）と名簿にいない uid（`!userById(u)`）を除く。others から host を除き、重複を除く（はじめに出た順）。
    - n＝1（自分）＋（host があれば1）＋ others.length。
  - `fellowsHtml(t, c) -> string`：自分が担当者・c.by・今日の司会なら ''。自分が helpers（c のときは cardHelpers）に入っていなければ ''。host も others も空なら ''。それ以外は `<p class="muted fellows">` の1行（Global Constraints の文）。［ほか m人］は `<button type="button" class="btn small" data-fellowsmore>`、全員の名前を入れた行は `data-fall` 属性ではなく、押したときに同じ `fellowsHtml` を `all=true` で作り直す（第3引数 `all`）。行に `data-ft`（区域 id）・`data-fc`（カード id）を持たせる。
  - 委譲クリック：`[data-fellowsmore]` → 近くの `.fellows` を `fellowsHtml(t, c, true)` の中身に入れかえる。

- [ ] **Step 1: 試験を書く** `tools/nakama-test.mjs`。試作データで、区域1つを「ほかの人が担当・グループの区域」にし、自分と他の人を helpers（until＝今日の終わり）に入れて `fellowsOf`・`fellowsHtml` を直接呼ぶ。
  - `1 自分を出さない・人数に入れる`：helpers＝[自分, A, B]、担当 H → `n===4`・others に自分なし・HTML に「あなたをふくめ4人」「司会」「Hさん」「Aさん」「Bさん」。
  - `2 今日の司会が司会になる`：t.lead＝{uid:L, h:H, until:今日の終わり} → host===L、Hは出ない。
  - `3 重複なし`：helpers に H（担当）・同じ A が2回 → 名前が1回ずつ。
  - `4 名簿にいない人`：helpers に 'u_nai' → 「不明」を含まず、n に数えない。
  - `5 期限切れ・groupOn 0`：until が昨日の人は出ない／groupOn 0 → ''。
  - `6 担当者・今日の司会の画面`：自分が holder／自分が lead → ''。
  - `7 グループでない区域`：t.group を消す → 「担当」。
  - `8 6人をこえる`：helpers 9人 → 名前5つと「ほか5人」（host＋others＝10人のうち5人を出す）。`fellowsHtml(t,null,true)` は10人ぶん・ボタンなし。
  - `9 XSS`：A の名前を `<img src=x onerror=window.__x=1>` → HTML に `<img` がなく、行を入れたあと `window.__x` が undefined。
  - `10 留守宅カード`：グループのカード c（by＝H、helpers＝[自分, A]）→ host===H・「司会」。
  - `11 スペイン語`：`KI.lang='es'` のとき「さん」なし・「, 」でつながる（試験の終わりに ja にもどす）。
- [ ] **Step 2: 失敗を確かめる** サイトを `npx http-server -p 8765 -c-1 .`（または `python3 -m http.server 8765`）で出し、`node tools/nakama-test.mjs` → `fellowsOf is not defined` で NG。
- [ ] **Step 3: 実装** 上の Interfaces どおり。HTML は `<p class="muted fellows" data-ft=".." data-fc=".."><b>今日このカードを回る人（あなたをふくめ{n}人）：</b><span>司会</span> <span data-notr>Xさん、Aさん</span> <button…>ほか{m}人</button></p>`（スペイン語は辞書で訳すので、日本語の文字は固定の部品ごとに分ける）。
- [ ] **Step 4: 合格を確かめる** `node tools/nakama-test.mjs` → 1〜11 がすべて OK、ページのエラー0。
- [ ] **Step 5: コミット** `feat: えらばれた人どうしで仲間が分かる部品（fellowsOf・fellowsHtml）`

### Task 2: くわしい表示の各所に出す（app.js）

**Files:**
- Modify: `app.js`
  - 次の5か所に `fellowsHtml` を入れる：
    1. `cardHtml`（8280 の「今日のあなたの範囲」の行のあと）：`!own && !lead && helper` のとき `fellowsHtml(t)`
    2. `awayCardHtml`（kind==='help' のとき、`poolLineHtml(c)` のあと）：`fellowsHtml(t, c)`
    3. `renderLegend` の地図の帯（4135 の `mp2` の行のあと）：`!own && !lead` のとき `fellowsHtml(r.t)`
    4. `renderCardBar`（留守宅カードの帯・最初の `<p>` のあと）：`fellowsHtml(t, c)`
    5. お知らせ2か所（`asgNoticeHtml` 1762 の `${esc(uname(a.by))}さんから…` の行のあと、ホームの 14006 の `<small>` の中の終わり）：`a.card ? fellowsHtml(a.t, activeCards().find(x => x.id === a.card)) : fellowsHtml(a.t)`。範囲の「（Aさん・Bさんと）」は残す。
- Test: `tools/nakama-test.mjs` に追加

**Interfaces:**
- Consumes: Task 1 の `fellowsHtml(t, c, all)`

- [ ] **Step 1: 試験を足す**（試作データ・幅375／1280・くわしい表示）
  - `12 区域カードのカード`：区域カードのタブで、手伝う区域の `.tcard` に `.fellows` があり「あなたをふくめ」。担当者の自分のカードには `.fellows` がない（回帰）。
  - `13 範囲があるとき`：myPart を作る → 「今日のあなたの範囲があります（…と）」と `.fellows` の両方。
  - `14 地図の帯`：`openTerr(t.id)` → `#legendInfo .fellows`。
  - `15 留守宅カード`：手伝うカードの `.tcard.away .fellows`／`openAwayCard(c.id)` → `#cardBar .fellows`。
  - `16 お知らせ`：未読のお知らせ（区域カードの上・ホーム）に `.fellows`。［ほか n人］を押したあと「わかりました」を押すとお知らせが消える（Review Focus 5）。
  - `17 ［ほか n人］`：押すと名前が全員になりボタンが消える。ほかのカードの開閉はおきない。
  - `18 はみ出し`：幅375で20人 → `document.documentElement.scrollWidth <= 375`。
  - `19 回帰`：担当者の「今日回る人（n人）：」の行・「今日回る人をえらぶ」「回る範囲を分ける」ボタンが今までどおり。
- [ ] **Step 2: 失敗を確かめる** → 12〜17 が NG。
- [ ] **Step 3: 実装** 上の5か所。
- [ ] **Step 4: 合格を確かめる** → 1〜19 OK・エラー0。
- [ ] **Step 5: コミット** `feat: くわしい表示で、今日回る仲間を出す`

### Task 3: 簡単表示に出す（kantan.js）

**Files:**
- Modify: `kantan.js`
  - `window.cardHtml`（196 の「一緒に回ります」のある所）：`!own && !lead` のとき、`tbody` の中に `fellowsHtml(t)`。
  - `window.awayCardHtml`：kind==='help' のとき `tbody` に `fellowsHtml(t, c)`。
  - `simpleLegend`：`#kLgKeep` のあと（`!own && !lead` のとき）に `fellowsHtml(r.t)`。
- Test: `tools/nakama-test.mjs` に追加

- [ ] **Step 1: 試験を足す**（簡単表示に切りかえて）
  - `20 簡単：区域カード・留守宅カード・地図の帯` に `.fellows`。
  - `21 簡単：今日のあなたの範囲の行（kLgKeep に移す）が残る`（回帰）。
- [ ] **Step 2: 失敗を確かめる** → 20 が NG。
- [ ] **Step 3: 実装**
- [ ] **Step 4: 合格を確かめる** → 1〜21 OK。
- [ ] **Step 5: コミット** `feat: 簡単表示でも、今日回る仲間を出す`

### Task 4: スペイン語・版・お知らせ・回帰

**Files:**
- Modify: `i18n-es-tenken.js`（最後の `});` の前に「// 今日回る仲間（2026.13.152）」として）
  - "今日このカードを回る人（あなたをふくめ{0}人）：" → "Hoy recorren esta tarjeta ({0} con usted): "
  - "司会" → "Dirige"、"担当" → "Responsable"、"ほか{0}人" → "{0} más"
  - CHANGELOG の文の訳
- Modify: `app.js`（APP_JS_VER・CHANGELOG の先頭に `{ v: '2026.13.152', items: [['人', '「今日回る人」にえらばれた人の画面にも、同じカードを今日回る人（司会と仲間）が出るようにしました。']] }`）、`index.html`（app-version）、`sw.js`（APP_CACHE `kuiki-app-v152` とコメント）
- Test: `tools/nakama-test.mjs` に追加

- [ ] **Step 1: 試験を足す** `22 スペイン語の画面`：`?lang=es` で開き、`.fellows` に「今日」「人」などの日本語が残らない（名前の部分 data-notr はのぞく）。`23 版がそろう`：app-version・APP_JS_VER・APP_CACHE の数字が 152。
- [ ] **Step 2: 失敗を確かめる** → 22・23 NG。
- [ ] **Step 3: 実装**
- [ ] **Step 4: 合格と回帰** `node tools/nakama-test.mjs`（1〜23 OK）。あわせて今ある試験 `tools/rusu-hyouji-test.mjs`・`tools/swipe-tap-test.mjs`・`tools/muki-zure-test.mjs` を動かし、main（df78900）と同じ結果であること。`node --check app.js kantan.js i18n-es-tenken.js sw.js`。
- [ ] **Step 5: コミット** `chore: 2026.13.152（スペイン語・お知らせ・版）`

### 最後：独立監査
- 別のエージェント（この会話を見ていない）に、spec と差分と `tools/nakama-test.mjs` を渡して監査（回帰・XSS・権限・見え方）。Critical／High があれば直してから報告。
- push して PR を作る（マージしない）。プロジェクトに実装メモ `claude/kyou-mawaru-hito-jissou-20261115.md`。
