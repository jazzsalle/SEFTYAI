import openpyxl,json,collections
wb=openpyxl.load_workbook("D:/VIBECODING/SafetyAI/seed_data/09. 주관기관 데이터 수신/9. ★재해대장_피해위치_복구비_260709/20260708_2010~2025재해대장보고서_New.xlsx",read_only=True)
ks=['year','name','sido','sigungu','dong','loc','ministry','fclty','grade','fname','stage','recStage','recType','dmgSgg','recSgg','dmgCtr','recCtr','reg']
out=[]
for i,r in enumerate(wb.active.iter_rows(values_only=True)):
  if i<2: continue
  s=' '.join(str(x) for x in r[2:6] if x)
  if ('부산' in s) or ('영천' in s) or ('인제' in s):
    out.append(dict(zip(ks,r)))
json.dump(out,open(r"D:/VIBECODING/SafetyAI/scripts/build_events/_work/ledger3.json","w",encoding="utf-8"),ensure_ascii=False,default=str)
def reg(x):
  s=' '.join(str(v) for v in (x['sido'],x['sigungu'],x['loc']) if v)
  return '부산' if '부산' in s else '영천' if '영천' in s else '인제' if '인제' in s else '?'
c=collections.defaultdict(lambda:[0,0,0])
for x in out:
  k=(reg(x),str(x['year']),x['name']); c[k][0]+=1
  try: c[k][1]+=float(x['dmgCtr'] or 0); c[k][2]+=float(x['recCtr'] or 0)
  except: pass
for k in sorted(c): print(k,c[k][0],round(c[k][1]),round(c[k][2]))
print(len(out))
