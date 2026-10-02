d=open('D:/VIBECODING/SafetyAI/seed_data/하천 공간정보/전국하천표준데이터/전국하천표준데이터.csv','rb').read()
for e in ('utf-8-sig','cp949'):
  try: t=d.decode(e); print(e); break
  except Exception as x: pass
open('std.csv','w',encoding='utf-8').write(t)
