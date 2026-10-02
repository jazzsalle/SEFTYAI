import "server-only";
import { DetailResponse, type EntityRef, type QueryContext } from "../../contract/agent";
import { EVENTS, EVENT_BY_ID, R119_BY_ID, SCENARIO, SR_BY_ID, eventRef, fmtKrw, fmtKrwThousand, r119Ref, regionRecord, type DisasterEvent } from "../events";
import { MANUAL_BY_REGION } from "../manual";
import { relevant119, RISK_BY_ID, nearbyRisks, regionOfRisk, riskRef, dist, type RiskObject } from "../risk";
import { Answer, cite119, citeEvent, citeManual, citeRisk, citeSR, situation, starName, ymd } from "./core";
import { RIVERS, riverRef, riverRelated, tidyBasis } from "./composers";

type DR = DetailResponse;
const F = (label: string, v: unknown) => ({ label, value: v == null || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v).replace(/[{}"]/g, "").replace(/,/g, ", ") : String(v) });

const FA_RE: Record<string, RegExp> = {
  지하차도: /지하차도|취약도로/, 급경사지: /급경사|산사태/, 붕괴위험지역: /급경사|산사태/, 산사태취약지역: /산사태|급경사|산악/, 상습침수지역: /저지대|침수|주차장/,
  홍수취약지구: /하천|제방/, 풍수해개선지구: /재해위험|급경사|저지대|인명피해/, 위험저수지: /저수지|인명피해/, 야영장: /계곡|야영|물놀이/, 소하천: /세월교|하천|계곡/, 하천위험요소: /하천|하상/, 건축물지하공간: /지하|저지대/,
};

function riskDetail(o: RiskObject, ctx: QueryContext): DR {
  const a = new Answer();
  const region = regionOfRisk(o);
  const s = situation(ctx, region);
  const m = region !== "national" ? MANUAL_BY_REGION[region] : null;
  const fas = m ? m.fieldActions.filter((f) => FA_RE[o.category]?.test(f.target)).slice(0, 2) : [];
  const tag = s.level === "경보" ? /호우경보|경보/ : s.level === "주의보" ? /주의보/ : /예비|평상/;
  const clean = (l: string, f: { page?: number }) => `${l.replace(/^\[[^\]]+\]\s*/, "").replace(/\s*\[p[\d-]+\]$/, "")}${f.page ? ` (매뉴얼 p.${f.page})` : ""}`;
  let what = fas.flatMap((f) => f.actions.filter((l) => tag.test(l.slice(0, 12))).map((l) => clean(l, f)));
  if (!what.length) what = fas.flatMap((f) => f.actions.slice(0, 2).map((l) => clean(l, f)));
  if (!what.length) what = ["특보 발효 시 현장 예찰·출입 통제 여부 판단", "인근 주민·이용객에게 위험 상황 전파(마을방송·재난문자)", "피해 징후(균열·누수·토사 유출) 발견 시 즉시 대피 및 상황보고"];
  const cr = citeRisk(a, o);
  const th = Number(o.trigger.text.match(/시간당\s*(\d+)\s*mm/)?.[1] ?? NaN);
  const verdict = s.active && s.rain1hMax != null
    ? !Number.isNaN(th)
      ? `▶ ${s.rain1hMax >= th ? "현재 기준 초과" : "현재 기준 미만"} — 시간 최대 ${s.rain1hMax}mm ${s.rain1hMax >= th ? ">" : "<"} ${th}mm(${o.trigger.derived ? "일반 기준" : "기관 기준"}) · ${s.advisoryText} 발효 중`
      : `▶ 현재 ${s.advisoryText} 발효 중 — 특보 기준 해당 (시간 최대 ${s.rain1hMax}mm)`
    : "";
  fas.forEach((f) => m && citeManual(a, m, f.page, f.criteria.slice(0, 140)));
  const addr = String(o.attrs["주소"] ?? o.attrs["위치"] ?? o.attrs["대표지번"] ?? o.attrs["상세주소"] ?? o.attrs["대지위치"] ?? "");
  const nearRep = s.reports.filter((r) => dist({ lon: r.ext.coord.lon, lat: r.ext.coord.lat }, o) <= 1 && relevant119(o.category, r.ext.accidentType));
  const planSt = o.plan ? String(o.plan["진행상태"] ?? o.plan["사업구분(진행상태)"] ?? "") : "";
  const hist = o.history ?? [];
  const relEvents = hist
    .map((h) => EVENTS.find((e) => e.startDate === h.date || (h.disaster && e.regions.some((r) => r.damages.publicFacilityLedger?.ledgerDisasterNames?.includes(h.disaster!)))))
    .filter((e): e is DisasterEvent => !!e);
  return {
    type: "risk",
    id: o.id,
    title: riskRef(o).name,
    category: o.category,
    badges: [
      ...(o.grade ? [{ text: o.grade.length <= 2 ? `${o.grade}등급` : o.grade, tone: "warn" as const }] : []),
      { text: `위험수준 ${o.risk_level === "high" ? "상" : o.risk_level === "low" ? "하" : "중"}`, tone: o.risk_level === "high" ? ("danger" as const) : ("neutral" as const) },
      ...(planSt ? [{ text: `정비 ${planSt.slice(0, 16)}`, tone: /완료|해제/.test(planSt) ? ("ok" as const) : ("info" as const) }] : []),
      ...(nearRep.length ? [{ text: `119 신고 ${nearRep.length}건 인근`, tone: "danger" as const }] : []),
      ...(o.coordApprox ? [{ text: "위치 근사", tone: "neutral" as const }] : []),
      ...(o.sample ? [{ text: "샘플(실데이터 미수신)", tone: "warn" as const }] : []),
    ],
    w4: {
      where: `${o.region.sido} ${o.region.sigungu} ${o.region.emd ?? ""}${addr ? ` · ${addr}` : ""}${o.coordApprox ? " (좌표는 읍면동 내 근사 — 원천 좌표 결합 필요)" : ""}`,
      why: o.reason,
      when: `${verdict ? verdict + "\n" : ""}${o.trigger.text}${o.trigger.thresholds ? `\n기준값 — ${Object.entries(o.trigger.thresholds).slice(0, 5).map(([k, v]) => `${k}: ${v}`).join(" · ")}` : ""}${o.trigger.derived ? "\n※ 개별 기준 미수신 — 기상청 특보·산림청 기준 등 일반 기준 적용" : ""}`,
      what: what.slice(0, 5),
    },
    sections: [
      { key: "risk", label: "위험·취약정보", fields: [F("지정·관리 사유", o.reason), F("위험 등급", o.grade), F("위험 조건", o.trigger.text), F("판단 근거", o.trigger.basis?.join(", ")), ...(o.trigger.past_flood_dates ? [F("과거 침수일", o.trigger.past_flood_dates.join(", "))] : [])].map((f, i) => (i === 0 ? { ...f, cite: [a.cid(cr)] } : f)) },
      { key: "attrs", label: "관리정보", fields: Object.entries(o.attrs).filter(([k]) => !/좌표|geojson|출처/.test(k)).slice(0, 24).map(([k, v]) => F(k, v)) },
      ...(o.plan ? [{ key: "plan", label: "정비계획", fields: Object.entries(o.plan).slice(0, 16).map(([k, v]) => F(k, v)) }] : []),
      ...(hist.length ? [{ key: "hist", label: "피해 이력", fields: hist.slice(0, 12).map((h) => F(ymd(h.date), `${h.disaster ?? "침수"}${h.damaged_facilities_in_emd ? ` — 같은 읍면동 공공시설 ${h.damaged_facilities_in_emd}건 피해` : ""}${h.parcels_flooded ? ` — 침수 필지 ${h.parcels_flooded}` : ""} (${h.source ?? ""})`)) }] : []),
      { key: "src", label: "공간·근거", fields: [F("좌표(WGS84)", `${o.lon.toFixed(5)}, ${o.lat.toFixed(5)}${o.coordApprox ? " (근사)" : ""}`), F("원천 데이터셋", o.source.dataset), F("파일", o.source.file), F("시트·행", `${o.source.sheet ?? ""} ${o.source.row ?? ""}`)] },
    ],
    related: [
      ...nearRep.map(r119Ref),
      ...[...new Map(relEvents.map((e) => [e.eventId, e])).values()].slice(0, 4).map((e) => eventRef(e, region)),
      ...nearbyRisks(o, 0.8, o.id).slice(0, 6).map((x) => riskRef(x)),
    ],
    citations: a.cites,
    geometry: { lon: o.lon, lat: o.lat },
    sources: [starName(o.category), ...(fas.length ? ["풍수해 현장조치 행동매뉴얼"] : [])],
  };
}

function eventDetail(e: DisasterEvent, ctx: QueryContext): DR {
  const a = new Answer();
  const pr = ctx.region === "national" ? undefined : ctx.region;
  const rec = (pr ? regionRecord(e, pr) : undefined) ?? e.regions[0];
  citeEvent(a, e);
  // 현재(시연) 사건 대비 유사도
  const curId = pr ? SCENARIO[pr].eventId : SCENARIO.busan.eventId;
  const cur = EVENT_BY_ID.get(curId);
  const curRec = cur && (pr ? regionRecord(cur, pr) : cur.regions[0]);
  const sim = curRec ? cur?.similarCases?.[curRec.regionRecordId]?.find((c) => c.eventId === e.eventId) : undefined;
  const reps = rec.reports119.map((id) => R119_BY_ID.get(id)).filter((x): x is NonNullable<typeof x> => !!x);
  reps.slice(0, 6).forEach((r) => cite119(a, r));
  const srs = rec.situationReports.map((id) => SR_BY_ID.get(id)).filter((x): x is NonNullable<typeof x> => !!x);
  srs.slice(0, 4).forEach((s) => citeSR(a, s));
  const pl = rec.damages.publicFacilityLedger, pf = rec.damages.privateFacility, ins = rec.damages.insurance, ft = rec.floodTraces;
  const tl = [
    ...e.weather.advisories.map((ad) => ({ at: (ad.issuedAt ?? "").replace("T", " ").slice(0, 16), label: "특보", kind: "특보", text: `${ad.area} ${ad.type}${ad.level}${ad.status ? ` (${ad.status})` : ""}` })),
    ...rec.actions.map((ac) => ({ at: ac.time.replace("T", " ").slice(0, 16), label: "대응", kind: "대응", text: ac.action })),
    ...reps.map((r) => ({ at: r.신고일시.slice(0, 16), label: "119", kind: "119", text: `${r.ext.accidentType} · ${r.ext.locationDetail} — ${r.ext.callSummary}` })),
    ...srs.map((s) => ({ at: s.submittedAt.replace("T", " ").slice(0, 16), label: `상황보고 ${s.reportNo}`, kind: "보고", text: s.overview })),
    ...rec.facts.map((f) => ({ at: e.startDate, label: "피해", kind: "피해", text: `${f.fact}${/검증/.test(f.source) ? " (공개자료·검증필요)" : ""}` })),
  ].sort((x, y) => x.at.localeCompare(y.at));
  return {
    type: "event",
    id: e.eventId,
    title: e.title.replace(/^\[시연\]\s*/, ""),
    category: "재난사건",
    badges: [
      { text: e.typeName, tone: "info" },
      { text: e.status, tone: e.status === "진행중" ? "danger" : "neutral" },
      ...(rec.crisisLevel ? [{ text: rec.crisisLevel, tone: "warn" as const }] : []),
      ...(e.synthetic ? [{ text: "훈련 시나리오(가상)", tone: "warn" as const }] : []),
      ...(/검증/.test(e.weather.rainfallSource) ? [{ text: "강우 공개자료(검증필요)", tone: "neutral" as const }] : []),
    ],
    sections: [
      ...(sim
        ? [{ key: "sim", label: "유사도 근거", fields: [F("유사도", `${sim.score} / 100 · 신뢰도 ${sim.confidence}`), ...sim.breakdown.map((b) => F(`${b.factor} (${b.weight})`, `${b.score} — ${tidyBasis(b.basis)}`)), F("유의", "유사도는 피해 예측값이 아닌 조건 일치도입니다")] }]
        : []),
      { key: "info", label: "기본정보", fields: [F("재난마스터 ID", e.eventId), F("재난유형", `${e.typeName} (코드 ${e.typeCode})`), F("기간", `${e.startDate} ~ ${e.endDate ?? "진행중"}`), F("NDMS 키", e.ndmsKey ? `${e.ndmsKey.DSTR_YEAR}/${e.ndmsKey.DSTR_TY_CD}/${e.ndmsKey.DSTR_SN} ${e.ndmsKey.DSTR_NM}` : "—"), F("영향 지역", e.regions.map((r) => `${r.sigungu} (${r.regionRecordId})`).join("\n")), F("강우", e.weather.maxHourlyRain_mm != null ? `시간 최대 ${e.weather.maxHourlyRain_mm}mm${e.weather.totalRain_mm ? ` · 누적 ${e.weather.totalRain_mm}mm` : ""} · ${e.weather.station ?? ""} · ${e.weather.rainfallSource}` : e.weather.rainfallSource), F("지역 요약", rec.summary), F("피해 유형", rec.damageTags.join(", "))] },
      {
        key: "dmg", label: "피해·복구",
        fields: [
          ...(pl ? [F("공공시설(재해대장)", `${pl.facilityCount}건 · 피해 ${fmtKrwThousand(pl.damage_krw_thousand)} · 복구비 ${fmtKrwThousand(pl.recovery_krw_thousand)}`), F("시설 유형별", Object.entries(pl.byFacilityType ?? {}).map(([k, v]) => `${k} ${v}`).join(", ")), F("시군구·읍면동별", Object.entries(pl.bySigungu ?? {}).map(([k, v]) => `${k} ${v}`).join(", "))] : []),
          ...(rec.damages.publicFloodItems ? [F("공공시설 침수피해", `${rec.damages.publicFloodItems.count}건`), ...rec.damages.publicFloodItems.items.slice(0, 5).map((it) => F(it.address.replace(/^(부산광역시|경상북도|강원특별자치도)\s*/, "").slice(0, 26), `${it.facilityType} · ${it.damageCause} · ${it.summary.slice(0, 60)} · ${fmtKrwThousand(it.damage_krw_thousand)}`))] : []),
          ...(pf ? [F("사유시설", `${pf.recordCount.toLocaleString()}건${pf.housing ? ` · 주택 침수 ${pf.housing.flooded}동` : ""}${pf.confirmedDamage_krw_thousand ? ` · ${fmtKrwThousand(pf.confirmedDamage_krw_thousand)}` : ""}`), ...(pf.housing?.bySigungu ? [F("주택 침수 구별", Object.entries(pf.housing.bySigungu).map(([k, v]) => `${k} ${v}`).join(", "))] : [])] : []),
          ...(ins?.house ? [F("풍수해보험(주택)", `${ins.house.claims}건 · ${fmtKrw(ins.house.paid_krw)}`)] : []),
          ...(ins?.sme ? [F("풍수해보험(소상공인)", `${ins.sme.claims}건 · ${fmtKrw(ins.sme.paid_krw)}`)] : []),
          ...(rec.damages.human ? [F("인명피해", `사망 ${rec.damages.human.dead ?? "—"} · 실종 ${rec.damages.human.missing ?? "—"} · 부상 ${rec.damages.human.injured ?? "—"}${/검증/.test(rec.damages.human.source ?? "") ? " (공개자료·검증필요)" : ""}`)] : []),
          ...(rec.recovery.recovery_krw_thousand ? [F("복구비", fmtKrwThousand(rec.recovery.recovery_krw_thousand))] : []),
        ],
      },
      ...(ft ? [{ key: "trace", label: "침수흔적", fields: [F("침수흔적", `${ft.count}개소 · ${Math.round(ft.totalArea_m2).toLocaleString()}㎡ (침수심은 원자료 단위 혼재 — 검증 후 표출)`), F("원인", Object.entries(ft.causes).map(([k, v]) => `${k} ${v}`).join(", ")), ...ft.records.slice(0, 8).map((r) => F(r.district, `${Math.round(r.area_m2).toLocaleString()}㎡ · ${r.cause} · ${r.begin} ~ ${r.end}`))] }] : []),
      { key: "timeline", label: "사건 이력", fields: [] },
      { key: "sat", label: "위성영상", fields: [F("촬영일시(발생 전)", `${e.startDate} 이전 최근 촬영분`), F("촬영일시(발생 후)", `${e.startDate} ~ ${e.endDate ?? "진행중"} 중 최초 촬영분`), F("위성·센서", "SAR (구름 영향 없음) — 시연 예시"), F("촬영 범위", rec.floodTraces?.districts?.slice(0, 3).join(", ") || rec.sigungu)] },
    ],
    timeline: tl,
    related: [
      ...reps.map(r119Ref),
      ...(ft?.records ?? []).slice(0, 10).map((f): EntityRef => ({ type: "damage", id: f.traceId, name: f.district, category: "침수흔적", lon: f.centroid.lon, lat: f.centroid.lat, summary: `침수면적 ${Math.round(f.area_m2).toLocaleString()}㎡ · ${f.cause}`, metric: `${Math.round(f.area_m2 / 1000).toLocaleString()}천㎡`, level: "mid" })),
      ...(curRec && cur?.eventId === e.eventId ? (cur.similarCases?.[curRec.regionRecordId] ?? []).flatMap((c): EntityRef[] => { const x = EVENT_BY_ID.get(c.eventId); return x ? [{ ...eventRef(x, pr), metric: `유사도 ${Math.round(c.score)}` }] : []; }) : []),
    ],
    citations: a.cites,
    geometry: ft?.records?.[0] ? { lon: ft.records[0].centroid.lon, lat: ft.records[0].centroid.lat } : undefined,
    sources: [...new Set(["재해대장", ...(pf ? ["상습침수지역·피해데이터"] : []), ...(ft ? ["침수흔적도"] : []), ...(reps.length ? ["소방 신고정보"] : []), ...(srs.length ? ["NDMS 상황보고"] : [])])],
  };
}

function r119Detail(id: string): DR | null {
  const r = R119_BY_ID.get(id);
  if (!r) return null;
  const a = new Answer();
  cite119(a, r);
  const ev = EVENT_BY_ID.get(r.eventId);
  const std = ["신고일시", "상황종료일시", "기관코드", "신고지역명", "신고내용", "긴급구조유형1명칭", "긴급구조유형2명칭", "긴급구조유형3명칭", "원인명", "재난규모", "관제상황구분", "진행일시", "번호"];
  const near = nearbyRisks({ lon: r.ext.coord.lon, lat: r.ext.coord.lat }, 0.6).slice(0, 6);
  return {
    type: "report119",
    id: r.reportId,
    title: `${r.ext.accidentType} · ${r.ext.locationDetail}`,
    category: "119신고",
    badges: [{ text: r.ext.accidentType, tone: "danger" }, { text: r.관제상황구분, tone: "info" }, ...(r.ext.rescueeCount ? [{ text: `요구조자 ${r.ext.rescueeCount}명`, tone: "danger" as const }] : []), ...(r.synthetic ? [{ text: "재구성(시연) · 표준 스키마", tone: "warn" as const }] : [])],
    w4: undefined,
    sections: [
      { key: "sum", label: "신고 요약", fields: [F("신고 내용(요약)", r.ext.callSummary), F("위치", `${r.신고지역명} · ${r.ext.locationDetail}`), F("출동", r.ext.dispatchUnit), F("처리 결과", r.ext.result), F("요구조자", `${r.ext.rescueeCount}명`), F("재난마스터", ev ? `${ev.eventId} ${ev.title}` : r.eventId), F("근거 지점", r.ext.groundedOn ?? "—")] },
      { key: "std", label: "소방긴급구조정보(표준)", fields: std.map((k) => F(k, r[k])) },
    ],
    related: [...(ev ? [eventRef(ev)] : []), ...near.map((x) => riskRef(x))],
    citations: a.cites,
    geometry: { lon: r.ext.coord.lon, lat: r.ext.coord.lat },
    sources: ["소방 신고정보"],
  };
}

function riverDetail(id: string, ctx: QueryContext): DR | null {
  const r = RIVERS.find((x) => x.riverId === id);
  if (!r) return null;
  const rel = riverRelated(r).slice(0, 15);
  const m = MANUAL_BY_REGION[r.region as "busan"];
  const a = new Answer();
  const fa = m?.fieldActions.filter((f) => f.target.includes(r.name) || f.criteria.includes(r.name)) ?? [];
  fa.forEach((f) => citeManual(a, m, f.page, f.criteria.slice(0, 140)));
  const sa = r.standardAttrs ?? {};
  void ctx;
  return {
    type: "river",
    id: r.riverId,
    title: r.label || r.name,
    category: "하천",
    badges: [{ text: r.grade, tone: "info" }, { text: `${r.length_km}km`, tone: "neutral" }],
    w4: fa.length || rel.length ? {
      where: `${r.regionName} ${r.sigungu.join("·")}${sa["시점위치"] ? ` · 시점 ${sa["시점위치"]}` : ""}${sa["종점위치"] ? ` → 종점 ${sa["종점위치"]}` : ""}`,
      why: rel.length ? `하천 주변 관리대상 ${rel.length}곳 (${[...new Set(rel.map((x) => x.category))].join(", ")}) — 집중호우 시 수위 상승으로 하상도로·산책로·저지대가 먼저 잠김` : "하천 범람·하상도로 침수 우려",
      when: fa[0] ? fa[0].criteria : "호우특보·홍수특보 발령 또는 하천 수위 주의 단계 도달 시",
      what: fa.length ? fa[0].actions.slice(0, 4).map((l) => l.replace(/\s*\[p[\d-]+\]$/, "")) : ["하천변 산책로·둔치 주차장 출입 통제", "수위 관측·CCTV 모니터링", "범람 우려 시 저지대 주민 대피 안내"],
    } : undefined,
    sections: [
      { key: "info", label: "하천 정보", fields: [F("하천 ID", r.riverId), F("하천명", r.name), F("등급", r.grade), F("연장", `${r.length_km}km (국가기본도 중심선)`), F("관할 시군구", r.sigungu.join(", ")), ...Object.entries(sa).filter(([k]) => !/하천명/.test(k)).map(([k, v]) => F(k, v))] },
    ],
    related: rel.map((x) => riskRef(x)),
    citations: a.cites,
    geometry: { lon: r.center[0], lat: r.center[1] },
    sources: ["하천 공간정보(국가기본도)", "전국하천표준데이터"],
  };
}

function damageDetail(id: string, ctx: QueryContext): DR | null {
  for (const e of EVENTS)
    for (const rec of e.regions) {
      const f = rec.floodTraces?.records.find((x) => x.traceId === id);
      if (f) {
        const a = new Answer();
        citeEvent(a, e, "침수흔적도");
        void ctx;
        return {
          type: "damage",
          id,
          title: `${f.district} 침수흔적`,
          category: "침수흔적",
          badges: [{ text: `침수면적 ${Math.round(f.area_m2).toLocaleString()}㎡`, tone: "warn" }, { text: f.disasterName, tone: "info" }],
          w4: {
            where: `${rec.sigungu} · ${f.district} (중심점 ${f.centroid.lat}, ${f.centroid.lon})`,
            why: `${f.cause} — 면적 ${Math.round(f.area_m2).toLocaleString()}㎡가 잠겼던 곳 (침수심 원자료 ${f.avgDepth_m} · 단위 검증 필요)`,
            when: `${f.begin} ~ ${f.end} (${e.title}${e.weather.maxHourlyRain_mm != null ? `, 시간 최대 ${e.weather.maxHourlyRain_mm}mm` : ", 강우 ASOS 결합 필요"})`,
            what: ["같은 강도 강우 예보 시 우선 예찰·배수시설 점검", "저지대·지하공간 이용자 대피 안내", "침수 반복 시 상습침수지역·위험개선지구 지정 검토"],
          },
          sections: [{ key: "info", label: "침수흔적 정보", fields: [F("흔적 ID", f.traceId), F("재난명", f.disasterName), F("기간", `${f.begin} ~ ${f.end}`), F("지구", f.district), F("원인", f.cause), F("평균 침수심", `${f.avgDepth_m}m`), F("면적", `${Math.round(f.area_m2).toLocaleString()}㎡`), F("재난마스터", e.eventId)] }],
          related: [eventRef(e), ...nearbyRisks(f.centroid, 0.8).slice(0, 6).map((x) => riskRef(x))],
          citations: a.cites,
          geometry: f.centroid,
          sources: ["상습침수지역·피해데이터(침수흔적도)"],
        };
      }
    }
  return null;
}

export function detail(type: string, id: string, ctx: QueryContext): DR | null {
  let d: DR | null = null;
  if (type === "risk") {
    const o = RISK_BY_ID.get(id);
    d = o ? riskDetail(o, ctx) : null;
  } else if (type === "event") {
    const e = EVENT_BY_ID.get(id);
    d = e ? eventDetail(e, ctx) : null;
  } else if (type === "report119") d = r119Detail(id);
  else if (type === "river") d = riverDetail(id, ctx);
  else if (type === "damage") d = damageDetail(id, ctx);
  return d ? DetailResponse.parse(d) : null;
}
export { riverRef };
