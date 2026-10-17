#!/usr/bin/env python3
"""
chiban-build.py  tools/chiban-sources.txt から、地番の地図（chiban/）を作り直す（GitHub Actions の「地番の地図」が使う）

  python3 tools/chiban-build.py [tools/chiban-sources.txt] [chiban]

  ・市区町村ごとに、いちばん新しい年の GeoJSON を「今の地番」（chiban/<コード>/<大字コード>.json）にする
  ・それより古い年の GeoJSON は「古い地番」（chiban/<コード>/old/<大字コード>.json）にする
    今の地図にない地番（そのあと合わさった・番号が変わった・分かれた土地のもとの番号）だけを入れる。
    同じ地番が何年にもあるときは、新しい年のものを使う
    → 古い一覧（エクセル）の番地でも、その土地があった場所（＝今もそこにある家）が分かる
  ・結果の記録は chiban/_log.txt
"""
import json
import os
import shutil
import subprocess
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'chiban-sources.txt')
DST = sys.argv[2] if len(sys.argv) > 2 else 'chiban'
TMP = 'dl'
LOG = []


def log(*a):
    s = ' '.join(str(x) for x in a)
    print(s)
    LOG.append(s)


def read_sources():
    by = {}
    for line in open(SRC, encoding='utf-8'):
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        parts = line.split()
        if len(parts) < 3:
            continue
        by.setdefault(parts[0], []).append((parts[1], parts[2]))
    for code in by:
        by[code].sort(key=lambda x: x[0], reverse=True)  # 新しい年が先
    return by


def download(url, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    req = urllib.request.Request(url, headers={'User-Agent': 'kuiki-map chiban-build'})
    with urllib.request.urlopen(req, timeout=300) as r, open(path, 'wb') as f:
        shutil.copyfileobj(r, f)
    log('  ダウンロード', os.path.getsize(path), 'バイト')


def build(src_dir, dst_dir, asof):
    r = subprocess.run([sys.executable, os.path.join(HERE, 'moj-chiban.py'), src_dir, dst_dir, asof], capture_output=True, text=True)
    for line in (r.stderr or '').splitlines():
        if not line.startswith('読みました'):
            log('  ' + line)
    if r.returncode != 0:
        raise RuntimeError('moj-chiban.py が失敗しました')


def main():
    ok = True
    for code, years in read_sources().items():
        cur_asof, cur_url = years[0]
        log(f'{code}：今の地番 {cur_asof}' + (f'・古い地番 {", ".join(a for a, _ in years[1:])}' if years[1:] else ''))
        try:
            d = os.path.join(TMP, code, cur_asof)
            download(cur_url, os.path.join(d, code + '.geojson'))
            shutil.rmtree(os.path.join(DST, code), ignore_errors=True)
            build(d, DST, cur_asof)
        except Exception as e:  # 今の地番が作れないときは、この市区町村をとばす
            log('  失敗：', e)
            ok = False
            continue
        idx_path = os.path.join(DST, code, 'index.json')
        idx = json.load(open(idx_path, encoding='utf-8'))
        have = {}  # 大字名 → 今ある地番
        for aza, v in idx['azas'].items():
            p = json.load(open(os.path.join(DST, code, v['f'] + '.json'), encoding='utf-8'))['p']
            have[aza] = {e[0] for e in p}
        old = {}  # 大字名 → {'f', 'p': [], 'y': []}
        for asof, url in years[1:]:
            try:
                d = os.path.join(TMP, code, asof)
                download(url, os.path.join(d, code + '.geojson'))
                out = os.path.join(TMP, 'built', asof)
                shutil.rmtree(out, ignore_errors=True)
                build(d, out, asof)
            except Exception as e:
                log('  古い地番', asof, 'は作れませんでした：', e)
                continue
            oi = json.load(open(os.path.join(out, code, 'index.json'), encoding='utf-8'))
            n = 0
            for aza, v in oi['azas'].items():
                p = json.load(open(os.path.join(out, code, v['f'] + '.json'), encoding='utf-8'))['p']
                o = old.setdefault(aza, {'f': (idx['azas'].get(aza) or v)['f'], 'p': [], 'y': [], 'seen': set()})
                for e in p:
                    if e[0] in have.get(aza, set()) or e[0] in o['seen']:
                        continue
                    o['p'].append(e)
                    o['y'].append(int(asof[:4]))
                    n += 1
                for e in p:  # 同じ年に同じ地番の土地が複数ある（飛び地）ときも全部入れるので、年が終わってから「見た」にする
                    o['seen'].add(e[0])
            log(f'  古い地番 {asof}：今の地図にない土地 {n}')
        if old:
            os.makedirs(os.path.join(DST, code, 'old'), exist_ok=True)
            idx['old'] = {}
            for aza, o in sorted(old.items()):
                if not o['p']:
                    continue
                with open(os.path.join(DST, code, 'old', o['f'] + '.json'), 'w', encoding='utf-8') as f:
                    json.dump({'v': 1, 'name': aza, 'p': o['p'], 'y': o['y']}, f, ensure_ascii=False, separators=(',', ':'))
                idx['old'][aza] = {'f': o['f'], 'n': len(o['p'])}
            idx['oldYears'] = sorted({int(a[:4]) for a, _ in years[1:]})
            with open(idx_path, 'w', encoding='utf-8') as f:
                json.dump(idx, f, ensure_ascii=False, separators=(',', ':'))
            log(f'  古い地番の合計：{sum(v["n"] for v in idx["old"].values())}')
    os.makedirs(DST, exist_ok=True)
    LOG.append('ok=' + ('1' if ok else '0'))
    with open(os.path.join(DST, '_log.txt'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(LOG) + '\n')


if __name__ == '__main__':
    main()
