s=open('build.py',encoding='utf-8').read()
def rep(a,b):
    global s; assert a in s, a; s=s.replace(a,b,1)
rep("            ents.append(dict(", "            if g.length < 150: continue  # boundary slivers of neighbouring-region rivers\n            ents.append(dict(")
rep("""        if attrs and attrs.get('하천구분명') in ('국가하천', '지방하천', '소하천') and grade not in ('국가하천', '지방하천', '소하천'):
            grade = attrs['하천구분명']""","""        gradeMap = grade
        if attrs and attrs.get('하천구분명') in ('국가하천', '지방하천', '소하천') and RANK[attrs['하천구분명']] < RANK[grade]:
            grade = attrs['하천구분명']  # 표준데이터(관리청, 2025~26) is newer than 국가기본도 (2024)""")
rep("""        label = e['name'] if namecount[e['name']] == 1 else f"{e['name']} ({sig[0] if sig else ''})\"""",
"""        label = e['name'] if namecount[e['name']] == 1 else f"{e['name']} ({sig[0] if sig else ''})"
        if label in used_labels: label = f"{label[:-1]}, {sum(1 for l in used_labels if l.startswith(label[:-1]))+1})" if label.endswith(')') else f"{label} ({len(used_labels)})"
        used_labels.add(label)""")
rep("    namecount = collections.Counter(e['name'] for e in ents)", "    namecount = collections.Counter(e['name'] for e in ents)\n    used_labels = set()")
rep("'grade': grade, 'region': rid, 'regionName': rname,\n                 'sigungu'", "'grade': grade, 'gradeMap': gradeMap, 'region': rid, 'regionName': rname,\n                 'sigungu'")
rep("        if g.is_empty or g.area < 50: continue","        if g.is_empty or g.area < 50: continue\n        if g.area < 2000 and not any(river_lines[ids[j]][2] == rid for j in ltree.query(g.buffer(30))): continue")
rep("    return max(7, min(14, int(math.log2(900 * 360 / (256 * w)))))","    return max(7, min(14, int(math.log2(700 * 360 / (256 * w)))))")
open('build.py','w',encoding='utf-8').write(s)
