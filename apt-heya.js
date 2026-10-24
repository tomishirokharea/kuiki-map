/* =========================================================
   apt-heya.js  区域マップ：旧区域カードの「部屋」を、アプリのアパートに入れる  ※区域係だけ
   （アパートの登録 ＞ ④ 旧区域カードの部屋を入れる）

   旧区域カード（PDF）のアパート情報をAIで読み取った一覧（エクセル）を読み、
   建物名でアプリのアパートを探して、階ごとの部屋番号を入れます。
   ・読むシート：「読み取り結果」。読む列：親区域・カード・建物名・階ごとの部屋・状態・要確認・確認（R Aさん記入）
     （メモの列・個人名は読みません）
   ・入れる行：確認の欄が「○」の行。確認の欄に「3階:1,2,3 / 2階:…」のように直した内容があれば、それを使う。
     「取り込まない」と書いた行は入れない。確認の欄が空の行は、チェックを入れたときだけ（「要確認」の行はのぞく）
   ・建物の探し方：建物名（空白・「・」・長音などをそろえる）で、
       1. 同じ親区域のアパート → 2. 同じ親区域の候補（まだ地図に置いていない一覧の建物）
       3. 親区域がちがっても、アプリに同じ名前が1つだけならそれ（区域の線が変わったため）
     同じ名前が2つ以上あるときは入れずに、一覧で知らせる
   ・部屋の入れ方：
       アパートが「1階・2階…」の枠だけ（または部屋なし）→ 部屋番号に置きかえる。記録のある枠は「（部屋不明）」として残す
       すでに部屋番号がある → 足りない部屋だけ足す（消さない）
       候補 → 候補に部屋を持たせ、現場で候補をえらんだときに部屋が自動で入る
   ・店・事務所・駐車場などは部屋にしない。家主は「1階家主」のように入れる。
     個人名だけの枠（各階1戸）は「2階」の枠にする
   ========================================================= */
(function () {
  'use strict';
  if (typeof CHANGELOG !== 'undefined' && !CHANGELOG.some(c => c.v === '2026.13.62')) {
    CHANGELOG.unshift({ v: '2026.13.62', items: [
      ['集', '「アパートの登録」に「旧区域カードの部屋を入れる」ができました。紙の区域カードから読み取った一覧（エクセル）を選ぶと、建物名でアパートを探して、階ごとの部屋番号を入れます'],
      ['集', '一覧の建物（候補）にも部屋を持たせられるようになりました。現場で候補をえらぶと、部屋番号まで自動で入ります']
    ] });
  }
  const MAX_UNITS = 300;
  const NONRES = /店|事務|駐|塾|倉|病院|医院|歯科|会社|銀行|JA|ランドリー|保育|ロビー|管理人|美容|郵便|学童|サロン|カラオケ|居酒屋|そろばん|介護|教会|工場|道場|くもん|^事$|^医$|^保$/;
  const OWNER = /^(主|家主|大家)$/;
  const SKIP = /^(空|空欄|不明|\?|？|読めない|行けない|-|―)$/;

  /* ---------- 名前をそろえる ---------- */
  const nrm = s => String(s || '').normalize('NFKC').toLowerCase()
    .replace(/[\s・･.,、。'"’`ｰー－―‐−~〜]/g, '').replace(/ヶ|ケ/g, 'ケ');
  const baseName = s => String(s || '').replace(/（続き）|\(続き\)/g, '').trim();
  /* 探すときの名前：そのまま／カッコを外した名前／カッコの中（例：Mille Aube（ミル オーブ）） */
  function nameKeys(name) {
    const n = baseName(name), out = new Set();
    const plain = n.replace(/[（(][^）)]*[）)]/g, '');
    [n, plain].forEach(x => { const k = nrm(x); if (k.length >= 2) out.add(k); });
    (n.match(/[（(]([^）)]*)[）)]/g) || []).forEach(p => {
      const inner = p.slice(1, -1);
      if (/続き|手書き|新築|名前|読め|別棟|オートロック|インターホン/.test(inner)) return;
      const k = nrm(inner); if (k.length >= 3) out.add(k);
    });
    return [...out];
  }
  const noName = name => /名前なし|名前読め|読めず|^[A-ZＡ-Ｚ]（|^Ⓐ|^\d+（名前なし）/.test(String(name || '')) || !nameKeys(name).length;
  const parentOf = t => (t ? String(t.pno || String(t.no).split('-')[0]) : '');

  /* ---------- 「3階:1,2,3 / 2階:…」を部屋の名前にする ---------- */
  function expand(tok) {
    let m;
    if (/4\s*なし/.test(tok)) { // 「201〜208（4なし）」：4で終わる番号をのぞく
      return expand(tok.replace(/[（(]?\s*4\s*なし\s*[）)]?/g, '')).filter(x => !/4$/.test(x));
    }
    if ((m = tok.match(/^(\d)-([A-Ha-h])〜\1-([A-Ha-h])$/))) { const out = []; for (let c = m[2].toUpperCase().charCodeAt(0); c <= m[3].toUpperCase().charCodeAt(0); c++) out.push(m[1] + '-' + String.fromCharCode(c)); return out; }
    if ((m = tok.match(/^(\d+)〜(\d+)$/))) {
      const a = +m[1], b = +m[2], w = m[1].length;
      if (b < a || b - a > 60) return [tok];
      const out = []; for (let i = a; i <= b; i++) out.push(w >= 3 ? String(i) : String(i));
      return out;
    }
    if ((m = tok.match(/^(\d)([A-Ha-h])〜\1([A-Ha-h])$/))) { const out = []; for (let c = m[2].toUpperCase().charCodeAt(0); c <= m[3].toUpperCase().charCodeAt(0); c++) out.push(m[1] + String.fromCharCode(c)); return out; }
    if ((m = tok.match(/^(.+)×(\d+)$/))) return Array.from({ length: Math.min(30, +m[2]) }, () => m[1]);
    return [tok];
  }
  /* 1つの枠 → 部屋の名前（部屋にしないものは ''、「2階」の枠にするものは '#frame'） */
  function unitName(fl, raw, isB) {
    const x = String(raw || '').normalize('NFKC').replace(/\s+/g, '').trim();
    if (!x) return '';
    if (/個人名/.test(x)) return '#frame';
    const t = x.replace(/[（(][^）)]*[）)]/g, '');
    if (!t || SKIP.test(t)) return '';
    if (OWNER.test(t)) return isB ? `B${fl}家主` : `${fl}階家主`;
    if (NONRES.test(t)) return '';
    if (/^\d+F$/i.test(t) || /^\d+部屋$/.test(t)) return '#frame';  // 「4F」と印字された各階1戸・番号の分からない部屋
    if (/^\d+F-\d+$/i.test(t)) return t.replace(/F/i, '');          // 3F-1 → 3-1                         // 「4F」と印字された各階1戸
    if (/^\d+$/.test(t)) {
      if (t.length >= 3) return t;                                    // 301・1001 は書かれたまま
      const n = +t; if (!n || n > 99) return '';
      return isB ? `B${fl}-${n}` : `${fl}${pad(n)}`;                 // 1 → 301
    }
    if (/^[A-Za-z]$/.test(t)) return `${fl}${t.toUpperCase()}`;       // A → 3A
    if (/^(右|左|中)$/.test(t)) return `${fl}階${t}`;
    if (/^[0-9A-Za-z\-]{1,10}$/.test(t)) return t.toUpperCase();     // 3A・2-1・A201・3-A・B1 は書かれたまま
    return '';
  }
  /* 戻り値：{ units: [...], frames: [2,…], skipped: 数 } */
  function parseFloors(text) {
    const out = { units: [], frames: [], skipped: 0, top: 0 };
    String(text || '').normalize('NFKC').replace(/：/g, ':').split(/\s*\/\s*/).forEach(seg => {
      const i = seg.indexOf(':'); if (i < 0) return;
      const lab = seg.slice(0, i).trim(); let items = seg.slice(i + 1).trim();
      let fls = [], isB = false, m;
      if ((m = lab.match(/^(\d+)階[〜~](\d+)階$/))) { for (let f = +m[1]; f >= +m[2]; f--) fls.push(f); }
      else if ((m = lab.match(/^(\d+)階$/))) fls = [+m[1]];
      else if ((m = lab.match(/^B(\d+)$/i)) || (m = lab.match(/^地下(\d*)/))) { fls = [+(m[1] || 1)]; isB = true; }
      else return;
      if (items.startsWith('各')) items = items.slice(1);
      const toks = [];
      items.split(/[,、]/).map(s => s.trim()).filter(Boolean).forEach(tk => expand(tk).forEach(x => toks.push(x)));
      fls.forEach(fl => {
        if (!isB) out.top = Math.max(out.top, fl);
        toks.forEach(tk => {
          // 「各01,02」のような書き方（階＋番号）
          const u = /^0\d$/.test(tk) && !isB ? `${fl}${tk}` : unitName(fl, tk, isB);
          if (u === '#frame') { if (!out.frames.includes(fl) && !isB) out.frames.push(fl); return; }
          if (!u) { if (!NONRES.test(String(tk))) out.skipped++; return; }
          const c = cleanUnit(u);
          if (c && !out.units.includes(c)) out.units.push(c);
        });
      });
    });
    return out;
  }

  /* ---------- エクセルを読む ---------- */
  const HEAD = {
    parent: /^親区域$/, card: /^カード$/, name: /^建物名$/, fl: /^階ごとの部屋/, status: /^状態$/, flag: /^要確認$/, ok: /^確認/
  };
  async function readBook(file) {
    await loadScript(LIB.xlsx);
    const wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const name = wb.SheetNames.find(n => /読み取り結果/.test(n)) || wb.SheetNames[0];
    const rows = window.XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' });
    const hi = rows.slice(0, 5).findIndex(r => r.some(c => HEAD.name.test(String(c).trim())) && r.some(c => HEAD.fl.test(String(c).trim())));
    if (hi < 0) return null;
    const head = rows[hi].map(c => String(c).trim()), C = {};
    Object.keys(HEAD).forEach(k => { C[k] = head.findIndex(h => HEAD[k].test(h)); });
    if (C.name < 0 || C.fl < 0 || C.card < 0) return null;
    const g = (r, i) => (i >= 0 ? String(r[i] == null ? '' : r[i]).trim() : '');
    return rows.slice(hi + 1).map(r => {
      const card = g(r, C.card);
      return { parent: g(r, C.parent) || card.split('-')[0], card, name: g(r, C.name), fl: g(r, C.fl), status: g(r, C.status), flag: !!g(r, C.flag), ok: g(r, C.ok), file: file.name || '' };
    }).filter(x => x.card && /^\d+-/.test(x.card));
  }

  /* ---------- 計画を作る ---------- */
  function decide(row, useBlank) {
    const ok = row.ok.normalize('NFKC');
    if (/階\s*[:：]/.test(ok)) return { use: true, text: ok, fixed: true };
    if (/取り込まない|入れない|不要|^×$/.test(ok)) return { use: false, why: 'no' };
    if (/^(○|〇|◯|o|ok|ＯＫ|はい|合っている|あっている)$/i.test(ok)) return { use: true, text: row.fl };
    if (ok) return { use: false, why: 'odd' };                                   // 読めない書きこみ
    if (row.flag) return { use: false, why: 'flag' };
    return useBlank ? { use: true, text: row.fl } : { use: false, why: 'blank' };
  }
  function buildIndex() {
    const apts = new Map(), cands = new Map(), used = new Set();
    D().houses.forEach(h => {
      if (h.cid) used.add(h.cid);
      if (h.type !== 'apt' || !h.label) return;
      const t = terrById(h.terrId), k = nrm(h.label);
      if (!apts.has(k)) apts.set(k, []);
      apts.get(k).push({ h, par: parentOf(t) });
    });
    D().territories.forEach(t => (t.cands || []).forEach(c => {
      if (!c.n) return;
      const k = nrm(c.n);
      if (!cands.has(k)) cands.set(k, []);
      cands.get(k).push({ c, t, par: parentOf(t) });
    }));
    cands.forEach((list, k) => cands.set(k, list.filter(x => !used.has(x.c.i)))); // 地図に置いた候補は、アパートのほうで探す
    return { apts, cands };
  }
  function find(idx, keys, par) {
    const hit = (map, local) => {
      const seen = new Map();
      keys.forEach(k => (map.get(k) || []).forEach(x => { if (!local || x.par === par) seen.set(x.h ? x.h.id : x.c.i, x); }));
      return [...seen.values()];
    };
    let a = hit(idx.apts, true);
    if (a.length === 1) return { kind: 'apt', x: a[0] };
    if (a.length > 1) return { kind: 'many', n: a.length };
    let c = hit(idx.cands, true);
    if (c.length === 1) return { kind: 'cand', x: c[0] };
    if (c.length > 1) return { kind: 'many', n: c.length };
    a = hit(idx.apts, false); c = hit(idx.cands, false);
    if (a.length + c.length === 1) return a.length ? { kind: 'apt', x: a[0], far: true } : { kind: 'cand', x: c[0], far: true };
    if (a.length + c.length > 1) return { kind: 'many', n: a.length + c.length };
    return null;
  }
  function makePlan(rows, useBlank) {
    const groups = new Map(), plan = { items: [], miss: [], many: [], skip: { no: 0, odd: [], flag: 0, blank: 0 }, noName: [], empty: [], rows: rows.length, files: new Set() };
    rows.forEach(r => {
      plan.files.add(r.file);
      if (r.status && r.status !== '通常') return;                   // アパートなし・立入禁止・この地図では入りません
      const d = decide(r, useBlank);
      if (!d.use) {
        if (d.why === 'odd') plan.skip.odd.push(r); else plan.skip[d.why]++;
        return;
      }
      if (noName(r.name)) { plan.noName.push(r); return; }
      const key = r.parent + '|' + nrm(baseName(r.name));
      if (!groups.has(key)) groups.set(key, { parent: r.parent, name: baseName(r.name), rows: [], units: [], frames: [], skipped: 0, top: 0, fixed: false });
      const g = groups.get(key), p = parseFloors(d.text);
      g.rows.push(r); g.fixed = g.fixed || !!d.fixed;
      p.units.forEach(u => { if (!g.units.includes(u)) g.units.push(u); });
      p.frames.forEach(f => { if (!g.frames.includes(f)) g.frames.push(f); });
      g.skipped += p.skipped; g.top = Math.max(g.top, p.top);
    });
    const idx = buildIndex(), usedTarget = new Map();
    groups.forEach(g => {
      g.frames.forEach(f => { const fu = `${f}階`; if (!g.units.some(u => u === fu)) g.units.push(fu); });
      if (!g.units.length) { plan.empty.push(g); return; }
      const f = find(idx, nameKeys(g.name), g.parent);
      if (!f) { plan.miss.push(g); return; }
      if (f.kind === 'many') { g.n = f.n; plan.many.push(g); return; }
      g.kind = f.kind; g.x = f.x; g.far = !!f.far;
      const id = f.kind === 'apt' ? 'h:' + f.x.h.id : 'c:' + f.x.c.i;
      if (usedTarget.has(id)) { const o = usedTarget.get(id); g.n = 2; plan.many.push(g); if (plan.items.includes(o)) { plan.items.splice(plan.items.indexOf(o), 1); o.n = 2; plan.many.push(o); } return; }
      usedTarget.set(id, g);
      if (f.kind === 'apt') {
        const h = f.x.h, frames = !h.units.length || h.units.every(u => B_FRAME.test(u));
        g.mode = frames ? 'replace' : 'add';
        g.add = g.units.filter(u => !h.units.includes(u));
        if (!frames && !g.add.length) { g.same = true; }
      } else g.mode = 'cand';
      plan.items.push(g);
    });
    plan.todo = plan.items.filter(g => !g.same);
    return plan;
  }

  /* ---------- 入れる ---------- */
  function applyApt(g) {
    const h = houseById(g.x.h.id); if (!h || h.type !== 'apt') return 0;
    const before = h.units.slice();
    if (g.mode === 'replace') {
      const fls = new Set(g.units.map(u => { const q = typeof unitPos === 'function' ? unitPos(u) : null; return q ? q.fl : null; }).filter(Boolean));
      // 記録のある枠と、一覧に部屋がない階の枠は残す
      const keep = before.filter(u => !g.units.includes(u) && (unitHasRec(h.id, u) || (B_FRAME.test(u) && !fls.has(+u.match(B_FRAME)[1]))));
      h.units = g.units.concat(keep).slice(0, MAX_UNITS);
      const ul = Object.assign({}, h.ul || {});
      keep.forEach(u => { if (B_FRAME.test(u) && !ul[u] && fls.has(+u.match(B_FRAME)[1])) ul[u] = cleanUnit(u + '（部屋不明）'); });
      Object.keys(ul).forEach(u => { if (!h.units.includes(u)) delete ul[u]; });
      if (Object.keys(ul).length) h.ul = ul; else delete h.ul;
      if (h.uk) { Object.keys(h.uk).forEach(u => { if (!h.units.includes(u)) delete h.uk[u]; }); if (!Object.keys(h.uk).length) delete h.uk; }
    } else {
      h.units = before.concat(g.add.filter(u => !before.includes(u))).slice(0, MAX_UNITS);
    }
    return h.units.filter(u => !before.includes(u)).length;
  }
  function applyCand(g) {
    const c = g.x.c; if (!c) return 0;
    c.r = g.units.slice(0, MAX_UNITS);
    if (!c.f && g.top) c.f = Math.min(40, g.top);
    return c.r.length;
  }

  /* ---------- 画面 ---------- */
  const grpLine = g => `区域${esc(g.parent)}　${esc(g.name)}　<small class="muted">${esc(g.rows.map(r => r.card).join('・'))}</small>`;
  let lastRows = null;
  async function readFiles(files) {
    let rows = [];
    try {
      toast('一覧を読んでいます…');
      for (const f of files) {
        const r = await readBook(f);
        if (!r) { infoSheet('一覧を読み込めませんでした', `「${esc(f.name || '')}」に「読み取り結果」のシート（建物名・階ごとの部屋・確認の列）が見つかりませんでした。旧区域カードの読み取り一覧（エクセル）を選んでください。`); return; }
        rows = rows.concat(r);
      }
    } catch (e) {
      infoSheet('一覧を読み込めませんでした', 'エクセル（.xlsx）のファイルを選んでください。はじめて使うときは、インターネットにつながっている必要があります。');
      return;
    }
    if (!rows.length) { infoSheet('読める行がありませんでした', '「カード」の列に「9-⑤」のような番号がある行を読みます。'); return; }
    lastRows = rows;
    showPlan(false);
  }
  function showPlan(useBlank) {
    const plan = makePlan(lastRows, useBlank);
    const nApt = plan.todo.filter(g => g.kind === 'apt').length, nCand = plan.todo.filter(g => g.kind === 'cand').length;
    const nRooms = plan.todo.reduce((n, g) => n + (g.mode === 'add' ? g.add.length : g.units.length), 0);
    const nSame = plan.items.length - plan.todo.length;
    const det = (title, list, line, hint) => list.length ? `<details class="more"><summary>${title}（${list.length}）</summary>${hint ? `<p class="hint">${hint}</p>` : ''}<ul>${list.map(x => `<li>${line(x)}</li>`).join('')}</ul></details>` : '';
    setSheet(headHtml(null, '旧区域カードの部屋を入れる', esc([...plan.files].join('・'))) + `
      <div class="tiles"><div class="tile"><b>${nApt}</b><span>アパートに部屋を入れる</span></div>
        <div class="tile"><b>${nCand}</b><span>候補に部屋を持たせる</span></div>
        <div class="tile"><b>${plan.miss.length + plan.many.length}</b><span>建物が決まらない</span></div></div>
      <p class="hint">入れる部屋：<b>${nRooms}部屋</b>。建物名で、同じ親区域のアパート（なければ候補）を探しました。</p>
      <p class="hint"><b>入れる行</b>：確認の欄が「○」の行と、確認の欄に直した内容（「3階:1,2,3 / 2階:…」）を書いた行です。「取り込まない」と書いた行は入れません。</p>
      <label class="check"><input type="checkbox" id="ahBlank"${useBlank ? ' checked' : ''}><span>確認の欄が空の行も入れる<br><small class="muted">「要確認」の行は入れません。紙と見くらべていない行なので、あとで建物の画面で確かめてください。</small></span></label>
      <p class="hint">・「1階・2階…」の枠だけのアパートは、部屋番号に置きかえます（記録のある枠は「（部屋不明）」として、一覧に部屋がない階の枠はそのまま残します）。<br>
        ・すでに部屋番号があるアパートは、足りない部屋だけ足します（消しません）。<br>
        ・店・事務所・駐車場は部屋にしません。家主は「1階家主」のように入れます。</p>
      ${det('入れる建物', plan.todo, g => `${grpLine(g)}<br><small class="muted">${g.kind === 'cand' ? '候補に' : g.mode === 'add' ? `足す部屋 ${g.add.length}` : '枠を部屋番号に'}：${esc((g.mode === 'add' ? g.add : g.units).slice(0, 12).join(' '))}${(g.mode === 'add' ? g.add : g.units).length > 12 ? ' …' : ''}${g.far ? '　<b>親区域がちがう建物です</b>' : ''}${g.fixed ? '　（確認の欄の内容）' : ''}</small>`)}
      ${det('建物名で見つからない', plan.miss, grpLine, 'アプリに同じ名前のアパートも候補もありません。地図で家の印をタップして「アパート・マンションだった」から入れるか、建物の名前を直してから、もう一度選んでください。')}
      ${det('同じ名前の建物が2つ以上ある', plan.many, g => `${grpLine(g)}${g.n ? `（${g.n}棟）` : ''}`, 'どれか決められないので入れません。建物の画面で部屋を入れてください。')}
      ${det('もう部屋がそろっている', plan.items.filter(g => g.same), grpLine)}
      ${det('建物名がない（「A」「名前なし」など）', plan.noName, r => `${esc(r.card)}　${esc(r.name)}`, '地図で建物をさがして、建物の画面から入れてください。')}
      ${det('確認の欄が読めない', plan.skip.odd, r => `${esc(r.card)}　${esc(r.name)}　<small class="muted">「${esc(r.ok)}」</small>`, '「○」か「取り込まない」、または「3階:1,2,3 / 2階:1,2,3」の形で書いてください。')}
      <p class="hint">入れない行：要確認 ${plan.skip.flag}・確認の欄が空 ${plan.skip.blank}・取り込まない ${plan.skip.no}（立入禁止・アパートなしなどの行は読みません）</p>
      <button class="btn primary block" id="ahGo"${plan.todo.length ? '' : ' disabled'}>${plan.todo.length}棟に部屋を入れる</button>
      <button class="btn block" id="ahBack">もどる</button>`);
    $('#ahBlank').onchange = e => showPlan(e.target.checked);
    $('#ahBack').onclick = () => { if (window.AptImport && window.AptImport.openMain) window.AptImport.openMain(); else closeSheet(); };
    $('#ahGo').onclick = () => {
      if (!isAdmin()) return;
      let nA = 0, nC = 0, nU = 0;
      commit(`${plan.todo.length}棟に部屋を入れました`, () => {
        plan.todo.forEach(g => { const n = g.kind === 'apt' ? applyApt(g) : applyCand(g); if (n) { nU += n; if (g.kind === 'apt') nA++; else nC++; } });
      });
      showResult(plan, nA, nC, nU);
    };
  }
  function showResult(plan, nA, nC, nU) {
    const apts = plan.todo.filter(g => g.kind === 'apt' && houseById(g.x.h.id));
    setSheet(headHtml(null, '部屋を入れました', '') + `
      <p>アパート <b>${nA}</b>棟・候補 <b>${nC}</b>棟に、あわせて <b>${nU}</b>部屋を入れました。まちがえたときは、下に出ている「取り消す」でもどせます。</p>
      ${apts.length ? `<p class="hint">押すと地図がその建物に移り、建物の画面で部屋を確かめられます。</p>
        <div class="list">${apts.map(g => `<button class="btn block" data-ahgo="${esc(g.x.h.id)}">${grpLine(g)}${g.far ? '<br><small class="muted">親区域がちがう建物です</small>' : ''}</button>`).join('')}</div>` : ''}
      <button class="btn block" data-close>閉じる</button>`);
    $$('[data-ahgo]', $('#sheet')).forEach(x => x.onclick = () => {
      const h = houseById(x.dataset.ahgo); if (!h) return;
      closeSheet(); showView('map');
      setTimeout(() => { map.setView([h.lat, h.lng], 18); openBuilding(h.id); }, 150);
    });
  }

  /* アパートの登録の画面（apt-import.js）から開く */
  document.addEventListener('change', e => {
    const f = e.target && e.target.id === 'ahFile' ? e.target : null;
    if (!f) return;
    const files = [...(f.files || [])]; f.value = '';
    if (!isAdmin()) { toast('区域係だけが使えます'); return; }
    if (files.length) readFiles(files);
  });
  window.AptHeya = { parseFloors, unitName, nameKeys, makePlan, decide, applyApt, applyCand };
})();
