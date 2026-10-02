import "server-only";
import type { Advisory, RegionId } from "../contract/agent";

/**
 * 기상청 기상특보 조회서비스 (data.go.kr WthrWrnInfoService)
 * - getPwnStatus : 현재 발효 중 특보 현황 (t6 = 발효 특보, t7 = 예비특보)
 * CORS 미지원 + 키 보호 → 서버 프록시로만 호출
 */
const BASE = "https://apis.data.go.kr/1360000/WthrWrnInfoService";
const KEY = process.env.KMA_SERVICE_KEY ?? "";

const REGION_KEYS: [RegionId, RegExp][] = [
  ["busan", /부산/],
  ["yeongcheon", /영천/],
  ["inje", /인제/],
];

function kmaTime(v: string | number) {
  const s = String(v);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10) || "00"}:${s.slice(10, 12) || "00"}:00+09:00`;
}

/** "o 호우경보 : 부산, 경상남도(김해, 양산), 강원도(인제평지)" 형태 파싱 */
export function parseStatusText(text: string, issuedAt: string): Advisory[] {
  const out: Advisory[] = [];
  const lines = text.replace(/\r/g, "").split(/\n|(?=o\s)/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const m = line.match(/^o\s*([가-힣]+?)(주의보|경보)\s*:\s*(.+)$/);
    if (!m) continue;
    const [, type, level, areas] = m;
    // 광역 단위로 분해 : "경상북도(영천, 경산)" → 경상북도(영천, 경산)
    const parts = areas.match(/[^,(]+(?:\([^)]*\))?/g)?.map((p) => p.trim()).filter(Boolean) ?? [];
    for (const part of parts) {
      const regionId = REGION_KEYS.find(([, re]) => re.test(part))?.[0];
      out.push({
        id: `KMA-${type}${level}-${part}`.replace(/\s/g, ""),
        type,
        level: level as "경보" | "주의보",
        area: part,
        regionId,
        issuedAt,
        status: "발효",
      });
    }
  }
  return out;
}

export async function fetchLiveAdvisories(): Promise<{ ok: boolean; message: string; advisories: Advisory[]; preliminary: { text: string; at: string }[] }> {
  if (!KEY) return { ok: false, message: "기상청 API 키 미설정 (KMA_SERVICE_KEY)", advisories: [], preliminary: [] };
  try {
    const url = `${BASE}/getPwnStatus?serviceKey=${KEY}&pageNo=1&numOfRows=10&dataType=JSON`;
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    const j = await r.json();
    const code = j?.response?.header?.resultCode;
    if (code !== "00") return { ok: false, message: j?.response?.header?.resultMsg ?? "응답 오류", advisories: [], preliminary: [] };
    const item = [j.response.body.items.item].flat()[0];
    if (!item) return { ok: true, message: "현재 발효 특보 없음", advisories: [], preliminary: [] };
    const at = kmaTime(item.tmFc);
    const t6: string = item.t6 ?? "";
    const t7: string = item.t7 ?? "";
    const advisories = /없\s*음/.test(t6) ? [] : parseStatusText(t6, at);
    const preliminary = /없\s*음/.test(t7)
      ? []
      : t7.replace(/\r/g, "").split("\n").map((s) => s.replace(/^o\s*/, "").trim()).filter(Boolean).map((text) => ({ text, at }));
    return {
      ok: true,
      message: advisories.length ? `발효 특보 ${advisories.length}건 (기상청 ${at.slice(11, 16)} 발표)` : `현재 발효 특보 없음 (기상청 ${at.slice(5, 10).replace("-", ".")} ${at.slice(11, 16)} 발표 기준)`,
      advisories,
      preliminary,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error && e.name === "TimeoutError" ? "기상청 API 응답 지연(TIMEOUT)" : "기상청 API 연결 실패", advisories: [], preliminary: [] };
  }
}
