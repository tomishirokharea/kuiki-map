# 使い方：サイトを http://localhost:8765 で開き、/home/claude/test/head_lib.py（head_t.py の部品）がある状態で python3 tools/muki-shindan-test.py
# 2026.13.148：「北」ボタンの長押しで向きの確かめの数字が出ること・ふつうに押したときの動きが変わらないこと
import asyncio, sys
sys.path.insert(0,'/home/claude/test')
from head_lib import page_for, orient, st
async def main():
    from playwright.async_api import async_playwright
    R=[]
    def ok(n,c,i=''): R.append(c); print(('OK  ' if c else 'NG  ')+n+('  '+str(i) if i!='' else ''))
    async with async_playwright() as p:
        b=await p.chromium.launch()
        pg=await page_for(b)
        await pg.click('#btnLocate'); await pg.wait_for_timeout(700); await pg.click('#btnLocate'); await pg.wait_for_timeout(300)
        await orient(pg, 90)
        box=await pg.locator('#btnNorth').bounding_box()
        await pg.mouse.move(box['x']+box['width']/2, box['y']+box['height']/2); await pg.mouse.down(); await pg.wait_for_timeout(1100); await pg.mouse.up(); await pg.wait_for_timeout(400)
        s=await st(pg)
        txt=await pg.evaluate("()=>{const d=document.getElementById('mukiDiag'); return d&&!d.hidden? d.firstChild.textContent:null}")
        ok('長押しで確かめの数字が出る', txt is not None, txt)
        ok('長押しのあと、北にもどらない・向きモードのまま', s['on'] and abs(s['deg']+90)<=3, s)
        ok('画面での北（測った）が 270 前後（東が上）', txt and '画面での北（測った）：270' in txt or (txt and any(f'（測った）：{v}' in txt for v in ['269','269.9','270.1','270','269.8','270.2'])), txt.split('\n')[6] if txt else '')
        await orient(pg, 200); await pg.wait_for_timeout(500)
        txt=await pg.evaluate("()=>document.getElementById('mukiDiag').firstChild.textContent")
        ok('向きを変えると数字も変わる（南南西→北は画面で約200°）', '（測った）：' in txt, txt.split('\n')[6])
        await pg.click('[data-mk="close"]'); h=await pg.evaluate("()=>document.getElementById('mukiDiag').hidden"); ok('閉じる', h)
        await pg.click('#btnNorth'); await pg.wait_for_timeout(800); s=await st(pg)
        ok('ふつうに押すと今までどおり北が上・向きモードをやめる', not s['on'] and s['deg']==0, s)
        ok('ページエラー0', not pg.perr, pg.perr)
        await b.close()
    print(f"合計 {len(R)}・不合格 {R.count(False)}")
asyncio.run(main())
