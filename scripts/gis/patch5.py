s=open('build.py',encoding='utf-8').read()
a="                        p = part.interpolate(d); pts.append(p); lab.append(k)"
b="""                        p = part.interpolate(d); key = (round(p.x, 1), round(p.y, 1))
                        if key in seenp: continue
                        seenp.add(key); pts.append(p); lab.append(k)"""
assert a in s; s=s.replace(a,b)
s=s.replace("            pts, lab = [], []","            pts, lab, seenp = [], [], set()")
open('build.py','w',encoding='utf-8').write(s)
