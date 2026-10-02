s=open('build.py',encoding='utf-8').read()
i=s.index("        best = +best"); j=s.index("    print(rid, 'area polys', n)")
new='''        best = +best
        sig_r = [k for k in best if best[k] > 200]
        pieces = []
        if len(sig_r) >= 2:  # polygon spans several named rivers (confluence) -> split by nearest centerline (Voronoi)
            pts, lab = [], []
            for k in sig_r:
                ln = lines_only(river_lines[k][0].intersection(g.buffer(300)))
                for part in (ln.geoms if hasattr(ln, 'geoms') else [ln]):
                    for d in range(0, int(part.length) + 1, 40):
                        p = part.interpolate(d); pts.append(p); lab.append(k)
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
'''
s=s[:i]+new+s[j:]
s=s.replace("import pyproj","import pyproj, shapely\nfrom shapely.geometry import MultiPoint",1)
open('build.py','w',encoding='utf-8').write(s)
