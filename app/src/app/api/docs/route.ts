import { NextResponse } from "next/server";
import { whoami } from "@/lib/server/who";
const J = (b: unknown, init?: ResponseInit) => NextResponse.json(b, init);
import { MANUALS } from "@/lib/server/manual";
import { sopOnPage } from "@/lib/server/sop";
import { cardText, codeLabel, stepLabel } from "@/lib/sop";

/** GET /api/docs?docId=&page= — 행동매뉴얼 원문 뷰어 (MAN:매뉴얼id, 대응절차 보존 기능) */
export async function GET(req: Request) {
  if (!(await whoami(req))) return J({ error: "로그인이 필요합니다." }, { status: 401 });
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

  return nf();
}
const nf = () => J({ title: "근거 문서", kind: "-", downloadable: false, meta: [], text: "원문을 찾을 수 없습니다." }, { status: 404 });
