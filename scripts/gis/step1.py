import shapefile, pickle, time, collections
from shapely.geometry import shape
from shapely.ops import unary_union, transform
from shapely import prepared
import pyproj
A='D:/VIBECODING/SafetyAI/seed_data/09. 주관기관 데이터 수신/4. 행정구역 및 GIS 추출 정보(260229)/002. 행정동_GIS정보/002. 행정동_GIS정보/BND_ADM_DONG_PG.shp'
r=shapefile.Reader(A,encoding='cp949')
t=pyproj.Transformer.from_crs(5186,5179,always_xy=True).transform
emd=[]
for sr in r.iterShapeRecords():
  c=sr.record['ADM_CD']
  if c.startswith('21') or c.startswith('37070') or c.startswith('32590'):
    g=shape(sr.shape.__geo_interface__).buffer(0)
    emd.append((c,sr.record['ADM_NM'],g))
print(len(emd), collections.Counter(c[:5] for c,_,_ in emd))
reg={'busan':unary_union([g for c,_,g in emd if c.startswith('21')]),
     'yeongcheon':unary_union([g for c,_,g in emd if c.startswith('37070')]),
     'inje':unary_union([g for c,_,g in emd if c.startswith('32590')])}
reg5179={k:transform(t,v) for k,v in reg.items()}
pickle.dump({'emd':emd,'reg5179':reg5179},open('admin.pkl','wb'))
out={}
for name,path in [('ctln','ctln/TN_RIVER_CTLN'),('bt','bt/TN_RIVER_BT'),('bndry','bndry/TN_RIVER_BNDRY')]:
  rr=shapefile.Reader(path)
  for k,g in reg5179.items():
    t0=time.time(); P=prepared.prep(g.buffer(50)); res=[]
    for s in rr.iterShapeRecords(bbox=list(g.bounds)):
      gg=shape(s.shape.__geo_interface__)
      if P.intersects(gg): res.append((list(s.record),gg))
    out[(name,k)]=res; print(name,k,len(res),round(time.time()-t0),flush=True)
pickle.dump(out,open('raw.pkl','wb'))
