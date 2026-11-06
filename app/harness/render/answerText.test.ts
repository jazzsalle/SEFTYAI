// 하네스 — 답변 글 화면 처리(lib/answerText, 사용자 결정 2026-11-06 「답변 표시는 개발서버처럼」).
// 개발서버(safetyai_une nia_ai-frontend/src/features/search/lib) answerMarkdown.ts·refMatch.ts·answerRefs.ts·agentRun.ts 의 규칙과 같은 결과인지 본다.
// npx vitest run harness/render
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cleanEntityLinks, displayAnswer, dropHiddenColumns, failureText, hideDbNames, isRefId, mappable, sameThing } from "@/lib/answerText";
import type { T3qRef } from "@/lib/jobTypes";

describe("내부 DB 표 이름 걷기(hideDbNames)", () => {
  it("표 이름만 든 괄호는 괄호째, 남은 표 이름은 앞 쉼표와 함께 — 수치·사건 ID·문장은 그대로", () => {
    expect(hideDbNames("과거 침수흔적(`flood.trace`) 중 저지대 3건")).toBe("과거 침수흔적 중 저지대 3건");
    expect(hideDbNames("- **침수흔적 자료 (`flood.trace`, `gis.flood_trace`)**: 12건")).toBe("- **침수흔적 자료**: 12건");
    expect(hideDbNames("재난안전정형 DB - `flood.v_chronic_parcel`, `hazard.zone` 기준 T10107-0001")).toBe("재난안전정형 DB - 기준 T10107-0001");
  });
  it("출처만 적은 줄은 통째로 뺀다", () => {
    expect(hideDbNames("본문\n*(출처: 재난안전정형 DB `weather.v_event_weather`)*\n끝")).toBe("본문\n끝");
    expect(hideDbNames("본문\n- **데이터 출처**: 침수흔적도(`flood.trace`)\n끝")).toBe("본문\n끝");
  });
  it("표 이름이 없으면 글을 건드리지 않는다 — 코드 꼴이어도 점이 없으면 그대로", () => {
    const t = "출처: 행정안전부 자료\n`코드` 와 (괄호)";
    expect(hideDbNames(t)).toBe(t);
  });
});

describe("표의 「정비 내용」 칸 빼기(dropHiddenColumns)", () => {
  it("머리·구분줄·본문을 같은 자리로 — 정렬 표시는 남은 칸 것 그대로", () => {
    const md = "앞 글\n\n| 지구 | 주요 정비 내용 및 상태 | 등급 |\n|:---|---|---:|\n| 사당천 | 단면 확대 \\| 2029년 | 가 |\n| 문현 | — |\n\n뒤 글 정비 내용은 그대로";
    expect(dropHiddenColumns(md)).toBe("앞 글\n\n| 지구 | 등급 |\n|:---|---:|\n| 사당천 | 가 |\n| 문현 |  |\n\n뒤 글 정비 내용은 그대로");
  });
  it("남길 칸이 없거나 숨길 칸이 없으면 그대로, 코드 블록 안은 보지 않는다", () => {
    const only = "| 주요 정비 내용 |\n|---|\n| 가 |";
    expect(dropHiddenColumns(only)).toBe(only);
    const fenced = "```\n| 정비 내용 | 값 |\n|---|---|\n| 가 | 1 |\n```";
    expect(dropHiddenColumns(fenced)).toBe(fenced);
  });
});

describe("대상 링크 이름의 대괄호(cleanEntityLinks)", () => {
  it("이름 안 대괄호는 걷고, 링크 전체를 감싼 바깥 괄호는 짝이 맞을 때만 걷는다", () => {
    expect(cleanEntityLinks("[[부산진구] 문현1지구](#ref:r6) 확인")).toBe("[부산진구 문현1지구](#ref:r6) 확인");
    expect(cleanEntityLinks("[[초량](#ref:r1)]")).toBe("[초량](#ref:r1)");
    expect(cleanEntityLinks("[[초량](#ref:r1) 끝")).toBe("[[초량](#ref:r1) 끝");
    expect(cleanEntityLinks("[외부](https://a.b) [그대로](#ref:r2)")).toBe("[외부](https://a.b) [그대로](#ref:r2)");
  });
});

describe("대상 링크 맞춤(sameThing·isRefId·mappable)", () => {
  const ref = (display_name: string | null, map: Record<string, unknown> = {}): T3qRef => ({ ref: "r1", entity_type: "RISK_AREA", display_name, map: { key: "k", value: "1", draw: "point", ...map } as T3qRef["map"] });
  it("같은 이름이거나 한쪽이 다른 쪽을 품으면 같다 — 이름이 없으면 믿지 않는다", () => {
    expect(sameThing("녹번1·2 지구", ref("녹번1"))).toBe(true);
    expect(sameThing("노원", ref("노원지하차도"))).toBe(true);
    expect(sameThing("내가평교", ref("덕산지구"))).toBe(false);
    expect(sameThing("초량", ref(null))).toBe(false);
    expect(sameThing(" ", ref("초량"))).toBe(false);
  });
  it("번호 그 자체인 글자", () => {
    expect(isRefId("#ref:r100")).toBe(true);
    expect(isRefId("ref:r1")).toBe(true);
    expect(isRefId("r1 지구")).toBe(false);
  });
  it("위치 없음(map.has_geometry: false)만 링크에서 뺀다 — 칸이 없으면 남긴다", () => {
    expect(mappable(ref("가", { has_geometry: false }))).toBe(false);
    expect(mappable(ref("가", { has_geometry: true }))).toBe(true);
    expect(mappable(ref("가"))).toBe(true);
  });
});

describe("실패 안내 문구(failureText)", () => {
  it("개발서버와 같은 문장", () => {
    expect(failureText("TIMEOUT")).toBe("질의가 제한 시간을 넘겼습니다. 조건을 좁혀 다시 시도하세요.");
    expect(failureText("CANCELLED")).toBe("질의를 취소했습니다.");
    expect(failureText("LOST")).toBe("답변을 불러오지 못했습니다.");
    expect(failureText("FAILED")).toBe("답변을 불러오지 못했습니다.");
  });
});

describe("녹화 답 전체 — 화면 처리 뒤", () => {
  const REC = join(__dirname, "..", "recordings");
  const texts: string[] = [];
  for (const f of readdirSync(REC, { recursive: true }) as string[]) {
    if (!f.endsWith(".json")) continue;
    const j = JSON.parse(readFileSync(join(REC, f), "utf8"));
    for (const fin of [...(j.runs ?? []).map((r: { final: unknown }) => r.final), ...(j.final ? [j.final] : [])]) {
      if (typeof fin?.result?.answer === "string") texts.push(fin.result.answer);
    }
  }
  it("DB 표 이름·「정비 내용」 머리글·이름 속 대괄호 링크가 남지 않는다", () => {
    expect(texts.some((t) => /`[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_.]*`/.test(t))).toBe(true);
    for (const t of texts) {
      const d = displayAnswer(t);
      expect(d).not.toMatch(/`[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_.]*`/);
      expect(d).not.toMatch(/^\s*\|.*정비\s*내용.*\|\s*$\n^\s*\|?\s*:?-/m);
      expect(d).not.toMatch(/\[[^\]\n]*\[[^\]\n]*\][^\]\n]*\]\(#ref:/);
    }
  });
  it("처리할 것이 없는 글은 그대로", () => {
    const t = "### 결론\n\n부산 **도심 저지대)**입니다. [초량제1지하차도](#ref:r1)\n\n| 구분 | 길이 |\n|---|---|\n| 가<br>나 | 125m |";
    expect(displayAnswer(t)).toBe(t);
  });
});
