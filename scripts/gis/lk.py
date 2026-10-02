import csv
F='D:/VIBECODING/SafetyAI/seed_data/09. 주관기관 데이터 수신/4. 행정구역 및 GIS 추출 정보(260229)/001. 행정동_법정동_연계/001. 행정동_법정동_연계/국가데이터처_법정동 연계정보_20250602.csv'
rows=list(csv.reader(open(F,encoding='cp949',errors='replace')))
print(rows[0],len(rows))
seen={}
for r in rows[1:]:
  if r and (r[0].startswith('부산') or r[1] in('영천시','인제군')):
    seen.setdefault((r[0],r[1],r[4][:5],r[5][:5]),set()).add(r[4])
for k,v in sorted(seen.items()): print(k,len(v))
