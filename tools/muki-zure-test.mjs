// 使い方：サイトを http://localhost:8765 で開いた状態で  node tools/muki-zure-test.mjs [ポート]
// 2026.13.147：iPhoneで向きモードが90°ずれた不具合（screen.orientation.angle の値ちがい）が、もどっていないかを確かめる
// 向きが90°ずれる不具合の再現テスト：headingOf を、画面の向きのいろいろな値で確かめる
import { chromium } from 'playwright';
const port = process.argv[2] || '8765';
const CFG = "window.KUIKI_CONFIG={apiUrl:'',lang:'ja',homeView:[26.33,127.80],homeZoom:10,ageData:true};";
const b = await chromium.launch(); let ng = 0;
async function run(name, w, h, wo, sa, input, want) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } }); const pg = await ctx.newPage();
  await pg.route('**/*', r => /gsi\.go\.jp|fonts\.g|script\.google/.test(r.request().url()) ? r.abort() : r.continue());
  await pg.route('**/config.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: CFG }));
  await pg.goto(`http://localhost:${port}/index.html`); await pg.waitForFunction(() => typeof headingOf === 'function');
  const got = await pg.evaluate(([wo, sa, input]) => {
    if (wo === null) { try { delete window.orientation; } catch (e) {} Object.defineProperty(window, 'orientation', { configurable: true, get: () => undefined }); }
    else Object.defineProperty(window, 'orientation', { configurable: true, get: () => wo });
    Object.defineProperty(screen, 'orientation', { configurable: true, get: () => ({ angle: sa, type: 'x' }) });
    return headingOf(input);
  }, [wo, sa, input]);
  const okk = Math.abs((((got - want) % 360) + 540) % 360 - 180) <= 0.5; if (!okk) ng++;
  console.log((okk ? 'OK  ' : 'NG  ') + name + `  → ${got}（正しくは ${want}）`); await ctx.close();
}
// iPhone 縦・水平：コンパスは北(0)。screen.orientation.angle が誤って 90 を返す
await run('iPhone縦・screen.angleが誤って90', 390, 844, 0, 90, { webkitCompassHeading: 0 }, 0);
await run('iPhone縦・screen.angleが誤って90（東を向く）', 390, 844, 0, 90, { webkitCompassHeading: 90 }, 90);
await run('iPhone縦・window.orientationなし・angle誤90', 390, 844, null, 90, { webkitCompassHeading: 200 }, 200);
// iPhone 横（左に回す＝window.orientation 90、iOSの screen.angle は 270）。北を向くと端末の上は西(270)を指す
await run('iPhone横（左に回す）', 844, 390, 90, 270, { webkitCompassHeading: 270 }, 0);
await run('iPhone横（右に回す）', 844, 390, -90, 90, { webkitCompassHeading: 90 }, 0);
// Android 縦・横（window.orientation と screen.angle は同じ意味）
await run('Android縦', 390, 844, 0, 0, { alpha: 270, absolute: true }, 90);
await run('Android横（左に回す）', 844, 390, 90, 90, { alpha: 90, absolute: true }, 0);
await run('Android横・window.orientationなし', 844, 390, null, 90, { alpha: 90, absolute: true }, 0);
await b.close(); console.log(ng ? `NG ${ng}件` : 'すべてOK'); process.exit(ng ? 1 : 0);
