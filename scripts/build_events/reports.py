# -*- coding: utf-8 -*-
"""상황보고 레코드: 인제군 NDMS 실제 보고서(마스킹) + 템플릿 기반 synthetic(초기/중간/최종/상황전파)."""
import collections

FORM = "재난 및 안전관리 기본법 시행규칙 [별지 제1호서식] 재난상황 보고서"
SRCDIR = "seed_data/07. 사업수행/3. 지자체 요구사항 수렴/(취합) 지자체 의견수렴서 수신/풍수해 매뉴얼 및 상황일지 양식/(인제) NDMS 상황보고서 자료/"
YC_TEMPLATE = "seed_data/07. …/풍수해 매뉴얼 및 상황일지 양식/(영천)대처상황 NDMS 입력 사항.xlsx (14개 시트: 비상체계·사전조치·통제·인명/사유/공공피해·응급복구·인력장비)"

def base(rid, eid, rrid, kind, no, title, sub, recv, sender, receiver, occ, loc, overview, synthetic, src=None):
    return {"reportId": rid, "eventId": eid, "regionRecordId": rrid, "reportKind": kind, "reportNo": no, "form": FORM if kind != "상황전파" else "상황전파메시지(TSD_MSG 유사)",
            "title": title, "submittedAt": sub, "receivedAt": recv, "sender": sender, "receiver": receiver,
            "occurredAt": occ, "location": loc, "overview": overview,
            "damage": {"human": {"dead": 0, "missing": 0, "injured": 0}, "property": None, "other": None},
            "actions": [], "mobilization": None, "support": None, "outlook": None, "weatherAtReport": None,
            "ndmsCopingStatus": None, "linkedReports119": [], "synthetic": synthetic, "sourceType": "SYNTHETIC" if synthetic else "REAL_NDMS_REPORT",
            "sourceFile": src}

def real_reports():
    out = []
    # 1) 2023-07-13 국도31호선 낙석 (초기)
    r = base("SR-1001-20230627-01-51810-01", "1001-20230627-01", "1001-20230627-01-51810", "초기", "1보", "재난상황 보고서(국도 낙석발생)",
             "2023-07-13T14:50", "2023-07-13T14:18", "강원특별자치도 인제군 재난안전상황실 방재안전8급 ○○○", "강원특별자치도",
             "2023-07-13T14:18", {"address": "강원특별자치도 인제군 인제읍 고사리 478-3(국도31호선)", "lat": 38.0371, "lon": 128.2172},
             "인제읍 고사리 ~ 인제읍 방면 낙석 및 수목전도에 따른 통행불가", False, SRCDIR + "(초기상황보고서) 강원특별자치도 인제군 재난상황보고서.hwp")
    r["damage"]["other"] = "인명피해 해당 없음"
    r["actions"] = [{"time": "2023-07-13T14:18", "action": "홍천국토관리사무소·인제군·인제소방서·인제경찰서 현장 출동"},
                    {"time": "2023-07-13T14:50", "action": "1차선 복구완료"},
                    {"time": None, "action": "홍천국토관리사무소 응급복구팀 현장 조치 중, 복구 완료 시까지 현장 통제 인력 비치"},
                    {"time": None, "action": "상황전파: 재난안전통신망 단말기 활용 기관간 현황 공유 / 현장파견: 안전교통과 주무관 ○○○(010-****-****)"}]
    r["outlook"] = "복구 현황 및 추가 피해 발생 시 보고이행 확행"
    out.append(r)
    # 2) 2023-07-24 미시령옛길 낙석 (2보)
    r = base("SR-1001-20230627-01-51810-02", "1001-20230627-01", "1001-20230627-01-51810", "중간", "2보", "재난상황 보고서(낙석발생) (2보)",
             "2023-07-24T17:50", "2023-07-24T17:18", "강원특별자치도 인제군 재난안전상황실 방재안전8급 ○○○", "강원특별자치도",
             "2023-07-24T17:18", {"address": "강원특별자치도 인제군 북면 용대리 산 12-11(미시령옛길)", "lat": 38.2074, "lon": 128.3880},
             "북면 용대리 산 12-11(미시령옛길) 일원 도로 낙석발생(잔돌) — 인제군 급경사지붕괴위험지역 36지구 정비사업장", False,
             SRCDIR + "(초기상황보고서) 기상특보 대응 재난상황보고서(도로 낙석발생).hwp")
    r["damage"]["other"] = "인명대피 해당 없음"
    r["actions"] = [{"time": None, "action": "인제군 안전교통과·인제경찰서 현장 출동"},
                    {"time": None, "action": "36지구 급경사지 정비사업장 자체 복구"},
                    {"time": "2023-07-24T17:50", "action": "복구완료"},
                    {"time": None, "action": "재난안전통신망 단말기(강원인제재난상황실01)로 인제경찰서·인제군 현황 공유"}]
    out.append(r)
    # 3) 2023-10-08 미시령 정상부 낙석 (2보)
    r = base("SR-1099-20231008-01-51810-01", "1099-20231008-01", "1099-20231008-01-51810", "중간", "2보", "재난상황 보고서(국도31호선 낙석발생) 2보",
             "2023-10-08T10:02", "2023-10-08T09:54", "강원특별자치도 인제군 재난안전상황실 지방방재안전7급 ○○○", "강원특별자치도",
             "2023-10-08T09:54", {"address": "강원특별자치도 인제군 북면 용대리 산12-7 일원(군도3호선, 미시령정상부)", "lat": 38.2185, "lon": 128.4185},
             "오전 09시 54분경 북면 용대리 산12-7번지 일원 낙석 발생, 1차선 통행 가능. 기상특보 없음", False,
             SRCDIR + "(초기상황보고서) 인제군 기상특보 대응 재난상황보고서(국도31호선 낙석발생) 2보.hwp")
    r["damage"]["property"] = "낙석 발생(30ton 내외)"; r["damage"]["other"] = "인명피해 없음"
    r["weatherAtReport"] = {"advisories": "없음", "rain": "13mm 누적강수(미시령)"}
    r["actions"] = [{"time": None, "action": "응급복구 상황 안내 및 교통통제 — 마을방송시설, SMS, 유선전화, PS-LTE"},
                    {"time": None, "action": "현장파견: 안전교통과 방재 주무관 ○○○ 외 1명"},
                    {"time": None, "action": "장비 투입 6w 1대, 8w 1대, 15ton D/T 3대 — 응급복구 완료 1차선 통행"}]
    r["mobilization"] = {"personnel": {"공무원": 2}, "equipment": {"굴삭기(6w)": 1, "굴삭기(8w)": 1, "15톤 덤프": 3}}
    r["outlook"] = "안전사고 발생(우려) 시 긴급재난문자 발송 예정, 현장 상황관리관 및 경찰-郡-소방 PS-LTE 실시간 소통으로 2차 피해 방지"
    out.append(r)
    # 4) 2026-08-17 남북리 도로 침수 (종료)
    r = base("SR-1001-20260817-01-51810-01", "1001-20260817-01", "1001-20260817-01-51810", "최종", "즉시보고 제1호[종료]", "[종료] 강원 인제군 경찰 상황전파(도로 침수 관련)",
             "2026-08-17T23:02", "2026-08-17T21:09", "인제군 안전교통과 지방방재안전주사보 ○○○", "강원특별자치도",
             "2026-08-17T21:09", {"address": "강원특별자치도 인제군 인제읍 남북리 817 일원", "lat": 38.0688, "lon": 128.1702},
             "집중호우에 의한 일시적 도로 물고임", False, SRCDIR + "(공식 상황보고서)-(풍수해) 강원_인제군_도로 침수 관련 사항 보고[종료].hwp")
    r["damage"] = {"human": {"dead": 0, "missing": 0, "injured": 0}, "property": "해당 없음", "other": "해당 없음"}
    r["actions"] = [{"time": "2026-08-17T21:09", "action": "NDMS 상황접수"}, {"time": "2026-08-17T21:10", "action": "현장 상황관리관 및 대응인력 현장 출동"},
                    {"time": "2026-08-17T21:20", "action": "현황 파악 및 배수작업, 안전조치"}, {"time": "2026-08-17T22:30", "action": "배수 및 물고임 상황 종료"}]
    r["mobilization"] = {"personnel": {"경찰관": 4, "공무원": 2, "현장인력": 3, "_원문표기": "인력: 4(경찰관: 4 , 공무원: 2, 현장 인력 3)"}, "equipment": {"배수장비": 1, "안전선": 2}}
    r["support"] = "해당 없음"; r["outlook"] = "해당 없음"
    out.append(r)
    # 5) 2026-07-28 훈련
    r = base("SR-1001-20260728-90-51810-01", "1001-20260728-90", "1001-20260728-90-51810", "훈련", "1보", "[훈련상황] 강원 인제군 집중호우 피해 발생보고 1보",
             "2026-07-28T00:00", "2026-07-28T00:00", "인제군청 ○○○", "강원특별자치도", "2026-07-28T00:00",
             {"address": "강원특별자치도 인제군 북면 일원", "lat": 38.1312, "lon": 128.2043},
             "00:00경 인제군 북면에서 기습적인 집중호우가 발생하여 반지하 주택·지하주차장·도로 등이 침수되고 맨홀 뚜껑 탈락으로 인한 추락 사고 등 발생. 인근 주민들의 추가적인 인명·재산피해가 우려.",
             False, SRCDIR + "(인제) ndms 재난상황보고(집중호우로 인한 피해, 26.04.29).hwp (+ 동명 PDF)")
    r["damage"] = {"human": {"dead": 0, "missing": 5, "injured": 8, "total": 13}, "property": "조사중", "other": None}
    r["training"] = True
    r["writingGuide"] = ["접수일시=NDMS 접수일시(실제 재난에서는 NDMS·전화·팩스 등으로 알게 된 시각)", "사고일시=사고발생 일시(접수일시 아님)",
                         "초기(1보)는 ①일시 ②장소 ③상황개요 위주로 신속 보고, 이후 정보는 2보~최종 보고로 추가", "상황개요의 일시·장소는 ①②와 일치"]
    out.append(r)
    return out

def synth(events, r119):
    out = []
    ev = {e["eventId"]: e for e in events}
    by = collections.defaultdict(list)
    for x in r119: by[x["regionRecordId"]].append(x)
    def reg_of(eid, adm): return next(r for r in ev[eid]["regions"] if r["admCode"] == adm)
    def lab(reg): return reg["sido"] if reg["admCode"] == "26000" else reg["sigungu"]
    def loc(reg): return reg["sido"] + " 일원" if reg["admCode"] == "26000" else reg["sido"] + " " + reg["sigungu"] + " 일원"
    SENDER = {"26000": "부산광역시 재난안전대책본부(자연재난과) 담당 ○○○", "47230": "영천시 재난안전대책본부(안전재난과) 담당 ○○○", "51810": "인제군 재난안전대책본부(안전교통과) 담당 ○○○"}
    RECV = {"26000": "행정안전부", "47230": "행정안전부, 경상북도", "51810": "행정안전부, 강원특별자치도"}
    # ---------- 현재 진행 이벤트 ----------
    cur_plan = [
        ("1001-20261002-01", "26000", [("초기", "1보", "2026-10-03T03:10", "부산 전역 호우경보(02:30) 발효, 동구 초량 제1지하차도 진입로 물고임 등 침수 신고 접수. 지하차도 7곳 선제통제 착수"),
                                       ("중간", "2보", "2026-10-03T06:30", "03~04시 시간당 58.5mm 집중. 사하구 하단동 반지하 고립 2명 구조, 연제구 연산동 차량고립 1명 구조, 남구 문현동 사면 토사유출, 조만강 제방 누수 응급조치"),
                                       ("중간", "3보", "2026-10-03T09:00", "강우 약화 추세이나 만조·수영강 수위 주의단계. 둔치주차장 차량 이동, 해안 월파구간 통제 지속. 누적 신고 12건(구조 6명)")]),
        ("1001-20261002-01", "47230", [("초기", "1보", "2026-10-03T06:00", "영천 호우경보(05:00) 발효, 고경면 청정리 지방도925호선 고촌천 범람 도로침수 신고 접수, 통제 착수"),
                                       ("중간", "2보", "2026-10-03T09:00", "05~06시 시간당 41mm. 임고면 삼매리 진입로 유실 주민 3명 고립(굴삭기 투입), 금호읍 봉죽리 사면 토사유입, 조교동 둔치 이용객 대피 완료")]),
        ("1001-20261002-02", "51810", [("초기", "1보", "2026-10-03T05:30", "인제 호우경보(04:00) 발효, 인제읍 남북리 817 일원 도로 물고임·북면 원통 시가지 내수침수·미시령옛길 낙석 접수"),
                                       ("중간", "2보", "2026-10-03T09:00", "산사태주의보(06:00) 추가 발효. 상남면 내린천변 야영객 12명 대피, 국도31호선 고사리 구간 낙석·수목전도 통제, 산사태 취약지역 14세대 19명 사전대피")]),
    ]
    for eid, adm, plan in cur_plan:
        rr = f"{eid}-{adm}"; reg = reg_of(eid, adm); wl = reg["weatherLocal"]
        for i, (kind, no, t, ov) in enumerate(plan, 1):
            s = base(f"SR-{rr}-{i:02d}", eid, rr, kind, no, f"[{lab(reg)}] 호우 대처상황 보고 {no}", t, t, SENDER[adm], RECV[adm],
                     eid and ev[eid]["startDate"], {"address": loc(reg)}, ov, True)
            calls = [c for c in by[rr] if c["신고일시"][:16].replace(" ", "T") <= t]
            s["linkedReports119"] = [c["reportId"] for c in calls]
            rescued = sum(c["ext"]["rescueeCount"] for c in calls if c["관제상황구분"] in ("구조완료", "상황종료"))
            s["damage"]["property"] = f"119 신고 {len(calls)}건(구조완료 {rescued}명) — " + ", ".join(sorted({c['ext']['accidentType'] for c in calls}))
            s["actions"] = [a for a in reg["actions"] if a["time"] <= t]
            s["weatherAtReport"] = {"advisories": [f"{a['type']}{a['level']}({a['area']}, {a['issuedAt'][5:16]})" for a in ev[eid]["weather"]["advisories"] if a["issuedAt"][:16] <= t and (reg["sigungu"] in a["area"] or (adm == "26000" and "부산" in a["area"]) or (adm == "51810" and "인제" in a["area"]))],
                                    "maxHourlyRain_mm": wl["maxHourlyRain_mm"] if t >= wl["maxHourlyAt"][:16] else None,
                                    "accumRain_mm": round(sum(h["mm"] for h in wl["hourly"] if h["t"][:16] <= t), 1), "station": wl["station"]}
            if adm == "47230" and kind == "중간":
                s["ndmsCopingStatus"] = {
                    "template": YC_TEMPLATE,
                    "1_비상체계": {"비상대응단계": "비상1단계→2단계 검토", "가동시간": "2026-10-02T22:20", "인원": {"소계": 46, "소방": 8, "공무원": 34, "경찰": 4}},
                    "2.1_홍보활동": {"SMS": {"회": 3, "명": 1840}, "자동음성통보": {"회": 2, "개소": 31}, "전광판(개소)": 6, "재난문자CBS(회)": 2},
                    "2.2_인명피해우려지역_사전점검": {"점검일자": "20261002", "지하차도": 2, "둔치주차장": 3, "하천변산책로": 4, "급경사지_붕괴위험지역": 5, "저수지·댐": 7},
                    "2.3_사전대피": {"산사태_취약지구": {"세대": 4, "명": 6}, "침수취약_반지하주택가": {"세대": 0, "명": 0}},
                    "3_통제현황": [{"시설분류": "도로", "주소": "고경면 청정리 지방도925호선", "통제범위": "고촌천 인접 1.2km", "통제일시": "10030540", "해제일시(예정)": "10031800"},
                                   {"시설분류": "하천둔치", "주소": "조교동 금호강 파크골프장", "통제범위": "둔치 전역", "통제일시": "10030510", "해제일시(예정)": "미정"}],
                    "4.1_인명피해": {"사망": 0, "부상": 0, "실종": 0},
                    "4.3_공공시설피해": {"도로": {"침수(개소)": 3, "사면유실(개소)": 1}, "소하천": {"기타(개소)": 1}, "산사태": {"개소": 1}},
                    "5.3_인력장비동원": {"인력(금일)": {"공무원": 34, "소방": 8, "경찰": 4}, "장비(금일)": {"백호우(대)": 2, "덤프(대)": 1, "기타(양수기 등)": 4}},
                    "_note": "synthetic — 영천시 제공 NDMS 대처상황 입력 양식의 시트·항목 구조를 그대로 사용"}
            s["outlook"] = "강우 정점 통과 후에도 하천 수위 상승 지속 예상 — 하천변·지하공간 통제 유지, 추가 피해 발생 시 즉시 보고"
            out.append(s)
        # 상황전파 메시지 (시간+장소+강우+피해+조치)
        for j, c in enumerate([c for c in by[rr] if c["ext"]["rescueeCount"] > 0 or "침수" in c["ext"]["accidentType"]][:3], 1):
            t = c["신고일시"][:16].replace(" ", "T")
            acc = round(sum(h["mm"] for h in wl["hourly"] if h["t"][:16] <= t), 1)
            ar = c['신고지역명'].split(' ', 1)[1]; ld = c['ext']['locationDetail']
            ld = ld[len(ar.split()[-1]):].strip() if ld.startswith(ar.split()[-1]) else ld
            msg = (f"[{lab(reg)} 상황실] {c['신고일시'][5:16]} {ar} {ld} — {c['ext']['accidentType']}"
                   f"(요구조자 {c['ext']['rescueeCount']}명) / {wl['station']} 누적 {acc}mm·호우특보 발효 중 / 조치: {c['ext']['result']}")
            s = base(f"SR-{rr}-M{j:02d}", eid, rr, "상황전파", f"M{j}", "상황전파 메시지", t, t, f"{lab(reg)} 재난안전상황실", "유관기관(경찰·소방·도·행안부 상황실)",
                     t, {"address": c["신고지역명"] + " " + c["ext"]["locationDetail"], "lat": c["ext"]["coord"]["lat"], "lon": c["ext"]["coord"]["lon"]}, msg, True)
            s["linkedReports119"] = [c["reportId"]]; s["message"] = msg
            out.append(s)
    # ---------- 과거 이벤트 최종보고 (실데이터 집계 + 서술 synthetic) ----------
    past = [("1001-20200723-01", "26000", "2020-07-25T18:00"), ("1001-20140825-01", "26000", "2014-08-27T18:00"), ("1005-20191001-01", "26000", "2019-10-05T18:00"),
            ("1001-20200728-01", "51810", "2020-08-12T18:00"), ("1001-20200728-01", "47230", "2020-08-12T18:00"), ("1005-20220903-01", "47230", "2022-09-08T18:00"),
            ("1005-20220903-01", "26000", "2022-09-08T18:00"), ("1001-20240708-01", "47230", "2024-07-20T18:00"), ("1001-20240919-01", "26000", "2024-09-23T18:00"),
            ("1005-20200901-01", "51810", "2020-09-09T18:00")]
    for eid, adm, t in past:
        e = ev[eid]; rr = f"{eid}-{adm}"; reg = reg_of(eid, adm); d = reg["damages"]
        lines = []
        if d["publicFacilityLedger"]:
            L = d["publicFacilityLedger"]
            lines.append(f"공공시설 {L['facilityCount']}건 피해 {L['damage_krw_thousand']:,}천원(복구비 {L['recovery_krw_thousand']:,}천원), 주요: " +
                         "; ".join(f"{x['facility']}({x['type']}, {x['damage_krw_thousand']:,}천원)" for x in L["topFacilities"][:3]))
        if d["privateFacility"]:
            P = d["privateFacility"]; lines.append(f"사유시설 {P['recordCount']}건, 주택 침수 {P['housing']['flooded']}동")
        if d["publicFloodItems"]:
            lines.append("공공시설 침수: " + "; ".join(f"{x['address']} {x['facilityType']} — {x['summary'][:40]}" for x in d["publicFloodItems"]["items"][:3]))
        if reg["floodTraces"]:
            F = reg["floodTraces"]; lines.append(f"침수흔적 {F['count']}개소(최대 평균침수심 {F['maxDepth_m']}m), 지구: " + ", ".join(F["districts"][:5]))
        s = base(f"SR-{rr}-F1", eid, rr, "최종", "최종", f"[{lab(reg)}] {e['title']} 피해 및 조치 최종보고", t, t, SENDER[adm], RECV[adm],
                 e["startDate"], {"address": loc(reg)},
                 f"{e['startDate']}~{e['endDate']} {e['typeName']} 피해 최종 집계(재해대장·피해내역·침수흔적도 기준). " + (" ".join(f["fact"] for f in reg["facts"]) if reg["facts"] else ""), True)
        s["damage"]["property"] = " / ".join(lines) or None
        if d["human"]: s["damage"]["human"] = {"dead": d["human"]["dead"], "missing": None, "injured": None, "source": d["human"]["source"]}
        s["linkedReports119"] = reg["reports119"]
        s["actions"] = [{"time": None, "action": "응급복구 및 복구계획 수립(NDMS 복구 입력) — 재해대장 등록", "source": "재해대장 존재로부터 추론"}]
        s["note"] = "피해 수치는 재해대장·피해내역·침수흔적도 실데이터 집계값, 보고서 형식·문장은 synthetic"
        s["synthetic"] = True; s["sourceType"] = "SYNTHETIC_FROM_REAL_AGGREGATES"
        out.append(s)
    return out

def build_reports(events, r119):
    return real_reports() + synth(events, r119)
