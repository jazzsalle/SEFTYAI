import { fail, json, whoami } from "@/lib/server/who";
import { t3q } from "@/lib/t3q/client";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/t3q/data {api, id?, body?, query?} — T3Q Data API 프록시 (화이트리스트). 봉투는 그대로 돌려준다(R0).
 * 상세 패널(사건·위험객체·하천·계획)과 목록 조회용. ID 는 T3Q 가 준 값을 그대로 쓴다(파싱 금지).
 */
const ID = /^[A-Za-z0-9_.\-가-힣]{1,80}$/;
const ROUTES: Record<string, (id?: string) => { method: "GET" | "POST"; path: string } | null> = {
  "T3Q-04": () => ({ method: "POST", path: "/similar-events/search" }),
  "T3Q-05": () => ({ method: "POST", path: "/risk-knowledge/search" }),
  "T3Q-06": () => ({ method: "POST", path: "/plans/search" }),
  "T3Q-10": (id) => (id ? { method: "GET", path: `/events/${id}` } : null),
  "T3Q-11": (id) => (id ? { method: "POST", path: `/events/${id}/similarity` } : null),
  "T3Q-12": (id) => (id ? { method: "GET", path: `/events/${id}/timeline` } : null),
  "T3Q-13": (id) => (id ? { method: "GET", path: `/events/${id}/damage-response` } : null),
  "T3Q-15": (id) => (id ? { method: "GET", path: `/risk-objects/${id}` } : null),
  "T3Q-16": (id) => (id ? { method: "GET", path: `/rivers/${id}/plan-knowledge` } : null),
  "T3Q-17": (id) => (id ? { method: "GET", path: `/plans/${id}` } : null),
  "T3Q-18": () => ({ method: "POST", path: "/kg/query" }),
  "T3Q-19": () => ({ method: "POST", path: "/evidence/search" }),
  "T3Q-30": () => ({ method: "POST", path: "/flood-traces/search" }),
};

export async function POST(req: Request) {
  const who = await whoami(req);
  if (!who) return fail(401, "로그인이 필요합니다.");
  if (who.mustChangePw) return fail(403, "초기 비밀번호를 먼저 바꿔 주세요.");
  const b = (await req.json().catch(() => null)) as { api?: string; id?: string; body?: unknown; query?: Record<string, string> } | null;
  const route = b?.api ? ROUTES[b.api] : undefined;
  if (!route) return fail(400, "지원하지 않는 조회입니다.");
  if (b!.id && !ID.test(b!.id)) return fail(400, "ID 형식이 맞지 않습니다.");
  const r = route(b!.id ? encodeURIComponent(b!.id) : undefined);
  if (!r) return fail(400, "ID 가 필요합니다.");
  const qs = b!.query ? "?" + new URLSearchParams(b!.query).toString() : "";
  const res = await t3q(r.method, r.path + qs, r.method === "POST" ? (b!.body ?? {}) : undefined);
  if (!res.envelope) return fail(502, res.error ?? "정보를 불러오지 못했습니다.", { http: res.http });
  return json({ api: b!.api, http: res.http, ms: res.ms, envelope: res.body });
}
