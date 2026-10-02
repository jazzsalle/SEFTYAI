import json,collections
D='D:/VIBECODING/SafetyAI/data/geo/'
idx=json.load(open(D+'rivers_index.json',encoding='utf-8'))['rivers']
for x in idx:
  if x['grade'] in('국가하천','지방하천') or x['name'] in ('온천천','수영강','금호강','신령천','내린천','소양강','북천','송정천'):
    print(x['riverId'],x['label'],x['grade'],x['length_km'],x['sigungu'][:4],'std' if x['standardAttrs'] else '-',x['standardMatches'],x['hasArea'],len(x['smallRiverZoneIds']))
print('std matched',sum(1 for x in idx if x['standardAttrs']),'/',len(idx))
a=json.load(open(D+'rivers_area.geojson',encoding='utf-8'))['features']
print('area unlinked', sum(1 for f in a if not f['properties']['riverId']), 'area km2 unlinked', sum(f['properties']['area_m2'] for f in a if not f['properties']['riverId'])/1e6, 'total', sum(f['properties']['area_m2'] for f in a)/1e6)
s=json.load(open(D+'small_river_zones.geojson',encoding='utf-8'))['features']
print(collections.Counter(f['properties']['sigungu'] for f in s).most_common(30))
print(json.load(open(D+'regions.json',encoding='utf-8'))['regions'][0]['sigungu'][:2])
