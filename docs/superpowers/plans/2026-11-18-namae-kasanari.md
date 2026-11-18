# 地図の名前の重なりを減らす　実装計画（2026-11-18）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 地図の建物の名前（紫の枠）と目印（紺の四角＋太字）を、同じ場所なら建物の名前だけに、重なるなら大事なほうだけにして、名前が重ならないようにする。

**Architecture:** 名前と目印の印を描くところを chizu.js の `placeNames()` 1か所にまとめる。app.js の `houseNameLabels` は建物の名前の候補を `window.HOUSE_NAMES` に置いて `placeNames` を呼ぶだけにする。`placeNames` は二重をまとめ、順番に並べ、画面の上の四角で重なりを調べてから描く。

**Tech Stack:** 素の JavaScript（ビルドなし）・Leaflet 1.9.4・Playwright（試験）・GitHub Pages。

**Spec:** プロジェクトの資料 `claude/namae-kasanari-sekkei-20261118.md`（repo には Task 0 で `docs/superpowers/specs/2026-11-18-namae-kasanari-design.md` として入れる）。要件 NK-1〜NK-11。

## Global Constraints

- 見た目は変えない：`.hname`・`.lm-label`・`.lmchip` の CSS、pane（建物の名前＝labelPane、目印の名前＝lmLabelPane、目印の印＝lmPane）、zIndexOffset、目印の名前の薄さ（nop）、目印は10文字＋「…」、建物は140px で「…」。
- ボタン・設定・文言は増やさない（お知らせ1項目とそのスペイン語だけ）。
- 二重：50m以内（`mDist`）かつ `sameName`。同じなら**建物の名前を残し、目印は印も名前も出さない**。
- 順番：拡大した地図（`z >= nameZoomNow() - 0.05`）は ①えらんだ区域の建物 ②ほかの建物 ③目印。縮めた地図は ①目印 ②えらんだ区域の建物 ③ほかの建物。目印どうしは今の `lmPri` 順。
- いちばん拡大（`z >= map.getMaxZoom() - 0.05`、今は20）は重なっても全部出す（二重の目印は出さないまま）。
- 拡大15未満は、名前を置けた目印だけ印を出す（会館はいつも）。
- 版：2026.13.160（index.html の meta、app.js の `APP_JS_VER`、sw.js の `APP_CACHE = 'kuiki-app-v160'`）。ほかのPRが先に160を使ったら次の番号。
- 試験は試作モード（`apiUrl:''`）＋Playwright。`python3 -m http.server 8765` でリポジトリを出して `node tools/xxx.mjs 8765`。
- 既存の機能を無くさない（R A さんの方針）：Task 0 の棚卸しを main で保存し、Task 2・3 のあとに `--check`。

## Review Focus

1. 目印を「切」にしても（凡例の「目印を出す」）、建物の名前は今までどおり出る（今の `lmRender` は「切」で早く戻るので、そのまま移すと建物の名前まで消える）。→ Task 3 の試験 T8。
2. 線引き・特別区域の分け方（mode が draw・sen・tok）に入ったとき、前の建物の名前が地図に残らない（建物の名前が houseLayer から別の層に移るため）。→ Task 2 の試験 R2。
3. アプリを開いて最初に地図を出したとき、地図を動かさなくても名前が出る（`lmGroup` ができる前に `placeNames` が呼ばれても落ちない）。→ Task 2 の試験 R3。
4. かんたん表示（目印の名前16px）・幅375pxで、出ている名前の DOM の四角どうしが本当に重ならない（文字の幅の見積もりが実物と合っている）。→ Task 3 の試験 T12。
5. 地図を回したとき（`setMapDeg(45)`）も、出ている名前どうしが重ならない。→ Task 3 の試験 T11。

---

### Task 0: 作業の準備と、main での棚卸し

**Files:**
- Create: `tools/namae-fixture.mjs`（試験の場面づくり。Task 2・3 の試験と棚卸しで使う）
- Create: `tools/namae-tanaoroshi.mjs`
- Create: `tools/namae-tanaoroshi-before.json`（main で保存）
- Create: `docs/superpowers/specs/2026-11-18-namae-kasanari-design.md`（プロジェクトの設計の写し）
- Create: `docs/superpowers/plans/2026-11-18-namae-kasanari.md`（この計画）

**Interfaces:**
- Produces: `openPage(b, port, { w=390, simple=false } = {}) -> { pg, ctx, errs }`（試作モードで開き、splash を消し、くわしい／かんたんにする。地図の画像・フォント・GAS は止める。手本：tools/map-default-test.mjs）
- Produces: `setupFixture(pg) -> { groups:{A..H:{center:[lat,lng]}}, items:[{ text, kind:'h'|'lm', group, lat, lng, dup?:true }] }`。試作の家の名前（label）をすべて空にしてから、下の家と目印を足し、`Store.save()`、`IDB.set('lm_v1', { rev:1, items })`（目印は `{ id, name, kind, lat, lng, src:'', rev:1 }`）、再読み込み、`showView('map')`、区域 t1 をえらぶところまで行う。
- Produces: `visibleNames(pg) -> [{ text, kind:'h'|'lm', r:{left,top,right,bottom} }]`（`.leaflet-marker-icon.hname span` と `.leaflet-marker-icon.lm-label span` で、画面に見えているもの）と `visibleMarks(pg) -> string[]`（`.lm-mark .lmchip` の文字）。

場面（試作の区域：t1 = 緯度 26.1600〜26.1640・経度 127.6720〜127.6765、t2 はその東 〜127.6810、t3 はその南 26.1560〜26.1600）。組と組は緯度で80m以上、同じ緯度なら経度で350m以上はなす（拡大15.5でも、ほかの組の名前と重ならないように）。家は `type:'house'`（apt は `type:'apt'`、`units:['101']`）。「何m」は組の中心からのずれ。

| 組 | 中心 | 家（kind・区域） | 目印（kind） | 確かめること |
|---|---|---|---|---|
| A 二重・同じ | 26.1635, 127.6730 | 宜保公民館（hall・t1）、宜保ハイツ（apt・t1・5m東） | 宜保公民館（kominkan・20m北）dup | T1・T1b・T2 |
| B 二重・全角半角 | 26.1620, 127.6730 | ファミリーマート 宜保（conv・t1） | ﾌｧﾐﾘｰﾏｰﾄ宜保（shop・15m北）dup | T1 |
| C 二重・ふくむ | 26.1605, 127.6730 | すみれ児童公園（gov・t1） | すみれ児童公園北（park・25m北）dup | T1 |
| D 同じ名前で60m | 26.1590, 127.6740 | にこにこ公園（gov・t3） | にこにこ公園（park・60m南） | T3 |
| E ちがう名前 | 26.1575, 127.6740 | ホワイトニング店（shop・t3） | 白ゆり公園（park・5m東） | T4 |
| F 目印どうし | 26.1563, 127.6740 | ― | 会館（kaikan）、ローソン豊見城（shop・5m東） | T6 |
| G 区域の中と外 | 26.1612, 127.6765 | アパートA棟（apt・t1・経度127.67645）、アパートB棟（apt・t2・経度127.67655） | ― | T5 |
| H 名前を出す範囲 | 26.1635, 127.6790 | さくら商店（shop・t2） | さくら商店（shop・10m北） | T10 |

家9・目印8。組 A は「宜保ハイツ」を「宜保公民館」より先に `D().houses` に入れる（T1b が、並びの順ではなく二重の順番で決まることを確かめるため）。

- [ ] **Step 1: 書きこめる形で repo をつなぐ**：`add_repo`（access:"push"）→ `/home/claude/kuiki-map` に clone、`git switch -c feat/namae-kasanari-20261118`（main 34c89db 以降）。
- [ ] **Step 2: `tools/namae-fixture.mjs` を書く**（上の Interfaces と場面）。
- [ ] **Step 3: `tools/namae-tanaoroshi.mjs` を書く**（`--save ファイル`／`--check ファイル`、手本：tools/haguruma-tanaoroshi.mjs）。集めるもの：
  - 歯車「地図」の画面の名前の部品：`[data-ui="aptName"]`・`[data-ui="fcName"]`・`[data-ui="nameScope"]`・名前のスライダー（aptZoom・fcZoom・lmNameZ）・凡例の `#lmOnChk`。それぞれ tag・data-ui・data-v・文字。
  - 区域 t1 をえらんだとき／えらんでいないときの、組 A〜H の中心で、拡大 14・16・18 の `visibleNames` の文字と種類、`visibleMarks`。
  - 名前ごとに、その場所を中心に拡大20にしたときに見えるか。
  - `--check`：①部品が全部同じ ②拡大20で、before に見えていた名前が全部見える（ただし dup の目印の名前は、同じ組の建物の名前が見えていればよい）。③ほかの拡大の差は「わざと変えたもの」として一覧を出す（不合格にはしない）。①②が足りなければ終了コード1。
- [ ] **Step 4: main のコードで保存**：`node tools/namae-tanaoroshi.mjs --save tools/namae-tanaoroshi-before.json`。期待：エラーなしで保存。拡大20で、場面の全部の名前（家9・目印8）が見えている。
- [ ] **Step 5: 設計と計画を repo に入れて commit**。

### Task 1: 名前を比べる・置き場所を決める部品（chizu.js の KZ）

**Files:**
- Modify: `chizu.js`（純粋な部品のところ、`const KZ = {...}` の前）
- Test: `tools/namae-kz-test.mjs`（node だけで動く。`createRequire(import.meta.url)('../chizu.js')`）

**Interfaces:**
- Produces: `nameKey(s: string): string` — NFKC、小文字、空白（全角の空白もふくむ）を消す。
- Produces: `sameName(a: string, b: string): boolean` — `nameKey` が同じか、片方がもう片方をふくむ（ふくまれるほうが `Array.from` で2文字以上）。どちらかが空なら false。
- Produces: `layoutNames(boxes: Array<{ r:[x1,y1,x2,y2] }>, force: boolean): boolean[]` — boxes は順番の高い順。前から置き、すでに置いた四角と重なる（`a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]`）ものは false。force なら全部 true。
- Produces: `nameRank(kind: 'h'|'lm', inSel: boolean, zoomedIn: boolean): number` — 拡大した地図：区域の中の建物0・ほかの建物1・目印2。縮めた地図：目印0・区域の中の建物1・ほかの建物2。
- 4つとも `KZ` に足す（`window.KZ` と `module.exports` で外に出る）。

- [ ] **Step 1: 試験を書く**（`tools/namae-kz-test.mjs`、OK/NG を出し、NG があれば終了コード1）
  - `nameKey('ﾌｧﾐﾘｰﾏｰﾄ　宜保') === 'ファミリーマート宜保'`
  - `sameName('ファミリーマート宜保中央店', 'ファミリーマート宜保') === true`
  - `sameName('ＡＢＣ', 'abc') === true`
  - `sameName('宜保公民館', '宜保公園') === false`
  - `sameName('宜', '宜保公民館') === false`（ふくまれるほうが1文字）
  - `sameName('', '') === false`
  - `layoutNames([{r:[0,0,10,10]},{r:[5,5,15,15]}], false)` → `[true,false]`
  - 辺がふれるだけ `[{r:[0,0,10,10]},{r:[10,0,20,10]}]` → `[true,true]`
  - つながり `A`と`B`が重なり、`B`と`C`が重なり、`A`と`C`は重ならない → `[true,false,true]`
  - force → `[true,true]`
  - `nameRank('h',true,true)===0`、`nameRank('h',false,true)===1`、`nameRank('lm',false,true)===2`、`nameRank('lm',false,false)===0`、`nameRank('h',true,false)===1`、`nameRank('h',false,false)===2`
- [ ] **Step 2: 走らせて失敗を確かめる**：`node tools/namae-kz-test.mjs` → NG（関数がない）。
- [ ] **Step 3: 4つの部品を書く**（chizu.js の `mDist` の近く）。
- [ ] **Step 4: 走らせて全部 OK**：`node tools/namae-kz-test.mjs`。
- [ ] **Step 5: commit**。

### Task 2: 名前を描くところを1つにする（見た目・動きは変えない）

ここでは置き場所の判定はまだ入れない。建物の名前も目印も、今とまったく同じに出ることを棚卸しで確かめる（作りかえだけ）。

**Files:**
- Modify: `app.js` `houseNameLabels`（4434行あたり）と `renderHouses`（4358行あたり、線引き中の早い return）
- Modify: `chizu.js` `lmEnsureLayer`・`lmRender`（487〜535行あたり）
- Test: `tools/namae-kasanari-test.mjs`（このタスクでは R1〜R3）

**Interfaces:**
- Produces（app.js・グローバル）：`drawHouseName(c, layer)` — 今の `L.marker(...)` と同じもの（className `c.cls`、html `<span class="${c.fc ? 'fc' : ''}">${esc(c.text)}</span>`、iconSize [0,0]、pane 'labelPane'、interactive/keyboard false、zIndexOffset `c.zOff`）を layer に足す。
- Produces（app.js）：`houseNameLabels` は候補 `c = { lat, lng, text, cls, fc, out, dot, inSel, zOff }` の配列を作る（`dot` は cls に ' dot' が入るとき true）。`inSel` は `!!sel && houseInTerr(h, sel)`（sel = `selTerrId()`、薄くするかどうかの `out` とは別）。どの return でも `window.HOUSE_NAMES = cands` にして、`window.placeNames` があれば呼ぶ。なければ `cands.forEach(c => drawHouseName(c, houseLayer))`（今と同じに描く）。
- Produces（chizu.js）：`placeNames()` を `window.placeNames` として出す。`lmRender` は `placeNames` を呼ぶだけにする（今 `lmRender` を呼んでいる所・「速さを測る」はそのまま）。

- [ ] **Step 1: 試験 R1〜R3 を書く**（`tools/namae-fixture.mjs` を使う）
  - R1：場面で区域 t1 をえらび、組 A・E の中心で拡大18 → 建物の名前（`.hname span`）と目印の名前（`.lm-label span`）が、棚卸しの before と同じ文字の組で出る。
  - R2：`setMode('draw')` → `.hname` が0個。`setMode('normal')` にもどす → また出る。
  - R3：再読み込みして地図を開いた直後（動かさない）に `.hname` が1個以上、JS のエラーなし。
- [ ] **Step 2: 走らせる**：`node tools/namae-kasanari-test.mjs 8765` → R1・R3 は今の main でも OK、R2 も OK のはず（作りかえの前の確かめ）。
- [ ] **Step 3: app.js を直す**：`drawHouseName` を分け、`houseNameLabels` を候補づくり＋`window.HOUSE_NAMES`＋`placeNames` 呼び出しにする。`renderHouses` の線引き中の return の前に `houseNameLabels(null, false)` を足す（mode が normal でないので空の候補になる）。
- [ ] **Step 4: chizu.js を直す**：`placeNames()` を作る。
  - はじめに `lmEnsureLayer()`（lmGroup がなければ作る）。`lmGroup.clearLayers()`。
  - 目印：今の `lmRender` の中身をそのまま（`lmOn()` が「切」・目印0件なら**目印だけ**とばす。早く return しない）。
  - 建物の名前：`(window.HOUSE_NAMES || []).forEach(c => drawHouseName(c, lmGroup))`。
  - 地図を回したときの画面の位置 `scr` は、関数 `scrPt(latlng)` として外に出す（Task 3 でも使う）。
- [ ] **Step 5: 走らせる**：`node tools/namae-kasanari-test.mjs 8765` → R1〜R3 OK。`node tools/namae-tanaoroshi.mjs --check tools/namae-tanaoroshi-before.json` → ①②OK、③の差が**0件**（作りかえだけなので）。
- [ ] **Step 6: commit**。

### Task 3: 二重をまとめ、重なったら出さない

**Files:**
- Modify: `chizu.js` `placeNames`
- Test: `tools/namae-kasanari-test.mjs`（T1〜T13 を足す）

**Interfaces:**
- Consumes: `nameKey`・`sameName`・`layoutNames`（Task 1）、`window.HOUSE_NAMES`・`drawHouseName`・`scrPt`（Task 2）、app.js の `nameZoomNow()`（なければ17）、`mDist`。
- Produces（chizu.js 内）：`nameRect(kind:'h'|'lm', p:L.Point, text:string, o:{ out?, dot?, simple? }): [x1,y1,x2,y2]`
  - 建物：`fs = o.out ? 11 : 12`、太さ `o.out ? 400 : 700`、書体 `"BIZ UDPGothic",sans-serif`、ふち `b = o.out ? 1 : 1.5`、上 `o.dot ? 9 : 20`。幅 `min(測った幅 + 12 + 2b, 140)`、高さ `fs*1.5 + 2b`。
  - 目印：`fs = o.simple ? 16 : 14`、太さ700、書体は `getComputedStyle(map.getContainer()).fontFamily`、上14、幅は測った幅＋2、高さ `fs*1.3`。
  - 文字の幅は canvas の `measureText`（書体＋文字で覚えておく Map）。四角は p を中心に左右へ半分ずつ。上下左右に2pxの余白を足す。

`placeNames` の流れ：
1. 目印の候補（今の条件・`lmPri` 順・200件まで）と、建物の候補（`HOUSE_NAMES`）を作る。`zoomedIn = z >= nameZoomNow() - 0.05`。順番は `nameRank`。
2. 二重：目印ごとに、`mDist <= 50` で `sameName` の建物を探す。あれば目印に `dup`（印も名前も出さない）、その建物の順番を `Math.min(建物の順番, 目印の順番)` にする。
3. 順番の小さい順に、同じ順番の中は元の並び（目印は `lmPri` 順、建物は `HOUSE_NAMES` の順）をくずさずに並べる。
4. 名前を出すもの（建物の名前全部、`nop > 0` の目印の名前）の四角を作り、`layoutNames(boxes, z >= map.getMaxZoom() - 0.05)`。
5. 描く：目印の印は `dup` でなく、（拡大15以上か会館）または名前を置けたとき。名前は置けたものだけ。建物の名前は `drawHouseName(c, lmGroup)`。今の目印どうしの重なりの判定（`cull = z < 16` と `placed`）は消す。

- [ ] **Step 1: 試験を足す**（区域 t1 をえらんだ場面。`base = await pg.evaluate(() => nameZoomNow())`。見る場所は各組の中心）
  - T1：組 A・B・C、拡大18で、建物の名前だけ出る。その目印の名前も印も出ない。
  - T1b：組 A、`base - 0.5` で「宜保公民館」（建物）が出て「宜保ハイツ」は出ない（二重で目印の順番をもらうため）。
  - T2：組 A・B・C、拡大20でも、dup の目印は出ない。
  - T3：組 D、拡大18で、建物と目印の「にこにこ公園」が両方出る。
  - T4：組 E：`base + 1` では「ホワイトニング店」だけ、`base - 0.5` では「白ゆり公園」だけ、拡大20では両方。
  - T5：組 G：`base + 1` で「アパートA棟」だけ出る。拡大20では両方。
  - T6：組 F：拡大18で「会館」が出て「ローソン豊見城」は出ない。拡大14では「ローソン豊見城」の印（店）も出ない、「会館」の印（会）は出る。
  - T7：組 A〜H で、拡大を 15〜20 まで 0.5 ずつ変えて、dup でない目印が「名前だけ出て印がない」ことがない。
  - T8：`lsSet('kuiki_lm_on','0')` → `renderHouses()` → 組 A・B・C で建物の名前が出る、目印は0。
  - T9：歯車で fcName を「出さない」→ 組 A・B・C の目印が名前と印で出る（建物の名前が出ないため）。
  - T10：nameScope「えらんだ区域だけ」→ 組 H の目印「さくら商店」が名前と印で出る（t2 の家の名前は出ないため）。
  - T11：`setMapDeg(45)` → 拡大 16・18 で、出ている名前の DOM の四角どうしが1pxより多く重ならない。
  - T12：かんたん表示・幅375pxで、拡大 15・16・17・18・19 で同じく重ならない。くわしい表示・幅390pxでも同じ。
  - T13：JS のエラーなし（全部の場面）。
- [ ] **Step 2: 走らせて失敗を確かめる**：T1・T1b・T2・T4・T5・T6 が NG（今は二重も重なりも出る）。T11・T12 も NG のはず。T3・T7〜T10・T13 は今でも OK。
- [ ] **Step 3: `nameRect` と `placeNames` の判定を書く**（上の流れ）。
- [ ] **Step 4: 走らせて全部 OK**：`node tools/namae-kasanari-test.mjs 8765`。
- [ ] **Step 5: 棚卸し**：`node tools/namae-tanaoroshi.mjs --check tools/namae-tanaoroshi-before.json` → ①②OK。③の差が、二重と重なりで消した名前だけであること（一覧を報告に貼る）。
- [ ] **Step 6: commit**。

### Task 4: 速さ・お知らせ・版・全部の試験

**Files:**
- Create: `tools/namae-perf.mjs`
- Modify: `app.js`（`CHANGELOG` の先頭、`APP_JS_VER`）、`index.html`（`meta app-version`）、`sw.js`（`APP_CACHE`）、`i18n-es-chizu.js`（最後の `});` の前）

- [ ] **Step 1: `tools/namae-perf.mjs [ポート]` を書く**：試作モードで家3万軒（試作の区域のまわりにばらまく。1%は kind `shop` で名前「テスト店N」、3%は apt で「テスト荘N」）と目印300件を足し、拡大15と17・区域t1をえらんだとき／えらばないときで、`renderHouses()` と `lmRender()` をそれぞれ10回の平均で出す。
- [ ] **Step 2: main と比べる**：main を `git worktree add /tmp/main origin/main` して 8766 で出し、両方で走らせる。期待：`renderHouses` の平均の差が +10ms 以内、`lmRender` が30ms未満。数字を報告に書く。
- [ ] **Step 3: お知らせと版**：
  - CHANGELOG の先頭に `{ v: '2026.13.160', items: [['地', '地図の名前が重ならないようにしました。同じ場所の目印と建物の名前は、建物の名前だけを出します。重なるときは、縮めた地図では目印を、拡大した地図では建物の名前を先に出します。いちばん拡大すると、全部の名前が出ます。']] }`
  - i18n-es-chizu.js：同じ文 → `"Los nombres del mapa ya no se superponen. Si un punto de referencia y un edificio son el mismo lugar, solo se muestra el nombre del edificio. Cuando se superponen, con el mapa alejado se muestran primero los puntos de referencia y con el mapa acercado, los edificios. Con el zoom máximo se muestran todos los nombres."`
  - 版を 2026.13.160 に（3か所）。
- [ ] **Step 4: 全部の試験**：`for f in tools/*-test.mjs; do node $f 8765; done`、`node tools/namae-kz-test.mjs`、今までの棚卸しの `--check`（haguruma・morau・genzaichi-kiroku の before.json）、`node tools/namae-tanaoroshi.mjs --check ...`。期待：NG 0。
- [ ] **Step 5: スペイン語で開いて**、お知らせが日本語のまま残らないことを確かめる（`KUIKI_CONFIG.lang:'es'`）。
- [ ] **Step 6: commit・push・PR**（本文に、確かめたこと／未確認（実機・本物のデータの二重の数）を分けて書く）。
- [ ] **Step 7: 独立監査**（別のエージェント・いちばん力のあるモデル）：main と比べて機能が消えていないかを最初に。Critical / High / Important が残るあいだはマージしない。マージは R A さんの指示で。
