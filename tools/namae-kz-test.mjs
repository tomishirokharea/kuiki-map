// 使い方：node tools/namae-kz-test.mjs
// 名前を比べる・置き場所を決める部品（chizu.js の KZ）の確かめ
import { createRequire } from 'module';
const KZ = createRequire(import.meta.url)('../chizu.js');
let ng = 0;
const ok = (c, name, got) => { if (!c) ng++; console.log((c ? 'OK  ' : 'NG  ') + name + (c ? '' : `  → ${JSON.stringify(got)}`)); };
const eq = (name, got, want) => ok(JSON.stringify(got) === JSON.stringify(want), name, got);
const call = (f, ...a) => { try { return typeof KZ[f] === 'function' ? KZ[f](...a) : 'no function ' + f; } catch (e) { return 'error ' + e.message; } };

eq('nameKey 半角カナ・全角空白', call('nameKey', 'ﾌｧﾐﾘｰﾏｰﾄ　宜保'), 'ファミリーマート宜保');
eq('sameName 店名の枝', call('sameName', 'ファミリーマート宜保中央店', 'ファミリーマート宜保'), true);
eq('sameName 全角と小文字', call('sameName', 'ＡＢＣ', 'abc'), true);
eq('sameName 別の名前', call('sameName', '宜保公民館', '宜保公園'), false);
eq('sameName 1文字は含まれても別', call('sameName', '宜', '宜保公民館'), false);
eq('sameName 空', call('sameName', '', ''), false);
eq('layoutNames 重なる', call('layoutNames', [{ r: [0, 0, 10, 10] }, { r: [5, 5, 15, 15] }], false), [true, false]);
eq('layoutNames 辺がふれるだけ', call('layoutNames', [{ r: [0, 0, 10, 10] }, { r: [10, 0, 20, 10] }], false), [true, true]);
eq('layoutNames つながり', call('layoutNames', [{ r: [0, 0, 10, 10] }, { r: [8, 0, 18, 10] }, { r: [16, 0, 26, 10] }], false), [true, false, true]);
eq('layoutNames force', call('layoutNames', [{ r: [0, 0, 10, 10] }, { r: [5, 5, 15, 15] }], true), [true, true]);
eq('nameRank 拡大・区域の中の建物', call('nameRank', 'h', true, true), 0);
eq('nameRank 拡大・ほかの建物', call('nameRank', 'h', false, true), 1);
eq('nameRank 拡大・目印', call('nameRank', 'lm', false, true), 2);
eq('nameRank 縮め・目印', call('nameRank', 'lm', false, false), 0);
eq('nameRank 縮め・区域の中の建物', call('nameRank', 'h', true, false), 1);
eq('nameRank 縮め・ほかの建物', call('nameRank', 'h', false, false), 2);
process.exit(ng ? 1 : 0);
