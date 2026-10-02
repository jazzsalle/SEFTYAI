import glob,openpyxl
B='D:/VIBECODING/SafetyAI/seed_data/하천 공간정보/'
for f in glob.glob(B+'국가기본도*/*.xlsx'):
  print('==',f)
  wb=openpyxl.load_workbook(f,data_only=True)
  for ws in wb:
    for r in ws.iter_rows(values_only=True):
      if any(r): print([c for c in r if c is not None])
wb=openpyxl.load_workbook(B+'소하천_소하천구역(연속주제)+브이월드/LSMD_CONT.xlsx',data_only=True)
for ws in wb:
  print('== LSMD sheet',ws.title,ws.max_row)
  for r in list(ws.iter_rows(values_only=True))[:15]:
    if any(r): print([c for c in r if c is not None])
