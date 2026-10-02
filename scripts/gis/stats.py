import pickle, collections
raw = pickle.load(open('raw.pkl', 'rb'))
for (lay, reg), rows in raw.items():
    print(lay, reg, len(rows))
    if lay == 'ctln':
        se = collections.Counter((r[3], bool(r[2])) for r, g in rows)
        print('  RIVER_SE/named', se)
        L = collections.defaultdict(float); N = collections.Counter(); NO = collections.defaultdict(set)
        for r, g in rows:
            if r[2]:
                L[r[2]] += g.length; N[r[2]] += 1; NO[r[2]].add(r[1])
        print('  named rivers', len(L))
        for n, l in sorted(L.items(), key=lambda x: -x[1])[:25]:
            print('   ', n, round(l / 1000, 1), N[n], sorted(NO[n])[:4])
    else:
        import numpy as np
        a = np.array([g.area for r, g in rows]) if rows else np.array([0])
        print('  area sum km2', round(a.sum() / 1e6, 2), 'max', round(a.max() / 1e6, 3), 'verts', sum(len(g.exterior.coords) if g.geom_type == 'Polygon' else sum(len(p.exterior.coords) for p in g.geoms) for r, g in rows))
