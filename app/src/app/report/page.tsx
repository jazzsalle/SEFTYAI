"use client";
import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "@/lib/session";
import { REGIONS } from "@/lib/config";
import { SOURCE_LABEL, type T3qRef } from "@/lib/jobTypes";
import { AnswerMarkdown } from "@/components/answer/Markdown";
import { RawFoot } from "@/components/answer/AnswerCard";
import { statusKo } from "@/lib/labels";
import { SCN_SENT_LABEL, sentWithScenario } from "@/lib/scenario";

/** 대화 인쇄용 — 질문과 T3Q 답 원문을 그대로 (R0) */
function Report() {
  const s = useSession();
  const id = useSearchParams().get("c");
  const conv = s.convs.find((c) => c.id === id);
  useEffect(() => {
    conv?.turns.forEach((t) => t.jobId && s.loadFull(t.jobId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv?.id]);
  if (!conv) return <div className="page"><div className="page-in">대화를 찾을 수 없습니다.</div></div>;
  return (
    <div className="report">
      <div className="no-print" style={{ marginBottom: 12 }}><button className="btn" onClick={() => window.print()}>인쇄</button></div>
      <h1>{conv.title}</h1>
      <div className="xs muted">기준지역 {conv.baseName ?? REGIONS[conv.region]?.name ?? conv.region} · {new Date(conv.updatedAt).toLocaleString("ko-KR")} · 답변은 재난안전 AI 응답 원문입니다.</div>
      {conv.turns.map((t, i) => {
        const raw = t.jobId ? s.full[t.jobId]?.raw : null;
        const scn = t.jobId ? sentWithScenario(s.full[t.jobId]?.request) : false;
        return (
          <section key={t.id} className="rep-turn">
            <h2>{i + 1}. {t.q} <span className="xs muted">({SOURCE_LABEL[t.source]}{scn ? ` · ${SCN_SENT_LABEL}` : ""})</span></h2>
            {raw?.result?.answer ? (
              <AnswerMarkdown text={raw.result.answer} refs={(raw.result.refs ?? []) as T3qRef[]} />
            ) : (
              <p className="muted">답변 없음{raw?.status ? ` (${statusKo(raw.status)})` : ""}</p>
            )}
            {raw && <RawFoot raw={raw} />}
            {raw?.meta?.base_time && <div className="xs muted">데이터 기준 {raw.meta.base_time}</div>}
          </section>
        );
      })}
    </div>
  );
}

export default function ReportPage() {
  return (
    <Suspense fallback={null}>
      <Report />
    </Suspense>
  );
}
