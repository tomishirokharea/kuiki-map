/* 係の画面「人」：その人を開くと登録済みのスマホが見える（2026-11-20）。
   使い方：リポジトリの上で python3 -m http.server 8769 を動かしてから node tools/hito-sumaho-test.mjs http://localhost:8769
   練習モード（?renshu=1）で動かすので、サーバーには送らない。一覧（devState.list）は試験が直接入れる */
import { chromium } from 'playwright';
const TILE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/58BAwAI/AL+hc2rNAAAAABJRU5ErkJggg==', 'base64');
const ROOT = process.argv[2] || 'http://localhost:8769';
const b = await chromium.launch({ channel: 'chrome' });
let fails = 0;
const ok = (c, m) => { console.log((c ? 'OK  ' : 'NG  ') + m); if (!c) fails++; };

async function open(w = 390, lang = '') {
  const ctx = await b.newContext({ viewport: { width: w, height: 844 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
  const pg = await ctx.newPage();
  pg.errs = []; pg.on('pageerror', e => pg.errs.push(String(e)));
  pg.server = [];
  await pg.route('**/*', r => {
    const u = r.request().url();
    if (/script\.google/.test(u)) { pg.server.push(u); return r.abort(); }
    if (/gsi\.go\.jp/.test(u) && /\.(png|jpg)/.test(u)) return r.fulfill({ status: 200, contentType: 'image/png', body: TILE });
    if (/gsi\.go\.jp|fonts\.g|open-meteo/.test(u)) return r.abort();
    return r.continue();
  });
  await pg.route('**/config.js', r => r.fulfill({ status: 200, contentType: 'application/javascript',
    body: "window.KUIKI_CONFIG={apiUrl:'https://script.google.com/macros/s/TEST/exec',lang:'ja',homeView:[26.158,127.676],homeZoom:16};" }));
  await pg.goto(ROOT + '/index.html?renshu=1&m=detail' + (lang ? '&lang=' + lang : ''));
  await pg.waitForFunction("typeof Store !== 'undefined' && Store.data && D().users.length > 0 && typeof openEditUser === 'function'");
  await pg.waitForTimeout(1000);
  await pg.evaluate(() => {
    const s = document.getElementById('splash'); if (s) s.remove();
    Store.data.currentUser = 'u3'; Store.save(); renderAll(); // 区域係C
  });
  await pg.waitForTimeout(400);
  return { pg, ctx };
}
const sheetText = pg => pg.evaluate(() => { const el = document.querySelector('#sheet'); return el ? el.innerText : ''; });
const openUser = async (pg, uid) => { await pg.evaluate(id => { if (typeof closeSheet === 'function') closeSheet(); openEditUser(id); }, uid); await pg.waitForTimeout(500); };

for (const w of [390, 1280]) {
  const { pg, ctx } = await open(w);
  // 一覧を試験から入れる（本番ではサーバーの devices。ここでは同じ形のデータを直接）
  await pg.evaluate(() => {
    devState.list = [
      { id: 'd1', uid: 'u1', name: '伝道者A', status: 'active', label: 'iPhone', reqAt: '2026-11-01T00:00:00Z', decAt: '2026-11-01T00:10:00Z', seen: '2026-11-19T06:00:00Z', code: '1111', hint: '' },
      { id: 'd2', uid: 'u1', name: '伝道者A', status: 'active', label: 'iPad（ホーム画面）', reqAt: '2026-11-02T00:00:00Z', decAt: '2026-11-02T00:10:00Z', seen: '2026-11-18T06:00:00Z', code: '2222', hint: '' },
      { id: 'd3', uid: 'u2', name: '伝道者B', status: 'active', label: 'パソコン', reqAt: '2026-11-03T00:00:00Z', decAt: '2026-11-03T00:10:00Z', seen: '', code: '3333', hint: '' },
      { id: 'd4', uid: '', name: '', status: 'pending', label: 'Android', reqAt: new Date().toISOString(), decAt: '', seen: '', code: '4444', hint: '' }
    ];
  });
  // H-1：2台の人：2台とも出る。ほかの人の端末・承認待ちは出ない
  await openUser(pg, 'u1');
  let t = await sheetText(pg);
  ok(/登録済みのスマホ（2台）/.test(t), `[${w}] H-1 2台の人に「登録済みのスマホ（2台）」が出る`);
  ok(/iPhone/.test(t) && /iPad（ホーム画面）/.test(t), `[${w}] H-1 端末の名前（iPhone・iPad）が出る`);
  ok(/に承認/.test(t) && /最後に使った日/.test(t), `[${w}] H-1 承認した日・最後に使った日が出る`);
  ok(!/パソコン/.test(t) && !/Android/.test(t), `[${w}] H-2 ほかの人の端末・承認待ちの端末は出ない`);
  ok(/本人用のリンクで開いただけのスマホは、ここに出ません/.test(t), `[${w}] H-3 本人用リンクのスマホは出ない説明がある`);
  ok(/保存する/.test(t) && /リンク・QR/.test(t), `[${w}] H-4 今までの編集の画面（保存する・リンク・QR）はそのまま`);
  // H-5：0台の人
  await openUser(pg, 'u4');
  t = await sheetText(pg);
  ok(/登録済みのスマホ（0台）/.test(t) && /この一覧に出るスマホはありません/.test(t), `[${w}] H-5 0台の人は「ありません」と出る`);
  // H-6：一覧がまだ無いとき（試作・練習では何も出さない）
  await pg.evaluate(() => { devState.list = null; });
  await openUser(pg, 'u1');
  t = await sheetText(pg);
  ok(!/登録済みのスマホ/.test(t) && !/読み込んでいます/.test(t), `[${w}] H-6 試作・練習（一覧なし）では、この項目を出さない`);
  // H-8：読み込みが遅れて届いたとき、描き直すのは「今ひらいている人」（前にひらいた人の一覧を出さない）
  await pg.evaluate(() => { devState.list = null; });
  await openUser(pg, 'u1');                       // u1 をひらく（一覧はまだ）
  await pg.evaluate(() => {
    devState.list = [{ id: 'd1', uid: 'u1', name: '伝道者A', status: 'active', label: 'iPhone', reqAt: '2026-11-01T00:00:00Z', decAt: '2026-11-01T00:10:00Z', seen: '2026-11-19T06:00:00Z', code: '1111', hint: '' }];
  });
  await openUser(pg, 'u4');                       // 一覧が届く前に u4 にひらき直した、という場面
  const race = await pg.evaluate(() => {          // 遅れて届いたときの描き直しと同じ処理（el.dataset.uid で描く）
    const el = document.querySelector('#euDevs'); el.innerHTML = euDevHtml(el.dataset.uid);
    return el.innerText;
  });
  ok(/登録済みのスマホ（0台）/.test(race) && !/iPhone/.test(race), `[${w}] H-8 遅れて届いた一覧は、今ひらいている人（u4）の分で描く`);
  // H-7：伝道者の画面からは開けない（今までどおり）
  await pg.evaluate(() => { if (typeof closeSheet === 'function') closeSheet(); Store.data.currentUser = 'u1'; Store.save(); renderAll(); });
  await pg.waitForTimeout(300);
  const noAdm = await pg.evaluate(() => { openEditUser('u2'); return document.querySelector('#sheet').hidden === true; }); // 閉じた画面の中身はDOMに残るので、開いたかどうかで見る
  ok(noAdm, `[${w}] H-7 伝道者からは、この画面を開けない（今までどおり）`);
  ok(pg.errs.length === 0, `[${w}] ページのエラーなし ${JSON.stringify(pg.errs.slice(0, 3))}`);
  ok(pg.server.length === 0, `[${w}] サーバーへの通信なし（練習モード）`);
  await ctx.close();
}

// スペイン語：見出し・説明が訳されて出る
{
  const { pg, ctx } = await open(390, 'es');
  await pg.evaluate(() => {
    devState.list = [{ id: 'd1', uid: 'u1', name: 'A', status: 'active', label: 'iPhone', reqAt: '2026-11-01T00:00:00Z', decAt: '2026-11-01T00:10:00Z', seen: '2026-11-19T06:00:00Z', code: '1111', hint: '' }];
  });
  await openUser(pg, 'u1');
  const t = await sheetText(pg);
  ok(/Teléfonos registrados \(1\)/.test(t), 'ES 見出しが訳されて出る（Teléfonos registrados (1)）');
  ok(/Aprobado: .*Último uso: /.test(t) && !/に承認/.test(t), 'ES 承認日と最後に使った日が両方あっても訳される ' + JSON.stringify((t.match(/Aprobado[^\n]*/) || [''])[0]));
  ok(/Los que solo abrieron el enlace personal no salen aquí/.test(t), 'ES 説明が訳されて出る');
  ok(pg.errs.length === 0, 'ES ページのエラーなし');
  await ctx.close();
}

await b.close();
console.log(fails ? `\n${fails} 件 NG` : '\nすべて OK');
process.exit(fails ? 1 : 0);
