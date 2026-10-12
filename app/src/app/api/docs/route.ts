import { NextResponse } from "next/server";
import { uxClean } from "@/lib/server/ux";
const J = (b: unknown, init?: ResponseInit) => NextResponse.json(uxClean(b), init);
import { MANUALS } from "@/lib/server/manual";
import { sopOnPage } from "@/lib/server/sop";
import { cardText, codeLabel, stepLabel } from "@/lib/sop";
import { RISK_BY_ID } from "@/lib/server/risk";
import { EVENT_BY_ID, R119_BY_ID, SR_BY_ID, fmtKrwThousand } from "@/lib/server/events";
import { LEDGER } from "@/lib/server/ledger";
import riverPlans from "@data/seed/river_plans.json";

/** GET /api/docs?docId=&page= — 근거 원문 뷰어 (FUN-UNE-601002~601004) */
export function GET(req: Request) {
  const u = new URL(req.url);
  const docId = u.searchParams.get("docId") ?? "";
  const page = Number(u.searchParams.get("page")) || undefined;
  const [kind, ...rest] = docId.split(":");
  const id = rest.join(":");

  if (kind === "MAN") {
    const m = MANUALS.find((x) => x.id === id);
    if (!m) return nf();
    const onPage = m.stages.flatMap((s) => s.tasks.filter((t) => t.page === page).map((t) => ({ s, t })));
    const fa = m.fieldActions.filter((f) => f.page === page);
    const img = m.images.find((i) => i.page === page);
    // 대응절차(SOP) — 이 쪽에 걸친 행동카드(본문 전체)와, 카드 없이 이 쪽에 근거를 둔 조치
    const sop = page ? sopOnPage(m.id, page) : null;
    const sm = sop?.m;
    const lines = [
      ...(sop && sm
        ? sop.cards.map((c) => {
            const acts = sop.actionsOf(c.id);
            const step = acts[0] ? `[${stepLabel(sm, acts[0].step)}] ` : "";
            return [
              `${step}행동카드 ${codeLabel(sm, c.code)} ${c.name}`,
              ...(c.summary ? [`   - 조치내용: ${c.summary}`] : []),
              ...(c.orgs.lead ? [`   - 주관: ${c.orgs.lead}${c.orgs.support?.length ? ` · 지원: ${c.orgs.support.join(", ")}` : ""}${c.orgs.collab?.length ? ` · 협업: ${c.orgs.collab.join(", ")}` : ""}`] : []),
              ...(acts.length ? [`   - 연결된 조치: ${acts.map((a) => `${a.code ? codeLabel(sm, a.code) + " " : ""}${a.name}`).join(" / ")}`] : []),
              "",
              cardText(c),
            ].join("\n");
          })
        : []),
      ...(sop && sm
        ? sop.actions.map((a) =>
            [
              `[${stepLabel(sm, a.step)}] ${a.code ? codeLabel(sm, a.code) + " " : ""}${a.name}${a.condition ? ` (${a.condition})` : ""}`,
              ...a.details.map((d) => `   ${d.seq}. ${d.title}${d.content ? "\n      " + d.content.split("\n").join("\n      ") : ""}`),
              ...(a.notes ?? []).map((n) => `   ※ ${n}`),
            ].join("\n"),
          )
        : []),
      ...onPage.map(({ s, t }) => `[${s.name.replace(/\s*\(.*\)/, "")}] ${t.code ? t.code + " " : ""}${t.task}${t.owner ? `\n   - 담당: ${t.owner}` : ""}${t.timing ? ` · 시기: ${t.timing}` : ""}`),
      ...fa.map((f) => `[현장조치 · ${f.target}]\n   기준: ${f.criteria}\n${f.actions.map((l) => `   - ${l}`).join("\n")}`),
    ];
    const c0 = sop?.cards[0];
    const a0 = c0 && sop ? sop.actionsOf(c0.id)[0] : sop?.actions[0];
    const heading = sm && a0 ? `${stepLabel(sm, a0.step)} · ${c0 ? `행동카드 ${codeLabel(sm, c0.code)}` : `${a0.code ? codeLabel(sm, a0.code) + " " : ""}${a0.name}`}` : "";
    return J({
      title: m.title,
      kind: "행동매뉴얼",
      region: `${m.region} · ${m.responsibleDept} · ${m.version.split(" (")[0]}`,
      page,
      pageCount: m.pageCount,
      heading: heading || (onPage[0]?.s.name ?? fa[0]?.target ?? img?.caption ?? ""),
      text: lines.length ? `이 쪽의 매뉴얼 조치 내용 (원문 정리)\n\n${lines.join("\n\n")}` : "이 쪽의 구조화 데이터가 없습니다. 아래 원문 이미지를 확인하세요.",
      image: img ? `/docs/manual/${img.file}` : undefined,
      downloadable: false,
      meta: [
        { label: "문서", value: m.file },
        { label: "쪽번호 규칙", value: m.pageNote },
        { label: "공개 등급", value: "공개 (지자체 누리집 게시 매뉴얼 · 비상연락망 제외)" },
      ],
    });
  }
  if (kind === "RISK") {
    const o = RISK_BY_ID.get(id);
    if (!o) return nf();
    return J({
      title: o.source.dataset,
      kind: "데이터셋",
      region: `${o.region.sido} ${o.region.sigungu}`,
      heading: `${o.source.file ?? ""} ${o.source.sheet ? `› ${o.source.sheet}` : ""} ${o.source.row ? `› ${o.source.row}행` : ""}`,
      highlight: o.reason,
      downloadable: false,
      meta: [
        ...Object.entries(o.attrs).slice(0, 30).map(([k, v]) => ({ label: k, value: typeof v === "object" ? JSON.stringify(v).replace(/[{}"]/g, "") : String(v ?? "—") })),
        ...(o.plan ? Object.entries(o.plan).slice(0, 12).map(([k, v]) => ({ label: `정비 · ${k}`, value: typeof v === "object" ? JSON.stringify(v).replace(/[{}"]/g, "") : String(v ?? "—") })) : []),
      ],
    });
  }
  if (kind === "EV") {
    const e = EVENT_BY_ID.get(id);
    if (!e) return nf();
    return J({
      title: e.title,
      kind: "재해대장·피해 집계",
      region: e.regions.map((r) => r.sigungu).join(", "),
      heading: `재난마스터 ${e.eventId}${e.ndmsKey ? ` · NDMS ${e.ndmsKey.DSTR_YEAR}/${e.ndmsKey.DSTR_TY_CD}/${e.ndmsKey.DSTR_SN}` : ""}`,
      highlight: e.summary,
      text: e.regions.map((r) => `■ ${r.sigungu} (${r.regionRecordId})\n${r.summary ?? "피해 요약 없음"}${r.facts.length ? "\n" + r.facts.map((f) => `- ${f.fact} [${f.source}]`).join("\n") : ""}`).join("\n\n"),
      downloadable: false,
      meta: [
        { label: "강우 출처", value: e.weather.rainfallSource },
        ...(e.sources ?? []).slice(0, 6).map((s) => ({ label: s.kind, value: s.path.split("/").pop() ?? s.path })),
      ],
    });
  }
  if (kind === "R119") {
    const r = R119_BY_ID.get(id);
    if (!r) return nf();
    return J({
      title: "소방긴급구조정보(표준) — 119 신고",
      kind: "119 신고",
      region: r.신고지역명,
      heading: `${r.신고일시} · ${r.ext.accidentType}`,
      highlight: r.ext.callSummary,
      text: `처리: ${r.ext.result}\n출동: ${r.ext.dispatchUnit}${r.ext.groundedOn ? `\n근거 지점: ${r.ext.groundedOn}` : ""}${r.synthetic ? "\n\n※ 훈련 시나리오 신고 기록입니다. 신고자 개인정보는 표시하지 않습니다." : ""}`,
      downloadable: false,
      meta: Object.entries(r).filter(([k, v]) => typeof v !== "object" && !["synthetic", "privacy"].includes(k)).map(([k, v]) => ({ label: k, value: String(v) })),
    });
  }
  if (kind === "SR") {
    const s = SR_BY_ID.get(id);
    if (!s) return nf();
    return J({
      title: s.title,
      kind: "재난상황 보고서",
      region: `${s.sender ?? ""} → ${s.receiver ?? ""}`,
      heading: `${s.reportKind} ${s.reportNo} · ${s.submittedAt.replace("T", " ")}`,
      highlight: s.overview,
      text: `□ 발생 일시: ${s.occurredAt?.replace("T", " ") ?? "—"}\n□ 장소: ${s.location?.address ?? "—"}\n□ 개요: ${s.overview}\n□ 피해: ${s.damage?.human ? `사망 ${s.damage.human.dead ?? "—"} · 실종 ${s.damage.human.missing ?? "—"} · 부상 ${s.damage.human.injured ?? "—"}` : ""} ${s.damage?.other ?? ""}\n□ 조치 사항\n${s.actions.map((a) => ` - ${a.time ? a.time.replace("T", " ") + " " : ""}${a.action}`).join("\n")}\n□ 향후 계획: ${s.outlook ?? "—"}${typeof s.message === "string" ? `\n\n□ 상황전파 메시지\n${s.message}` : ""}`,
      downloadable: false,
      meta: [{ label: "출처", value: s.synthetic ? "훈련 시나리오 상황보고 (별지 제1호서식)" : `NDMS 실보고서 (${(s.sourceFile ?? "").split("/").pop()})` }],
    });
  }
  if (kind === "LED") {
    const rows = LEDGER.filter((x) => `${x.facility?.시설명 ?? ""} ${x.location_detail} ${x.damage_summary}`.includes(id)).slice(0, 40);
    return J({
      title: "재해대장 (2010~2025) 공공시설 피해·복구",
      kind: "재해대장",
      heading: `'${id}' 포함 레코드 ${rows.length}건`,
      text: rows.map((x) => `${x.date_start} ${x.disaster_name.trim()} | ${x.region.sigungu} ${x.region.emd ?? ""} | ${x.facility?.시설명 ?? ""} (${x.facility?.시설구분 ?? ""})\n   ${x.damage_summary} · 피해 ${fmtKrwThousand(x.damage_amount_krw_thousand)} · 복구비 ${fmtKrwThousand(x.recovery_cost_krw_thousand)}`).join("\n\n"),
      downloadable: false,
      meta: [{ label: "원천", value: "20260708_2010~2025재해대장보고서_New.xlsx (★ 9번 폴더)" }],
    });
  }
  if (kind === "PLAN") {
    const p = (riverPlans as unknown as { rivers: { name: string; planTitle: string; planYear: number; designFreq: string; designFlood_cms: number; requiredFreeboard_m: number; page: number; sections: Record<string, unknown>[]; riskFactors: { factor: string; detail: string; source: string }[] }[] }).rivers.find((r) => r.name === id);
    if (!p) return nf();
    return J({
      title: p.planTitle, kind: "하천기본계획", page: p.page, region: `${p.planYear} 수립 · ${p.designFreq} · 계획홍수량 ${p.designFlood_cms}㎥/s`,
      heading: "제4장 하천정비계획 › 제방 여유고 검토",
      text: [
        `필요 여유고 ${p.requiredFreeboard_m}m (하천설계기준)`,
        "",
        ...p.sections.map((x) => `${x["station"]} (${x["location"]})\n   계획홍수위 ${x["designFloodLevel_m"]}m · 현 제방고 ${x["currentLevee_m"] ?? "무제부"}m · 계획제방고 ${x["planLevee_m"]}m → 여유고 ${x["freeboard_m"] ?? "—"}m [${x["status"]}]`),
        "",
        "위험요인",
        ...p.riskFactors.map((r) => `· ${r.factor} — ${r.detail} (${r.source})`),
      ].join("\n"),
      downloadable: false,
      meta: [{ label: "출처", value: "하천기본계획 보고서" }],
    });
  }
  if (kind === "KMA") {
    return J({ title: id === "live" ? "기상청 기상특보 조회서비스 (실시간)" : "기상특보 — 시연 사건", kind: "기상특보", heading: "apis.data.go.kr/1360000/WthrWrnInfoService", downloadable: false, meta: [{ label: "특보 기준", value: "호우주의보 3시간 60mm·12시간 110mm 이상 예상 / 호우경보 3시간 90mm·12시간 180mm 이상 예상" }] });
  }
  return nf();
}
const nf = () => J({ title: "근거 문서", kind: "-", downloadable: false, meta: [], text: "원문을 찾을 수 없습니다." }, { status: 404 });
