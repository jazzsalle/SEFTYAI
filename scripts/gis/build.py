import pickle, json, csv, math, collections, os, shapefile, glob
import pyproj, shapely
from shapely.geometry import MultiPoint
from shapely.geometry import shape, mapping, LineString, MultiLineString, Polygon, MultiPolygon, GeometryCollection
from shapely.ops import unary_union, transform, linemerge
from shapely import prepared
_lm = linemerge
def linemerge(g):
    if g.geom_type == 'LineString': return g
    return _lm(lines_only(g))
from shapely.strtree import STRtree

OUT = 'D:/VIBECODING/SafetyAI/data/geo/'
os.makedirs(OUT, exist_ok=True)
T86 = pyproj.Transformer.from_crs(5186, 4326, always_xy=True).transform
T79 = pyproj.Transformer.from_crs(5179, 4326, always_xy=True).transform
T86_79 = pyproj.Transformer.from_crs(5186, 5179, always_xy=True).transform
P5174 = pyproj.CRS.from_proj4('+proj=tmerc +lat_0=38 +lon_0=127.0028902777778 +k=1 +x_0=200000 +y_0=500000 '
                              '+ellps=bessel +units=m +no_defs +towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43')
T74 = pyproj.Transformer.from_crs(P5174, 4326, always_xy=True).transform
T74_79 = pyproj.Transformer.from_crs(P5174, 5179, always_xy=True).transform

TOL = {'emd': 10, 'sigungu': 15, 'ctln': 8, 'area': 12, 'small': 8}
REGIONS = [('busan', '부산광역시', 'BS', '21', '26'), ('yeongcheon', '경상북도 영천시', 'YC', '37070', '47230'),
           ('inje', '강원특별자치도 인제군', 'IJ', '32590', '51810')]
SE = {'RVC001': '국가하천', 'RVC002': '지방하천', 'RVC003': '소하천', 'RVC004': '기타하천', 'RVC005': '세류'}
RANK = {'국가하천': 0, '지방하천': 1, '소하천': 2, '기타하천': 3, '세류': 4, None: 5}


def rnd(o):
    if isinstance(o, float): return round(o, 6)
    if isinstance(o, (list, tuple)): return [rnd(x) for x in o]
    return o


def geo(g):
    m = mapping(g)
    return {'type': m['type'], 'coordinates': rnd(m['coordinates'])}


def polys_only(g):
    if g.is_empty: return g
    if g.geom_type in ('Polygon', 'MultiPolygon'): return g
    if hasattr(g, 'geoms'):
        ps = [x for x in g.geoms if x.geom_type in ('Polygon', 'MultiPolygon')]
        return unary_union(ps) if ps else Polygon()
    return Polygon()


def lines_only(g):
    if g.is_empty: return g
    if g.geom_type in ('LineString', 'MultiLineString'): return g
    if hasattr(g, 'geoms'):
        ls = []
        for x in g.geoms:
            if x.geom_type == 'LineString': ls.append(x)
            elif x.geom_type == 'MultiLineString': ls.extend(x.geoms)
        return MultiLineString(ls) if ls else LineString()
    return LineString()


def pt(g):
    p = g.representative_point() if g.geom_type in ('Polygon', 'MultiPolygon') else g.interpolate(0.5, normalized=True) if g.geom_type == 'LineString' else None
    if p is None:  # multiline: midpoint of longest part
        p = max(g.geoms, key=lambda x: x.length).interpolate(0.5, normalized=True)
    return p


def lonlat(p, T):
    x, y = T(p.x, p.y); return [round(x, 6), round(y, 6)]


def bbox(g, T):
    g2 = transform(T, g); return [round(v, 6) for v in g2.bounds]


def write(name, feats):
    fc = {'type': 'FeatureCollection', 'name': name.replace('.geojson', ''), 'crs_note': 'EPSG:4326 lon/lat', 'features': feats}
    s = json.dumps(fc, ensure_ascii=False, separators=(',', ':'))
    open(OUT + name, 'w', encoding='utf-8').write(s)
    print(name, len(feats), round(len(s.encode()) / 1e6, 2), 'MB')


# ---------- admin ----------
adm = pickle.load(open('admin.pkl', 'rb'))
LINK = 'D:/VIBECODING/SafetyAI/seed_data/09. 주관기관 데이터 수신/4. 행정구역 및 GIS 추출 정보(260229)/001. 행정동_법정동_연계/001. 행정동_법정동_연계/국가데이터처_법정동 연계정보_20250602.csv'
sgg = {}  # sgis5 -> (sido, sigungu, law5)
emdname = {}
for r in csv.reader(open(LINK, encoding='cp949', errors='replace')):
    if len(r) < 7 or not r[4][:2].isdigit(): continue
    k = r[4][:5]
    if k.startswith('21') or k in ('37070', '32590'):
        sido = '강원특별자치도' if k == '32590' else r[0]
        law = r[6][:5]
        if k == '32590': law = '51810'
        sgg.setdefault(k, (sido, r[1], law))
        emdname[r[4]] = r[2]
emd = adm['emd']
sgg_geo = collections.defaultdict(list)
feats = []
for code, nm, g in sorted(emd, key=lambda x: x[0]):
    s5 = code[:5]
    sido, sig, law = sgg[s5]
    sgg_geo[s5].append(g)
    gs = polys_only(g.simplify(TOL['emd'], preserve_topology=True))
    feats.append({'type': 'Feature', 'id': code, 'properties': {'code': code, 'sido': sido, 'sigungu': sig, 'sigunguCode': law, 'emd': nm,
                  'center': lonlat(g.representative_point(), T86)}, 'geometry': geo(transform(T86, gs))})
write('admin_emd.geojson', feats)
sgg_poly = {}
feats = []
for s5, gl in sorted(sgg_geo.items(), key=lambda x: sgg[x[0]][2]):
    sido, sig, law = sgg[s5]
    u = unary_union(gl).buffer(0.5).buffer(-0.5)
    sgg_poly[law] = (sig, transform(T86_79, u))
    gs = polys_only(u.simplify(TOL['sigungu'], preserve_topology=True))
    feats.append({'type': 'Feature', 'id': law, 'properties': {'code': law, 'sgisCode': s5, 'sido': sido, 'sigungu': sig,
                  'center': lonlat(u.representative_point(), T86), 'emdCount': len(gl)}, 'geometry': geo(transform(T86, gs))})
write('admin_sigungu.geojson', feats)
sgg_items = list(sgg_poly.items())
sgg_tree = STRtree([g for _, (_, g) in sgg_items])


def sigungu_of(g, minlen=0):
    res = []
    for i in sgg_tree.query(g):
        law, (sig, sg) = sgg_items[i]
        x = sg.intersection(g)
        m = x.length if g.geom_type.endswith('LineString') else x.area
        if m > minlen: res.append((m, law, sig))
    res.sort(reverse=True)
    return res


# ---------- standard data ----------
std = list(csv.DictReader(open('std.csv', encoding='utf-8')))
ALIAS = {'신령천': ['신녕천'], '신녕천': ['신령천']}
REGKEY = {'busan': ['부산'], 'yeongcheon': ['영천'], 'inje': ['인제']}


def std_match(name, rid):
    keys = REGKEY[rid]
    names = {name} | set(ALIAS.get(name, []))
    c = [r for r in std if r['하천명'] in names and any(k in (r['제공기관명'] + r['관리기관명'] + r['시점위치'] + r['종점위치']) for k in keys)]
    if not c: return None, 0
    c.sort(key=lambda r: (-(any(k in r['제공기관명'] for k in keys)), -sum(1 for v in r.values() if v)))
    b = c[0]
    keep = ['하천코드', '하천명', '제1지류명', '제2지류명', '하천구분명', '하천지정근거명', '하천지정연월', '시점위치', '종점위치',
            '시점위치(위도)', '시점위치(경도)', '종점위치(위도)', '종점위치(경도)', '하천길이', '하천계획홍수량', '하천계획홍수위', '하천계획하폭',
            '관리기관명', '관리기관전화번호', '데이터기준일자', '제공기관명']
    return {k: b[k] for k in keep if b.get(k)}, len(c)


# ---------- centerlines ----------
raw = pickle.load(open('raw.pkl', 'rb'))
regpoly = adm['reg5179']
index = []
cfeats = []
river_lines = {}  # riverId -> geom 5179
GAP = 1500  # m: same-name pieces further apart become separate entities
for rid, rname, ab, _, _ in REGIONS:
    R = regpoly[rid]; PR = prepared.prep(R)
    groups = collections.defaultdict(list)
    for rec, g in raw[('ctln', rid)]:
        nm = rec[2].strip()
        if not nm: continue
        if not PR.contains(g):
            g = lines_only(g.intersection(R))
            if g.is_empty: continue
        groups[nm].append((SE.get(rec[3]), rec[1], g))
    ents = []
    for nm, segs in groups.items():
        merged = linemerge(unary_union([g for _, _, g in segs]))
        parts = list(merged.geoms) if hasattr(merged, 'geoms') else [merged]
        # cluster parts by proximity
        par = list(range(len(parts)))
        def f(i):
            while par[i] != i: par[i] = par[par[i]]; i = par[i]
            return i
        tr = STRtree(parts)
        for i, p in enumerate(parts):
            for j in tr.query(p.buffer(GAP)):
                if j != i and p.distance(parts[j]) <= GAP: par[f(i)] = f(j)
        # also join parts sharing a RIVER_NO (handles reservoir/culvert gaps)
        pno = [set(no for _, no, sg in segs if no and sg.distance(p) < 1) for p in parts]
        for i in range(len(parts)):
            for j in range(i + 1, len(parts)):
                if pno[i] & pno[j]: par[f(i)] = f(j)
        cl = collections.defaultdict(list)
        for i, p in enumerate(parts): cl[f(i)].append(p)
        for ps in cl.values():
            g = linemerge(MultiLineString(ps)) if len(ps) > 1 else ps[0]
            gl = collections.Counter()
            nos = collections.Counter()
            for se, no, sg in segs:
                if sg.distance(g) < 1:
                    gl[se] += sg.length
                    if no: nos[no] += sg.length
            grade = min(gl, key=lambda k: (RANK[k], -gl[k])) if gl else None
            # use majority-by-length grade but prefer 국가/지방 if they make up >20%
            tot = sum(gl.values()) or 1
            for k in ('국가하천', '지방하천', '소하천'):
                if gl.get(k, 0) / tot > 0.2: grade = k; break
            else:
                grade = gl.most_common(1)[0][0] if gl else None
            if g.length < 150: continue  # boundary slivers of neighbouring-region rivers
            ents.append(dict(name=nm, geom=g, grade=grade, riverNo=nos.most_common(1)[0][0] if nos else None))
    ents.sort(key=lambda e: (RANK[e['grade']], -e['geom'].length, e['name']))
    namecount = collections.Counter(e['name'] for e in ents)
    used_labels = set()
    for n, e in enumerate(ents, 1):
        e['id'] = f'RV-{ab}-{n:04d}'
        g = e['geom']
        sl = sigungu_of(g, 1)
        attrs, nmatch = std_match(e['name'], rid)
        grade = e['grade']
        gradeMap = grade
        if attrs and attrs.get('하천구분명') in ('국가하천', '지방하천', '소하천') and RANK[attrs['하천구분명']] < RANK[grade]:
            grade = attrs['하천구분명']  # 표준데이터(관리청, 2025~26) is newer than 국가기본도 (2024)
        e['grade'] = grade
        sig = [s for _, _, s in sl]
        cen = pt(g)
        label = e['name'] if namecount[e['name']] == 1 else f"{e['name']} ({sig[0] if sig else ''})"
        if label in used_labels: label = f"{label[:-1]}, {sum(1 for l in used_labels if l.startswith(label[:-1]))+1})" if label.endswith(')') else f"{label} ({len(used_labels)})"
        used_labels.add(label)
        gs = g.simplify(TOL['ctln'], preserve_topology=False)
        g4 = transform(T79, gs)
        props = {'riverId': e['id'], 'name': e['name'], 'label': label, 'grade': grade, 'gradeMap': gradeMap, 'region': rid, 'regionName': rname,
                 'sigungu': sig, 'sigunguCodes': [c for _, c, _ in sl], 'length_km': round(g.length / 1000, 2), 'riverNo': e['riverNo']}
        if attrs:
            props.update({'std_code': attrs.get('하천코드'), 'std_grade': attrs.get('하천구분명'), 'std_length_km': attrs.get('하천길이'),
                          'std_start': attrs.get('시점위치'), 'std_end': attrs.get('종점위치'), 'std_manager': attrs.get('관리기관명'),
                          'std_trib1': attrs.get('제1지류명'), 'std_planFlood': attrs.get('하천계획홍수량')})
            props = {k: v for k, v in props.items() if v is not None}
        cfeats.append({'type': 'Feature', 'id': e['id'], 'properties': props, 'geometry': geo(g4)})
        river_lines[e['id']] = (g, e['name'], rid)
        index.append({'riverId': e['id'], 'name': e['name'], 'label': label, 'grade': grade, 'region': rid, 'regionName': rname,
                      'sigungu': sig, 'bbox': [round(v, 6) for v in g4.bounds], 'center': lonlat(cen, T79),
                      'length_km': round(g.length / 1000, 2), 'aliases': ALIAS.get(e['name'], []), 'standardAttrs': attrs, 'standardMatches': nmatch,
                      'hasArea': False, 'smallRiverZoneIds': []})
    print(rid, 'named river groups', len(groups), 'entities', len(ents), collections.Counter(e['grade'] for e in ents))
write('rivers_centerline.geojson', cfeats)

# ---------- areas (실폭하천) ----------
ids = list(river_lines)
ltree = STRtree([river_lines[i][0] for i in ids])
afeats = []
idx_by = {x['riverId']: x for x in index}
for rid, rname, ab, _, _ in REGIONS:
    R = regpoly[rid]; PR = prepared.prep(R)
    n = 0
    for rec, g in raw[('bt', rid)]:
        g = g.buffer(0)
        if not PR.contains(g):
            g = polys_only(g.intersection(R))
        if g.is_empty or g.area < 50: continue
        if g.area < 2000 and not any(river_lines[ids[j]][2] == rid for j in ltree.query(g.buffer(30))): continue
        best = collections.Counter()
        for j in ltree.query(g):
            rv = ids[j]
            if river_lines[rv][2] != rid: continue
            best[rv] = g.intersection(river_lines[rv][0]).length
        best = +best
        sig_r = [k for k in best if best[k] > 200]
        pieces = []
        if len(sig_r) >= 2:  # polygon spans several named rivers (confluence) -> split by nearest centerline (Voronoi)
            pts, lab, seenp = [], [], set()
            for k in sig_r:
                ln = lines_only(river_lines[k][0].intersection(g.buffer(300)))
                for part in (ln.geoms if hasattr(ln, 'geoms') else [ln]):
                    for d in range(0, int(part.length) + 1, 40):
                        p = part.interpolate(d); key = (round(p.x, 1), round(p.y, 1))
                        if key in seenp: continue
                        seenp.add(key); pts.append(p); lab.append(k)
            vor = shapely.voronoi_polygons(MultiPoint(pts), extend_to=g.envelope.buffer(1000), ordered=True)
            cells = collections.defaultdict(list)
            for c, k in zip(vor.geoms, lab): cells[k].append(c)
            for k, cl in cells.items():
                pg = polys_only(g.intersection(unary_union(cl)))
                if not pg.is_empty and pg.area > 50: pieces.append((k, pg))
        else:
            pieces.append((max(best, key=lambda k: (best[k], -RANK[idx_by[k]['grade']])) if best else None, g))
        for rv, pg in pieces:
            gs = polys_only(pg.simplify(TOL['area'], preserve_topology=True))
            if gs.is_empty: continue
            n += 1
            sl = sigungu_of(pg, 1)
            props = {'id': f'RA-{ab}-{n:05d}', 'nfId': rec[0], 'riverId': rv, 'name': river_lines[rv][1] if rv else None,
                     'otherRiverIds': [k for k in best if k != rv][:5], 'split': len(pieces) > 1, 'region': rid,
                     'sigungu': [s for _, _, s in sl[:3]], 'area_m2': round(pg.area)}
            if rv: idx_by[rv]['hasArea'] = True
            afeats.append({'type': 'Feature', 'id': props['id'], 'properties': props, 'geometry': geo(transform(T79, gs))})
    print(rid, 'area polys', n)
write('rivers_area.geojson', afeats)

# ---------- small river zones ----------
sfeats = []
law2sig = {law: sig for law, (sig, _) in sgg_poly.items()}
lawalias = {'42810': '51810'}
name_idx = collections.defaultdict(list)
for x in index: name_idx[(x['region'], x['name'])].append(x)
for f in glob.glob('sr/*.shp'):
    r = shapefile.Reader(f)
    for sr in r.iterShapeRecords():
        rec = sr.record.as_dict()
        law = lawalias.get(rec['COL_ADM_SE'], rec['COL_ADM_SE'])
        if law not in law2sig: continue
        rid = 'busan' if law.startswith('26') else 'yeongcheon' if law == '47230' else 'inje'
        g = shape(sr.shape.__geo_interface__).buffer(0)
        nm = (rec['ALIAS'] or rec['REMARK'] or '').strip() or None
        g79 = transform(T74_79, g)
        gs = polys_only(g79.simplify(TOL['small'], preserve_topology=True))
        if gs.is_empty: continue
        rv = None
        if nm:
            c = name_idx.get((rid, nm), [])
            if c: rv = min(c, key=lambda x: river_lines[x['riverId']][0].distance(g79))['riverId']
        sid = 'SR-' + rec['MNUM']
        props = {'id': sid, 'mnum': rec['MNUM'], 'name': nm, 'sigungu': law2sig[law], 'sigunguCode': law, 'region': rid,
                 'ntfDate': rec['NTFDATE'], 'riverId': rv, 'area_m2': round(g79.area)}
        if rv: idx_by[rv]['smallRiverZoneIds'].append(sid)
        sfeats.append({'type': 'Feature', 'id': sid, 'properties': props, 'geometry': geo(transform(T79, gs))})
write('small_river_zones.geojson', sfeats)
print('small zones by region', collections.Counter(f['properties']['region'] for f in sfeats),
      'named', sum(1 for f in sfeats if f['properties']['name']), 'linked', sum(1 for f in sfeats if f['properties']['riverId']))

json.dump({'version': 1, 'crs': 'EPSG:4326', 'count': len(index), 'rivers': index},
          open(OUT + 'rivers_index.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('rivers_index.json', len(index), round(os.path.getsize(OUT + 'rivers_index.json') / 1e6, 2), 'MB')

# ---------- regions ----------
def zoom(bb):
    w = max(bb[2] - bb[0], (bb[3] - bb[1]) * 1.2)
    return max(7, min(14, int(math.log2(700 * 360 / (256 * w)))))

regs = []
for rid, rname, ab, s5, law in REGIONS:
    R = regpoly[rid]
    bb = bbox(R, T79)
    sl = []
    for lw, (sig, g) in sorted(sgg_poly.items()):
        if (rid == 'busan' and lw.startswith('26')) or lw == law:
            sl.append({'code': lw, 'name': sig, 'center': lonlat(g.representative_point(), T79), 'bbox': bbox(g, T79)})
    regs.append({'id': rid, 'name': rname.split()[-1], 'fullName': rname, 'code': law if law != '26' else '26000', 'sgisCode': s5 if s5 != '21' else '21',
                 'bbox': bb, 'center': lonlat(R.representative_point() if rid != 'busan' else R.centroid, T79), 'zoom': zoom(bb),
                 'riverCount': sum(1 for x in index if x['region'] == rid), 'sigungu': sl})
json.dump({'crs': 'EPSG:4326', 'regions': regs}, open(OUT + 'regions.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('regions', [(r['id'], r['zoom'], len(r['sigungu'])) for r in regs])
