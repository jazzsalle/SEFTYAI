import olefile,zlib,struct,sys,glob,os
def hwp_text(path):
  f=olefile.OleFileIO(path)
  hdr=f.openstream('FileHeader').read(); comp=hdr[36]&1
  out=[]
  secs=sorted([s for s in f.listdir() if s[0]=='BodyText'],key=lambda s:int(s[1][7:]))
  for s in secs:
    d=f.openstream(s).read()
    if comp: d=zlib.decompress(d,-15)
    i=0
    while i<len(d):
      h=struct.unpack_from('<I',d,i)[0]; tag=h&0x3ff; size=(h>>20)&0xfff; i+=4
      if size==0xfff: size=struct.unpack_from('<I',d,i)[0]; i+=4
      if tag==67:
        b=d[i:i+size]; t=''; j=0
        while j<len(b):
          c=struct.unpack_from('<H',b,j)[0]
          if c in (1,2,3,4,5,6,7,8,9,10,11,12,14,15,16,17,18,19,20,21,22,23):
            if c in (10,13): t+='\n'
            elif c==9: t+='\t'
            j+=16 if c not in (10,13) else 2; continue
          if c==13: t+='\n'
          else: t+=chr(c)
          j+=2
        out.append(t.strip())
      i+=size
  return '\n'.join(x for x in out if x)
os.makedirs(sys.argv[2],exist_ok=True)
for p in glob.glob(sys.argv[1]+'/*.hwp'):
  try:
    t=hwp_text(p)
  except Exception as e: t='ERR '+repr(e)
  n=os.path.basename(p)[:-4]
  open(os.path.join(sys.argv[2],n+'.txt'),'w',encoding='utf-8').write(t)
  print(n,len(t))
