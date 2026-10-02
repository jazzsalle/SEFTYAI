import openpyxl,json,collections
wb=openpyxl.load_workbook("D:/VIBECODING/SafetyAI/seed_data/09. 주관기관 데이터 수신/16. ★상습침수지역 및 피해데이터(재난영향분석과 자료)_260811/수신 데이터/★Raw data(공공시설 오류)/★Raw data(공공시설 오류)/침수흔적도(위선)_조인현황.xlsx",read_only=True)
it=wb.active.iter_rows(values_only=True); h=next(it)
out=[]
for r in it:
  d=dict(zip(h,r)); a=str(d['ADM_CD'] or '')
  if a.startswith('26') or a.startswith('47230') or a.startswith('51810') or a.startswith('42810'):
    d.pop('geometry',None); out.append(d)
json.dump(out,open(r"D:/VIBECODING/SafetyAI/scripts/build_events/_work/trace3.json","w",encoding="utf-8"),ensure_ascii=False,default=str)
c=collections.Counter((str(d['ADM_CD'])[:5],d['F_DSSTR_NM'],d['F_BEGIN_DE']) for d in out)
for k,v in sorted(c.items(),key=str): print(k,v)
print(len(out))
