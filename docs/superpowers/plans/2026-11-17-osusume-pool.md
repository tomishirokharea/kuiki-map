# おすすめの出し方の作り直し 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** おすすめタブに出す家を「完了した区域の残り」から「留守宅カードにして返してあり、だれも持っていない区域の、回り残しと会えなかった家」に置きかえ、区域をまたいで近い数軒にまとめ、押さえ（今行く・予定に入れる）を全体でなくす。

**Architecture:** 画面（kuiki-map）の app.js に区域の判定 `poolOpen(t)` を置き、`leftOf(t)` を留守宅カードの区域でも使えるようにする。kangaeru.js の `afterItems` はこの2つと `unmetIndex`・`awayOk` だけで家をえらび、`buildClusters` は全体から起点に近い順に数軒ずつまとめる。押さえは画面（`liveHolds()` が空）とサーバー（`ruleHold_` が新しい押さえを受け取らない）の両方で止める。

**Tech Stack:** 素の JavaScript（GitHub Pages）、Google Apps Script（auto/gas/Code.gs）、試験は Node（tests/server・tests/site）と Playwright（tests/e2e）。

**Spec:** プロジェクトの資料 `claude/osusume-pool-sekkei-20261117.md`（R1〜R9・保留1/2）と `claude/osusume-pool-hikitsugi-20261117.md`

## Global Constraints

- 版：2026.13.158 → **2026.13.159**。index.html の app-version ＝ app.js の APP_JS_VER ＝ sw.js の `kuiki-app-v159`（tests/site/mamori-b-logic T-B5-7）
- 1回目の目安は係の `donePct`（今は90%）。決め打ちしない
- 保留1：特別区域（`isSpecial(t)`）は出さない。保留2：重点の時間帯の印（`focusSlots`・「区域係のおすすめ」）は今のまま
- 設定の値は消さない（extRest・extCap・extDays・extStopBefore・osaeMax・osaeDays は画面から外すだけ。app.js の既定値・サーバーの設定はそのまま）
- 押さえの古いデータ（D().holds・シートの holds）は消さない（毎月の整理で消える）。画面とサーバーは無視する
- 既存の機能を消さない：留守宅カードの受け取り・返却・正式返却、地図の「地図で見る」、かんたんモード、スペイン語、自分の予定（カレンダー）、重点の印、雨の日、夜・オートロックの設定、並べかえ（近い順・長く訪ねていない順）
- ほかの人の再訪問・押さえの持ち主など、個人が分かる情報を新しく画面に出さない
- 画面の言葉はやさしい日本語。新しい文はすべてスペイン語の辞書（i18n-es-osusume.js）にも入れる

## Review Focus

1. 同じ家が区域の境目にあり、近くの区域の家と1つのおすすめに入るとき：地図で両方の区域の線が出て、番号のついた家をすべて押して記録でき、「この区域を回っていますか」の確認が出ない → Task 3 の E-9
2. おすすめを開いたまま、ほかの人がその区域の留守宅カードを受け取ったとき：次に一覧を作り直すと、その区域の家が消える → Task 3 の E-3
3. 古い端末が押さえ（holds）を送ってきたとき：サーバーが断り、画面は「受け付けられませんでした」のあと、カレンダーの予定も消える（今の M14 の動き）→ Task 1 の S-1 と、mamori-b T-B10（そのまま）
4. 押さえを入れた古い予定がカレンダーに残っているとき：「地図をひらく」で、その家を見るだけの地図が開く（エラーにならない）→ Task 3 の E-11
5. 起点（今いる所）がないとき：いちばん長く訪ねていない家から始めて、区域をまたいでまとめる（落ちない） → Task 3 の E-6

---

### Task 1: サーバー：押さえを受け取らない・おすすめの区域の仮の家を消せる

**Files:**
- Modify: `auto/gas/Code.gs`（ruleHold_・ruleAwayCard の holds の busy・heldHouse_・houseCanDel）
- Create: `auto/tests/server/osusume-pool.test.js`

**Interfaces:**
- Produces: `poolOpenTerr_(ctx, tid) -> boolean`（担当者なし・awayPoolAt あり・試験用でない・特別区域でない・受け取り中の留守宅カードがない）

- [ ] **Step 1: 試験を書く**（tests/lib/env.js の E.sync を使う。区域 TP＝留守宅カードにして返した区域、TC＝完了した区域）
  - S-1：uB が新しい押さえ（TC・kind now）を送ると `holds:<id>` が rejected、シートに入らない。同じ送信の訪問記録は入る
  - S-2：前からある押さえ（by uB）の endedAt を uB が送ると受け付ける（古い端末の「やめる」）
  - S-3：前からある生きている押さえの家を含む留守宅カードを uC が受け取れる（押さえを無視）
  - S-4：記録も印もない仮の家（TP の家）を、担当でも作った人でもない uC が消せる。TP に受け取り中の留守宅カードがあると断られる。TC・ふつうの貸出中の区域の仮の家は今までどおり断られる。記録のある仮の家は断られる（H8）
  - S-5：古い押さえ（TC・生きている）があっても、その仮の家を uC は消せない（押さえは無視）
- [ ] **Step 2: 走らせて落ちることを確かめる**　`node tests/server/osusume-pool.test.js` → S-1・S-3・S-4・S-5 が不合格
- [ ] **Step 3: 実装**　ruleHold_：`old` がない（新しい押さえ）は `return null`。awayCards の `ctx.col('holds')…busy` の行を外す。heldHouse_ は `return false`（中身は残さない）。houseCanDel：`if (c && c.data.prov && poolOpenTerr_(ctx, c.data.terrId)) return true;` を heldHouse_ の行の代わりに置く
- [ ] **Step 4: 走らせて通ることを確かめる**　`node tests/server/osusume-pool.test.js`、ほかの tests/server/*.test.js も全部合格（h8 T8-2・kumi-c C1-3 は今までどおり）
- [ ] **Step 5: コミット**

### Task 2: 画面の論理：おすすめに出す区域と家

**Files:**
- Modify: `kuiki-map/app.js`（recoState の近く：poolOpen を足す、leftOf、liveHolds、recoLabel の文）
- Test: `auto/tests/e2e/osusume-pool.e2e.js`（Task 3 と同じファイル。E-1〜E-5 をここで先に書く）

**Interfaces:**
- Produces（app.js のグローバル）:
  - `poolOpen(t) -> boolean`：R1・R2。`t && t.awayPoolAt && !t.holder && !t.dummy && !isSpecial(t) && !t.paperLentAt && !t.recLess && !activeCards().some(c => c.terrId === t.id) && poolPct1(t) >= donePct && !(rec && (rec.low || rec.lowOk))`（rec＝`D().returns` の `t.poolRetId`。係の端末にしかない）
  - `poolPct1(t) -> number`：`coverAt(t, roundBounds(t.id).start, t.lastFirstAt || t.awayPoolAt)`
  - `leftOf(t) -> [{ k, h, u, lastAt }]`：完了した区域は今まで（b.ext）どおり。留守宅カードの区域（`t.awayPoolAt && !t.holder`）は、巡回の始まり `roundBounds(t.id).start` から一度も訪ねていない家（最近会えた家・recLess の扱いは今と同じ）。それ以外は []
  - `liveHolds() -> []`（いつも空。押さえは無視）
- [ ] **Step 1: 試験を書く（E-1〜E-5。地図ではなく page.evaluate で `poolOpen`・`leftOf`・kangaeru の結果を見る）**
  - 区域：P1（留守宅カードにして返した・1回目95%・回り残し2軒・留守3軒）、P2（同じで、uD が留守宅カードを受け取り中）、P3（1回目85%で返した）、P4（係が目安未満で返した：返却の記録 low）、P5（紙や口頭で確かめた recLess）、P6（特別区域）、P7（試験用 dummy）、C1（完了した区域：留守と回り残しあり）、H1（uB が貸出中）
  - E-1：`poolOpen` は P1 だけ true（P2〜P7・C1・H1 は false）
  - E-2：P1 の回り残し2軒・留守3軒がおすすめの家に入り、拒否の家・訪問しない家・立入禁止の建物の部屋・自分の再訪問の家・最近会えた家は入らない
  - E-3：P1 に uD が留守宅カードを受け取ると（同期のあと）P1 の家がおすすめから消える
  - E-4：留守の家は、留守だった時間帯をえらぶと出ない（awayNoRepeat）・上限回数（awayCap）に届いた家は出ない。回り残しはどの時間帯にも出る
  - E-5：C1（完了した区域）の家はおすすめに出ない。`leftOf(C1)` は今までどおりの数（H2 の試験のため）
- [ ] **Step 2: 落ちることを確かめる**　`KUIKI_MAP_DIR=… node tests/e2e/osusume-pool.e2e.js`
- [ ] **Step 3: 実装**（app.js。recoState・afterDone・extState は残す。kangaeru.js の afterItems の区域えらびを `poolOpen(t)`、家を `leftOf(t)`＋`unmetIndex(t.id)` に、awayOk のルールを `awayRule()` にする）
- [ ] **Step 4: 通ることを確かめる**（E-1〜E-5）
- [ ] **Step 5: コミット**

### Task 3: おすすめタブ：全体から近い数軒・押さえの画面をなくす・地図

**Files:**
- Modify: `kuiki-map/kangaeru.js`（afterItems・buildClusters・cardHtml・paintMine・paintList・renderRecoView・openTerrInfo・openKF・paintKFBar・wrapFn 群・SORTS）
- Modify: `kuiki-map/app.js`（renderTerrs の `on` に `kfOnTerrs()`、既定 `function kfOnTerrs() { return null; }`）
- Test: `auto/tests/e2e/osusume-pool.e2e.js`（E-6〜E-14）

**Interfaces:**
- Consumes: Task 2 の `poolOpen`・`leftOf`・`liveHolds`
- Produces:
  - 1つのおすすめ（cluster）：`{ kind: 'after', t（最初の家の区域）, ts（区域の配列・番号順）, stops, keys, n, dist, mins, last, rank, rain, focus, left, prov }`。title は `区域{番号を「・」でつなぐ}の家 {n}軒`
  - `openKF({ keys, since? })`：KF に `tids`（keys の家の区域・重なりなし）を持つ。`KF.tid = tids[0]`
- [ ] **Step 1: 試験を書く**
  - E-6：起点なし・起点あり（会館）で、全体の家から recoCount 軒ずつまとまり、1つ目は起点にいちばん近い家を含む。2つの区域の境目の家どうしが1つのおすすめに入る（タイトルに両方の番号）
  - E-7：おすすめのカードに「今行く」「予定に入れる」がなく「地図で見る」がある（くわしい・かんたんの両方）。「あなたの予定」に押さえの行が出ない。区域のようすの画面にも「今行く」「予定に入れる」が出ない（おすすめから開いたとき）
  - E-8：設定（係）に「寝かせる日数」「1軒あたりの回数（完了のあと）」「おすすめに出す期間」「次の新規の前に止める」「押さえられる予定の数」「何日先まで」がなく、「1つのおすすめに入れる家の数」「回り残しの家も出す」「オートロックの建物も出す」はある。状況に「完了した区域」の表が出ない。設定の値（extRest など）は残っている
  - E-9：「地図で見る」で、入っている区域の線がすべて濃く出て、番号の家を記録しても区域の確認が出ず、記録の src が `reco:after`
  - E-10：おすすめで P1 の留守の家を訪ね直して決めた割合（awayRetPct）に届くと、係の端末の finalizePools で P1 が正式返却（completedAt・returns の completed）になり、P1 はおすすめから消える
  - E-11：押さえ付きの古い予定（myData().events の hold）で「地図をひらく」を押すと、見るだけの地図が開き、エラーが出ない
  - E-12：市の年齢データがないときは「若い世代」の並べかえ・欄が出ない
  - E-13：スペイン語の画面で、おすすめタブ・係の設定に日本語が残らない（新しい文）
  - E-14：幅360pxで横にはみ出さない・スクリプトのエラー0
- [ ] **Step 2: 落ちることを確かめる**
- [ ] **Step 3: 実装**
  - buildClusters(items, pos, rain)：家（stop）をまとめた全体の山から、起点があれば起点にいちばん近い家、なければいちばん長く訪ねていない家を種にし、種から近い順に recoN 軒（今と同じく1つの家の部屋は続けて入れる）を1つのおすすめにする。残りでくり返す。最大40個。雨の日の集合住宅の扱い・回る順・mins・prov の数え方は今のまま
  - 押さえ：newHold・goNow・openPlanAfter・endHold・tidyHolds・myLost・holdRow・markHere を消す。paintMine は自分の予定（e.tid のある予定。hold のあるものもふくむ）だけ。openHoldById は、その押さえの家があれば `openKF({ keys, since: h.at })`（見るだけ）、なければ toast
  - cardHtml：くわしい・かんたんの両方で「地図で見る」1つ（data-kgview）
  - openTerrInfo：from.kind が 'after' のときは「予定に入れる」「今行く」を出さない（ほかから開いたときの「予定に入れる」は今のまま）
  - SORTS：`young` は youngInfo() があるときだけ。COLS も同じ
  - 文：上の説明「留守宅カードの区域で、まだ訪ねていない家と、まだ会えていない家を、近くの数軒ずつ出しています。区域をまたぐこともあります。カードを受け取らなくても回れます。」、空のとき「今出せるおすすめはありません。<br>区域が留守宅カードにして返されると、まだ訪ねていない家や、まだ会えていない家がここに出ます。」、歯車の説明「留守宅カードの区域で、まだ会えていない家を、近くの数軒ずつえらべます」
- [ ] **Step 4: 通ることを確かめる**（E-1〜E-14）
- [ ] **Step 5: コミット**

### Task 4: 係の設定・状況・言葉・版

**Files:**
- Modify: `kuiki-map/app.js`（extSetHtml・renderAwayAdmin の adAwaySet・recoLabel・APP_JS_VER）、`kimari.js`（extRest・extDays・adAwaySetH の keys）、`schedule.js`（重点の画面の完了した区域の文）、`help.js`（ja・es）、`i18n-es-osusume.js`、`index.html`（版・CHANGELOG・krgExt の見出し「おすすめ」）、`sw.js`
- Test: E-8・E-13、tests/site/mamori-b-logic（T-B5-7）

- [ ] **Step 1: 試験は Task 3 の E-8・E-13**
- [ ] **Step 2: 実装**
  - extSetHtml：はじめの説明を「留守宅カードにして返した区域（だれも持っていない）で、まだ訪ねていない家と、まだ会えていない家を、全員の「おすすめ」タブに近くの数軒ずつ出します。1回目が目安（{donePct}%）に届かずに返した区域・特別区域・試験用の区域は出しません。完了した区域は出しません。」にし、recoCount・recoLeft・recoLock の行だけ残す（recoLeft の説明は「留守宅カードの区域で、この巡回の中で一度も訪ねていない家…」）
  - renderAwayAdmin：`#adAwaySet` は空にする（extAdminHtml は消す。toggleExtStop は呼ぶ所がなくなるので消す）
  - kimari.js：extRest・extDays の行を外し、adAwaySetH の keys を `['freeAfterDays']`
  - schedule.js：完了した区域の文を「この区域は完了しています。残りの家は、次に区域カードとして受け取った人が回ります。」
  - help.js：extRest・extCap・extDays・extStopBefore・extList・osaeMax・osaeDays を消し（ja・es）、extOn・recoLeft・recoLock・recoOn の文を新しい決まりにする
  - recoLabel('reco:after')：「おすすめ（近くの数軒）」
  - 版 2026.13.159・CHANGELOG（index.html のお知らせ）
- [ ] **Step 3: 通ることを確かめる**　E-8・E-13・mamori-b-logic
- [ ] **Step 4: コミット**

### Task 5: 古い試験の直し・回帰・監査

**Files:**
- Modify: `auto/tests/e2e/kaiki.e2e.js`（R-7：recoState をやめ、「完了した区域 R5 はおすすめに出ない・leftOf は3」に）、`auto/tests/e2e/chimei3d.e2e.js`（T2-11：extAdminHtml の表がなくなったので、leftOf で同じことを確かめる）、`auto/tests/README.md`
- [ ] **Step 1: 直す**（直した理由を試験の中に書く：設計 R8 で表と recoState をなくしたため）
- [ ] **Step 2: すべての試験を走らせる**（tests/server・tests/site・tests/e2e。main でも落ちる古い試験は、main と同じ数で落ちることを確かめる）
- [ ] **Step 3: 別のエージェントで監査**（設計 R1〜R9・既存の機能が消えていないか・個人情報・性能（3万件））
- [ ] **Step 4: 指摘を直して、PR・マージ（auto を先に＝サーバー、そのあと kuiki-map）**
