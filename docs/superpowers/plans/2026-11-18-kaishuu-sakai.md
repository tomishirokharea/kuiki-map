# 会衆の境（S-54）と取りこぼしの確かめ 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 区域係が S-54 の KML を取り込むと、会衆の境が区域とは別の灰色の破線として全員の地図に出て、「全部の区域のすき間・重なりを調べる」で境の内側の取りこぼしも見つけて直せるようにする。

**Architecture:** 境はサーバーの設定 `settings.congArea`（groupPts と同じ特別扱い）に入れ、全員の端末に届ける。画面は新しいファイル `sakai.js` に、純粋な部品（KML の読み取り・点数の上限・幅の判定）と、地図の層・凡例・取り込みの画面を置く。torikomi.js は入口の2項目だけ、kyoukai.js は findIssues の checkAll に取りこぼし（k:'miss'）を足し、出し方と直し方を足す。

**Tech Stack:** 素の JavaScript・Leaflet（GitHub Pages の kuiki-map）、Google Apps Script（auto/gas/Code.gs）、polygon-clipping 0.15.7（vendor・kyoukai.js が読み込む）、JSZip（vendor・KMZ）。試験は Node（auto/tests/server・auto/tests/site）と Playwright（auto/tests/e2e）。

**Spec:** プロジェクトの資料 `claude/kaishuu-sakai-sekkei-20261118.md`（R1〜R14。点の上限は300点に変更済み）

## Global Constraints

- ブランチ：kuiki-map・auto とも `feat/kaishuu-sakai-20261118`。main に直接 push しない。マージ・本番 GAS・Pages 公開は R A さんの承認のあと。**auto を先にマージ**（R12：画面より先にサーバー）
- 版：2026.13.159 → **2026.13.160**（着手時の main を確かめ、ちがえば次の番号）。index.html の app-version ＝ app.js の APP_JS_VER ＝ sw.js の `kuiki-app-v160`（tests/site/mamori-b-logic の T-B5-7）
- 保存の形：`settings.congArea = { v: 1, n, d, at, rings: [[[緯度, 経度], …], …] }`。消したとき `{}`
- 上限：rings 20本・点の合計 **300**・rings の JSON **8,000字**・1本3点以上・緯度20〜46・経度122〜154・小数5けた・n は40字・d は `YYYY-MM-DD` か空
- サーバーの印：`SERVER_CAPS.capArea = 1`。画面は `!LIVE || Number(D().settings.capArea) === 1` のときだけ取り込める（試作モードの makeDemo の settings にも `capArea: 1`）
- 地図の層：pane `congPane`・zIndex **340**・pointerEvents none・mapPane の子（地図を回すと一緒に回る）。線は色 `#374151`（写真の地図のときは `#F3F4F6`）・太さ 2.5・破線 `10 7`・不透明度 0.65・塗りなし・interactive false
- 取りこぼしの定数（kyoukai.js の先頭）：`MISS_CORE_M2 = 1000`、`MISS_HALF_M = 10`（幅20mの半分）、`MISS_STEP_M = 10`。「区域に入れる」は `area <= GAP_MAX`（5,000㎡）かつ穴なしかつ adj あり
- 区域の数・一覧・S-13・S-12・reassign・addAt・おすすめ・留守宅カードには境を入れない（R13）
- 境がないとき、findIssues の結果と「すき間・重なりが ○か所 見つかりました」などの文は今とまったく同じ（R11）
- S-54 の試験用ファイルは **auto/tests/fixtures/s54/** だけに置く（公開の kuiki-map に置かない）
- 新しい文はすべて `i18n-es-sakai.js`（新規・index.html で i18n-es-obi.js のあと）にスペイン語を入れる。数の入る文は `{0}` の形
- 決まった文（そのまま使う）
  - 取り込みの項目：記号「境」・題「会衆の境（S-54）」・説明「会衆の区域割り当て（S-54）のKMLから、会衆の境を地図に出します。区域は変わりません」。境があるとき説明は「今：{0}（{1}）」（名前・日付。日付がなければ「今：{0}」）
  - 消す項目：記号「−」・題「会衆の境を消す」・説明「地図の境の線を消します。区域は変わりません」（境があるときだけ出す）
  - 確認画面：題「会衆の境を取り込む」、ボタン「会衆の境にする」「やめる」。点を減らしたとき「点の数が多いので、形を少しなめらかにしました（{0}点 → {1}点）」。S-54 らしくないとき「S-54 のファイルではないかもしれません（区域の線が{0}本あります）」
  - 古いサーバー：「サーバーを更新してから取り込んでください」
  - 凡例：「会衆の境（S-54）」
  - 取りこぼし：見出し「取りこぼし {0}か所」、1か所の文「{0}/{1}：境の中で、どの区域にも入っていない所（{2}・家の印 {3}軒）」、家の印が0軒のとき後ろに「。家の印はありません。地図で、家があるかを見てください」、ボタン「新しい区域の線を引く」「とばす」、出さなかった所「細い所・小さい所（境とのずれなど）{0}か所・約{1}は出していません」
- 既存の機能を消さない。既存の試験（auto/tests の server・site・e2e の kaiki・mamori-b・insatsu・ie-idou ほか）が全部、今と同じ結果

## Review Focus

1. 写真の地図に切りかえたとき：境の線が写真の上でも見える色（`#F3F4F6`）に変わり、地図にもどすと `#374151` にもどる → Task 3 の E-7
2. 地図を2本指で回したとき：境の線が区域の線と一緒に回り、ずれない（congPane が mapPane の子）→ Task 3 の E-8
3. 端末に残った境のデータがこわれているとき（rings が2点だけ・数でない・空）：エラーにならず、線を出さない → Task 3 の E-9
4. S-54 の ExtendedData に名前や日付がないとき：名前は `<Document><name>`、それもなければファイル名、日付は空で取り込める → Task 4 の P-4
5. 取りこぼしの塊の中に、ほかの区域が島のように入っているとき（穴のある塊）：家の印の数に穴の中の家を入れず、「区域に入れる」を出さない（穴の区域をのみこまない）→ Task 5 の K-2g

---

### Task 0: 準備（ブランチ・設計書と計画の写し・試験用ファイル）

**Files:**
- Create: `kuiki-map/docs/superpowers/specs/2026-11-18-kaishuu-sakai-design.md`（プロジェクトの設計書の写し）
- Create: `kuiki-map/docs/superpowers/plans/2026-11-18-kaishuu-sakai.md`（この計画の写し）
- Create: `auto/tests/fixtures/s54/tomigusuku-29280.kml`（R A さんから受け取った KML。中身は変えない）

- [ ] **Step 1:** 両リポジトリの main が最新で、kuiki-map の版が 2026.13.159 であることを確かめる（ちがえば Global Constraints の版を読みかえる）
- [ ] **Step 2:** 両方に `feat/kaishuu-sakai-20261118` を作る
- [ ] **Step 3:** 上の3ファイルを置く。fixture は `sha256sum` を控え、Polygon 1つ・座標65個（最後の点＝最初の点。重ならない点は64）・広さ約16.9km² であることを確かめる
- [ ] **Step 4:** それぞれコミット

### Task 1: サーバー：settings.congArea を保存し、全員に渡す

**Files:**
- Modify: `auto/gas/Code.gs`（DEFAULT_SETTINGS・SERVER_CAPS・saveSettings_・SETTING_LABELS・opsShow_。新しい関数 cleanCongArea_ は cleanGroupPts_ のすぐ下）
- Create: `auto/tests/server/sakai.test.js`

**Interfaces:**
- Produces: `cleanCongArea_(src) -> object | null`（正しければ整えた `{ v:1, n, d, at, rings }`、空のオブジェクトなら `{}`、まちがいなら `null`＝保存しない）。`getSettings_().capArea === 1`。`getSettings_().congArea` は全員の settingsFor_ に入る

- [ ] **Step 1: 試験を書く**（tests/lib/env.js の setup・E.sync・E.F。係 uAdm・伝道者 uA。境は fixture を正規表現で座標だけ読んで作る）
  - SK-S1：uAdm が `{ settings: { congArea: { v:1, n:'沖縄県豊見城市豊見城', d:'2024-12-11', at:<ISO>, rings:[64点の輪] } } }` を送る → `getSettings_().congArea.rings[0].length` が送った点の数、緯度経度が小数5けた、n・d・at がそのまま
  - SK-S2：そのあと uAdm が `{ settings: { donePct: 80 } }` だけ送る → congArea は同じ（JSON が一致）
  - SK-S3：`{ congArea: {} }` → `getSettings_().congArea` が `{}`
  - SK-S4：保存しない（直前の境のまま）：点が2つの輪／緯度19.9／経度154.1／輪21本／点の合計301／rings の JSON が8,000字を超える／rings が配列でない／数でない点
  - SK-S5：n が50字 → 40字に切る・制御文字を消す。d が `2024/12/11` → `''`。at が日付でない → `''`
  - SK-S6：uA（伝道者）が congArea を送る → 今の決まりどおり settings が断られ、境は変わらない
  - SK-S7：`fullFor_` の uA の state.settings に congArea と `capArea: 1` が入る。差分（kuiki-maintenance.gs の頭）でも settings に congArea が入る
  - SK-S8：古い画面の形（settings をまるごと・同じ congArea を含めて）送る → congArea は同じ
  - SK-S9：300点の境を入れたあと、settings のシートのセル（JSON）が 50,000字より十分小さい（20,000字未満）
  - SK-S10：変更履歴（operations シート）に「会衆の境」の行。変更前「なし」、変更後「沖縄県豊見城市豊見城・64点」。行に緯度経度の数（`26.1` など）が入らない
- [ ] **Step 2: 走らせて落ちることを確かめる**　`node tests/server/sakai.test.js` → SK-S1・S3〜S5・S7・S9・S10 が不合格
- [ ] **Step 3: 実装**　DEFAULT_SETTINGS に `congArea: {}`（コメントつき）。SERVER_CAPS に `capArea: 1`。saveSettings_ の loop に groupPts と同じ形で `if (k === 'congArea') { if (!('congArea' in s)) return; const v = cleanCongArea_(s.congArea); if (v) cur.congArea = v; return; }`。SETTING_LABELS に `congArea: '会衆の境'`。opsShow_ に congArea（rings がなければ「なし」、あれば「名前・点の数」）
- [ ] **Step 4: 走らせて通ることを確かめる**　`node tests/server/sakai.test.js` が全部合格。ほかの `tests/server/*.test.js` も全部、今と同じ結果
- [ ] **Step 5: コミット**（auto）

### Task 2: 画面の純粋な部品（sakai.js の前半）

**Files:**
- Create: `kuiki-map/sakai.js`（前半：純粋な部品。tochi-kugiri.js と同じく `if (typeof module !== 'undefined' && module.exports) module.exports = SK_API;`）
- Create: `auto/tests/site/sakai-logic.test.js`

**Interfaces:**
- Produces（`window.Sakai` と module.exports の両方に出す）
  - `capRings(rings, max = 300) -> { rings, before, after }`：rings は `[[[lat,lng],…],…]`。小数5けたに丸め、合計が max を超えるときは、ずれの許しを 1m から2倍ずつ大きくして全部の輪をなめらかにし（Douglas-Peucker・app.js の simplifyRing と同じ考え方を自前で）、max 以下になったら止める。3点未満になった輪は捨てる
  - `ringsAreaM2(rings) -> number`（輪の広さの合計。app.js の ringAreaM2 と同じ近似）
  - `inRing(lat, lng, ring) -> boolean`（偶奇判定）
  - `coreAreaAtLeast(outer, holes, needM2, step = 10, half = 10) -> boolean`：塊の範囲に step m 間隔で点を置き、outer の中で holes の外にあり、outer・holes のどの辺からも half m 以上はなれた点を数える。数×step² が needM2 以上になった時点で true を返す（早く止める）。最後まで届かなければ false
  - `parseS54(text, DP) -> { name, date, type, borders: { n, e, s, w }, rings, polys, network }`（DP は DOMParser。省けば window.DOMParser）。Placemark の Polygon（MultiGeometry の中も）の outerBoundaryIs の coordinates をすべて rings に（[lng,lat] → [lat,lng]、同じ点の続き・最後の閉じる点は1つに）。name：ExtendedData の Name → Placemark の name → Document の name → ''。date：LastUpdatedIso（`YYYY-MM-DD` でなければ ''）。type：ExtendedData の Type。borders：BorderNorth/East/South/West。polys：Polygon の数。network：NetworkLink があるか。こわれた XML は例外

- [ ] **Step 1: 試験を書く**（Node で `require(<kuiki-map>/sakai.js)`。fixture の座標は試験の中で正規表現で読む）
  - SL-1：fixture の輪（閉じる点を除いて64点）を capRings(…, 300) → after は64、before＝after、座標が小数5けた
  - SL-2：2,000点の円（半径2km）を capRings → after ≤ 300、形の広さの変化が1%未満
  - SL-3：3本の輪で合計900点 → after ≤ 300、3本とも残る
  - SL-4：coreAreaAtLeast：100m×100m の正方形・need 1,000 → true。5m×400m の帯 → false。5m 幅の帯の先に 40m×40m の四角がつながった形 → true。100m×100m の中に 90m×90m の穴 → false
  - SL-5：ringsAreaM2 が fixture の境で 16.5〜17.5 km²（手で計算して約16.9km²）
  - SL-6：inRing：fixture の境で（26.1773, 127.6814）は中、（26.2063, 127.6466）と（26.1612, 127.6688）は外（手で確かめた点）
- [ ] **Step 2:** `KUIKI_MAP_DIR=… node tests/site/sakai-logic.test.js` → sakai.js がないので落ちる
- [ ] **Step 3:** sakai.js の前半を書く（DOM・Leaflet・D() にさわらない部分だけ）
- [ ] **Step 4:** 試験が全部合格
- [ ] **Step 5: コミット**（kuiki-map と auto）

### Task 3: 地図の層・凡例・はじめの表示（sakai.js の後半の1）

**Files:**
- Modify: `kuiki-map/sakai.js`（後半：地図・凡例）
- Modify: `kuiki-map/index.html`（`<script src="sakai.js"></script>` を tochi-kugiri.js のすぐあと・kyoukai.js より前に。凡例の `#legendKeys` は触らず、sakai.js が1行を差しこむ）
- Modify: `kuiki-map/app.js`（makeDemo の settings に `capArea: 1` を足すだけ）
- Create: `kuiki-map/i18n-es-sakai.js`（この Task の文）、index.html に読み込み
- Create: `auto/tests/e2e/sakai.e2e.js`（E-1〜E-9。API_PORT の既定は 19420）

**Interfaces:**
- Consumes: なし（Task 2 と同じファイルに書く）
- Produces: `Sakai.rings() -> Array<ring> | null`（D().settings.congArea の rings のうち okPoly な輪だけ。なければ null）、`Sakai.info() -> { n, d, pts, nRings } | null`、`Sakai.render() -> void`（同じ内容なら描き直さない。sig は `at|輪の数|点の数|地図の種類`）、`Sakai.canImport() -> boolean`
- 包む関数（tochi-kugiri.js と同じ作法・元の動きはそのまま）：`window.renderTerrs`（あとで Sakai.render）・`window.renderLegend`（あとで凡例の1行）・`window.setBase`（あとで Sakai.render）。はじめの表示：起動時、`okPoly` な区域が1つもなく Sakai.rings() があれば `map.fitBounds(境)`（1回だけ）

- [ ] **Step 1: 試験を書く**（harness の startMock・makeSite・newDevice。M.settings({ congArea: … }) で境を入れる）
  - E-1：境あり・伝道者 uA：`map.getPane('congPane')` があり zIndex 340・pointer-events none、中に path が1本（輪の数）、stroke が `#374151`・stroke-dasharray が `10 7`、fill なし
  - E-2：区域 T1 の線が境の線と重なる場所をタップ → これまでどおり T1 がえらばれる（selTerrId() === 'T1'）。家の印のタップも今までどおり
  - E-3：凡例を開く → 「会衆の境（S-54）」の1行がある。境がない会衆では、その行がない
  - E-4：かんたんモードの人にも線が出る。線引き（mode draw）・線を直す（mode sen）の画面でも線が残る
  - E-5：境がない → congPane の中に path が0本（pane はあってよい）・JS エラー0
  - E-6：区域が1つもなく境がある → 開いた地図の範囲（getBounds）が境の範囲をふくむ。区域があるときは今と同じ（setView の中心・ズームが変わらない）
  - E-7（Review Focus 1）：setBase('photo') → stroke が `#F3F4F6`、setBase('pale') → `#374151`
  - E-8（Review Focus 2）：congPane の parentElement が `map.getPane('mapPane')`
  - E-9（Review Focus 3）：D().settings.congArea に `{ rings: [[[26.1, 127.6], [26.2, 127.7]]] }`・`{ rings: 'x' }`・`{ rings: [] }` を入れて renderAll() → エラー0・path 0本
- [ ] **Step 2:** `KUIKI_MAP_DIR=… node tests/e2e/sakai.e2e.js` → 落ちる
- [ ] **Step 3:** 実装（pane は最初の render で作る。L.polygon に `pane: 'congPane'`・`interactive: false`・`fill: false`。D() の境が変わったとき（取り込み・消す・ほかの端末から届いた設定）は renderTerrs からの呼び出しで描き直される）
- [ ] **Step 4:** sakai.e2e.js が全部合格。`kaiki.e2e.js`・`insatsu.e2e.js`・`ie-idou.e2e.js` が今と同じ結果
- [ ] **Step 5: コミット**

### Task 4: 取り込み・入れなおす・消す（sakai.js の後半の2・torikomi.js）

**Files:**
- Modify: `kuiki-map/sakai.js`（`openImport`・`clear`）
- Modify: `kuiki-map/torikomi.js`（openMake の「ファイルから」の、区域の線だけ（マイマップ）のすぐ上に2項目。change と go に分岐を1つずつ）
- Modify: `kuiki-map/i18n-es-sakai.js`（この Task の文）
- Modify: `auto/tests/e2e/sakai.e2e.js`（P-1〜P-6・I-1〜I-8）
- Create: `auto/tests/fixtures/s54/` に試験用の作ったファイル：`multi.kml`（MultiGeometry で2つの輪）・`noext.kml`（ExtendedData なし）・`mymap25.kml`（区域の線25本・Type なし）・`big.kml`（2,000点の円）・`tomigusuku-29280.kmz`（fixture を doc.kml として zip したもの）

**Interfaces:**
- Consumes: Task 2 の parseS54・capRings・ringsAreaM2、Task 3 の rings・info・canImport・render
- Produces: `Sakai.openImport(file: File) -> Promise<void>`（ファイル → 確認画面 → 「会衆の境にする」で `D().settings.congArea = { v:1, n, d, at: new Date().toISOString(), rings }`・`Store.save()`・`renderAll()`・toast）、`Sakai.clear() -> Promise<void>`（ask で確かめて `D().settings.congArea = {}`）。torikomi.js の項目のキー：`sakai`（ファイル1つ・`accept=".kml,.kmz,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz"`）・`sakaiDel`（ボタン・境があるときだけ）
- KMZ：先頭2バイトが PK なら `loadScript(LIB.zip)` → JSZip で `doc.kml` か最初の .kml（app.js の readKmlFile と同じ。readKmlFile は変えない）

- [ ] **Step 1: 試験を書く**（読み取りはページの中で `Sakai.parseS54(text)` を呼ぶ）
  - P-1：fixture → name「沖縄県豊見城市豊見城」・date「2024-12-11」・type「Congregation」・borders.n「国場川」・rings 1本・polys 1
  - P-2：multi.kml → rings 2本
  - P-3：mymap25.kml → polys 25（取り込めない側）
  - P-4（Review Focus 4）：noext.kml → name は Document の name、date ''
  - P-5：こわれた XML → 例外（画面では「ファイルを読み込めませんでした」）
  - P-6：KMZ → fixture と同じ rings
  - I-1：係 uAdm で 区域 ＞「区域の線・取り込み」に「会衆の境（S-54）」があり、「会衆の境を消す」はない
  - I-2：fixture を選ぶ → 確認画面に 名前・最終更新・北／東／南／西・点の数・広さ（km²）。地図に仮の線が出て、全体が入るように合う。「やめる」→ D().settings.congArea は変わらず、仮の線は消える
  - I-3：「会衆の境にする」→ flush 後、サーバーの `getSettings_().congArea.rings[0].length` が画面と同じ。伝道者 uA の端末で pull すると線が出る（E-1 と同じ形）
  - I-4：もう一度開くと項目の説明が「今：沖縄県豊見城市豊見城（2024年12月11日）」になり、「会衆の境を消す」が出る。消す → 確かめ → サーバーの congArea が `{}`、uA の端末で pull すると線が消える
  - I-5：big.kml → 確認画面に「点の数が多いので、形を少しなめらかにしました（2000点 → ○点）」（○≤300）。取り込んだあとサーバーの点の合計 ≤ 300
  - I-6：mymap25.kml → 「S-54 のファイルではないかもしれません（区域の線が25本あります）」と出て、「会衆の境にする」を押せない。noext.kml（Type なし・1本）は注意つきで取り込める
  - I-7：古いサーバー（`OLD_SERVER=1 GAS_DIR=<main の gas>` の作法、または M.rt で SERVER_CAPS の capArea を消す）→ 「サーバーを更新してから取り込んでください」と出て、取り込まない
  - I-8：伝道者 uA には「区域の線・取り込み」自体が出ない（今のまま）。区域の数「全部で ○区域」が取り込みの前後で同じ
- [ ] **Step 2:** sakai.e2e.js → P・I が落ちる
- [ ] **Step 3:** 実装（確認画面は setSheet と headHtml の今の作法。境の文はすべて esc。仮の線は congPane に破線で、閉じたら消す）
- [ ] **Step 4:** sakai.e2e.js が全部合格。kaiki.e2e.js が今と同じ結果
- [ ] **Step 5: コミット**（kuiki-map と auto）

### Task 5: 取りこぼし（kyoukai.js）

**Files:**
- Modify: `kuiki-map/kyoukai.js`（定数・findIssues・新しい findMiss・paintCheckBar・paintIssues・act・planAuto の先頭）
- Modify: `kuiki-map/i18n-es-sakai.js`（この Task の文）
- Create: `auto/tests/e2e/sakai-miss.e2e.js`（K-0〜K-7。API_PORT の既定は 19430）
- Create: `auto/tests/fixtures/s54/issues-before.json`（K-0 で作る今の結果）

**Interfaces:**
- Consumes: Task 2 の coreAreaAtLeast・inRing、Task 3 の Sakai.rings
- Produces: findIssues(null) の結果に `{ k: 'miss', ring, holes, area, houses, adj }` が gap・ov のあとに入る（家の印の多い順 → 広い順）。`S.missHidden = { n, area }`。act の新しいキー `missNew`（`close()` してから `startDraw(null)`・地図はその場所のまま）・`missSkip`（S.issues から今の1件を外し、次を見せる）
- findMiss の流れ（findIssues の中で、tid がないときだけ・境があるときだけ）
  1. 境の輪を union → 境の形 B
  2. 区域の合わせた形は findIssues の `u`（小さな四角つき）を使う。区域が1つもなければ B をそのまま残りにする
  3. 残り＝`P.difference(B, u)`。塊（polygon）ごとに outer＝`fromRing(poly[0])`・holes＝残り
  4. その塊の labelPoint が、すでに見つけた gap の輪の中なら飛ばす（二重に出さない）
  5. 家の印＝outer の中で holes の外の家（`housesInRing` と同じ範囲の絞り方）
  6. 出す：家の印が1軒以上、または `coreAreaAtLeast(outer, holes, MISS_CORE_M2, MISS_STEP_M, MISS_HALF_M)`。出さない塊は S.missHidden に数と広さを足す
  7. adj＝bbox の重なる区域のうち `touches(outer, t.polygon)`
- 出し方：paintCheckBar の数え方を k ごとに（gap・ov・miss）。今の `ovs = n - gaps` は `k === 'ov'` を数える形に。見出しの今の部分の後ろに「取りこぼし ○か所」。miss のとき：文は Global Constraints のとおり、ボタンは（`area <= GAP_MAX && !holes.length && adj.length` のときだけ）今の gapTo と同じ「区域○に入れる」＋「新しい区域の線を引く」＋「とばす」＋今の nav と「もどる」。S.missHidden.n があれば見出しの下に一言。paintIssues は miss の holes を L.polygon の穴として描く
- planAuto の先頭：`if (x.k === 'miss') return { why: '取りこぼし' };`
- checkAll の toast：miss が0件なら今の文のまま。1件以上なら「すき間・重なり・取りこぼしが {0}か所 見つかりました」

- [ ] **Step 1: K-0 を作る（変える前の結果を控える）**：今の main の kyoukai.js で、試験用の区域（下の K-2 の形＋区域どうしのすき間 300㎡ と 6,000㎡・重なり 50㎡）に `kyoukai._auto.findIssues(null)` を動かし、`[k, round(area), adj を並べたもの]` の一覧と toast の文を issues-before.json に書く（`RECORD=1` のときだけ書く）
- [ ] **Step 2: 試験を書く**（区域は 1度＝約111km の近似で m 単位の四角を作る。境は試験の中で `D().settings.congArea` に入れる）
  - K-1（R11）：境なし → 結果と toast が issues-before.json と同じ。境ありでも gap・ov の部分は同じ
  - K-2a：区域にふれる 60m×60m の残り → miss 1件、adj に区域、「区域○に入れる」が出る
  - K-2b：境に沿った幅3m・長さ500m の帯 → 出ない。S.missHidden.n ≥ 1、見出しの下に「細い所・小さい所…」
  - K-2c：同じ帯の中に家の印が1軒 → 出る（家の印 1軒）
  - K-2d：100m×100m（10,000㎡）の残り → 出る。「区域○に入れる」は出ず、「新しい区域の線を引く」「とばす」だけ
  - K-2e：区域どうしの 300㎡ のすき間 → gap だけ。同じ所に miss が出ない
  - K-2f：区域が1つもない → miss 1件（広さ＝境の広さ±1%）
  - K-2g（Review Focus 5）：残りの塊の中に区域 T9 が島のように入る → 家の印の数に T9 の家が入らない、「区域○に入れる」が出ない
  - K-3：planAuto(miss).why === '取りこぼし'。「まとめて直す（○か所）」の数に miss が入らない。まとめて直しても miss の所は変わらない
  - K-4：K-2a で「区域○に入れる」→ その区域の線に残りが入り、残りの中の家の terrId がその区域になる。「↶ 戻す」で元にもどる
  - K-5：「とばす」→ 一覧から1件へり、次の所が出る。もう一度「全部の区域の…」を押すとまた出る（覚えない）
  - K-6：「新しい区域の線を引く」→ mode が 'draw'、地図の中心がその場所のまま
  - K-7（速さ）：fixture の境の中に 20×20 の区域（約400区域）と家1万軒を作り、checkAll の時間を境なし・境ありで測る。差が PC（この機械）で2秒以内。スマホは「未確認」と書く
- [ ] **Step 3:** sakai-miss.e2e.js → K-2〜K-6 が落ちる（K-1 は合格）
- [ ] **Step 4:** 実装
- [ ] **Step 5:** sakai-miss.e2e.js が全部合格。sakai.e2e.js・kaiki.e2e.js が今と同じ
- [ ] **Step 6: コミット**（kuiki-map と auto）

### Task 6: 版・お知らせ・スペイン語の仕上げ・通しの回帰

**Files:**
- Modify: `kuiki-map/index.html`（app-version）・`kuiki-map/app.js`（APP_JS_VER・CHANGELOG）・`kuiki-map/sw.js`（APP_CACHE・APP_NAMES に sakai・i18n-es-sakai があればそこにも）
- Modify: `kuiki-map/i18n-es-sakai.js`（CHANGELOG の訳）
- Modify: `auto/tests/README.md`（新しい試験の動かし方の行）、`auto/tests/e2e/sakai.e2e.js`（L-1・L-2）

**Interfaces:**
- CHANGELOG（v '2026.13.160'）
  - みんな向け：`['境', '地図に、会衆の境を灰色の破線で出すようにしました（区域係が取り込んだとき）。区域の線とは別の線で、押してもえらばれません。']`
  - 係向け（role: 'admin'）：`['境', '区域係：「区域の線・取り込み」で、会衆の区域割り当て（S-54）のKMLから会衆の境を取り込めます。']`、`['境', '区域係：「全部の区域のすき間・重なりを調べる」で、会衆の境の中で、どの区域にも入っていない所（取りこぼし）も出ます。']`

- [ ] **Step 1: 試験を書く**　L-1：スペイン語（lang 'es'）で、取り込みの項目・確認画面（名前と境の文を除く）・凡例・取りこぼしの文に日本語（ひらがな・カタカナ）が残らない。L-2：幅375px・1,280px・文字「とても大きく」で、確認画面と取りこぼしの帯がはみ出さない
- [ ] **Step 2:** 版を3か所そろえて上げ、CHANGELOG と訳を入れる
- [ ] **Step 3: 通しの回帰**　`node --check` を変えた .js 全部。auto/tests/server の全部、tests/site の全部（mamori-b-logic の T-B5-7 を含む）、e2e の sakai・sakai-miss・kaiki・insatsu・ie-idou・mamori-b・obi・osusume-pool。結果を「合格数/全体」で控える。変える前から不合格の試験は、main でも同じ結果であることを示す
- [ ] **Step 4: コミット**（kuiki-map と auto）

### Task 7: 豊見城の境での確かめ（R A さんに見てもらう一覧）

**Files:**
- Create: `auto/tests/site/sakai-tomigusuku-report.mjs`（試験ではなく一覧を出す道具。結果はチャットで渡し、リポジトリに置かない）

- [ ] **Step 1:** R A さんに、今の区域の KML（KLM フォルダの 01〜67・ZIP）を受け取れるか聞く（以前の取り込みの調べと同じ。リポジトリ・プロジェクトには置かない）
- [ ] **Step 2:** 受け取れたら、kml-koushin.js の planTerrs で区域の線を作り、fixture の境と Task 5 の findMiss と同じ手順で、取りこぼしの一覧（場所・広さ・幅の判定・出す／出さない）と図（SVG）を作る。家の印のデータはないので、家の数は「未確認」
- [ ] **Step 3:** 受け取れなければ「未確認」とし、マージ後に R A さんが本番で「全部の区域のすき間・重なりを調べる」を押して確かめる手順を報告に書く
- [ ] **Step 4:** 出る所が多すぎるとき（目安：10か所より多い・ほとんどが境とのずれ）は、MISS_CORE_M2・MISS_HALF_M の調整案を、数を変えた一覧と一緒に R A さんに出す（変えるのは承認のあと）

### 仕上げ（計画の外の決まり）
- 独立監査（別のチャット・`superpowers:requesting-code-review`）→ Critical／High を直す → PR を2つ（auto を先に）。PR の本文：変えたファイル・試験の結果（合格数/全体）・未確認のこと（スマホの速さ・本番の区域での取りこぼしの数ほか）
- マージ・本番 GAS・Pages 公開は R A さんの「はい」のあと。マージ後：Pages の公開・版 2026.13.160・kuiki-app-v160 を確かめる
- 切り戻し：設計書 10章のとおり
