import json
from shapely.geometry import shape
D='D:/VIBECODING/SafetyAI/data/geo/'
c={f['id']:shape(f['geometry']) for f in json.load(open(D+'rivers_centerline.geojson',encoding='utf-8'))['features']}
for f in json.load(open(D+'small_river_zones.geojson',encoding='utf-8'))['features'][:2000]:
  p=f['properties']
  if p['riverId']: print('SR',p['name'],round(shape(f['geometry']).distance(c[p['riverId']])*1e5),'m~')
a=json.load(open(D+'rivers_area.geojson',encoding='utf-8'))['features']
import collections
cnt=collections.Counter(f['properties']['name'] for f in a if f['properties']['riverId'])
print(cnt.most_common(12))
