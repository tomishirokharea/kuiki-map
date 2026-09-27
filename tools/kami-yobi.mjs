/* =========================================================
   区域マップ：紙の予備（S-12・S-13 の PDF）を作って、Googleドライブへ送るロボット
   GitHub の自動実行（.github/workflows/kami-yobi.yml）から、毎週動きます。

   ・区域マップの画面を、見えないブラウザで「区域係のロボット」として開く
   ・前回から変わった区域だけ、S-12（区域地図のカード）を PDF にする（8区域で1ファイル）
   ・S-13（区域割り当ての記録）も、変わっていれば PDF にする
   ・GAS（pdf-backup.gs）に送り、ドライブの「紙の予備」フォルダに上書き保存してもらう
   ・訪問の記録は使わないので、受け取らない（サーバーを軽くし、個人の情報を運ばないため）
   ・画面のデータ（住所・名前など）は、記録（ログ）に書かない

   使う設定（GitHub の Settings → Secrets and variables → Actions）
     KUIKI_ROBOT_TOKEN（Secret）… ロボット用に作った区域係の招待コード（招待リンクの t= の後ろ）
     KUIKI_PAGE（Variable）   … ロボットが開く区域マップのURL
   ========================================================= */
import { chromium } from 'playwright';

const PAGE = String(process.env.KUIKI_PAGE || '').trim();
const TOKEN = String(process.env.KUIKI_TOKEN || '').trim();
const FORCE = String(process.env.FORCE || '') === 'true'; // すべて作り直す（手で動かすときに選べる）
const DEMO = String(process.env.KUIKI_DEMO || '') === '1'; // 試作モードでの動作確認用（ふだんは使わない）
const UPLOAD = String(process.env.KUIKI_UPLOAD || '').trim(); // 動作確認用：送り先を変える（ふだんは空）
const PER_FILE = 8;            // 1ファイルに入れる区域の数（A4の表・裏が2組）
const LAYOUT = 's12-a6-v2';    // カードの形を変えたときは、この文字を変える（全部を作り直す）
const LOAD_WAIT_MS = 15 * 60000;

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const fail = msg => { console.error('失敗：' + msg); process.exitCode = 1; };

async function post(api, body) {
  const url = api + (api.includes('?') ? '&' : '?') + 'pdf=1';
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
      const text = await res.text();
      let j;
      try { j = JSON.parse(text); } catch (e) { throw new Error('サーバーの返事が読めません（' + res.status + '）'); }
      if (j.ok) return j;
      if (j.error !== 'busy' && j.error !== 'server') throw new Error('サーバー：' + j.error);
      throw new Error('サーバー：' + j.error);
    } catch (e) {
      if (i === 2) throw e;
      log('送り直します：' + e.message);
      await new Promise(r => setTimeout(r, 5000 * (i + 1)));
    }
  }
}

async function main() {
  if (!PAGE) return fail('KUIKI_PAGE（区域マップのURL）がありません');
  if (!TOKEN && !DEMO) return fail('KUIKI_ROBOT_TOKEN（ロボットの招待コード）がありません');

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ locale: 'ja-JP', timezoneId: 'Asia/Tokyo', viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => log('画面のエラー：' + String(e && e.message || e).slice(0, 200)));

  // 訪問の記録は受け取らない（S-12・S-13 には使わない）
  await page.route('**/macros/s/**', async route => {
    const req = route.request();
    const body = req.method() === 'POST' ? (req.postData() || '') : '';
    if (/"action":"load"/.test(body) && /"part":"visits"/.test(body)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, mode: 'part', part: 'visits', rows: [], next: null }) });
    }
    return route.continue();
  });

  try {
    const url = PAGE + (TOKEN ? (PAGE.includes('?') ? '&' : '?') + 't=' + encodeURIComponent(TOKEN) : '');
    log('区域マップを開いています');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });

    // 読み込みが終わるまで待つ（読み込めなかったときは、画面に出た理由で止める）
    const t0 = Date.now();
    for (;;) {
      const st = await page.evaluate(() => {
        try {
          const b = document.querySelector('#blocker'), retry = document.querySelector('#blockRetry');
          if (b && !b.hidden && retry && !retry.hidden) {
            return { err: (document.querySelector('#blockTitle') || {}).textContent + '／' + (document.querySelector('#blockDetail') || {}).textContent };
          }
          const ok = typeof Store !== 'undefined' && Store.data && Array.isArray(Store.data.houses) && Array.isArray(Store.data.territories) &&
            (!LIVE || Store.data.live === true) && (!b || b.hidden);
          return { ok };
        } catch (e) { return { ok: false }; }
      }).catch(() => ({ ok: false }));
      if (st.err) throw new Error('区域マップを読み込めませんでした：' + st.err.slice(0, 200));
      if (st.ok) break;
      if (Date.now() - t0 > LOAD_WAIT_MS) throw new Error('区域マップの読み込みが終わりませんでした（招待コードが正しいか確かめてください）');
      await page.waitForTimeout(2000);
    }
    await page.waitForTimeout(1500);
    if (DEMO) await page.evaluate(() => { me().role = 'admin'; });
    // 紙の予備には、マンション・アパートと学校・お店などの名前を出す（区域の中の建物だけ）
    await page.evaluate(() => { UI.aptName = 'on'; UI.fcName = 'on'; UI.nameScope = 'sel'; });

    const info = await page.evaluate(() => ({
      admin: isAdmin(), s12: typeof printS12 === 'function', s13: typeof printS13 === 'function',
      api: typeof API_URL === 'string' ? API_URL : '', terrs: D().territories.length, houses: D().houses.length
    }));
    if (!info.admin) throw new Error('ロボットが区域係になっていません（users シートの役割を「区域係」にしてください）');
    if (!info.s12) throw new Error('このページには S-12 の印刷がありません（KUIKI_PAGE のURLを確かめてください）');
    const api = UPLOAD || info.api;
    if (!api) throw new Error('送り先（GAS のURL）がわかりません');
    log(`読み込みました：区域 ${info.terrs}・家 ${info.houses}`);

    // 地図の画像は JPEG にして、PDF を軽くする（ドライブへ送りやすくするため）
    await page.evaluate(() => {
      window.__tileBad = 0;
      window.print = () => {};
      const cache = new Map();
      s12Tile = function (url) {
        if (cache.has(url)) return cache.get(url);
        const p = (async () => {
          for (let i = 0; i < 3; i++) {
            try {
              const r = await fetch(url, { mode: 'cors' });
              if (r.status === 404) return '';
              if (r.ok) {
                const bmp = await createImageBitmap(await r.blob());
                const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d');
                g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0);
                return URL.createObjectURL(await c.convertToBlob({ type: 'image/jpeg', quality: 0.8 }));
              }
            } catch (e) { /* もう一度ためす */ }
            await new Promise(r => setTimeout(r, 1500 * (i + 1)));
          }
          window.__tileBad++;
          return url;
        })();
        cache.set(url, p);
        return p;
      };
    });

    // 区域ごとの「中身の印」（ここが変わった区域だけ作り直す）
    const plan = await page.evaluate(async ({ PER_FILE, LAYOUT }) => {
      const sha = async s => {
        const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
        return [...new Uint8Array(b)].slice(0, 16).map(x => x.toString(16).padStart(2, '0')).join('');
      };
      const safe = s => String(s).replace(/[\\/:*?"<>|]/g, '_');
      const dnc = D().dnc || {};
      const terrs = D().territories.filter(t => !t.dummy).slice().sort(byNo);
      const lines = await sha(JSON.stringify(polyTerrs().map(t => [t.id, t.no, t.polygon]))); // となりの区域の線も地図に出るため
      const byT = new Map();
      D().houses.forEach(h => { if (!h.terrId) return; if (!byT.has(h.terrId)) byT.set(h.terrId, []); byT.get(h.terrId).push(h); });
      const sigs = {};
      for (const t of terrs) {
        const hs = (byT.get(t.id) || []).map(h => [h.id, h.lat, h.lng, h.type, h.label || '', h.units || [], h.kind || '', !!h.lock,
          h.uk || null, h.ul || null, !!h.prov, dnc[K(h.id, '')] ? 1 : 0, (h.units || []).filter(u => dnc[K(h.id, u)])])
          .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
        sigs[t.id] = await sha(JSON.stringify([LAYOUT, t.no, t.name || '', t.polygon || null, lines, hs]));
      }
      const files = [];
      for (let i = 0; i < terrs.length; i += PER_FILE) {
        const g = terrs.slice(i, i + PER_FILE);
        const name = `S-12_区域地図のカード_${String(files.length + 1).padStart(2, '0')}（区域${safe(g[0].no)}〜${safe(g[g.length - 1].no)}）.pdf`;
        files.push({ name, ids: g.map(t => t.id), sig: await sha(JSON.stringify([name, g.map(t => sigs[t.id])])) });
      }
      const y = svcYearOf(new Date());
      const rows = s13Rows(y).map(r => [r.t.no, r.prev, r.rows.map(x => [x.name, x.a, x.c])]);
      const s13 = { name: `S-13_区域割り当ての記録_${y}奉仕年度.pdf`, year: y, sig: await sha(JSON.stringify(['s13-v1', y, rows])) };
      return { files, s13 };
    }, { PER_FILE, LAYOUT });

    const list = await post(api, { action: 'pdf_list', token: TOKEN });
    const had = list.files || {};
    const made = [];
    let skipped = 0;

    const render = async () => {
      const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
      await page.evaluate(() => { document.body.classList.remove('printing'); document.querySelector('#printArea').innerHTML = ''; });
      return pdf;
    };
    const send = async (name, sig, pdf, note) => {
      await post(api, { action: 'pdf_put', token: TOKEN, name, hash: sig, note, data: Buffer.from(pdf).toString('base64') });
      made.push(name);
      log(`保存しました：${name}（${Math.round(pdf.length / 1024)}KB）`);
    };

    for (const f of plan.files) {
      if (!FORCE && had[f.name] && had[f.name].h === f.sig) { skipped++; continue; }
      const before = await page.evaluate(() => window.__tileBad);
      await page.evaluate(async ids => { await printS12(ids, 'a6', true); }, f.ids);
      const bad = (await page.evaluate(() => window.__tileBad)) - before;
      const pdf = await render();
      // 地図の画像が欠けたときは、印を残さない（次の回にもう一度作る）
      await send(f.name, bad ? 'incomplete' : f.sig, pdf, bad ? `地図の画像${bad}枚を受け取れませんでした` : '');
      if (bad) log(`注意：${f.name} で地図の画像 ${bad} 枚を受け取れませんでした（次の回に作り直します）`);
    }
    if (info.s13) {
      const s = plan.s13;
      if (FORCE || !had[s.name] || had[s.name].h !== s.sig) {
        await page.evaluate(y => { printS13(s13Rows(y), y); }, s.year);
        await send(s.name, s.sig, await render(), '');
      } else skipped++;
    }
    // 区域の数が変わって、使わなくなった S-12 のファイルを片づける
    const pr = await post(api, { action: 'pdf_prune', token: TOKEN, keep: plan.files.map(f => f.name) });
    await post(api, { action: 'pdf_done', token: TOKEN, made: made.length, skipped, pruned: pr.trashed || 0 });
    log(`終わりました：作った ${made.length}・変わりなし ${skipped}・片づけた ${pr.trashed || 0}`);
  } catch (e) {
    fail(e && e.message || String(e));
    try { if (TOKEN || UPLOAD) await post(UPLOAD || await page.evaluate(() => API_URL), { action: 'pdf_done', token: TOKEN, error: String(e && e.message || e).slice(0, 300) }); } catch (e2) { /* 何もしない */ }
  } finally {
    await browser.close();
  }
}

main();
