#!/usr/bin/env python3
"""
moj-chiban.py  法務省の登記所備付地図データ（地図XML）から、区域マップ用の「地番の表」を作る

  使い方：
    pip install pyproj shapely
    python3 tools/moj-chiban.py <地図XMLのZIPかXMLが入ったフォルダ> <出力先フォルダ（例：chiban）> [データの時点 例：2026-02]

  入力：G空間情報センターの「法務省登記所備付地図データ」からダウンロードした ZIP（中に XML／ZIP が入っていてもよい）
        または、AIGID が変換して公開している GeoJSON（例：47212_豊見城市_公共座標15系_筆R_2026.geojson。ログイン不要・CC BY）
        https://www.geospatial.jp/ckan/dataset/aigid-moj-47212
  出力：<出力先>/<市区町村コード>/index.json と、大字ごとの <大字コード>.json
        地番ごとに「土地の中の1点（代表点）」と「土地の形」を、小さな形にして入れる
        ・公共座標の地図だけを使う（任意座標＝古い公図の地図は、位置が合わないので入れない）
        ・「地区外」「無地番」「水」「長狭物不明」「筆界未定地」など、数字で始まらない地番は入れない
        ・「2-4W1」「12X(1/2)」のような枝の書き方は、「2-4」「12」にそろえる（同じ地番の土地は全部入れる）

  ひとつの土地の形：[地番, 代表点の緯度×1e6, 経度×1e6, 形の点（代表点からの差×1e6 を 緯度,経度 の順にならべる）…]

  出典の書き方（登記所備付地図データ利用規約 1）：
    出典：「登記所備付地図データ ○○市」（法務省）（https://front.geospatial.jp/moj-chizu-xml-readme/）を加工して作成
"""
import glob
import io
import json
import os
import re
import sys
import unicodedata
import zipfile
import xml.etree.ElementTree as ET

from pyproj import Transformer
from shapely.geometry import Polygon

NS = {'m': 'http://www.moj.go.jp/MINJI/tizuxml', 'z': 'http://www.moj.go.jp/MINJI/tizuzumen'}
# 平面直角座標系（JGD2011）の 1〜19系 → EPSG 6669〜6687
ZONE_EPSG = {i: 6668 + i for i in range(1, 20)}
KANJI_NUM = {'一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10, '十一': 11, '十二': 12, '十三': 13, '十四': 14, '十五': 15, '十六': 16, '十七': 17, '十八': 18, '十九': 19}


def xml_sources(path):
    """フォルダの中の XML と、ZIP の中の XML（ZIP の中の ZIP も）を、(名前, バイト列) で返す"""
    def from_zip(data, name):
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            for n in z.namelist():
                if n.lower().endswith('.xml'):
                    yield name + '/' + n, z.read(n)
                elif n.lower().endswith('.zip'):
                    yield from from_zip(z.read(n), name + '/' + n)
    for f in sorted(glob.glob(os.path.join(path, '**', '*'), recursive=True)):
        if f.lower().endswith('.xml'):
            yield f, open(f, 'rb').read()
        elif f.lower().endswith('.zip'):
            yield from from_zip(open(f, 'rb').read(), f)


def zone_of(text):
    m = re.search(r'公共座標\s*([0-9０-９]+|[一二三四五六七八九十]+)\s*系', text or '')
    if not m:
        return None
    v = unicodedata.normalize('NFKC', m.group(1))
    return int(v) if v.isdigit() else KANJI_NUM.get(v)


def norm_aza(s):
    s = unicodedata.normalize('NFKC', s or '').strip()
    return re.sub(r'^(大字|字)', '', s)


def norm_no(s):
    s = unicodedata.normalize('NFKC', s or '').strip()
    if not re.match(r'^\d', s):
        return None
    s = re.sub(r'W\d+$', '', s)          # 2-4W1 → 2-4
    s = re.sub(r'X\(.*\)$', '', s)       # 12X(1/2) → 12
    return s if re.fullmatch(r'\d+(-\d+)*', s) else None


def parse(name, data, out, stats):
    root = ET.fromstring(data)
    zone = zone_of(root.findtext('m:座標系', default='', namespaces=NS))
    if not zone:
        stats['任意座標の地図（使わない）'] = stats.get('任意座標の地図（使わない）', 0) + 1
        return None
    tr = Transformer.from_crs(f'EPSG:{ZONE_EPSG[zone]}', 'EPSG:6668', always_xy=True)
    code = root.findtext('m:市区町村コード', default='', namespaces=NS)
    muni = root.findtext('m:市区町村名', default='', namespaces=NS)
    sp = root.find('m:空間属性', NS)
    pts = {}
    for p in sp.findall('z:GM_Point', NS):
        d = p.find('z:GM_Point.position/z:DirectPosition', NS)
        pts[p.get('id')] = (float(d.find('z:X', NS).text), float(d.find('z:Y', NS).text))
    curves = {}
    for c in sp.findall('z:GM_Curve', NS):
        seq = []
        for col in c.findall('z:GM_Curve.segment/z:GM_LineString/z:GM_LineString.controlPoint/z:GM_PointArray.column', NS):
            dd = col.find('z:GM_Position.direct', NS)
            if dd is not None:
                seq.append((float(dd.find('z:X', NS).text), float(dd.find('z:Y', NS).text)))
            else:
                ref = col.find('z:GM_Position.indirect/z:GM_PointRef.point', NS)
                if ref is not None and ref.get('idref') in pts:
                    seq.append(pts[ref.get('idref')])
        curves[c.get('id')] = seq
    surf = {}
    for s in sp.findall('z:GM_Surface', NS):
        ring = []
        for g in s.findall('.//z:GM_SurfaceBoundary.exterior/z:GM_Ring/z:GM_CompositeCurve.generator', NS):
            seg = curves.get(g.get('idref'), [])
            ring.extend(seg[1:] if ring and seg and ring[-1] == seg[0] else seg)
        surf[s.get('id')] = ring
    for h in root.find('m:主題属性', NS).findall('m:筆', NS):
        no = norm_no(h.findtext('m:地番', default='', namespaces=NS))
        if not no:
            stats['数字でない地番（使わない）'] = stats.get('数字でない地番（使わない）', 0) + 1
            continue
        aza = norm_aza((h.findtext('m:大字名', default='', namespaces=NS) or '') + (h.findtext('m:丁目名', default='', namespaces=NS) or ''))
        acode = (h.findtext('m:大字コード', default='', namespaces=NS) or '000') + (h.findtext('m:丁目コード', default='', namespaces=NS) or '000')
        sh = h.find('m:形状', NS)
        ring = surf.get(sh.get('idref')) if sh is not None else None
        if not aza or not ring or len(ring) < 3:
            stats['形のない土地（使わない）'] = stats.get('形のない土地（使わない）', 0) + 1
            continue
        poly = Polygon([(y, x) for x, y in ring])  # X＝北・Y＝東 → (東, 北)
        if not poly.is_valid:
            poly = poly.buffer(0)
        if poly.is_empty:
            continue
        if poly.geom_type != 'Polygon':
            poly = max(poly.geoms, key=lambda g: g.area)
        simp = poly.simplify(0.3, preserve_topology=True)  # 30cm より細かい折れ目は省く
        c = poly.representative_point()                     # かならず土地の中にある1点
        clng, clat = tr.transform(c.x, c.y)
        cy, cx = round(clat * 1e6), round(clng * 1e6)
        enc = [no, cy, cx]
        for ex, ny in list(simp.exterior.coords)[:-1]:
            lng, lat = tr.transform(ex, ny)
            enc += [round(lat * 1e6) - cy, round(lng * 1e6) - cx]
        m = out.setdefault(code, {'muni': muni, 'azas': {}})
        a = m['azas'].setdefault(acode, {'name': aza, 'p': []})
        a['p'].append(enc)
        stats['使った土地'] = stats.get('使った土地', 0) + 1
    return code


def parse_geojson(name, data, out, stats):
    """AIGID の GeoJSON（mojxml2ogr で変換。経緯度 JGD2011）を読む"""
    j = json.loads(data)
    for ft in j.get('features', []):
        pr = ft.get('properties') or {}
        g = ft.get('geometry') or {}
        if '任意' in str(pr.get('座標系', '')):
            stats['任意座標の地図（使わない）'] = stats.get('任意座標の地図（使わない）', 0) + 1
            continue
        no = norm_no(pr.get('地番'))
        aza = norm_aza(str(pr.get('大字名') or '') + str(pr.get('丁目名') or ''))
        if not no or not aza or not code:
            stats['数字でない地番（使わない）'] = stats.get('数字でない地番（使わない）', 0) + 1
            continue
        code = str(pr.get('市区町村コード') or pr.get('市区町村C') or '')  # AIGID の GeoJSON は「市区町村C」
        muni = str(pr.get('市区町村名') or '')
        acode = str(pr.get('大字コード') or '000').zfill(3) + str(pr.get('丁目コード') or '000').zfill(3)
        rings = []
        if g.get('type') == 'Polygon':
            rings = [g['coordinates'][0]]
        elif g.get('type') == 'MultiPolygon':
            rings = [pp[0] for pp in g['coordinates']]
        if not rings:
            stats['形のない土地（使わない）'] = stats.get('形のない土地（使わない）', 0) + 1
            continue
        # 経緯度のままでは面積・簡略化の単位がずれるので、平面（m）に直して計算する
        lat0 = rings[0][0][1]
        k = 111320 * __import__('math').cos(__import__('math').radians(lat0))
        polys = [Polygon([((x - rings[0][0][0]) * k, (y - lat0) * 110540) for x, y in r[:]]) for r in rings if len(r) >= 4]
        polys = [pp if pp.is_valid else pp.buffer(0) for pp in polys]
        polys = [pp for pp in polys if not pp.is_empty]
        if not polys:
            continue
        poly = max(polys, key=lambda pp: pp.area)
        if poly.geom_type != 'Polygon':
            poly = max(poly.geoms, key=lambda pp: pp.area)
        simp = poly.simplify(0.3, preserve_topology=True)
        back = lambda x, y: (y / 110540 + lat0, x / k + rings[0][0][0])
        c = poly.representative_point()
        clat, clng = back(c.x, c.y)
        cy, cx = round(clat * 1e6), round(clng * 1e6)
        enc = [no, cy, cx]
        for x, y in list(simp.exterior.coords)[:-1]:
            la, ln = back(x, y)
            enc += [round(la * 1e6) - cy, round(ln * 1e6) - cx]
        m = out.setdefault(code, {'muni': muni, 'azas': {}})
        m['azas'].setdefault(acode, {'name': aza, 'p': []})['p'].append(enc)
        stats['使った土地'] = stats.get('使った土地', 0) + 1


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    src, dst = sys.argv[1], sys.argv[2]
    asof = sys.argv[3] if len(sys.argv) > 3 else ''
    out, stats = {}, {}
    gjs = [f for f in glob.glob(os.path.join(src, '**', '*.geojson'), recursive=True)] if os.path.isdir(src) else ([src] if src.endswith('.geojson') else [])
    for f in gjs:
        parse_geojson(f, open(f, 'rb').read(), out, stats)
        print('読みました：', f, file=sys.stderr)
    for name, data in (xml_sources(src) if os.path.isdir(src) else []):
        parse(name, data, out, stats)
        print('読みました：', name, file=sys.stderr)
    for code, m in out.items():
        d = os.path.join(dst, code)
        os.makedirs(d, exist_ok=True)
        index = {'v': 1, 'code': code, 'muni': m['muni'], 'asof': asof,
                 'src': (f'「登記所備付地図データ {m["muni"]}」（法務省）をAIGIDがGeoJSONに変換したもの（CC BY、https://www.geospatial.jp/ckan/dataset/aigid-moj-{code}）を加工して作成'
                         if gjs else f'「登記所備付地図データ {m["muni"]}」（法務省）（https://front.geospatial.jp/moj-chizu-xml-readme/）を加工して作成'),
                 'azas': {}}
        for acode, a in sorted(m['azas'].items()):
            a['p'].sort(key=lambda e: [int(n) for n in e[0].split('-')])
            index['azas'][a['name']] = {'f': acode, 'n': len(a['p'])}
            with open(os.path.join(d, acode + '.json'), 'w', encoding='utf-8') as f:
                json.dump({'v': 1, 'name': a['name'], 'p': a['p']}, f, ensure_ascii=False, separators=(',', ':'))
        with open(os.path.join(d, 'index.json'), 'w', encoding='utf-8') as f:
            json.dump(index, f, ensure_ascii=False, separators=(',', ':'))
        print(f'{m["muni"]}（{code}）：大字 {len(m["azas"])}・土地 {sum(len(a["p"]) for a in m["azas"].values())}', file=sys.stderr)
    # 市区町村の一覧（画面は、ここを見て、どの市町村の表があるかを知る）
    lst_path = os.path.join(dst, 'index.json')
    lst = json.load(open(lst_path, encoding='utf-8')) if os.path.exists(lst_path) else {'v': 1, 'munis': {}}
    for code, m in out.items():
        lst['munis'][m['muni']] = {'code': code, 'asof': asof}
    with open(lst_path, 'w', encoding='utf-8') as f:
        json.dump(lst, f, ensure_ascii=False, separators=(',', ':'))
    print(stats, file=sys.stderr)


if __name__ == '__main__':
    main()
