import "server-only";
import { AgentResponse, type AgentRequest, type QueryContext, type RegionId } from "../../contract/agent";
import { EVENT_BY_ID } from "../events";
import { RISK_BY_ID, categoriesFromText } from "../risk";
import { Answer } from "./core";
import {
  RIVERS, compose119, composeBriefing, composeClarify, composeEvent, composeManual, composeObject, composeRisk, composeRiver, composeSimilar, composeWeather, matchEvent, matchRisk, matchRiver,
} from "./composers";

const RE = {
  briefing: /브리핑|현재\s*상황|상황\s*(정리|요약)|한\s*번에\s*정리/,
  similar: /과거|비슷|유사|예전|잠겼|침수\s*(됐|되었|했)|피해.{0,6}(있었|났)|그때|당시/,
  manual: /해야|할\s*일|절차|매뉴얼|대응\s*(방법|요령)?|조치|뭘\s*해|무엇을\s*해|어떻게\s*해/,
  r119: /119|신고/,
  weather: /특보|기상|강우|비\s*가|수위|날씨|호우\s*(상황|현황)/,
  risk: /위험|취약|어디|어느\s*곳|대상|현황|목록|관리/,
};

/** 질문 속 지역·강우를 조건으로 흡수 */
function enrich(q: string, ctx: QueryContext): QueryContext {
  const c = { ...ctx, hydro: { ...(ctx.hydro ?? {}) } };
  const reg: [RegExp, RegionId][] = [[/부산/, "busan"], [/영천/, "yeongcheon"], [/인제/, "inje"]];
  const hit = reg.filter(([re]) => re.test(q));
  if (hit.length === 1) c.region = hit[0][1];
  const m1 = q.match(/(시간\s*당|1\s*시간|시우량)\s*(\d{2,3}(?:\.\d)?)\s*(mm|㎜|밀리)/);
  if (m1) c.hydro.rain1h = Number(m1[2]);
  const mt = q.match(/누적\s*(\d{2,4})\s*(mm|㎜)/);
  if (mt) c.hydro.rainTotal = Number(mt[1]);
  return c;
}

export function classify(q: string, ctx: QueryContext, presetKey?: string): { intent: string; run: (a: Answer) => void } {
  switch (presetKey) {
    case "briefing": return { intent: "briefing", run: (a) => composeBriefing(a, ctx) };
    case "wx": return { intent: "weather", run: (a) => composeWeather(a, ctx) };
    case "risk": return { intent: "risk", run: (a) => composeRisk(a, ctx, q) };
    case "similar": return { intent: "similar", run: (a) => composeSimilar(a, ctx) };
    case "manual": return { intent: "manual", run: (a) => composeManual(a, ctx, q) };
    case "report119": return { intent: "report119", run: (a) => compose119(a, ctx) };
  }
  // 참조대상 지정 질의
  const ref = ctx.refEntity;
  if (ref && !RE.briefing.test(q)) {
    if (ref.type === "risk" && RISK_BY_ID.get(ref.id) && !(RE.similar.test(q) && !/주변|이\s*곳|여기/.test(q))) return { intent: "object", run: (a) => composeObject(a, ctx, RISK_BY_ID.get(ref.id)!) };
    if (ref.type === "event" && EVENT_BY_ID.get(ref.id) && !RE.manual.test(q)) return { intent: "event", run: (a) => composeEvent(a, ctx, EVENT_BY_ID.get(ref.id)!) };
    if (ref.type === "river") {
      const r = RIVERS.find((x) => x.riverId === ref.id);
      if (r) return { intent: "river", run: (a) => composeRiver(a, ctx, r) };
    }
  }
  if (RE.briefing.test(q)) return { intent: "briefing", run: (a) => composeBriefing(a, ctx) };

  const ev = matchEvent(q, ctx.region);
  if (ev && !/지금|이번에|오면/.test(q)) return { intent: "event", run: (a) => composeEvent(a, ctx, ev) };
  if (/이번\s*(사건|호우)|진행\s*중/.test(q) && RE.r119.test(q)) return { intent: "report119", run: (a) => compose119(a, ctx) };

  const obj = matchRisk(q, ctx.region);
  if (obj) return { intent: "object", run: (a) => composeObject(a, ctx, obj) };
  const river = matchRiver(q, ctx.region);
  const cats = categoriesFromText(q);

  if (RE.r119.test(q) && !RE.manual.test(q)) return { intent: "report119", run: (a) => compose119(a, ctx) };
  if (river && !/지금|이번에|오면/.test(q) && (RE.similar.test(q) || /주변|구간|통제|기준|언제/.test(q))) return { intent: "river", run: (a) => composeRiver(a, ctx, river) };
  if (RE.similar.test(q)) return { intent: "similar", run: (a) => composeSimilar(a, ctx) };
  if (river && !cats.length) return { intent: "river", run: (a) => composeRiver(a, ctx, river) };
  if (cats.length && (RE.risk.test(q) || /기준|왜|언제|통제|철수/.test(q))) return { intent: "risk", run: (a) => composeRisk(a, ctx, q) };
  if (RE.manual.test(q) || (RE.r119.test(q) && RE.manual.test(q))) return { intent: "manual", run: (a) => composeManual(a, ctx, q) };
  if (cats.length) return { intent: "risk", run: (a) => composeRisk(a, ctx, q) };
  if (RE.weather.test(q) && !RE.risk.test(q)) return { intent: "weather", run: (a) => composeWeather(a, ctx) };
  if (RE.risk.test(q)) return { intent: "risk", run: (a) => composeRisk(a, ctx, q) };
  if (river) return { intent: "river", run: (a) => composeRiver(a, ctx, river) };
  return { intent: "clarify", run: (a) => composeClarify(a, ctx, q) };
}

export function answer(req: AgentRequest): AgentResponse {
  const t0 = Date.now();
  const ctx = enrich(req.question, req.context);
  const { intent, run } = classify(req.question, ctx, req.presetKey);
  const a = new Answer();
  try {
    run(a);
  } catch (e) {
    console.error("[agent]", intent, e);
    a.blocks = [];
    a.status = "partial";
    a.push({ kind: "notice", tone: "danger", text: "답변을 구성하는 중 일부 데이터를 조회하지 못했습니다. 다시 시도하거나 질문을 바꿔 주세요." });
  }
  if (!a.blocks.length) composeClarify(a, ctx, req.question);
  const res: AgentResponse = {
    requestId: `REQ-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    answeredAt: new Date().toISOString(),
    intent,
    status: a.status,
    title: a.title || req.question.slice(0, 40),
    blocks: a.blocks,
    entities: [...a.ents.values()],
    citations: a.cites,
    followUps: a.followUps.slice(0, 4),
    mapFocus: a.focus.length ? { entityIds: a.focus } : undefined,
    trace: { apis: [...a.apis], datasets: [...a.datasets], elapsedMs: Date.now() - t0 + 900 },
  };
  return AgentResponse.parse(res);
}
