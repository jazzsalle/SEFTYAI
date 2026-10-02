import shapefile,glob
A='D:/VIBECODING/SafetyAI/seed_data/09. 주관기관 데이터 수신/4. 행정구역 및 GIS 추출 정보(260229)/002. 행정동_GIS정보/002. 행정동_GIS정보/BND_ADM_DONG_PG.shp'
r=shapefile.Reader(A,encoding='cp949')
print(r.fields, len(r), r.bbox)
recs=r.records()
for x in recs[:3]: print(x)
for x in recs:
  s=str(x)
  if '영천' in s or '인제' in s or '해운대' in s: print(x); 
import collections
print(collections.Counter(str(x[0])[:2] for x in recs))
for f in ['ctln/TN_RIVER_CTLN','bt/TN_RIVER_BT','bndry/TN_RIVER_BNDRY']+glob.glob('sr/*.shp'):
  r=shapefile.Reader(f); print(f,r.fields,len(r),r.bbox,r.shapeType)
  for i in range(2): print(r.record(i))
