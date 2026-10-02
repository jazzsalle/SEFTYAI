import openpyxl,json,collections
wb=openpyxl.load_workbook("D:/VIBECODING/SafetyAI/seed_data/09. 주관기관 데이터 수신/27. 재난이벤트 내용(재난안전데이터과)_내용 거의 없음_260824/1.재난관리시스템/TDR_SDR_OCCR_NATURE.xlsx",read_only=True)
rows=list(wb.active.iter_rows(values_only=True))
h=rows[0]; d=[dict(zip(h,r)) for r in rows[1:]]
json.dump(d,open(r"D:/VIBECODING/SafetyAI/scripts/build_events/_work/occr.json","w",encoding="utf-8"),ensure_ascii=False,default=str)
print(collections.Counter(str(x['DSTR_YEAR']) for x in d))
print(collections.Counter(str(x['RM']) for x in d))
for x in d:
  if str(x['DSTR_TY_CD']) in ('1001','1005','1008','1015','1016','1041') and (x['RM']!='비우심' or str(x['DSTR_YEAR'])>='2016'):
    if x['RM']!='비우심': print(x['DSTR_YEAR'],x['DSTR_TY_CD'],x['DSTR_SN'],x['DSTR_NM'],x['DSTR_BEGIN_DE'],x['DSTR_END_DE'],x['RM'])
