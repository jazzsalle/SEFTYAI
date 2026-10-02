s=open('build.py',encoding='utf-8').read()
old="""        cl = collections.defaultdict(list)"""
new="""        # also join parts sharing a RIVER_NO (handles reservoir/culvert gaps)
        pno = [set(no for _, no, sg in segs if no and sg.distance(p) < 1) for p in parts]
        for i in range(len(parts)):
            for j in range(i + 1, len(parts)):
                if pno[i] & pno[j]: par[f(i)] = f(j)
        cl = collections.defaultdict(list)"""
assert old in s; s=s.replace(old,new,1)
old="""    c = [r for r in std if r['하천명'] == name and"""
new="""    names = {name} | set(ALIAS.get(name, []))
    c = [r for r in std if r['하천명'] in names and"""
assert old in s; s=s.replace(old,new,1)
s=s.replace("REGKEY = {","ALIAS = {'신령천': ['신녕천'], '신녕천': ['신령천']}\nREGKEY = {",1)
s=s.replace("'length_km': round(g.length / 1000, 2), 'aliases': [],","'length_km': round(g.length / 1000, 2), 'aliases': ALIAS.get(e['name'], []),",1)
open('build.py','w',encoding='utf-8').write(s)
