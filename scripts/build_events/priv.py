from common import *
import json,time,re
f=find("16.*/*/★침수 피해 데이터(2차)/*/(복구 확정) 2016*.xlsx")
t=time.time()
wb=openpyxl.load_workbook(f,read_only=True,data_only=True)
print([ (w.title,w.max_row) for w in wb.worksheets],flush=True)
out=open('priv_region.jsonl','w',encoding='utf-8')
pat=re.compile(r'부산|영천시|인제군')
n=k=0; hdr=None
import itertools
for r in itertools.chain(*[w.iter_rows(values_only=True) for w in wb.worksheets]):
    n+=1
    if n<=3: print(r, flush=True)
    if hdr is None and r and r[0]=='재난년도': hdr=r; out.write(json.dumps({'_hdr':[str(x) for x in r]},ensure_ascii=False)+'\n'); continue
    s=' '.join(str(v) for v in r[:12] if v is not None)
    if pat.search(s):
        k+=1; out.write(json.dumps([None if v is None else str(v) for v in r],ensure_ascii=False)+'\n')
    if n%200000==0: print(n,k,round(time.time()-t),flush=True)
print('done',n,k,round(time.time()-t))
