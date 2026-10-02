import json,collections
D='D:/VIBECODING/SafetyAI/data/geo/'
a=json.load(open(D+'rivers_area.geojson',encoding='utf-8'))['features']
s=collections.defaultdict(float)
for f in a: s[(f['properties']['region'],f['properties']['name'])]+=f['properties']['area_m2']/1e6
for k,v in sorted(s.items(),key=lambda x:-x[1])[:15]: print(k,round(v,2))
