/* =========================================================
   区域マップ：名簿（グループ表のPDF）から、人とグループをまとめて更新する（meibo.js）【2026-10-24】
   区域係の「人とグループ」の「名簿（PDF）から更新」から開く。

   名簿の読み方（豊見城会衆の「野外奉仕グループ」の表の形）
   ・いちばん上の行：グループの名前（列ごと）
   ・左はしの「監」の行＝グループ監督、「補」の行＝補佐（司会者にする）、数字の行＝グループの人
   ・名前の前の「(開)」は開拓者の印なので、名前だけを使う
   ・名前の前に「不」「子」がある人は登録しない

   消さないための決まり
   ・今いる人は、id を変えずに、名前・グループ・監督・司会者だけを書きかえる。
     再訪問のメモ・受け持ち・訪問の記録・端末の登録は id で結びついているので、そのまま使える
   ・名簿に見つからない今の人は、何もしない（「名簿にいない（今のまま）」が初めの値）
   ・使うのをやめるのは、係が1人ずつえらび、さらに確認の画面で「消していいですか」に答えたときだけ
   ・新しく登録する人は、一覧で確かめてから登録する（外すこともできる）
   ・サーバーは、書く前に users シートの控えを残す（meibo.gs）
   ========================================================= */
(function () {
  'use strict';
  const MB = window.MEIBO = {};
  const key = s => String(s || '').normalize('NFKC').replace(/\s+/g, '');          // 同じ名前かを見る形
  const T = s => (window.KI ? window.KI.t(s) : s); // 確認の画面の文（1つの文字のかたまりになるので、先に訳す）
  const tidy = s => String(s || '').replace(/[　\s]+/g, ' ').trim().slice(0, 30); // 登録する形

  /* ---------- PDFの文字の並びから、表を読む ----------
     items：[{ s: 文字, x: 左, y: 下からの高さ, w: 幅 }]（1ページ分） */
  MB.parseItems = function (items) {
    const its = items.map(i => ({ s: String(i.s || '').trim(), x: i.x, y: i.y, w: i.w || 0 }))
      .filter(i => i.s && isFinite(i.x) && isFinite(i.y));
    its.forEach(i => { i.cx = i.x + i.w / 2; i.k = key(i.s); });
    // 左はしの行の見出し（監・補・数字）
    let labels = its.filter(i => /^(監|補|\d{1,3})$/.test(i.k));
    if (!labels.length) return null;
    const minX = Math.min(...labels.map(i => i.x));
    labels = labels.filter(i => i.x <= minX + 25);
    if (!labels.some(i => i.k === '監' || i.k === '補') && labels.length < 3) return null;
    const labelRight = Math.max(...labels.map(i => i.x + i.w));
    const rows = labels.map(i => ({ y: i.y, kind: i.k === '監' ? 'ov' : i.k === '補' ? 'ld' : 'n' })).sort((a, b) => b.y - a.y);
    const gaps = rows.slice(1).map((r, i) => rows[i].y - r.y).filter(g => g > 1).sort((a, b) => a - b);
    const tol = Math.max(3, (gaps.length ? gaps[Math.floor(gaps.length / 2)] : 16) * 0.45);
    // グループの名前：いちばん上の見出しのすぐ上の行
    const topY = rows[0].y;
    const above = its.filter(i => i.x > labelRight && i.y > topY + tol);
    if (!above.length) return null;
    const hy = Math.min(...above.map(i => i.y));
    const heads = above.filter(i => Math.abs(i.y - hy) <= 4).sort((a, b) => a.cx - b.cx);
    if (!heads.length) return null;
    const cols = heads.map(h => ({ name: tidy(h.s), cx: h.cx }));
    const colOf = cx => { let best = 0; cols.forEach((c, j) => { if (Math.abs(c.cx - cx) < Math.abs(cols[best].cx - cx)) best = j; }); return best; };
    const left = cols[0].cx - (cols.length > 1 ? (cols[1].cx - cols[0].cx) / 2 : 200), right = cols[cols.length - 1].cx + (cols.length > 1 ? (cols[cols.length - 1].cx - cols[cols.length - 2].cx) / 2 : 200);
    // ます目ごとに文字を集める
    const cells = new Map();
    its.forEach(i => {
      if (i.x <= labelRight || i.cx < left || i.cx > right || i.y > topY + tol) return;
      let ri = -1, d = tol;
      rows.forEach((r, j) => { const dd = Math.abs(r.y - i.y); if (dd <= d) { d = dd; ri = j; } });
      if (ri < 0) return;
      const ck = ri + ':' + colOf(i.cx);
      if (!cells.has(ck)) cells.set(ck, []);
      cells.get(ck).push(i);
    });
    const out = { groups: cols.map(c => c.name), entries: [] };
    cells.forEach((list, ck) => {
      const [ri, ci] = ck.split(':').map(Number);
      list.sort((a, b) => a.x - b.x);
      let text = '';
      list.forEach((i, j) => { text += (j && i.x - (list[j - 1].x + list[j - 1].w) > 1.5 ? ' ' : '') + i.s; });
      const first = list[0].k;
      out.entries.push({ kind: rows[ri].kind, group: cols[ci].name, raw: tidy(text), firstMark: first === '不' || first === '子' ? first : '' });
    });
    return out;
  };

  /* 1つのます目の文字から、名前と印を取り出す */
  function readCell(e) {
    let t = e.raw, pioneer = false, mark = e.firstMark;
    for (let n = 0; n < 3; n++) {
      const m = /^[(（]\s*開\s*[)）]\s*/.exec(t);
      if (m) { pioneer = true; t = t.slice(m[0].length); continue; }
      const x = /^(不|子)(\s+|$)/.exec(t);
      if (x) { mark = mark || x[1]; t = t.slice(x[0].length); continue; }
      break;
    }
    return { name: tidy(t), pioneer, mark };
  }

  /* 表 → 名簿（登録する人・登録しない人・気になること） */
  MB.roster = function (tables) {
    const people = new Map(), skipped = [], notes = [], groups = [];
    const flags = [];
    tables.forEach(tb => {
      tb.groups.forEach(g => { if (g && groups.indexOf(g) < 0) groups.push(g); });
      tb.entries.forEach(e => {
        const c = readCell(e);
        if (!c.name) return;
        const k = key(c.name);
        if (e.kind !== 'n') { flags.push({ k, name: c.name, group: e.group, kind: e.kind }); return; }
        if (c.mark) { skipped.push({ name: c.name, group: e.group, mark: c.mark, k }); return; }
        const p = people.get(k);
        if (p) {
          if (p.group !== e.group) notes.push(`「${c.name}」さんが、${p.group}と${e.group}の2つのグループにいます。${p.group}にしました`);
          return;
        }
        people.set(k, { k, name: c.name, group: e.group, overseer: false, leader: false, pioneer: c.pioneer });
      });
    });
    flags.forEach(f => {
      let p = people.get(f.k);
      if (!p) { p = { k: f.k, name: f.name, group: f.group, overseer: false, leader: false }; people.set(f.k, p); }
      else if (p.group !== f.group) notes.push(`「${f.name}」さんは${p.group}の人ですが、${f.group}の${f.kind === 'ov' ? '監督' : '補佐'}の欄にもいます。${p.group}のままにしました`);
      if (f.kind === 'ov') p.overseer = true; else p.leader = true;
    });
    skipped.forEach(s => { if (people.has(s.k)) notes.push(`「${s.name}」さんは、名簿に「${s.mark}」つきと、つかないものの2回あります。登録します`); });
    return { groups, people: [...people.values()], skipped: skipped.filter(s => !people.has(s.k)), notes };
  };

  /* PDFのファイル → 表（ページごと） */
  async function readPdf(file) {
    await loadScript(LIB.pdf);
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = LIB.pdfWorker;
    const doc = await window.pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise; // CVE-2024-4367 の回避策（点検①S4）
    const tables = [];
    try {
      for (let p = 1; p <= Math.min(doc.numPages, 10); p++) {
        const page = await doc.getPage(p);
        const tc = await page.getTextContent();
        const t = MB.parseItems(tc.items.map(i => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width })));
        if (t && t.entries.length) tables.push(t);
      }
    } finally { try { doc.destroy(); } catch (e) { /* 何もしない */ } }
    return tables;
  }

  /* ---------- 今の登録と合わせる ---------- */
  // st：{ R: 名簿, link: { 今の人のid: 名簿の人のk | '' | 'off' }, addOff: Set(登録しない名簿の人のk) }
  function plan(st) {
    const R = st.R, users = D().users;
    const byKey = new Map();
    users.forEach(u => { const k = key(u.name); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(u); });
    const matched = new Map(); // 名簿の人のk → 今の人
    const usedU = new Set();
    // 1. 名前が同じ人（使っている人を先に）
    R.people.forEach(p => {
      const c = (byKey.get(p.k) || []).slice().sort((a, b) => (a.inactive ? 1 : 0) - (b.inactive ? 1 : 0));
      if (c.length) { matched.set(p.k, c[0]); usedU.add(c[0].id); }
    });
    const exactU = new Set(usedU); // 名前で見つかった人（係がえらぶ一覧には出さない）
    const exactK = new Set(matched.keys());
    // 2. 係がえらんだ人
    Object.keys(st.link).forEach(id => {
      const v = st.link[id];
      if (!v || v === 'off' || usedU.has(id)) return;
      const u = userById(id); if (!u || u.inactive || matched.has(v)) return;
      matched.set(v, u); usedU.add(id);
    });
    const ups = [], adds = [], ons = [], offs = [], same = [];
    R.people.forEach(p => {
      const u = matched.get(p.k);
      if (!u) { if (!st.addOff.has(p.k)) adds.push(p); return; }
      const rename = key(u.name) !== p.k;
      const ch = rename || (u.group || '') !== normGroup(p.group) || !!u.overseer !== p.overseer || !!u.leader !== p.leader || !!u.inactive;
      if (!ch) { same.push({ u, p }); return; }
      const x = { u, p, rename, group: (u.group || '') !== normGroup(p.group), role: !!u.overseer !== p.overseer || !!u.leader !== p.leader };
      if (u.inactive) ons.push(x); else ups.push(x);
    });
    // 名簿に見つからない、今使っている人
    const rest = users.filter(u => !u.inactive && !exactU.has(u.id));
    rest.forEach(u => { if (st.link[u.id] === 'off' && u.id !== me().id) offs.push(u); });
    const pick = new Map(); // 2人以上に同じ名簿の人がえらばれていないか
    Object.keys(st.link).forEach(id => { const v = st.link[id]; if (v && v !== 'off') pick.set(v, (pick.get(v) || 0) + 1); });
    const twice = [...pick.entries()].filter(x => x[1] > 1).map(x => x[0]);
    return { ups, adds, ons, offs, same, rest, matched, twice, exactK };
  }

  /* 名簿に見つからない今の人に、名簿のだれかを提案する（その人だけに当てはまるときだけ） */
  function suggest(u, free) {
    const k = key(u.name);
    if (!k) return '';
    const hit = free.filter(p => p.k.indexOf(k) >= 0);
    return hit.length === 1 ? hit[0].k : '';
  }

  /* ---------- 画面 ---------- */
  MB.open = function () {
    if (!isAdmin()) return;
    setSheet(headHtml(null, '名簿（PDF）から更新', 'グループ表のPDFを読み、人とグループをまとめて直します') + `
      <p>グループの名前・グループ監督（監）・補佐（補）・グループの人が並んだ名簿のPDFをえらんでください。</p>
      <ul class="hint" style="padding-left:20px;margin:6px 0 12px">
        <li>「補」の人は、司会者にします。</li>
        <li>名前の前の「(開)」は印なので、名前だけを登録します。</li>
        <li>名前の前に「不」「子」がある人は登録しません。</li>
        <li>今登録されている人は、同じ人のまま名前とグループを直すので、再訪問のメモや記録はそのまま使えます。</li>
        <li>読み取ったあと、変わる内容を確かめてから更新します。PDFをえらんだだけでは、何も変わりません。</li>
      </ul>
      <label class="btn primary block">名簿のPDFをえらぶ<input type="file" id="mbFile" accept="application/pdf,.pdf" hidden></label>
      <button class="btn block" data-close>やめる</button>`);
    $('#mbFile').onchange = async e => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      toast('名簿を読んでいます…');
      let tables;
      try { tables = await readPdf(f); } catch (err) {
        infoSheet('名簿を読めませんでした', 'インターネットにつながっているか、ファイルが壊れていないかを確かめて、もう一度えらんでください。パスワード付きのPDFや、写真を取りこんだだけのPDFは読めません。');
        return;
      }
      const R = MB.roster(tables);
      if (!R.groups.length || R.people.length < 2) {
        infoSheet('名簿の形が読み取れませんでした', '左はしに「監」「補」と番号、いちばん上にグループの名前が並んだ表のPDFをえらんでください。写真を取りこんだだけのPDFは読めません。何も変えていません。');
        return;
      }
      review({ R, link: {}, addOff: new Set(), file: f.name || '名簿' });
    };
  };

  function review(st) {
    const R = st.R;
    // 名簿に見つからない今の人：初めに一度だけ、提案を入れる
    if (!st.seeded) {
      st.seeded = true;
      const p0 = plan(st);
      const free = R.people.filter(p => !p0.matched.has(p.k));
      p0.rest.forEach(u => { const s = suggest(u, free); if (s) st.link[u.id] = s; });
    }
    const P = plan(st);
    const free = R.people.filter(p => !P.exactK.has(p.k)); // 名前で見つからなかった名簿の人（だれかにえらばれていても出す）
    const byGroup = g => R.people.filter(p => p.group === g);
    const nm = s => `<b data-notr>${esc(s)}</b>`;
    const optList = cur => {
      const opts = R.groups.map(g => {
        const ps = free.filter(p => p.group === g);
        return ps.length ? `<optgroup label="${esc(g)}">${ps.map(p => `<option value="${esc(p.k)}"${p.k === cur ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</optgroup>` : '';
      }).join('');
      return `<option value=""${!cur ? ' selected' : ''}>名簿にいない（今のまま）</option>${opts}<option value="off"${cur === 'off' ? ' selected' : ''}>名簿にいない・使うのをやめる（転出など）</option>`;
    };
    const restHtml = P.rest.length ? `<h3 class="sub">名簿で見つからない、今の登録の人（${P.rest.length}人）</h3>
      <p class="hint">名前がちがうだけで同じ人なら、名簿の名前をえらんでください。同じ人のまま名前を直すので、再訪問のメモや記録はそのまま使えます。えらばないと、今のまま残ります（何も消えません）。</p>
      ${P.rest.map(u => `<label class="field"><span>${nm(u.name)}${u.group ? `　<small class="hint">今のグループ：${esc(u.group)}</small>` : ''}${u.id === me().id ? '　<small class="hint">（あなた）</small>' : ''}</span>
        <select class="big" data-mblink="${esc(u.id)}">${u.id === me().id ? optList(st.link[u.id] || '').replace(/<option value="off"[^>]*>[^<]*<\/option>/, '') : optList(st.link[u.id] || '')}</select></label>`).join('')}` : '';
    const addHtml = R.people.filter(p => !P.matched.has(p.k)).length ? `<h3 class="sub">新しく登録する人（${P.adds.length}人）</h3>
      <p class="hint">今の登録にいない人です。登録しない人は、チェックを外してください。登録しても、本人がスマホで申し込み、係が承認するまでは使えません。</p>
      ${R.groups.map(g => { const ps = byGroup(g).filter(p => !P.matched.has(p.k)); return ps.length ? `<p class="q">${esc(g)}</p>` +
        ps.map(p => `<label class="check"><input type="checkbox" data-mbadd="${esc(p.k)}"${st.addOff.has(p.k) ? '' : ' checked'}>${nm(p.name)}${p.overseer ? ' <span class="gbadge">監督</span>' : ''}${p.leader ? ' <span class="gbadge">司会者</span>' : ''}</label>`).join('') : ''; }).join('')}` : '';
    const chLine = x => `<li>${nm(x.rename ? `${x.u.name} → ${x.p.name}` : x.p.name)}　${[x.group ? `グループ ${esc(x.u.group || 'なし')} → ${esc(x.p.group)}` : '', x.role ? `${x.p.overseer ? '監督' : x.p.leader ? '司会者' : '監督・司会者ではなくなる'}` : ''].filter(Boolean).join('・')}</li>`;
    const upHtml = P.ups.length ? `<details class="dueset"><summary>名前・グループなどが変わる人（${P.ups.length}人）</summary><ul style="padding-left:20px">${P.ups.map(chLine).join('')}</ul></details>` : '';
    const onHtml = P.ons.length ? `<h3 class="sub">もう一度使えるようにする人（${P.ons.length}人）</h3><p class="hint">前に「使うのをやめる」にした人です。同じ人として戻すので、受け持ちの家と記録が戻ります（消えた再訪問のメモは戻りません）。</p><ul style="padding-left:20px">${P.ons.map(chLine).join('')}</ul>` : '';
    const groupsHtml = `<table class="slots narrow"><tr><th>グループ</th><th>監督</th><th>司会者</th><th>人数</th></tr>${R.groups.map(g => {
      const ps = byGroup(g);
      return `<tr><th>${esc(g)}</th><td data-notr>${esc(ps.filter(p => p.overseer).map(p => p.name).join('、') || '—')}</td><td data-notr>${esc(ps.filter(p => p.leader).map(p => p.name).join('、') || '—')}</td><td>${ps.length}人</td></tr>`;
    }).join('')}</table>
      <details class="dueset"><summary>名簿から読み取った名前を見る</summary>${R.groups.map(g => `<p class="q">${esc(g)}（${byGroup(g).length}人）</p><p data-notr>${byGroup(g).map(p => esc(p.name)).join('、')}</p>`).join('')}
        ${R.skipped.length ? `<p class="q">登録しない人（「不」「子」・${R.skipped.length}人）</p><p data-notr>${R.skipped.map(s => esc(`${s.mark} ${s.name}`)).join('、')}</p>` : ''}</details>`;
    const warn = [];
    if (P.twice.length) warn.push('同じ名簿の人を、2人の今の登録にえらんでいます。1人だけにしてください。');
    if (P.rest.some(u => !st.link[u.id]) && P.adds.length) warn.push('「名簿にいない（今のまま）」の人の中に、名前がちがうだけの同じ人がいないか確かめてください。同じ人を新しく登録すると、2人に分かれ、前の再訪問のメモが新しいほうに引きつがれません。');
    const total = P.ups.length + P.adds.length + P.ons.length + P.offs.length;
    setSheet(headHtml(null, '名簿の内容を確かめる', esc(st.file)) + `
      <p>名簿から${R.people.length}人（${R.groups.length}グループ）を読み取りました。</p>
      ${R.skipped.length ? `<p class="hint">「不」「子」の${R.skipped.length}人は登録しません。</p>` : ''}
      ${groupsHtml}
      ${R.notes.length ? `<div class="notice warn">${R.notes.map(esc).join('<br>')}</div>` : ''}
      ${restHtml}${addHtml}${onHtml}
      <h3 class="sub">変わること</h3>
      <ul style="padding-left:20px;margin:4px 0"><li>名前・グループなどを直す：${P.ups.length}人</li><li>新しく登録する：${P.adds.length}人</li>
        ${P.ons.length ? `<li>もう一度使えるようにする：${P.ons.length}人</li>` : ''}${P.offs.length ? `<li><b>使うのをやめる：${P.offs.length}人</b></li>` : ''}<li>変わらない：${P.same.length}人</li></ul>
      ${upHtml}
      <p class="hint">役割（伝道者・区域係）と、各自の設定は変えません。名簿にいない人は、えらばない限り今のまま残ります。更新の前の名簿の控えを、スプレッドシートに残します。</p>
      ${warn.length ? `<div class="notice warn">${warn.join('<br>')}</div>` : ''}
      <button class="btn primary block" id="mbGo"${!total || P.twice.length ? ' disabled' : ''}>${total ? 'この内容で更新する' : '変わることはありません'}</button>
      <button class="btn block" data-close>やめる</button>`);
    $$('[data-mblink]', $('#sheet')).forEach(s => s.onchange = () => { st.link[s.dataset.mblink] = s.value; sheetKeepNext(); review(st); });
    $$('[data-mbadd]', $('#sheet')).forEach(c => c.onchange = () => { if (c.checked) st.addOff.delete(c.dataset.mbadd); else st.addOff.add(c.dataset.mbadd); sheetKeepNext(); review(st); });
    $('#mbGo').onclick = () => apply(st, P);
  }
  // 選びなおしたとき、見ていた位置のまま描き直す
  function sheetKeepNext() { try { sheetKeep = true; } catch (e) { /* 何もしない */ } }

  async function apply(st, P) {
    const lines = [];
    if (P.ups.length) lines.push(T(`名前・グループなどを直す：${P.ups.length}人`));
    if (P.adds.length) lines.push(T(`新しく登録する：${P.adds.length}人`));
    if (P.ons.length) lines.push(T(`もう一度使えるようにする：${P.ons.length}人`));
    if (P.offs.length) lines.push(T(`使うのをやめる：${P.offs.length}人`));
    lines.push(T('今の登録の人は、同じ人のまま直すので、再訪問のメモや記録は消えません。'));
    if (!await ask('', { title: T('名簿の内容で更新しますか？'), body: lines.join('\n'), ok: '更新する', danger: false })) return;
    if (P.offs.length && !await ask('', { title: T(`${P.offs.length}人のデータを消していいですか？`),
      body: `${P.offs.map(u => u.name).join('、')}\n` + T('この人たちは区域マップを使えなくなり、スマホでは、次に開いたときに区域の情報が消えます。再訪問のメモ（次の約束・📌）も消え、元にもどせません（本人がバックアップを保存していれば、もどせます）。受け持ちの家と会えた記録は残ります。'),
      ok: '消して、使うのをやめる', cancel: 'この人たちは残す', danger: true })) {
      P.offs.forEach(u => { st.link[u.id] = ''; });
      review(st);
      toast('使うのをやめる人は、今のまま残しました。もう一度確かめてください');
      return;
    }
    const items = [];
    P.ups.concat(P.ons).forEach(x => {
      const it = { op: 'upd', id: x.u.id, group: normGroup(x.p.group), overseer: x.p.overseer, leader: x.p.leader };
      if (x.rename) it.name = x.p.name;
      if (x.u.inactive) it.on = true;
      items.push(it);
    });
    P.adds.forEach(p => items.push({ op: 'add', name: p.name, group: normGroup(p.group), overseer: p.overseer, leader: p.leader }));
    P.offs.forEach(u => items.push({ op: 'off', id: u.id }));
    if (!LIVE) { // 試作版：この端末の中だけ
      commit('名簿の内容で更新しました', () => {
        items.forEach(it => {
          if (it.op === 'add') { D().users.push(Object.assign({ id: 'u' + uid(), name: it.name, role: 'pub', group: it.group || undefined }, it.overseer ? { overseer: true } : {}, it.leader ? { leader: true } : {})); return; }
          const u = userById(it.id); if (!u) return;
          if (it.op === 'off') { u.inactive = true; return; }
          if (it.name) u.name = it.name;
          u.group = it.group || undefined; u.overseer = it.overseer || undefined; u.leader = it.leader || undefined;
          if (it.on) delete u.inactive;
        });
      });
      closeSheet(); return;
    }
    const btn = $('#mbGo'); if (btn) { btn.disabled = true; btn.textContent = '更新しています…'; }
    let j;
    try { j = await api('user_bulk', { items }, { timeout: 120000 }); } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = 'この内容で更新する'; }
      if (e && e.code === 'unknown_action') { infoSheet('まだ更新できません', 'サーバーの準備がまだです。少しあとで、もう一度ためしてください。何も変えていません。'); return; }
      toast('更新できませんでした。通信を確認して、もう一度押してください（同じ内容を2回送っても、人が2人に増えることはありません）');
      return;
    }
    await refresh(true).catch(() => {});
    renderAll();
    const sk = (j.skipped || []).length;
    const why = { dup_name: '同じ名前の別の人がいる', exists: 'もう登録されている', twice: '同じ人が2回', self: '自分は止められない', not_found: '見つからない', name: '名前が空', op: '' };
    const skList = (j.skipped || []).map(s => { const it = items[s.i] || {}; const u = it.id ? userById(it.id) : null; return `${esc(it.name || (u && u.name) || '')}（${why[s.why] || s.why}）`; });
    setSheet(headHtml(null, '名簿の内容で更新しました', '') + `
      <ul style="padding-left:20px;margin:4px 0"><li>名前・グループなどを直した人：${j.upd || 0}人</li><li>新しく登録した人：${j.add || 0}人</li>
        ${j.on ? `<li>もう一度使えるようにした人：${j.on}人</li>` : ''}${j.off ? `<li>使うのをやめた人：${j.off}人</li>` : ''}</ul>
      ${sk ? `<div class="notice warn">次の${sk}件は、そのままにしました。<br><span data-notr>${skList.join('<br>')}</span></div>` : ''}
      <p class="hint">新しく登録した人は、共通リンクのQRから申し込んでもらい、「申請・承認」で、その人の名前をえらんで承認してください。更新の前の名簿は、スプレッドシートの「users_控え」に残っています。</p>
      <button class="btn primary block" data-close>閉じる</button>`);
  }
})();
