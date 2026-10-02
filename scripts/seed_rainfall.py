"""
T3Q 기상결합(ASOS 시간강수) 시연 시드 생성
- T3Q가 사건 기간·시군구로 기상청 ASOS/AWS 강우를 결합해 제공한다고 가정(연계 전 시연용)
- 강우가 없는 과거 사건에 시간강수 시계열·최대·누적을 결정적(eventId 해시)으로 생성
- 피해 규모(주택 침수·공공시설 피해·침수흔적)에 비례하도록 강도 설정
- 진행 중(시연) 사건의 유사사례 강우 요인을 다시 계산
실행: python scripts/seed_rainfall.py  (data/seed/events.json 갱신 후 app/data/seed 로 복사)
"""
import hashlib, json, math, shutil, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data", "seed", "events.json")
DST = os.path.join(ROOT, "app", "data", "seed", "events.json")
SOURCE = "T3Q 기상결합(ASOS 시간강수) — 시연 가정값"
STATION = {"26": "부산(159) ASOS", "47": "영천(281) ASOS", "51": "인제(211) ASOS", "42": "인제(211) ASOS"}


def rnd(key, lo, hi):
    h = int(hashlib.md5(key.encode()).hexdigest()[:8], 16) / 0xFFFFFFFF
    return lo + (hi - lo) * h


def severity(rec):
    d = rec.get("damages") or {}
    house = ((d.get("privateFacility") or {}).get("housing") or {}).get("flooded") or 0
    pub = (d.get("publicFacilityLedger") or {}).get("damage_krw_thousand") or 0
    traces = (rec.get("floodTraces") or {}).get("count") or 0
    s = math.log10(1 + house) * 0.9 + math.log10(1 + pub / 1e5) * 0.8 + math.log10(1 + traces) * 0.6
    return min(1.0, s / 4.0)


def series(key, start, peak, total, hours=24):
    """피크가 중간 이후에 오는 비대칭 강우 곡선 (합계=total)"""
    pk = int(rnd(key + "pk", hours * 0.45, hours * 0.75))
    raw = []
    for i in range(hours):
        x = (i - pk) / (2.2 if i < pk else 3.5)
        raw.append(math.exp(-x * x) + rnd(f"{key}{i}", 0.02, 0.12))
    scale = total / sum(raw)
    vals = [round(v * scale, 1) for v in raw]
    vals[pk] = round(peak, 1)
    out = []
    for i, v in enumerate(vals):
        hh = (start + i) % 24
        day = (start + i) // 24
        out.append({"h": i, "t": f"D+{day} {hh:02d}:00", "mm": v})
    return out, pk


def main():
    data = json.load(open(SRC, encoding="utf-8"))
    for e in data["events"]:
        w = e["weather"]
        if e.get("status") == "진행중":
            continue
        known = w.get("maxHourlyRain_mm")
        typ = e["typeName"]
        by = {}
        peaks, totals = [], []
        for rec in e["regions"]:
            code = (rec.get("admCode") or "")[:2]
            sev = severity(rec)
            k = f'{e["eventId"]}-{rec["regionRecordId"]}'
            if known and code == "26":
                peak = known
            elif "태풍" in typ:
                peak = rnd(k, 28, 42) + sev * 22
            else:
                peak = rnd(k, 22, 34) + sev * 38
            if code in ("51", "42"):
                peak *= 0.9
            total = peak * rnd(k + "tot", 3.2, 5.2) + (80 if "태풍" in typ else 40) * sev
            date = e["startDate"]
            hourly, pk = series(k, int(rnd(k + "st", 0, 18)), peak, total)
            day0 = date
            # 실제 날짜로 변환
            from datetime import datetime, timedelta
            base = datetime.fromisoformat(day0) + timedelta(hours=int(rnd(k + "st", 0, 18)))
            for hrow in hourly:
                hrow["t"] = (base + timedelta(hours=hrow["h"])).strftime("%Y-%m-%dT%H:00+09:00")
                del hrow["h"]
            wl = {
                "station": STATION.get(code, "ASOS"),
                "maxHourlyRain_mm": round(peak, 1),
                "maxHourlyAt": hourly[pk]["t"],
                "totalRain_mm": round(total, 1),
                "since": hourly[0]["t"],
                "hourly": hourly,
                "rainfallSource": SOURCE if not (known and code == "26") else w.get("rainfallSource"),
            }
            rec["weatherLocal"] = wl
            by[rec["regionRecordId"]] = wl
            peaks.append(peak)
            totals.append(total)
        if not known:
            w["maxHourlyRain_mm"] = round(max(peaks), 1)
            w["totalRain_mm"] = round(max(totals), 1)
            w["station"] = by[e["regions"][peaks.index(max(peaks))]["regionRecordId"]]["station"]
            w["rainfallSource"] = SOURCE
        elif not w.get("totalRain_mm"):
            w["totalRain_mm"] = round(max(totals), 1)

    # 진행 중 사건 유사사례 강우 요인 재계산
    ev = {e["eventId"]: e for e in data["events"]}
    for e in data["events"]:
        sc = e.get("similarCases")
        if not sc:
            continue
        for rrid, cases in sc.items():
            rec = next(r for r in e["regions"] if r["regionRecordId"] == rrid)
            cur = rec["weatherLocal"]
            cmax, ctot = cur["maxHourlyRain_mm"], cur["totalRain_mm"]
            for c in cases:
                p = ev.get(c["eventId"])
                if not p:
                    continue
                code = rrid[-5:-3]
                pr = next((r for r in p["regions"] if (r.get("admCode") or "")[:2] == code), p["regions"][0])
                pw = pr.get("weatherLocal") or {}
                pmax = pw.get("maxHourlyRain_mm") or p["weather"]["maxHourlyRain_mm"]
                ptot = pw.get("totalRain_mm") or p["weather"]["totalRain_mm"]
                s1 = 1 - abs(cmax - pmax) / max(cmax, pmax)
                s2 = 1 - abs(ctot - ptot) / max(ctot, ptot) if ptot else s1
                rs = round(30 * (0.6 * s1 + 0.4 * s2), 1)
                for b in c["breakdown"]:
                    if b["factor"] == "강우량":
                        b["score"] = rs
                        b["basis"] = f"시간최대 {cmax}↔{round(pmax,1)}mm, 누적 {ctot}↔{round(ptot,1)}mm"
                c["score"] = round(sum(b["score"] for b in c["breakdown"]), 1)
                c["confidence"] = "높음" if rs >= 18 else "보통"
            cases.sort(key=lambda c: -c["score"])

    json.dump(data, open(SRC, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    shutil.copy(SRC, DST)
    n = sum(1 for e in data["events"] if e["weather"].get("maxHourlyRain_mm") is not None)
    print(f"events with rainfall: {n}/{len(data['events'])}")
    for e in data["events"][:40]:
        print(e["eventId"], e["title"][:28], e["weather"]["maxHourlyRain_mm"], e["weather"]["totalRain_mm"])


if __name__ == "__main__":
    main()
