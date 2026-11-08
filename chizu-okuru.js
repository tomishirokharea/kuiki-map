/* =========================================================
   区域マップ：区域カードの「印刷・送る」（chizu-okuru.js・2026-11-08）
   ・区域カード（自分の区域・一緒に回る区域・司会する区域）から、その区域の地図を
     A4たて1枚にして、印刷する／PDFにしてLINEなどで送る。だれでも使える
   ・紙面は係の S-12 と同じ部品（s12Prep・s12FrontHtml・s12BackHtml）を使う
     集合住宅がある区域：上に地図（A5の表）、下に集合住宅の部屋（A5の裏）
     集合住宅がない区域：地図を1枚いっぱいに大きく
   ・PDF は外の部品を使わず、紙面を画像（JPEG）にして、PDF の形に包むだけ（軽い・通信しない）
   ・app.js のあとに読む
   ========================================================= */
(function () {
  'use strict';
  const NOTE = '区域の奉仕のためだけに使ってください。回り終えたら、送ったPDFや印刷した紙は消して（捨てて）ください。';
  const A4W = 595.28, A4H = 841.89; // PDF の1ページ（ポイント）
  let busy = false;

  /* その区域を印刷・送ってよい人：担当・今日一緒に回る人・今日の司会・区域係 */
  function canSend(t) {
    if (!t) return false;
    if (isAdmin()) return true;
    const uid = me().id;
    return t.holder === uid || helpersOf(t).some(h => h.uid === uid) || isLead(t);
  }
  const fileName = (t, ext) => `区域${String(t.no).replace(/[\\/:*?"<>|\s]/g, '')}_地図.${ext}`;
  /* スマホでは、紙面を「画像」にして共有の画面に出す（区域係の印刷と同じ）。
     PDF だと iPhone の共有の画面に LINE が出ないことがあるため。画像なら LINE も「プリント」も出る（2026.13.126） */
  const canShareImg = () => isMobile() && typeof File !== 'undefined' && !!navigator.canShare &&
    (() => { try { return navigator.canShare({ files: [new File([''], 'a.jpg', { type: 'image/jpeg' })] }); } catch (e) { return false; } })();
  const isAndroid = () => /Android/.test(navigator.userAgent);

  /* 作った画像は、この画面を開いているあいだ10分だけ取っておく（同じ日のうち）。
     2回目からは、押したその場で共有の画面を出せる（作り直す待ちがない） */
  const IMG = new Map(), KEEP = 10 * 60 * 1000;
  const cachedImg = t => { const c = IMG.get(t.id); return c && c.day === ymd(new Date()) && Date.now() - c.at < KEEP ? c.file : null; };

  function openMapSend(id) {
    const t = terrById(id);
    if (!canSend(t)) { toast('この区域の地図は、印刷・送ることができません'); return; }
    const share = canShareImg();
    // スマホ：間の画面を出さずに、すぐ共有の画面へ（2026.13.127）
    if (share) { const f = cachedImg(t); if (f) shareNow(t, f); else run(t, 'img'); return; }
    setSheet(`<h2>区域${esc(t.no)}の地図</h2>
      <p class="muted">${esc(t.name || '')}</p>
      <p>区域の線・家・拒否の印が入った地図を、A4の紙1枚にします。</p>
      ${housesOf(t.id).some(h => h.type === 'apt') ? '<p>下半分に、集合住宅の部屋の一覧が入ります。</p>' : ''}
      ${share ? '<button type="button" class="btn primary block" id="msImg">共有する（LINE・印刷など）</button>' : '<button type="button" class="btn primary block" id="msPdf">PDFを保存する</button>'}
      ${!share || isAndroid() ? '<button type="button" class="btn block" id="msPrint" style="margin-top:10px">印刷する</button>' : ''}
      <p class="hint">${NOTE}</p>
      <button type="button" class="btn block" data-close>閉じる</button>`);
    if ($('#msImg')) $('#msImg').onclick = () => run(t, 'img');
    if ($('#msPdf')) $('#msPdf').onclick = () => run(t, 'pdf');
    if ($('#msPrint')) $('#msPrint').onclick = () => run(t, 'print');
  }

  /* 1区域の紙面（A4たて1枚）を作る。
     集合住宅の部屋の一覧は、入るのに要る高さだけ下に取り（多くても半分）、残りはすべて地図にする */
  const PAGE_H = 296.5, FRONT_EXTRA = 40, BACK_EXTRA = 26; // 地図・部屋の一覧のほかに要る高さ（見出し・凡例・余白。mm）
  function backNeed(c, base) {
    const box = document.createElement('div');
    box.className = 'pdoc s12measure a5';
    box.innerHTML = s12BackHtml(c, base, base.font);
    document.body.appendChild(box);
    const el = box.querySelector('.s12apts');
    el.style.height = 'auto';
    const mm = el.scrollHeight / PX_MM;
    box.remove();
    return mm + BACK_EXTRA;
  }
  async function pageHtml(t) {
    const byT = new Map([[t.id, housesOf(t.id)]]); // 家の索引を使う（3万件を全部は見ない）
    const base = S12_SIZE.a5;
    let c = s12Prep(t, base, byT);
    const backH = c.apts.length ? Math.min(PAGE_H / 2, Math.max(60, Math.ceil(backNeed(c, base)))) : 0;
    const frontH = PAGE_H - backH, mapH = Math.round(frontH - FRONT_EXTRA);
    c = s12Prep(t, Object.assign({}, base, { mapH }), byT);
    const { tileUrl, bad } = await s12Load([c]);
    const now = new Date(), stamp = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}`;
    // A4 1枚では、部屋の一覧は同じ面の下にある（S-12 の「裏面」「表の地図」を言いかえる）
    const front = s12FrontHtml(c, tileUrl, stamp, NOTE).replace('集合住宅（番号は裏面）', '集合住宅（番号は下の一覧）');
    let back = '', over = false;
    if (backH) {
      const S = Object.assign({}, base);
      const fit = s12FitBacks([c], S, 'a5'); // 半分に入りきらないときだけ、文字を小さくする
      back = s12BackHtml(c, S, fit.size.get(t.id) || base.font).replace('集合住宅（番号は表の地図）', '集合住宅（番号は上の地図）');
      over = fit.over.length > 0;
    }
    const st = `grid-template-rows:${frontH}mm${backH ? ` ${backH}mm` : ''};--kmmap:${mapH}mm;--kmapt:${Math.max(30, backH - BACK_EXTRA)}mm`;
    return { html: `<div class="s12doc"><div class="s12sheet a5 kmsend" style="${st}">${front}${back}</div></div>`, bad, over };
  }

  async function run(t, how) {
    if (busy) return;
    busy = true;
    try {
      const p = await pageHtml(t);
      const warn = [];
      if (p.bad) warn.push(`地図の画像${p.bad}枚を受け取れませんでした。電波のよい所で、もう一度ためしてください`);
      if (p.over) warn.push('集合住宅の部屋が多く、全部は入りきりませんでした');
      if (how === 'print') {
        printDoc(p.html, false, '@page{size:A4 portrait;margin:0}');
      } else {
        const img = how === 'img';
        showBlocking(img ? '地図を画像にしています…' : 'PDFを作っています…', '少しお待ちください。', true);
        let jpg;
        try { jpg = await Promise.race([jpegFromHtml(p.html), wait(30000).then(() => { throw new Error('timeout'); })]); } finally { hideBlocking(); } // 画像にする処理が止まっても、待つ画面が消えるように
        if (img) {
          const f = new File([jpg], fileName(t, 'jpg'), { type: 'image/jpeg' });
          if (!p.bad) IMG.set(t.id, { file: f, at: Date.now(), day: ymd(new Date()) }); // 地図が欠けた画像は取っておかない
          shareNow(t, f);
        } else ready(t, new File([pdfOfJpegBytes(jpg)], fileName(t, 'pdf'), { type: 'application/pdf' }));
      }
      if (warn.length) setTimeout(() => toast(warn.join('。')), how === 'print' ? 3800 : 600);
    } catch (e) {
      hideBlocking();
      toast(how === 'pdf' ? 'PDFを作れませんでした。「印刷する」から、印刷の画面で「PDFとして保存」をえらんでください' : '印刷の準備がうまくいきませんでした。もう一度ためしてください');
    } finally { busy = false; }
  }

  /* すぐ共有の画面を出す。画像を作るのに時間がかかり、ブラウザに「押したその場ではない」と止められたときだけ、
     「共有する」ボタンの画面を出す。共有の画面を閉じただけのときは何もしない（Android は「印刷する」を選べる画面を出す） */
  function shareNow(t, file) {
    let p;
    try { p = navigator.share({ files: [file] }); } catch (e) { ready(t, file); return; }
    p.then(() => {}, e => {
      if (e && e.name === 'AbortError') { if (isAndroid()) ready(t, file); return; }
      ready(t, file);
    });
  }

  /* できた画像・PDFを共有する・保存する。共有の画面は、押したその場で出す必要があるので、ボタンを1つはさむ */
  function ready(t, file) {
    const img = file.type === 'image/jpeg';
    const share = img && navigator.canShare && navigator.canShare({ files: [file] });
    let el = $('#printReady');
    if (!el) { el = document.createElement('div'); el.id = 'printReady'; document.body.appendChild(el); }
    el.innerHTML = `<div class="blockbox" role="dialog" aria-modal="true" aria-labelledby="msTitle"><h2 id="msTitle">準備ができました</h2>
      <p>区域${esc(t.no)}の地図（A4・1ページ）</p>
      <p>${share ? '「共有する」を押すと、共有の画面が出ます。LINE で送るときは「LINE」、印刷するときは「プリント」をえらんでください。' : '「保存する」を押すと、PDFが保存されます。'}</p>
      <button type="button" class="btn primary block" id="msGo">${share ? '共有する' : '保存する'}</button>
      ${share && isAndroid() ? '<button type="button" class="btn block" id="msPr">印刷する</button>' : ''}
      <button type="button" class="btn block" id="msNo">閉じる</button></div>`;
    el.hidden = false;
    const close = () => { el.hidden = true; };
    $('#msNo').onclick = close;
    if ($('#msPr')) $('#msPr').onclick = () => { close(); run(t, 'print'); };
    $('#msGo').onclick = () => {
      if (share) {
        // 共有の画面を閉じただけ（AbortError）のときは、この画面を残して、もう一度押せるようにする
        navigator.share({ files: [file] }).then(close, e => { if (!e || e.name !== 'AbortError') { save(file); close(); } });
      } else { save(file); close(); }
    };
    const h = el.querySelector('h2'); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
  }
  function save(file) {
    const u = URL.createObjectURL(file), a = document.createElement('a');
    a.href = u; a.download = file.name; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 60000);
  }

  /* 紙面を画像（JPEG のバイト列）にする */
  async function jpegFromHtml(html) {
    const host = document.createElement('div');
    host.className = 'pdoc';
    host.style.cssText = 'position:fixed;left:-99999px;top:0;background:#fff';
    host.innerHTML = html;
    document.body.appendChild(host);
    try {
      for (const x of Array.from(host.querySelectorAll('image'))) {
        const u = x.getAttribute('href') || x.getAttribute('xlink:href'), d = await imgToData(u);
        x.setAttribute('href', d); if (x.hasAttribute('xlink:href')) x.setAttribute('xlink:href', d);
      }
      const el = host.querySelector('.s12sheet');
      const w = Math.ceil(el.offsetWidth), h = Math.ceil(el.offsetHeight);
      return new Uint8Array(await (await pageJpeg(el, w, h)).arrayBuffer());
    } finally { host.remove(); }
  }
  function pdfOfJpegBytes(jpg) {
    const sz = jpegSize(jpg);
    if (!sz) throw new Error('jpeg');
    return pdfOfJpeg(jpg, sz.w, sz.h);
  }
  /* JPEG の幅・高さを読む（SOF の印） */
  function jpegSize(b) {
    if (b[0] !== 0xFF || b[1] !== 0xD8) return null;
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xFF) { i++; continue; }
      const m = b[i + 1], len = (b[i + 2] << 8) | b[i + 3];
      if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
      i += 2 + len;
    }
    return null;
  }
  /* JPEG 1枚を A4 1ページに入れた PDF（文字は入れない・ASCII だけで書く） */
  function pdfOfJpeg(jpg, w, h) {
    const enc = s => new TextEncoder().encode(s);
    const content = `q ${A4W} 0 0 ${A4H} 0 0 cm /Im0 Do Q`;
    const objs = [
      enc('<< /Type /Catalog /Pages 2 0 R >>'),
      enc('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
      enc(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4W} ${A4H}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`),
      [enc(`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`), jpg, enc('\nendstream')],
      enc(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
    ];
    const parts = [enc('%PDF-1.4\n')];
    let pos = parts[0].length;
    const offs = [];
    objs.forEach((o, i) => {
      offs.push(pos);
      const chunk = [enc(`${i + 1} 0 obj\n`)].concat(Array.isArray(o) ? o : [o], [enc('\nendobj\n')]);
      chunk.forEach(c => { parts.push(c); pos += c.length; });
    });
    const xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('') +
      `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`;
    parts.push(enc(xref));
    return new Blob(parts, { type: 'application/pdf' });
  }

  window.openMapSend = openMapSend;
  window.kmPdfOfJpeg = pdfOfJpeg; // 試験用
})();
