// 使い方：サイトを http://localhost:8765 で開いた状態で  node tools/muki-zure-test.mjs [ポート]
// 2026.13.147：iPhoneで向きモードが90°ずれた不具合（screen.orientation.angle の値ちがい）が、もどっていないかを確かめる。
// あわせて、タブレット・画面の分割など「縦長の窓でも横の値が正しい」場合をこわしていないかも確かめる。
import { chromium } from 'playwright';
const port = process.argv[2] || '8765';
const CFG = "window.KUIKI_CONFIG={apiUrl:'',lang:'ja',homeView:[26.33,127.80],homeZoom:10,ageData:true};";
const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36',
};
const b = await chromium.launch(); let ng = 0;
async function run(name, ua, w, h, wo, sa, input, want) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, userAgent: UA[ua] }); const pg = await ctx.newPage();
  await pg.route('**/*', r => /gsi\.go\.jp|fonts\.g|script\.google/.test(r.request().url()) ? r.abort() : r.continue());
  await pg.route('**/config.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: CFG }));
  await pg.goto(`http://localhost:${port}/index.html`); await pg.waitForFunction(() => typeof headingOf === 'function');
  const got = await pg.evaluate(([wo, sa, input]) => {
    Object.defineProperty(window, 'orientation', { configurable: true, get: () => (wo === null ? undefined : wo) });
    Object.defineProperty(screen, 'orientation', { configurable: true, get: () => ({ angle: sa, type: 'x' }) });
    return headingOf(input);
  }, [wo, sa, input]);
  const okk = Math.abs((((got - want) % 360) + 540) % 360 - 180) <= 0.5; if (!okk) ng++;
  console.log((okk ? 'OK  ' : 'NG  ') + name + `  → ${got}（正しくは ${want}）`); await ctx.close();
}
// iPhone 縦・水平（今回の不具合）：screen.orientation.angle が誤って 90 を返す
await run('iPhone縦・screen.angleが誤って90（北）', 'iphone', 390, 844, 0, 90, { webkitCompassHeading: 0 }, 0);
await run('iPhone縦・screen.angleが誤って90（東）', 'iphone', 390, 844, 0, 90, { webkitCompassHeading: 90 }, 90);
await run('iPhone縦・window.orientationなし・angle誤90', 'iphone', 390, 844, null, 90, { webkitCompassHeading: 200 }, 200);
await run('iPhone縦・window.orientationも誤って90', 'iphone', 390, 844, 90, 90, { webkitCompassHeading: 45 }, 45);
// iPhone 横（左に回す＝window.orientation 90）。北を向くと端末の上は西(270)を指す
await run('iPhone横（左）・古いiOS（angle 270）', 'iphone', 844, 390, 90, 270, { webkitCompassHeading: 270 }, 0);
await run('iPhone横（左）・新しいiOS（angle 90）', 'iphone', 844, 390, 90, 90, { webkitCompassHeading: 270 }, 0);
await run('iPhone横（右）', 'iphone', 844, 390, -90, 90, { webkitCompassHeading: 90 }, 0);
// Android（window.orientation と screen.angle は同じ意味）
await run('Android縦', 'android', 390, 844, 0, 0, { alpha: 270, absolute: true }, 90);
await run('Android横（左）', 'android', 844, 390, 90, 90, { alpha: 90, absolute: true }, 0);
await run('Android横（右）', 'android', 844, 390, -90, 270, { alpha: 270, absolute: true }, 0);
await run('Android逆さ縦 180', 'android', 390, 844, 180, 180, { alpha: 180, absolute: true }, 0);
await run('Android横・window.orientationなし', 'android', 844, 390, null, 90, { alpha: 90, absolute: true }, 0);
// 縦長の窓でも横の値が正しい場合（こわしてはいけない）
await run('横が本来のタブレットを縦に持つ（90）', 'android', 800, 1280, 90, 90, { alpha: 90, absolute: true }, 0);
await run('横が本来のタブレットを縦に持つ（-90）', 'android', 800, 1280, -90, 270, { alpha: 270, absolute: true }, 0);
await run('iPad横・Split Viewで縦長の窓', 'ipad', 400, 1000, 90, 90, { webkitCompassHeading: 270 }, 0);
await run('Android横・画面分割で縦長の窓', 'android', 500, 700, 90, 90, { alpha: 90, absolute: true }, 0);
await run('横・正方形の窓', 'android', 700, 700, 90, 90, { alpha: 90, absolute: true }, 0);
await run('window.orientationなし・タブレットを縦に持つ', 'android', 800, 1280, null, 90, { alpha: 90, absolute: true }, 0);
await b.close(); console.log(ng ? `NG ${ng}件` : 'すべてOK'); process.exit(ng ? 1 : 0);
