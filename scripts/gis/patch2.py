s=open('build.py',encoding='utf-8').read()
s=s.replace("from shapely import prepared","from shapely import prepared\n_lm = linemerge\ndef linemerge(g):\n    if g.geom_type == 'LineString': return g\n    return _lm(lines_only(g))",1)
open('build.py','w',encoding='utf-8').write(s)
