// 글자 크기는 토큰(var(--fs-*))이나 calc(Npx * var(--fs-scale)) 로만 — px 를 바로 적으면 [글자 크기] 메뉴를 따라 커지지 않는다(R58, 2026-11-07).
// npx vitest run harness/devsync/fontPx
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { FONT_TOKENS } from "@/lib/fontScale";

const SRC = join(__dirname, "../../src");
const files = (d: string, out: string[] = []): string[] => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) files(p, out);
    else if (/\.(css|tsx?)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
  }
  return out;
};
const ALL = files(SRC);
const rel = (p: string) => relative(SRC, p).split(sep).join("/");

/** 예외 — 꼭 고정 px 여야 하는 곳만 「파일: 까닭」으로 적는다(지금은 없음) */
const ALLOW: Record<string, string> = {};

const hits = (re: RegExp, pick: (p: string) => boolean) =>
  ALL.filter(pick).flatMap((p) => {
    if (ALLOW[rel(p)]) return [];
    return readFileSync(p, "utf8").split(/\r?\n/).flatMap((line, i) => (re.test(line) ? [`${rel(p)}:${i + 1} ${line.trim().slice(0, 120)}`] : []));
  });

describe("글자 크기 px 금지(R58)", () => {
  it("CSS 에 font-size: NNpx 가 없다", () => {
    expect(hits(/font-size\s*:\s*[0-9.]+px/i, (p) => p.endsWith(".css"))).toEqual([]);
  });
  it("tsx 인라인 fontSize 에 숫자·px 를 바로 쓰지 않는다", () => {
    expect(hits(/fontSize\s*:\s*(["'`]\s*)?[0-9.]+(px)?\s*["'`]?\s*[,}]/, (p) => /\.tsx?$/.test(p))).toEqual([]);
  });
  it("캔버스 글꼴 문자열(font: \"700 12px …\")에 px 를 바로 쓰지 않는다 — scaledPx() 로", () => {
    expect(hits(/font\s*:\s*["'`][^"'`]*\b[0-9.]+px/, (p) => /\.tsx?$/.test(p))).toEqual([]);
  });
  it("토큰은 calc(기본px * var(--fs-scale)) 이고 배율 기본은 1", () => {
    const css = readFileSync(join(SRC, "app/globals.css"), "utf8");
    expect(css).toMatch(/--fs-scale:\s*1;/);
    for (const [name, px] of Object.entries(FONT_TOKENS)) expect(css).toContain(`${name}: calc(${px}px * var(--fs-scale));`);
  });
});
