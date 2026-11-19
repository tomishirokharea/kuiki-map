# 状況グラフ（おすすめの色分け・留守／回り残しの振り分け・数えない拒否・いちばん上へ）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 区域係の状況グラフで、おすすめ経由の訪問を「留守＝留守宅カード側／回り残し＝区域カード側」に振り分け、おすすめで会えた分を模様で見せ、実際に訪ねていない拒否を数えず、グラフを状況タブのいちばん上に出す。

**Architecture:** 数え方は `kuiki-map/joukyou-graph.js` の `build` だけで変える。新しい判定（数えない拒否・巡回の始まり）は、画面の `inputs()` から関数として渡す（`o.skipRefused`・`o.roundStart`）ので、Node の試験では差し替えられる。サーバー（`auto/gas`）は変えない。

**Tech Stack:** 素の JavaScript（ビルドなし）・SVG・`localStorage`。試験は `auto` の `tests/site/*.test.js`（Node）と `tests/e2e/*.e2e.js`（Playwright＋Chrome）。

**Spec:** `kuiki-map/docs/superpowers/specs/2026-11-19-joukyou-graph-osusume-design.md`

## Global Constraints

- **サーバー（`auto/gas`）は変えない**。記録の `src` の形も変えない
- 既存の機能・表示を消さない（期間の切りかえ・くらべの表・区域ごとの内訳・カルテへの移動・読み上げ・画面ロック中は作らない・区域係だけ）
- **色だけで区別しない**：おすすめで会えた分は、色の濃さに加えて模様（白い水玉）で分ける
- 人ごとの数字は「**拒否の記録の件数**」だけ、区域係の画面だけに出す。奉仕の成績・順位・名前の一覧は出さない
- 新しいタブ・新しい画面は作らない（「下から出る画面」＝既存の `setSheet` を使う）
- 新しく出す日本語の文は、すべて `i18n-es-joukyou.js` に足す
- 版は3か所そろえる：`index.html` の `app-version` ＝ `2026.13.170`、`app.js` の `APP_JS_VER` ＝ `2026.13.170`、`sw.js` の `APP_CACHE` ＝ `kuiki-app-v170`
- 試験は実装に合わせて甘くしない。既存の 44件（`joukyou-graph.test.js`）・15件（`card-mark-logic.test.js`）は、仕様で変えると決めた項目以外は合格のまま
- 数え方の速さ：記録30万件・家3万軒で、変更前（中央値 約150〜190ms）より目に見えて遅くしない

## Review Focus

1. **名簿にいない `by` の拒否**（転出・止めた人の記録）→ `'auto'`（記録した人が分からない）として数えない。Task 1 で試験
2. **`localStorage` が読めない・JSON が壊れている**→ 例外を外に出さず、既定（区域係だけ除外）で動く。Task 5 で試験
3. **おすすめ記録が巡回の始まりより前**（前の巡回の記録・`roundStart` が空）→ 履歴判定をせず、今までどおり印（`card`／`area`）に従う。Task 2 で試験
4. **`rMet` が `met` を超える・`met` が0で `rMet` が1以上**（データの食い違い）→ 負の高さ・はみ出す矩形を描かない（下の段は `max(0, met - rMet)`）。Task 3 で試験
5. **同じ日・同じ家に、おすすめ経由とふつうの記録が混ざる**→ その日の最初の訪問の `src` で「おすすめ経由」を決め、1軒として数える。Task 1 で試験

---

### Task 1: 数えない拒否と、おすすめ経由の内数（数え方の土台）

**Files:**
- Modify: `kuiki-map/joukyou-graph.js`（`tally`・`empty`・`build`・`processList`・`bump`・`rollup`・`compare`・`detail`・`rate`、新規 `recoRate`）
- Test: `auto/tests/site/joukyou-graph.test.js`（既存44件に追加・一部の期待値を更新）

**Interfaces:**
- Produces:
  - `tally()` → `{ met: 0, refused: 0, away: 0, rMet: 0, rAway: 0 }`（`rMet`・`rAway` ＝ おすすめ経由の内数）
  - `build(o)` の新しい入力 `o.skipRefused(v)` → `'' | 'auto' | 'adm' | 'pick'`（空でなければ、その拒否は数えない）。渡されないときは常に `''`
  - `build(o)` の返り値に `r.days.get(day).skip` → `{ auto: 0, adm: 0, pick: 0 }`（外した拒否の数。カテゴリには分けない）
  - `rollup(r, p)` の棒に `skip` → 同じ形（期間の合計）
  - `recoRate(t, minN)` → `{ reco: { n, met, few, pct }, other: { n, met, few, pct }, use }`<br>`reco.n = t.rMet + t.rAway`、`reco.met = t.rMet`、`other.n = t.met + t.refused + t.away - reco.n`、`other.met = t.met - t.rMet`、`use = n ? Math.round(reco.n / (t.met + t.refused + t.away) * 100) : null`。`n < minN` のとき `few: true`・`pct: null`

- [ ] **Step 1: 失敗する試験を書く**（`auto/tests/site/joukyou-graph.test.js` の末尾、`/* ---- 数えない拒否・おすすめ経由 ---- */` の見出しの下）

```js
// 試験の道具：数えない拒否の判定を差し替えられるようにする
const SKIP = map => (v => (v.result === 'refused' ? (map[v.by] || '') : ''));
{ // X-1 区域係が記録した拒否は数えない（同じ日の同じ家の留守は残る）
  const r = run([V('h1', 'away', L(2026, 10, 24, 9), 'u1'), V('h1', 'refused', L(2026, 10, 24, 15), 'u3')], { skipRefused: SKIP({ u3: 'adm' }) });
  const a = day(r, '2026-10-24').area;
  check('X-1', a.away === 1 && a.refused === 0 && N(a) === 1, '係の拒否は数えない。その日の結果は留守1軒', a);
}
{ // X-2 伝道者が玄関で記録した拒否は、今までどおり数える
  const r = run([V('h1', 'refused', L(2026, 10, 24), 'u1')], { skipRefused: SKIP({ u3: 'adm' }) });
  check('X-2', day(r, '2026-10-24').area.refused === 1, '伝道者の拒否は数える', day(r, '2026-10-24').area);
}
{ // X-3 数えない拒否だけの日は、棒に出ない
  const r = run([V('h1', 'refused', L(2026, 10, 24), 'u3')], { skipRefused: SKIP({ u3: 'adm' }) });
  check('X-3', !r.days.has('2026-10-24'), '数えない拒否だけの日は出ない', [...r.days.keys()]);
}
{ // X-4 外した数は理由ごとに日に残る
  const r = run([V('h1', 'refused', L(2026, 10, 24), 'u3'), V('h2', 'refused', L(2026, 10, 24), 'u9'), V('h3', 'refused', L(2026, 10, 24), 'u7')],
    { skipRefused: SKIP({ u3: 'adm', u9: 'auto', u7: 'pick' }) });
  const s = (r.days.get('2026-10-24') || {}).skip;
  check('X-4', s && s.adm === 1 && s.auto === 1 && s.pick === 1, '外した拒否の数が、理由ごとに残る', s);
}
{ // X-5 数えない拒否は、その日の「最初の訪問」の判定にも入らない（カードの印は、数える記録から取る）
  const r = run([V('h1', 'refused', L(2026, 10, 24, 8), 'u3', 'card'), V('h1', 'away', L(2026, 10, 24, 18), 'u1', 'area')], { skipRefused: SKIP({ u3: 'adm' }) });
  const d = day(r, '2026-10-24');
  check('X-5', d.area.away === 1 && d.card.away === 0, '外した拒否の印（card）は使わない。残った記録の印（area）で数える', d);
}
{ // X-6 おすすめ経由の内数：その日の最初の訪問の src で決める
  const r = run([V('h1', 'met', L(2026, 10, 24), 'u1', 'reco:near area'), V('h2', 'met', L(2026, 10, 24), 'u1', 'area'), V('h3', 'away', L(2026, 10, 24), 'u1', 'reco:near area')]);
  const a = day(r, '2026-10-24').area;
  check('X-6', a.met === 2 && a.rMet === 1 && a.away === 1 && a.rAway === 1, 'おすすめ経由の会えた1・留守1を内数で持つ', a);
}
{ // X-7 同じ日・同じ家で、おすすめ（留守）→ ふつう（会えた）：最初の訪問がおすすめなので、おすすめ経由の「会えた」1軒
  const r = run([V('h1', 'away', L(2026, 10, 24, 9), 'u1', 'reco:near area'), V('h1', 'met', L(2026, 10, 24, 16), 'u1', 'area')]);
  const a = day(r, '2026-10-24').area;
  check('X-7', a.met === 1 && a.rMet === 1 && N(a) === 1, '最初の訪問がおすすめ → おすすめ経由の会えた1軒', a);
}
{ // X-8 recoRate：おすすめ経由とそれ以外の割合・使用率
  const t = { met: 11, refused: 0, away: 27, rMet: 11, rAway: 27 }; // 全部おすすめ
  const x = JG.recoRate(t, 5);
  check('X-8', x.reco.n === 38 && x.reco.met === 11 && x.reco.pct === 29 && x.other.n === 0 && x.other.few === true && x.use === 100, 'おすすめ経由 38軒・29%／おすすめ以外は0軒でデータ少／使用率100%', x);
}
{ // X-9 recoRate：5軒未満はデータ少
  const x = JG.recoRate({ met: 1, refused: 0, away: 3, rMet: 1, rAway: 2 }, 5);
  check('X-9', x.reco.n === 3 && x.reco.few === true && x.reco.pct === null, 'おすすめ経由3軒はデータ少', x);
}
{ // X-10 名簿にいない人の拒否（Review Focus 1）は、画面側の判定で 'auto'。数え方は X-1 と同じに外れる
  const r = run([V('h1', 'refused', L(2026, 10, 24), 'uX')], { skipRefused: SKIP({ uX: 'auto' }) });
  check('X-10', !r.days.has('2026-10-24') , '名簿にいない人の拒否も数えない', [...r.days.keys()]);
}
```

- [ ] **Step 2: 失敗を確かめる** — Run: `cd /home/claude/auto && KUIKI_MAP_DIR=/home/claude/kuiki-map node tests/site/joukyou-graph.test.js`。Expected: X-1〜X-10 が FAIL（`recoRate` は未定義、`skip`・`rMet` は無い）。既存の44件は合格のまま
- [ ] **Step 3: 実装する** — `joukyou-graph.js`：`tally`・`empty` に `rMet`・`rAway`、`counts` の1日分を 15（3カテゴリ×5）に、`processList` で `v.result === 'refused' && o.skipRefused(v)` の記録を読み飛ばして理由別に数え、`bump` に「おすすめ経由か」（`first.src` が `reco` で始まる）を渡し、`rollup`・`compare`・`detail` で新しい項目も足し合わせ、`recoRate` を足して `api` に出す
- [ ] **Step 4: 合格を確かめる** — 同じコマンド。Expected: 54/54（44＋10）合格
- [ ] **Step 5: コミット** — `git -C /home/claude/kuiki-map add joukyou-graph.js && git commit -m "状況グラフ：数えない拒否と、おすすめ経由の内数を数える"`（試験は `auto` 側で別にコミット）

---

### Task 2: おすすめ経由の振り分け（留守／回り残し）

**Files:**
- Modify: `kuiki-map/joukyou-graph.js`（`kindOf`、新規 `recoKind`、`inputs`）
- Modify: `kuiki-map/app.js`（`window.KM` に `roundStart` を出す。`roundBounds` は既に `app.js` にある）
- Test: `auto/tests/site/joukyou-graph.test.js`

**Interfaces:**
- Consumes: Task 1 の `tally`・`build`
- Produces:
  - `build(o)` の新しい入力 `o.roundStart(terrId)` → 巡回の始まりの ISO 文字（分からなければ `''`）
  - 振り分けの決まり（`kindOf` の中）：`src` の先頭が `reco` **かつ** `Date.parse(v.at) >= Date.parse(o.roundStart(terr))` のときだけ、履歴で判定する。<br>履歴の判定（`recoKind`）：その家（部屋）の記録を新しい順に、その訪問より古い側へ見て、**数える・数えないを問わず拒否を飛ばした最初の記録**を探す。<br>・見つかった記録が巡回の始まり以降 → 結果が `away` なら `'card'`、`met` なら `'area'`<br>・見つからない／巡回の始まりより前 → `'area'`（この巡回で初めて訪ねた＝回り残し）
  - 画面側（`app.js`）：`KM.roundStart = tid => { const b = roundBounds(tid); return (b.ext ? b.ext.start : b.start) || ''; }`

- [ ] **Step 1: 失敗する試験を書く**

```js
const RS = at => (() => at); // 巡回の始まりを固定する
{ // Y-1 おすすめ：今の巡回で前に留守 → 留守宅カード側（印が area でも）
  const r = run([V('h1', 'away', L(2026, 10, 20), 'u1', 'area'), V('h1', 'away', L(2026, 10, 24), 'u1', 'reco:near area')],
    { roundStart: RS(L(2026, 10, 1)) });
  check('Y-1', day(r, '2026-10-24').card.away === 1 && day(r, '2026-10-24').area.away === 0, '前に留守 → 留守宅カード側', day(r, '2026-10-24'));
}
{ // Y-2 おすすめ：今の巡回で初めて訪ねた（前の巡回に留守あり）→ 区域カード側＝回り残し
  const r = run([V('h1', 'away', L(2026, 8, 20), 'u1', 'area'), V('h1', 'away', L(2026, 10, 24), 'u1', 'reco:near card')],
    { roundStart: RS(L(2026, 10, 1)) });
  check('Y-2', day(r, '2026-10-24').area.away === 1 && day(r, '2026-10-24').card.away === 0, '今の巡回で初訪問 → 回り残し＝区域カード側（印が card でも）', day(r, '2026-10-24'));
}
{ // Y-3 おすすめ：今の巡回で前に会えた → 区域カード側
  const r = run([V('h1', 'met', L(2026, 10, 10), 'u1', 'area'), V('h1', 'away', L(2026, 10, 24), 'u1', 'reco:near card')],
    { roundStart: RS(L(2026, 10, 1)) });
  check('Y-3', day(r, '2026-10-24').area.away === 1, '今の巡回で前に会えた → 区域カード側', day(r, '2026-10-24'));
}
{ // Y-4 おすすめ：前の記録がまったくない → 区域カード側
  const r = run([V('h1', 'away', L(2026, 10, 24), 'u1', 'reco:near card')], { roundStart: RS(L(2026, 10, 1)) });
  check('Y-4', day(r, '2026-10-24').area.away === 1, '前の記録なし → 区域カード側', day(r, '2026-10-24'));
}
{ // Y-5 おすすめ：巡回の始まりが空（分からない）→ 履歴判定をせず、印に従う（Review Focus 3）
  const r = run([V('h1', 'away', L(2026, 10, 20), 'u1', 'area'), V('h1', 'away', L(2026, 10, 24), 'u1', 'reco:near card')], { roundStart: () => '' });
  check('Y-5', day(r, '2026-10-24').card.away === 1, '巡回が分からないときは、印（card）に従う', day(r, '2026-10-24'));
}
{ // Y-6 おすすめ：その訪問が巡回の始まりより前 → 印に従う（R12c・古い棒の数字を書きかえない）
  const r = run([V('h1', 'away', L(2026, 9, 10), 'u1', 'area'), V('h1', 'away', L(2026, 9, 20), 'u1', 'reco:near card')], { roundStart: RS(L(2026, 10, 1)) });
  check('Y-6', day(r, '2026-09-20').card.away === 1, '巡回の始まりより前のおすすめ記録は、印に従う', day(r, '2026-09-20'));
}
{ // Y-7 履歴をさかのぼるとき、拒否の記録は飛ばす
  const r = run([V('h1', 'away', L(2026, 10, 10), 'u1', 'area'), V('h1', 'refused', L(2026, 10, 15), 'u3', 'area'), V('h1', 'away', L(2026, 10, 24), 'u1', 'reco:near area')],
    { roundStart: RS(L(2026, 10, 1)), skipRefused: SKIP({ u3: 'adm' }) });
  check('Y-7', day(r, '2026-10-24').card.away === 1, '拒否を飛ばして、その前の留守を見る → 留守宅カード側', day(r, '2026-10-24'));
}
{ // Y-8 おすすめ以外の記録は、今までどおり印で分かれる（回帰）
  const r = run([V('h1', 'away', L(2026, 10, 20), 'u1', 'area'), V('h1', 'away', L(2026, 10, 24), 'u1', 'card')], { roundStart: RS(L(2026, 10, 1)) });
  check('Y-8', day(r, '2026-10-24').card.away === 1 && day(r, '2026-10-20').area.away === 1, 'おすすめ以外は印のまま', [day(r, '2026-10-20'), day(r, '2026-10-24')]);
}
{ // Y-9 おすすめの印に :p が付いていても同じ
  const r = run([V('h1', 'away', L(2026, 10, 20), 'u1', 'area:p'), V('h1', 'away', L(2026, 10, 24), 'u1', 'reco:after card:p')], { roundStart: RS(L(2026, 10, 1)) });
  check('Y-9', day(r, '2026-10-24').card.away === 1, ':p 付きでも履歴で判定する', day(r, '2026-10-24'));
}
```

- [ ] **Step 2: 失敗を確かめる** — 同じコマンド。Expected: Y-2・Y-3・Y-4・Y-7 が FAIL（今は印で分かれるため）
- [ ] **Step 3: 実装する** — `joukyou-graph.js` の `kindOf` に上の順の分岐を足し、`recoKind(v, list, i, terr)` を書く。巡回の始まりは区域ごとに `Map` で1回だけ引く。`processList` は、`kindOf` に「家の記録リストと今の位置」を渡せるようにする（索引がないときの道も同じにする）。`inputs()` に `roundStart: tid => (window.KM && KM.roundStart ? KM.roundStart(tid) : '')` を足し、`app.js` に `KM.roundStart` を出す
- [ ] **Step 4: 合格を確かめる** — 同じコマンド。Expected: 63/63 合格（既存44＋Task1の10＋9）
- [ ] **Step 5: コミット** — `おすすめ経由の記録を、留守／回り残しで振り分ける`

---

### Task 3: 棒の塗りを2段にする（おすすめで会えた分）

**Files:**
- Modify: `kuiki-map/joukyou-graph.js`（`DEFS`・`MFILL`・`swatch`・`LEGEND`・`chartSvg`・`mini`）
- Test: `auto/tests/e2e/joukyou-graph.e2e.js`（Task 8 で全体を書き直すので、ここでは Node で SVG の文字列を確かめる試験を `auto/tests/site/joukyou-graph.test.js` に足す）

**Interfaces:**
- Consumes: Task 1 の `tally`（`rMet`）
- Produces: `<defs>` に `jgRecoA`（濃い青＋白い水玉）・`jgRecoC`（濃い橙＋白い水玉）。`chartSvg` は、会えた分を「下＝`max(0, met - rMet)`・上＝`rMet`」の2つの矩形で描く

- [ ] **Step 1: 失敗する試験を書く**（`JG` を `document` なしで読み込むと画面の部分は動かないため、`chartSvg` は画面側。ここでは**高さの計算だけ**を試験できるように `JG.fillParts(t)` を切り出して試験する）

```js
{ // Z-1 塗りの2段：会えた11軒のうち、おすすめ4軒
  const p = JG.fillParts({ met: 11, refused: 0, away: 27, rMet: 4, rAway: 10 });
  check('Z-1', p.base === 7 && p.reco === 4, '下＝ふつう7軒・上＝おすすめ4軒', p);
}
{ // Z-2 データの食い違い（rMet > met）でも、負にしない（Review Focus 4）
  const p = JG.fillParts({ met: 2, refused: 0, away: 1, rMet: 5, rAway: 0 });
  check('Z-2', p.base === 0 && p.reco === 2 && p.base + p.reco === 2, '合計は met を超えない・負にしない', p);
}
{ // Z-3 おすすめが0なら、今までどおり1段
  const p = JG.fillParts({ met: 3, refused: 0, away: 1, rMet: 0, rAway: 0 });
  check('Z-3', p.base === 3 && p.reco === 0, 'おすすめ0なら下の段だけ', p);
}
```

- [ ] **Step 2: 失敗を確かめる** — 同じコマンド。Expected: `JG.fillParts` が未定義で FAIL
- [ ] **Step 3: 実装する** — `fillParts(t)` → `{ base: Math.max(0, Math.min(t.met, t.met - t.rMet)), reco: Math.min(t.met, t.rMet) }` を `api` に出し、`chartSvg` と `mini`（内訳の小さな帯）で使う。`DEFS` に模様2つを足し、`swatch(c)` を3段の見本にし、`LEGEND()` に「濃い色＋白い水玉＝おすすめで会えた」「無地＝おすすめ以外で会えた」を足す
- [ ] **Step 4: 合格を確かめる** — 同じコマンド。Expected: 66/66 合格
- [ ] **Step 5: コミット** — `状況グラフ：おすすめで会えた分を、模様の付いた段で見せる`

---

### Task 4: 「おすすめのききめ」と「数えなかった拒否」の表示

**Files:**
- Modify: `kuiki-map/joukyou-graph.js`（`draw` の `jg-sum` と `hint`、`openBar` の `jg-cmp` の下、`numLine`）

**Interfaces:**
- Consumes: Task 1 の `recoRate`・`skip`
- Produces: `recoLines(t, minN)` → HTML 文字列（`おすすめ経由`／`おすすめ以外`／`訪ねた家のうち、おすすめ経由 z%` の3行）。`skipLine(skip)` → `数えなかった拒否 N軒（自動・取り込み ○軒／区域係 ○軒／えらんだ人 ○軒）`。0軒のときは空文字

- [ ] **Step 1: 失敗する試験を書く**（文字の形だけ）

```js
{ // W-1 ききめの3行：訪ねた・会えた・割合と使用率
  const h = JG.recoLines({ met: 42, refused: 0, away: 138, rMet: 11, rAway: 27 }, 5);
  check('W-1', /おすすめ経由/.test(h) && /訪ねた 38軒・会えた 11軒（29%）/.test(h) && /おすすめ以外/.test(h) && /訪ねた 142軒・会えた 31軒（22%）/.test(h) && /おすすめ経由 21%/.test(h), 'ききめの3行', h);
}
{ // W-2 おすすめ経由が0軒のときは、ききめを出さない
  check('W-2', JG.recoLines({ met: 5, refused: 0, away: 5, rMet: 0, rAway: 0 }, 5) === '', 'おすすめ0ならききめは出さない', JG.recoLines({ met: 5, refused: 0, away: 5, rMet: 0, rAway: 0 }, 5));
}
{ // W-3 数えなかった拒否の1行
  check('W-3', /数えなかった拒否 6軒/.test(JG.skipLine({ auto: 3, adm: 2, pick: 1 })) && JG.skipLine({ auto: 0, adm: 0, pick: 0 }) === '', '外した拒否の1行（0軒なら出さない）', JG.skipLine({ auto: 3, adm: 2, pick: 1 }));
}
```

- [ ] **Step 2: 失敗を確かめる** — 同じコマンド。Expected: 未定義で FAIL
- [ ] **Step 3: 実装する** — `recoLines`・`skipLine` を書いて `api` に出し、`draw`（期間の合計の下・グラフの下の `hint`）と `openBar`（`jg-cmp` の下に見出し「おすすめのききめ」）で使う。文は責めない書き方。`esc` を通す
- [ ] **Step 4: 合格を確かめる** — 同じコマンド。Expected: 69/69 合格
- [ ] **Step 5: コミット** — `状況グラフ：おすすめのききめと、数えなかった拒否の行を出す`

---

### Task 5: 「拒否を数えない人」をえらぶ（端末の中に保存）

**Files:**
- Modify: `kuiki-map/joukyou-graph.js`（新規 `noRef`・`saveNoRef`・`openNoRefPick`・`skipRefusedOf`、`inputs`・`draw`・`dataSig`）
- Test: `auto/tests/site/joukyou-graph.test.js`（`skipRefusedOf` の論理だけ）

**Interfaces:**
- Consumes: Task 1 の `o.skipRefused`
- Produces:
  - `skipRefusedOf(people, picked)` → `v => '' | 'auto' | 'adm' | 'pick'`。`people` は `[{id, name, role}]`、`picked` は id の配列。判定の順：`v.auto` か `v.by` が空か名簿にない → `'auto'`／`role === 'admin'` → `'adm'`／`picked` に入っている → `'pick'`／ほかは `''`
  - `noRef()` → 選ばれた id の配列（`localStorage` の `kuiki_jg_noref_<使う人のid>`。読めない・壊れていれば `[]`）
  - `saveNoRef(ids)` → 保存して `st.agg = null`（数え直す）。例外は外に出さない
  - `openNoRefPick()` → 既存の `setSheet` で、名簿の人を拒否の記録の件数つきに並べる画面を出す
  - `dataSig()` に、選ばれた人の一覧を足す（変えたら数え直す）

- [ ] **Step 1: 失敗する試験を書く**

```js
const PEOPLE = [{ id: 'u1', name: '伝道者A', role: 'pub' }, { id: 'u3', name: '区域係C', role: 'admin' }, { id: 'u7', name: '赤嶺E', role: 'pub' }];
{ // V-1〜V-5 判定
  const f = JG.skipRefusedOf(PEOPLE, ['u7']);
  check('V-1', f({ result: 'refused', by: 'u3' }) === 'adm', '区域係 → adm', f({ result: 'refused', by: 'u3' }));
  check('V-2', f({ result: 'refused', by: 'u7' }) === 'pick', 'えらんだ人 → pick', f({ result: 'refused', by: 'u7' }));
  check('V-3', f({ result: 'refused', by: 'u1' }) === '', '伝道者 → 数える', f({ result: 'refused', by: 'u1' }));
  check('V-4', f({ result: 'refused', by: 'uX' }) === 'auto' && f({ result: 'refused', by: '' }) === 'auto', '名簿にいない・空 → auto（Review Focus 1）', [f({ result: 'refused', by: 'uX' }), f({ result: 'refused', by: '' })]);
  check('V-5', f({ result: 'refused', by: 'u1', auto: 1 }) === 'auto' && f({ result: 'met', by: 'u3' }) === '', '自動の印 → auto／会えた・留守は外さない', [f({ result: 'refused', by: 'u1', auto: 1 }), f({ result: 'met', by: 'u3' })]);
}
{ // V-6 名簿が空・選んだ人が null でも落ちない（Review Focus 2）
  const f = JG.skipRefusedOf(null, null);
  check('V-6', f({ result: 'refused', by: 'u1' }) === 'auto', '名簿がないときは、記録した人が分からない扱い', f({ result: 'refused', by: 'u1' }));
}
```

- [ ] **Step 2: 失敗を確かめる** — 同じコマンド。Expected: 未定義で FAIL
- [ ] **Step 3: 実装する** — `skipRefusedOf` を `api` に出す。画面側に `noRef`・`saveNoRef`（`try/catch`）・`openNoRefPick`（件数は `D().visits` を1周して `by` ごとに数え、多い順。0軒の人は「ほかの人をすべて見る」で出す。区域係の行は `disabled` で「自動で除外」）。`draw` のグラフの下に小さな文字のボタン `data-jgnoref`、`box` の click で `openNoRefPick()`。`inputs()` に `skipRefused: skipRefusedOf(D().people, noRef())`
- [ ] **Step 4: 合格を確かめる** — 同じコマンド。Expected: 75/75 合格
- [ ] **Step 5: コミット** — `状況グラフ：拒否を数えない人を、係の端末でえらべるようにする`

---

### Task 6: 状況タブのいちばん上に出す／はじめから開く

**Files:**
- Modify: `kuiki-map/joukyou-graph.js:539 付近`（`paint` の差し込み先）
- Modify: `kuiki-map/kimari.js:355`（`isOpen` の既定）

**Interfaces:**
- Consumes: なし
- Produces: `adJG` が状況ペインの最初の子。`kimari.js` の `isOpen` で `jg` も既定で開く

- [ ] **Step 1: 失敗する試験を書く**（画面の試験。Task 8 の書き直しに入れる項目を、ここで先に1つだけ足す）

```js
// E1-a 状況タブの最初の子が adJG（期限の見張りより上）／はじめから開いている
const pos = await d.page.evaluate(() => {
  const p = document.querySelector('[data-apane="status"]');
  return { first: p.firstElementChild.id, ids: [...p.children].map(x => x.id || x.tagName), folded: !!document.querySelector('#jgBody.kr-folded') };
});
check('E1-a', pos.first === 'adJG' && pos.ids[1] === 'adDue' && !pos.folded, 'グラフが状況のいちばん上・期限の見張りはその次・はじめから開いている', pos);
```

- [ ] **Step 2: 失敗を確かめる** — Run: `cd /home/claude/auto && PLAYWRIGHT=/home/claude/node_modules/playwright CHROME=/usr/bin/google-chrome KUIKI_MAP_DIR=/home/claude/kuiki-map node tests/e2e/joukyou-graph.e2e.js`。Expected: E1-a が FAIL（今は `adDue` が最初・`jg` はたたまれている）
- [ ] **Step 3: 実装する** — `paint()`：`if (box.parentNode !== pane || pane.firstElementChild !== box) pane.insertBefore(box, pane.firstElementChild)`（毎回の描き直しで動かさないよう、位置がちがうときだけ動かす）。`kimari.js`：`id === 'due' || id === 'ops' || id === 'jg'`
- [ ] **Step 4: 合格を確かめる** — 同じコマンド。Expected: E1-a が PASS
- [ ] **Step 5: コミット** — `状況グラフ：状況タブのいちばん上に出し、はじめから開く`

---

### Task 7: 言葉・スペイン語・「？」の説明・版上げ

**Files:**
- Modify: `kuiki-map/help.js:217`（日本語）・`:547`（スペイン語）の `joukyouGraph`
- Modify: `kuiki-map/i18n-es-joukyou.js`（新しい文）
- Modify: `kuiki-map/index.html:5`（`app-version`）・`kuiki-map/app.js:7`（`APP_JS_VER`）・`kuiki-map/sw.js:16`（`APP_CACHE`）
- Modify: `kuiki-map/app.js`（`CHANGELOG` に係向けの項目）

**Interfaces:**
- Consumes: Task 3・4・5・6 の新しい文
- Produces: 版 `2026.13.170`／`kuiki-app-v170`

- [ ] **Step 1: 失敗する試験を書く** — 版の3か所がそろっているかは既存の `auto/tests/site/mamori-b-logic.test.js`（T-B5-7）で確かめる。スペイン語の抜けは Task 8 の E5 で確かめる
- [ ] **Step 2: 失敗を確かめる** — Run: `cd /home/claude/auto && KUIKI_MAP_DIR=/home/claude/kuiki-map node tests/site/mamori-b-logic.test.js`。Expected: 版を上げる前は合格、片方だけ上げると FAIL になることを確かめてから3か所そろえる
- [ ] **Step 3: 実装する** — 「？」の説明に書くこと：①実際に訪ねていない拒否（自動・取り込み／区域係／えらんだ人）は数えないこと、上の「曜日と時間帯」の表とは数え方がちがうこと ②おすすめ経由は「留守の家＝留守宅カード側／まだ訪ねていない家（回り残し）＝区域カード側」に数えること ③おすすめで会えた分は模様で分かること・「おすすめのききめ」で割合をくらべられること ④巡回の始まりは今の値を使うので、1年の古い棒ではおすすめ記録を印のまま数えること
- [ ] **Step 4: 合格を確かめる** — 同じコマンドと `node --check`
- [ ] **Step 5: コミット** — `状況グラフ：説明・スペイン語・版（2026.13.170）`

---

### Task 8: 画面の試験を今の画面に合わせて書き直し、回帰と速さを確かめる

**Files:**
- Rewrite: `auto/tests/e2e/joukyou-graph.e2e.js`（main で失敗中。2026-11-07 の2本並べ＋今回の変更に合わせる）
- Modify: `auto/tests/README.md`（新しい動かし方の行）

**Interfaces:**
- Consumes: Task 1〜7 のすべて

- [ ] **Step 1: 試験を書く** — 幅375・390・1,280・1,366px、文字「とても大きく」、日本語とスペイン語で：
  - E1 いちばん上・はじめから開く・ほかの見出しのたたみと要点が今までどおり（`adDue`・`adAch`・`adMeet` などの見出しが出る）
  - E2 棒が2本・おすすめで会えた分の模様（`url(#jgRecoA)`／`url(#jgRecoC)`）・棒の上の数字は割合だけ・目盛りは13px以上・はみ出し0・JSエラー0
  - E3 棒を押す → 「おすすめのききめ」の3行 → 区域を押す → カルテ →「もどる」で内訳にもどる
  - E4 「数えなかった拒否 N軒」・「拒否を数えない人」の画面が開く・えらぶと数が変わる（係の記録は、えらばなくても外れている）
  - E5 スペイン語で、新しい文が訳されている（日本語のままの文がない）
- [ ] **Step 2: 失敗を確かめる** — Run: 上の e2e コマンド。Expected: 書き直した試験が、実装の抜けを指す
- [ ] **Step 3: 直す** — 抜けを実装側で直す（試験を甘くしない）
- [ ] **Step 4: 全部そろえて確かめる** — Run:
  - `KUIKI_MAP_DIR=… node tests/site/joukyou-graph.test.js`（75件）
  - `KUIKI_MAP_DIR=… node tests/site/card-mark-logic.test.js`（15件・変えないので合格のまま）
  - `KUIKI_MAP_DIR=… node tests/e2e/joukyou-graph.e2e.js`
  - `KUIKI_MAP_DIR=… node tests/e2e/card-mark-flow.e2e.js`（本物の画面→サーバー→グラフの通し）
  - `KUIKI_MAP_DIR=… node tests/e2e/kaiki.e2e.js`（回帰）
  - `KUIKI_MAP_DIR=… node tests/site/joukyou-graph-perf.js`（速さ。変更前と比べる）
- [ ] **Step 5: コミット** — `状況グラフ：画面の試験を今の画面に合わせて書き直す`

---

### Task 9: 独立監査 → 直し → PR

- [ ] **Step 1** 別のエージェントに、差分・設計書・試験の結果を渡して独立監査（Critical／High／Medium／Low と、根拠・影響・直し方）
- [ ] **Step 2** 指摘を直し、試験を全部もう一度動かす
- [ ] **Step 3** ブランチ `feat/joukyou-graph-osusume-20261119` を push（`kuiki-map` と `auto` の両方）
- [ ] **Step 4** PR を作る（**main へはマージしない**）。本文に、実施内容・検証した内容と実際の結果・未検証・切り戻し方を書く
