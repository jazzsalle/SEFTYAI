# -*- coding: utf-8 -*-
import json, collections, datetime as dt, math, re, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from catalog import EVENTS, REGIONS, VERIFY
from content119 import R as R119
from current import CURRENT
from pyproj import Transformer

SCR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_work")
OUT = r"D:/VIBECODING/SafetyAI/data/seed"
os.makedirs(OUT, exist_ok=True)
J = lambda n: json.load(open(os.path.join(SCR, n), encoding="utf-8"))
LEDGER, PRIV, FLOOD, TRACE, OCCR = J("ledger3.json"), J("priv3.json"), J("flood3.json"), J("trace3.json"), J("occr.json")
TR = Transformer.from_crs("EPSG:5179", "EPSG:4326", always_xy=True)

SRC = {
 "ledger": "seed_data/09. 주관기관 데이터 수신/9. ★재해대장_피해위치_복구비_260709/20260708_2010~2025재해대장보고서_New.xlsx",
 "public": "seed_data/09. 주관기관 데이터 수신/16. ★상습침수지역 및 피해데이터(재난영향분석과 자료)_260811/수신 데이터/★침수 피해 데이터(2차)/(복구 확정) 2011~2025 자연재난 공공시설 피해내역_침수 한정(4,019개).xlsx",
 "private": "seed_data/09. …/16. …/★침수 피해 데이터(2차)/(복구 확정) 2016~2025 자연재난 사유시설 피해내역(1,466,559개).xlsx",
 "insHouse": "seed_data/09. …/16. …/★침수 피해 데이터(2차)/주택_2016~2025년_풍수해보험금지급내역_침수 한정(4,433개).xlsx",
 "insSme": "seed_data/09. …/16. …/★침수 피해 데이터(2차)/소상공인_2017~2025년_풍수해보험금지급내역_침수 한정(2,553개).xlsx",
 "trace": "seed_data/09. …/16. …/★Raw data(공공시설 오류)/침수흔적도(위선)_조인현황.xlsx",
 "occr": "seed_data/09. …/27. 재난이벤트 내용(재난안전데이터과)/1.재난관리시스템/TDR_SDR_OCCR_NATURE.xlsx",
 "codes": "seed_data/09. …/27. …/1.재난관리시스템/02.재난코드 정보.xlsx",
 "fire": "seed_data/09. …/30. ★소방 신고정보(260929)/소방긴급구조정보(표준).xls",
 "ijReports": "seed_data/07. 사업수행/3. 지자체 요구사항 수렴/(취합) 지자체 의견수렴서 수신/풍수해 매뉴얼 및 상황일지 양식/(인제) NDMS 상황보고서 자료/*.hwp",
 "ycNdms": "seed_data/07. …/풍수해 매뉴얼 및 상황일지 양식/(영천)대처상황 NDMS 입력 사항.xlsx",
}

CODES = {"1001": "호우", "1002": "대설", "1003": "풍랑,강풍", "1004": "강풍", "1005": "태풍", "1008": "태풍ㆍ호우", "1015": "산사태", "1016": "홍수", "1041": "풍수해", "1099": "기타"}
ALIAS = {"1001": "RAIN", "1005": "TYPH", "1008": "TYRN", "1015": "LSLD", "1016": "FLOD", "1099": "ETC"}

def num(x):
    try: return float(str(x).replace(",", ""))
    except: return 0.0

def d8(s):
    s = re.sub(r"[^0-9]", "", str(s or ""))[:8]
    return dt.date(int(s[:4]), int(s[4:6]), int(s[6:8])) if len(s) == 8 else None

def in_reg(reg, text):
    t = str(text or "")
    return (reg == "BS" and t.startswith("부산")) or (reg == "YC" and "영천시" in t) or (reg == "IJ" and "인제군" in t)

def ledger_reg(reg, d):
    loc = re.sub(r"\s+", " ", str(d["loc"] or "")).strip()
    if reg == "BS": return str(d["sido"] or "").startswith("부산") or (not str(d["sido"] or "").strip("( )미기재") and loc.startswith("부산"))
    return str(d["sigungu"] or "") == REGIONS[reg]["sigungu"] or (REGIONS[reg]["sigungu"] in loc and not str(d["sigungu"] or "").strip())

TRACE_PREFIX = {"BS": ("26",), "YC": ("47230",), "IJ": ("51810", "42810")}
EMD_IJ = {"5181025": "인제읍", "5181031": "남면", "5181032": "북면", "5181033": "기린면", "5181034": "서화면", "5181035": "상남면"}

# ---------------- aggregations ----------------
def agg_ledger(reg, names):
    rows = [d for d in LEDGER if d["name"] in names and ledger_reg(reg, d)]
    if not rows: return None, []
    dmg = sum(num(d["dmgCtr"]) or num(d["dmgSgg"]) for d in rows)
    rec = sum(num(d["recCtr"]) or num(d["recSgg"]) for d in rows)
    byF = collections.Counter(d["fclty"] for d in rows)
    def area(d):
        tk = re.sub(r"\s+", " ", str(d["loc"] or "")).split()
        if reg == "BS": return d["sigungu"] or (tk[1] if len(tk) > 1 else "?")
        return d["dong"] or emd_of(reg, d["loc"])
    for d in rows: d["dong"] = d["dong"] or (emd_of(reg, d["loc"]) if reg != "BS" else (re.sub(r"\s+", " ", str(d["loc"] or "")).split() + ["", "", ""])[2])
    byA = collections.Counter(area(d) for d in rows)
    rtype = collections.Counter(d["recType"] for d in rows if d["recType"])
    top = sorted(rows, key=lambda d: -(num(d["dmgCtr"]) or num(d["dmgSgg"])))[:6]
    return {
        "source": "재해대장(2010~2025) — 공공시설 피해·복구 확정",
        "ledgerDisasterNames": names,
        "facilityCount": len(rows),
        "damage_krw_thousand": round(dmg), "recovery_krw_thousand": round(rec),
        "byFacilityType": dict(byF.most_common(8)),
        ("bySigungu" if reg == "BS" else "byEmd"): dict(byA.most_common(8)),
        "recoveryTypes": dict(rtype),
        "topFacilities": [{"facility": d["fname"], "type": d["fclty"], "emd": d["dong"], "location": re.sub(r"\s+", " ", str(d["loc"] or "")).strip(),
                           "ministry": d["ministry"], "damage_krw_thousand": round(num(d["dmgCtr"]) or num(d["dmgSgg"])),
                           "recovery_krw_thousand": round(num(d["recCtr"]) or num(d["recSgg"])), "recoveryType": d["recType"], "stage": d["recStage"]} for d in top],
    }, rows

def agg_public(reg, names):
    rows = [d for d in FLOOD["public"] if d["재난명"] in names and {"부산": "BS", "영천": "YC", "인제": "IJ"}[d["_reg"]] == reg]
    return [{"date": str(d["피해일시"]), "address": re.sub(r"\s+", " ", str(d["피해상세주소"] or "")).strip(), "facilityType": d["시설구분명"],
             "ministry": d["소관부처명"], "damageCause": d["피해요인"], "summary": re.sub(r"\s+", " ", str(d["피해개요"] or "")).strip(),
             "damage_krw_thousand": num(d["피해금액(천원)"]) if str(d["피해금액(천원)"]).replace(".", "").isdigit() else None,
             "source": "공공시설 피해내역(침수 한정)"} for d in rows]

def emd_of(reg, loc):
    tk = str(loc).split()
    if reg == "BS": return tk[1] if len(tk) > 1 else "?"
    for t in tk[2:4]:
        if re.search(r"(읍|면|동)$", t): return t
    return tk[2] if len(tk) > 2 else "?"

def agg_private(reg, names):
    rows = [d for d in PRIV if d["재난명"] in names and in_reg(reg, d["피해위치"])]
    if not rows: return None
    house = [d for d in rows if d["피해종류②"] == "주택"]
    flooded = [d for d in house if "침수" in str(d["피해종류④"]) + str(d["피해요인"])]
    return {
        "source": "사유시설 피해내역(복구 확정, 2016~2025) — 세대 단위 원자료를 읍면동/구 단위로 집계(개인 주소 비공개)",
        "disasterNames": names, "recordCount": len(rows),
        "byCategory": dict(collections.Counter(d["피해종류②"] for d in rows).most_common(8)),
        "housing": {"total": len(house), "flooded": len(flooded),
                    "byDamage": dict(collections.Counter(str(d["피해종류④"] or d["피해구분"]) for d in house).most_common(6)),
                    "byCause": dict(collections.Counter(str(d["피해요인"]) for d in house if d["피해요인"]).most_common(6)),
                    ("bySigungu" if reg == "BS" else "byEmd"): dict(collections.Counter(emd_of(reg, d["피해위치"]) for d in flooded).most_common(8))},
        "confirmedDamage_krw_thousand": round(sum(num(d["확정피해금액"]) for d in rows)),
    }

def agg_ins(reg, start, end):
    res = {}
    for key, label in (("house", "주택 풍수해보험(침수 한정)"), ("sme", "소상공인 풍수해보험(침수 한정)")):
        rows = [d for d in FLOOD[key] if {"부산": "BS", "영천": "YC", "인제": "IJ"}[d["_reg"]] == reg and d8(d["사고일자"]) and start <= d8(d["사고일자"]) <= end]
        if rows:
            res[key] = {"source": label, "claims": len(rows), "paid_krw": round(sum(num(d["지급보험금"]) for d in rows)),
                        "byDate": dict(sorted(collections.Counter(str(d["사고일자"])[:8] for d in rows).items())),
                        "bySigungu": dict(collections.Counter(str(d["지역시군구"]) for d in rows).most_common(6)),
                        "byLossType": dict(collections.Counter(str(d["손해구분"]) for d in rows).most_common(4))}
    return res or None

def norm_depth(v):
    v = num(v)
    return round(v / 100, 3) if v > 10 else round(v, 3)

def agg_trace(reg, start, end):
    rows = []
    for d in TRACE:
        a = str(d["ADM_CD"] or "")
        if not a.startswith(TRACE_PREFIX[reg]): continue
        b = d8(d["F_BEGIN_DE"])
        if b and start <= b <= end: rows.append(d)
    if not rows: return None
    recs = []
    for d in rows:
        cx = (num(d["xmin"]) + num(d["xmax"])) / 2; cy = (num(d["ymin"]) + num(d["ymax"])) / 2
        lon, lat = TR.transform(cx, cy)
        a = str(d["ADM_CD"])
        recs.append({"traceId": f"FT-{d['ID']}", "admCode": a, "emd": EMD_IJ.get(a[:7]) if reg == "IJ" else None,
                     "disasterName": d["F_DSSTR_NM"], "begin": f"{d8(d['F_BEGIN_DE'])} {str(d['F_BEGIN_HM'] or '')[:2]}시", "end": f"{d8(d['F_END_DE'])} {str(d['F_END_HM'] or '')[:2]}시",
                     "district": d["F_DSTRC_NM"], "cause": d["F_CDTL_NM"], "avgDepth_raw": d["AVG_FLDWTL"], "avgDepth_m": norm_depth(d["AVG_FLDWTL"]),
                     "area_m2": round(num(d["FLUD_AR"]), 1), "centroid": {"lat": round(lat, 5), "lon": round(lon, 5)}})
    recs.sort(key=lambda r: -r["area_m2"])
    return {"source": "침수흔적도(위선) 조인현황 — 재난영향분석과(EPSG:5179 → WGS84 중심점 변환)", "count": len(recs),
            "totalArea_m2": round(sum(r["area_m2"] for r in recs)), "maxDepth_m": max(r["avgDepth_m"] for r in recs),
            "districts": sorted({r["district"] for r in recs if r["district"]})[:15],
            "causes": dict(collections.Counter(r["cause"] for r in recs if r["cause"]).most_common(5)),
            "records": recs[:12], "depthNote": "AVG_FLDWTL 원자료 단위 혼재(m·cm) — 10 초과값은 cm로 보아 m 환산"}

# ---------------- 119 ----------------
SEQ = collections.Counter()
FIRE_CODE = {"BS": ("부산소방본부", "26"), "YC": ("경북소방본부", "47"), "IJ": ("강원소방본부", "51")}
def build_119():
    out = []
    for i, t in enumerate(R119):
        (eid, reg, recv, endt, area, detail, lat, lon, t1, t2, acc, nres, ctrl, result, summ, grounded) = t
        org, pfx = FIRE_CODE[reg]
        SEQ[eid] += 1
        sgg = area.split()[1] if reg == "BS" else REGIONS[reg]["sigungu"]
        recvd = dt.datetime.strptime(recv, "%Y-%m-%d %H:%M:%S")
        prog = recvd + dt.timedelta(minutes=12 + (i * 7) % 25)
        out.append({
            "reportId": f"R119-{eid}-{SEQ[eid]:03d}",
            "eventId": eid, "regionRecordId": f"{eid}-{REGIONS[reg]['admCode']}",
            # --- 소방긴급구조정보(표준) 원 스키마 필드 ---
            "신고일시": recv, "상황종료일시": endt or "--", "기관코드": org, "신고지역명": area,
            "신고내용": "-", "긴급구조위치1": "-",
            "긴급구조유형1명칭": t1, "긴급구조유형2명칭": t2, "긴급구조유형3명칭": "1차출동" if nres < 5 else "2차출동",
            "상세내역": "", "원인명": "호우" if eid.startswith(("1001", "1008")) else ("태풍" if eid.startswith("1005") else "기타"),
            "재난규모코드": "0050001" if nres < 5 else "0050002", "재난규모": "1차출동" if nres < 5 else "2차출동",
            "진행상황구분코드": "0", "진행상황코드": "0", "관제상황구분": ctrl,
            "진행일시": prog.strftime("%Y-%m-%d %H:%M:%S"), "번호": f"1W{pfx}{(sum(map(ord, eid)) % 90 + 10):02d}{SEQ[eid]:06d}"[:12],
            "DT_REGT": prog.strftime("%Y-%m-%d %H:%M:%S"),
            # --- 서비스 가공 확장 필드 ---
            "ext": {"accidentType": acc, "locationDetail": detail, "coord": {"lat": lat, "lon": lon, "crs": "WGS84", "precision": "동·시설 단위 근사"},
                    "rescueeCount": nres, "dispatchUnit": f"{sgg} 관할 119안전센터·구조대", "result": result,
                    "callSummary": summ, "isFloodRelated": True, "groundedOn": grounded},
            "synthetic": True,
            "privacy": "원천 '신고내용'은 개인정보로 '-' 마스킹되어 유통됨 — callSummary는 풍수해 필터링·요약 가공 결과를 가정한 시연값",
        })
    return out

# ---------------- similarity ----------------
TYPE_SIM = {frozenset(["1001", "1008"]): 0.7, frozenset(["1005", "1008"]): 0.7, frozenset(["1001", "1005"]): 0.5, frozenset(["1001", "1016"]): 0.8, frozenset(["1001", "1015"]): 0.6, frozenset(["1005", "1015"]): 0.4}
def tsim(a, b):
    return 1.0 if a == b else TYPE_SIM.get(frozenset([a, b]), 0.0)
def rsim(a, b):
    if not a or not b: return None
    return max(0.0, 1 - abs(math.log(a / b)) / math.log(3))
def season(m):
    return "장마" if m in (6, 7) else "태풍·늦여름" if m in (8, 9, 10) else "기타"
def month_sim(m1, m2):
    d = min(abs(m1 - m2), 12 - abs(m1 - m2))
    return max(0.0, 1 - d / 3)

W = {"type": 20, "rain": 30, "region": 20, "season": 10, "damage": 20}
def similarity(cur, cand, reg):
    cr = next((r for r in cand["regions"] if r["_reg"] == reg), None)
    parts = {}
    parts["type"] = (tsim(cur["typeCode"], cand["typeCode"]), f"{cur['typeName']} ↔ {cand['typeName']}")
    cw, kw = cur["weather"], cand["weather"]
    hs, ts = rsim(cw.get("maxHourlyRain_mm"), kw.get("maxHourlyRain_mm")), rsim(cw.get("totalRain_mm"), kw.get("totalRain_mm"))
    vals = [v for v in (hs, ts) if v is not None]
    parts["rain"] = (sum(vals) / len(vals) if vals else None,
                     f"시간최대 {cw.get('maxHourlyRain_mm') or '미상'}↔{kw.get('maxHourlyRain_mm') or '미상'}mm, 누적 {cw.get('totalRain_mm') or '미상'}↔{kw.get('totalRain_mm') or '미상'}mm" if vals else "과거 사건 강우자료 없음 → 강우점수 0.4(중립 이하) 고정, 신뢰도 하향")
    if cr: parts["region"] = (1.0, f"같은 지역({REGIONS[reg]['sido'] if reg == 'BS' else REGIONS[reg]['sigungu']})")
    else:
        same_terrain = any(REGIONS[r["_reg"]]["terrain"].split("·")[0] == REGIONS[reg]["terrain"].split("·")[0] for r in cand["regions"])
        parts["region"] = (0.4 if same_terrain else 0.0, "유사 지형" if same_terrain else "다른 지역·지형")
    m1, m2 = int(cur["startDate"][5:7]), int(cand["startDate"][5:7])
    parts["season"] = (month_sim(m1, m2), f"{m1}월({season(m1)}) ↔ {m2}월({season(m2)})")
    ct = set(next(r for r in cur["regions"] if r["_reg"] == reg)["damageTags"])
    kt = set(cr["damageTags"]) if cr else set().union(*[set(r["damageTags"]) for r in cand["regions"]])
    jac = len(ct & kt) / len(ct | kt) if ct | kt else 0
    parts["damage"] = (jac, "공통 피해유형: " + (", ".join(sorted(ct & kt)) or "없음"))
    br, total = [], 0
    for k, (v, why) in parts.items():
        w = W[k]
        pts = round((0.4 if v is None else v) * w, 1)
        total += pts
        br.append({"factor": {"type": "재난유형", "rain": "강우량", "region": "지역", "season": "계절", "damage": "피해유형"}[k], "weight": w, "score": pts, "basis": why})
    conf = "높음" if parts["rain"][0] is not None else "보통(강우 미확보 → 강우항목 0.4 고정)"
    return round(total, 1), br, conf

# ---------------- main ----------------
def main():
    events, regionIndex = [], {}
    r119 = build_119()
    by_ev_reg = collections.defaultdict(list)
    for r in r119: by_ev_reg[(r["eventId"], r["regionRecordId"])].append(r["reportId"])
    for e in EVENTS:
        eid = f"{e['type']}-{e['date']}-{e['seq']:02d}"
        start = dt.date.fromisoformat(e["start"]); end = dt.date.fromisoformat(e["end"]) if e.get("end") else dt.date(2026, 10, 3)
        synth = e.get("synthetic", False); training = e.get("training", False)
        cur = CURRENT.get(eid)
        weather = cur["weather"] if cur else e.get("weather") or {"advisories": [], "maxHourlyRain_mm": None, "totalRain_mm": None, "station": None,
                                                                    "rainfallSource": "강우자료 미확보 — 기상청 ASOS/AWS 연계 필요"}
        if cur:  # derive totals from series
            for rk, w in weather["byRegion"].items():
                w["totalRain_mm"] = round(sum(x["mm"] for x in w["hourly"]), 1)
                mx = max(w["hourly"], key=lambda x: x["mm"]); w["maxHourlyRain_mm"] = mx["mm"]
                t = dt.datetime.fromisoformat(mx["t"]); w["maxHourlyAt"] = f"{t:%Y-%m-%dT%H:%M}~{t + dt.timedelta(hours=1):%H:%M}"
            first = list(weather["byRegion"].values())[0]
            weather["maxHourlyRain_mm"], weather["totalRain_mm"] = first["maxHourlyRain_mm"], first["totalRain_mm"]
        regions = []
        for rk, rc in e["regions"].items():
            rid = f"{eid}-{REGIONS[rk]['admCode']}"
            led, _ = agg_ledger(rk, rc.get("ledger", []))
            pub = agg_public(rk, rc.get("pub", []))
            priv = agg_private(rk, rc.get("priv", []))
            pad = dt.timedelta(days=1)
            ins = agg_ins(rk, start - pad, end + pad) if not synth and not training else None
            trs, tre = (dt.date.fromisoformat(rc["traceRange"][0]), dt.date.fromisoformat(rc["traceRange"][1])) if rc.get("traceRange") else (start - pad, end + pad)
            tr = agg_trace(rk, trs, tre) if not synth and not training else None
            human = None
            for f in rc.get("facts", []):
                m = re.search(r"(\d+)명 사망", f["fact"])
                if m: human = {"dead": int(m.group(1)), "missing": None, "injured": None, "source": VERIFY}
            actions = []
            if cur: actions = [{"time": t, "action": a, "source": "synthetic"} for t, a in cur["actions"].get(rk, [])]
            rec = {"cost_krw": led["recovery_krw_thousand"] * 1000 if led else None, "damage_krw": led["damage_krw_thousand"] * 1000 if led else None,
                   "recovery_krw_thousand": led["recovery_krw_thousand"] if led else None, "recoveryTypes": led["recoveryTypes"] if led else None,
                   "source": "재해대장 중앙확정 기준(없으면 시군구 값)" if led else None}
            # region summary text
            bits = []
            if led: bits.append(f"재해대장 공공시설 {led['facilityCount']}건, 피해 {led['damage_krw_thousand']/1e5:.1f}억원·복구비 {led['recovery_krw_thousand']/1e5:.1f}억원")
            if priv: bits.append(f"사유시설 {priv['recordCount']}건(주택 침수 {priv['housing']['flooded']}동)")
            if tr: bits.append(f"침수흔적 {tr['count']}개소(면적 {tr['totalArea_m2']:,}㎡)")
            if pub: bits.append(f"공공시설 침수피해 {len(pub)}건")
            n119 = len(by_ev_reg.get((eid, rid), []))
            if cur and n119: bits.append(f"119 신고 {n119}건 접수(진행중)")
            if ins: bits.append("풍수해보험 침수 지급 " + ", ".join(f"{('주택' if k=='house' else '소상공인')} {v['claims']}건" for k, v in ins.items()))
            regions.append({
                "regionRecordId": rid, "_reg": rk, "sido": REGIONS[rk]["sido"], "sigungu": REGIONS[rk]["sigungu"], "admCode": REGIONS[rk]["admCode"],
                "terrain": REGIONS[rk]["terrain"], "period": {"start": e["start"], "end": e.get("end")},
                "crisisLevel": cur["crisisLevel"].get(rk) if cur else None,
                "weatherLocal": weather.get("byRegion", {}).get(rk) if cur else None,
                "summary": " / ".join(bits) if bits else None,
                "damageTags": rc.get("tags", []),
                "damages": {"publicFacilityLedger": led, "publicFloodItems": ({"count": len(pub), "items": sorted(pub, key=lambda x: -(x["damage_krw_thousand"] or 0))[:15]} if pub else None), "privateFacility": priv, "insurance": ins, "human": human},
                "recovery": rec, "floodTraces": tr,
                "reports119": by_ev_reg.get((eid, rid), []), "situationReports": [],
                "actions": actions, "facts": rc.get("facts", []), "note": rc.get("note"),
            })
        ndms = e.get("ndms")
        ev = {
            "eventId": eid, "aliasId": f"{ALIAS.get(e['type'], 'ETC')}-{e['date']}-{e['seq']:02d}",
            "typeCode": e["type"], "typeName": CODES[e["type"]], "startDate": e["start"], "endDate": e.get("end"),
            "status": e.get("status", "종료"), "title": e["title"], "summary": None,
            "registerType": "9:훈련재난" if training else ("우심재난" if ndms and ndms[4] == "우심" else "실재난"),
            "ndmsKey": {"DSTR_YEAR": ndms[0], "DSTR_TY_CD": ndms[1], "DSTR_SN": ndms[2], "DSTR_NM": ndms[3], "RM": ndms[4]} if ndms else None,
            "weather": weather, "regions": regions, "facts": e.get("facts", []), "note": e.get("note"),
            "synthetic": synth, "training": training,
        }
        events.append(ev)
    # situation reports
    from reports import build_reports
    srs = build_reports(events, r119)
    for s in srs:
        for e in events:
            for r in e["regions"]:
                if r["regionRecordId"] == s["regionRecordId"]: r["situationReports"].append(s["reportId"])
    # summaries, totals, sources
    for e in events:
        T = collections.Counter()
        for r in e["regions"]:
            L = r["damages"]["publicFacilityLedger"]; P = r["damages"]["privateFacility"]
            if L: T["ledgerFacilities"] += L["facilityCount"]; T["damage_krw_thousand"] += L["damage_krw_thousand"]; T["recovery_krw_thousand"] += L["recovery_krw_thousand"]
            if P: T["privateRecords"] += P["recordCount"]; T["housingFlooded"] += P["housing"]["flooded"]
            if r["floodTraces"]: T["floodTraces"] += r["floodTraces"]["count"]
            if r["damages"]["publicFloodItems"]: T["publicFloodItems"] += r["damages"]["publicFloodItems"]["count"]
            T["reports119"] += len(r["reports119"]); T["situationReports"] += len(r["situationReports"])
            if r["damages"]["human"] and r["damages"]["human"].get("dead"): T["dead"] += r["damages"]["human"]["dead"]
        e["totals"] = dict(T)
        pl = set()
        for r in e["regions"]:
            d = r["damages"]
            if d["publicFacilityLedger"]: pl |= set((d["publicFacilityLedger"].get("bySigungu") or d["publicFacilityLedger"].get("byEmd") or {}).keys())
            if d["privateFacility"]: pl |= set((d["privateFacility"]["housing"].get("bySigungu") or d["privateFacility"]["housing"].get("byEmd") or {}).keys())
            if r["floodTraces"]: pl |= {x for x in r["floodTraces"]["districts"]} | {x["emd"] for x in r["floodTraces"]["records"] if x["emd"]}
            if d["publicFloodItems"]: pl |= {x["address"].split()[1] + " " + x["address"].split()[2] for x in d["publicFloodItems"]["items"] if len(x["address"].split()) > 2}
        for x in r119:
            if x["eventId"] == e["eventId"]: pl.add(" ".join(x["신고지역명"].split()[1:3]))
        e["places"] = sorted(p for p in pl if p and p != "?")
        w = e["weather"]
        rain = f"시간최대 {w['maxHourlyRain_mm']}mm" if w.get("maxHourlyRain_mm") else "강우자료 미확보"
        regs = ", ".join(f"{r['sigungu']}({r['summary'] or '피해기록 없음'})" for r in e["regions"])
        e["summary"] = f"{e['title']} — {e['startDate']}~{e['endDate'] or '진행중'}, {rain}. {regs}"
        srcs = set()
        for r in e["regions"]:
            d = r["damages"]
            if d["publicFacilityLedger"]: srcs.add("ledger")
            if d["publicFloodItems"]: srcs.add("public")
            if d["privateFacility"]: srcs.add("private")
            if d["insurance"]: srcs.add("insHouse")
            if r["floodTraces"]: srcs.add("trace")
            if r["reports119"]: srcs.add("fire")
        if e["ndmsKey"]: srcs.add("occr")
        e["sources"] = [{"key": k, "path": SRC[k], "kind": "REAL" if k != "fire" else "SCHEMA(REAL)·VALUES(SYNTHETIC)"} for k in sorted(srcs)]
        e["dataQuality"] = {"realData": not e["synthetic"], "rainfallVerified": False,
                            "synthetic_parts": (["전체"] if e["synthetic"] else []) + (["119 신고 레코드"] if e["totals"].get("reports119") else []) +
                                               (["상황보고(일부)"] if any(s["eventId"] == e["eventId"] and s["synthetic"] for s in srs) else [])}
    # similarity for current events
    hist = [e for e in events if not e["synthetic"] and not e["training"] and e["typeCode"] != "1099"]
    for e in events:
        if not e["synthetic"]: continue
        e["similarCases"] = {}
        for r in e["regions"]:
            sc = []
            for h in hist:
                s, br, conf = similarity(e, h, r["_reg"])
                sc.append({"eventId": h["eventId"], "title": h["title"], "score": s, "confidence": conf, "breakdown": br})
            sc.sort(key=lambda x: -x["score"])
            e["similarCases"][r["regionRecordId"]] = sc[:5]
    for e in events:
        for r in e["regions"]: r.pop("_reg", None)
    meta = {"_meta": {"schema": "disaster-master-event v1.0", "generated": "2026-10-03", "author": "UNE",
                      "idRule": "{재난유형코드(02.재난코드 정보)}-{발생일 YYYYMMDD}-{같은날·같은유형 순번 2자리(3자리 확장)}; 90~99=훈련재난",
                      "regionRecordRule": "{eventId}-{시군구 행정코드 5자리}",
                      "units": {"krw_thousand": "천원(재해대장 원자료 단위)", "rain": "mm", "depth": "m"},
                      "counts": {"events": len(events), "real": sum(1 for e in events if not e["synthetic"] and not e["training"]), "synthetic": sum(1 for e in events if e["synthetic"]), "training": sum(1 for e in events if e["training"])},
                      "caution": "weather.rainfallSource가 '공개자료 기반 추정(검증필요)'인 수치는 기상청 ASOS/AWS로 검증 전 인용 금지. synthetic=true 레코드는 시연용."},
            "events": events}
    json.dump(meta, open(os.path.join(OUT, "events.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump({"_meta": {"schema": "소방긴급구조정보(표준) + ext 확장", "sourceSchema": SRC["fire"], "count": len(r119), "synthetic": True,
                         "fieldNote": "한글 키 = 원천 표준 컬럼명 그대로(21개), ext = 서비스 가공 필드(사고유형·좌표·요구조자수·처리결과·요약·근거)",
                         "observedValueDomains": {"긴급구조유형1명칭": ["구조", "화재", "구급", "기타"], "관제상황구분": ["출동지령", "출동중", "출동보고", "현장도착", "현장도착보고", "구조완료", "병원도착보고", "귀소보고", "귀소완료보고", "상황종료", "추가출동지령", "완전진화"],
                                                  "재난규모코드": {"0050001": "1차출동", "0050002": "2차출동"}, "번호": "1W + 10자리(앞 2자리 시도코드 추정)"},
                         "assumedFloodCategories": "긴급구조유형2명칭 중 '자연재해·수난사고·배수지원·기타안전사고·교통사고'를 풍수해 후보로 가정(실제 코드값은 소방청 수신 후 확정)"},
               "reports": r119}, open(os.path.join(OUT, "reports_119.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump({"_meta": {"schema": "재난상황보고(재난안전법 시행규칙 별지 제1호서식) + NDMS 지자체 대처상황", "count": len(srs),
                         "real": sum(1 for s in srs if not s["synthetic"]), "synthetic": sum(1 for s in srs if s["synthetic"]),
                         "privacy": "원문 보고서의 성명·휴대전화는 ○○○/010-****-****로 마스킹"},
               "reports": srs}, open(os.path.join(OUT, "situation_reports.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("events", len(events), "119", len(r119), "SR", len(srs))
    for e in events: print(e["eventId"], e["totals"])

if __name__ == "__main__":
    main()
