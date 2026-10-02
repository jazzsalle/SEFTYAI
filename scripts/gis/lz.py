import zipfile,glob,sys
B='D:/VIBECODING/SafetyAI/seed_data/하천 공간정보/'
for z in glob.glob(B+'국가기본도*/*.zip')+glob.glob(B+'소하천*/*5174_[부경강]*.zip'):
  zf=zipfile.ZipFile(z); names=zf.infolist(); print(z,len(names))
  for i in names[:int(sys.argv[1])]:
    n=i.filename
    if not (i.flag_bits & 0x800):
      try: n=n.encode('cp437').decode('cp949')
      except: pass
    print('  ',n,i.file_size)
