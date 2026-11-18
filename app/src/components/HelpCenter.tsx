"use client";
/**
 * 온라인 도움말 (UFR-008-001-06 · SCR-UNE-102002) — 개발서버 HelpModal(오른쪽 서랍 modal--help) 그대로(2026-11-19 「개발서버와 동일하게」)
 *  · 모든 화면(로그인 포함)의 [도움말] 단추로 연다(openHelp). ✕·Esc 로 닫는다(바깥을 눌러도 닫지 않음 — 공통 창 틀 Dialog)
 *  · 검색칸 → 지금 보는 화면(쪽지) · 이렇게 질문해 보세요(브리핑 세트 앞 셋, 누르면 바로 질문) · 전체 도움말(접었다 폄). 검색하면 걸린 묶음만, 펼친 채로
 *  · 시스템 운영자는 사용자 매뉴얼 ↔ 운영자 매뉴얼을 단추로 오간다. 바닥 고정 「문의처 · 확정 후 기재」
 *  · 내용은 lib/help.ts
 */
import "./helpCenter.css";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { ADMIN_SECTIONS, HELP_SECTIONS, screenHelpOf, searchSections, type HelpSection } from "@/lib/help";
import { useBriefingSet } from "@/lib/briefing";
import { useSession } from "@/lib/session";
import { Dialog } from "./account/Dialog";

/** 예시 질문 수(개발서버 HelpModal SampleCount) */
const SAMPLE_COUNT = 3;

/** 다른 화면에서 도움말을 특정 묶음을 펼친 채로 여는 방법 : openHelp("account") */
export function openHelp(sectionId?: string) {
  window.dispatchEvent(new CustomEvent("sa-help", { detail: sectionId }));
}

export default function HelpCenter() {
  const [open, setOpen] = useState<{ section?: string } | null>(null);
  useEffect(() => {
    const onEvt = (e: Event) => setOpen({ section: (e as CustomEvent<string | undefined>).detail });
    window.addEventListener("sa-help", onEvt);
    return () => window.removeEventListener("sa-help", onEvt);
  }, []);
  return (
    <>
      {/* 머리줄이 없는 화면(보고서 등)의 자리 — 머리줄이 있으면 renewal.css 가 숨긴다 */}
      <button type="button" className="help-btn" onClick={() => setOpen({})} aria-haspopup="dialog">도움말</button>
      {open && <HelpModal section={open.section} onClose={() => setOpen(null)} />}
    </>
  );
}

function HelpModal({ section, onClose }: { section?: string; onClose: () => void }) {
  const id = useId();
  const path = usePathname() ?? "/";
  const router = useRouter();
  const { account } = useSession();
  const op = account?.role === "운영자";
  const [admin, setAdmin] = useState(op);
  const [q, setQ] = useState("");
  const [opened, setOpened] = useState<string[]>(section ? [section] : []);

  const mine = (s: HelpSection) => !s.roles || (!!account && s.roles.includes(account.role));
  const sections = useMemo(() => (admin && op ? ADMIN_SECTIONS : HELP_SECTIONS).filter(mine), [admin, op, account]); // eslint-disable-line react-hooks/exhaustive-deps
  const searching = q.trim() !== "";
  const found = useMemo(() => (searching ? searchSections(q, sections) : sections), [q, searching, sections]);
  const screen = screenHelpOf(path);

  const switchTo = (next: boolean) => {
    setAdmin(next);
    setQ("");
    setOpened([]);
  };
  const ask = (text: string) => {
    onClose();
    router.push(`/explore?q=${encodeURIComponent(text)}`);
  };
  const toggle = (sid: string) => setOpened((p) => (p.includes(sid) ? p.filter((x) => x !== sid) : [...p, sid]));

  return (
    <Dialog title="도움말" drawer className="help-dlg" onClose={onClose} footer={<p className="help-contact">문의처 · 확정 후 기재</p>}>
      {op && (
        <div className="help-mode">
          <p className="help-mode-name">{admin ? "운영자 매뉴얼" : "사용자 매뉴얼"}</p>
          <button type="button" className="help-mode-switch" onClick={() => switchTo(!admin)}>{admin ? "사용자 매뉴얼 보기" : "운영자 매뉴얼 보기"}</button>
        </div>
      )}

      <div className="help-search">
        <label className="sr-only" htmlFor={`${id}-q`}>도움말 검색</label>
        <input id={`${id}-q`} type="search" value={q} placeholder="도움말 검색어를 입력하세요." onChange={(e) => setQ(e.target.value)} />
        <SearchIcon />
      </div>

      <div className="help-scroll">
        {searching ? (
          found.length === 0 ? (
            <p className="help-empty">검색어와 일치하는 도움말이 없습니다. 다른 검색어로 다시 검색하세요.</p>
          ) : (
            <section className="help-block" aria-label="검색 결과">
              <h3 className="help-block-title">검색 결과</h3>
              {found.map((s) => (
                <div className="help-section is-open" key={s.id}>
                  <p className="help-section-title">{s.title}</p>
                  <Lines lines={s.lines} />
                </div>
              ))}
            </section>
          )
        ) : (
          <>
            {!admin && (
              <>
                <section className="help-block" aria-label="지금 보는 화면">
                  <h3 className="help-block-title">지금 보는 화면 · {screen.name}</h3>
                  {screen.cards.map((c) => (
                    <div className="help-card" key={c.title}>
                      <p className="help-card-title"><InfoIcon />{c.title}</p>
                      <Lines lines={c.lines} />
                    </div>
                  ))}
                </section>
                <section className="help-block" aria-label="이렇게 질문해 보세요">
                  <h3 className="help-block-title">이렇게 질문해 보세요</h3>
                  {account ? <Samples onAsk={ask} /> : <p className="help-note">예시 질문은 로그인한 뒤에 쓸 수 있습니다.</p>}
                </section>
              </>
            )}
            <section className="help-block" aria-label={admin ? "운영 안내" : "전체 도움말"}>
              <h3 className="help-block-title">{admin ? "운영 안내" : "전체 도움말"}</h3>
              {sections.map((s) => {
                const on = opened.includes(s.id);
                return (
                  <div className={`help-section${on ? " is-open" : ""}`} key={s.id}>
                    <button type="button" className="help-section-toggle" aria-expanded={on} aria-controls={`${id}-${s.id}`} onClick={() => toggle(s.id)}>
                      {s.title}
                      <ChevronIcon />
                    </button>
                    <div id={`${id}-${s.id}`} hidden={!on}>
                      <Lines lines={s.lines} />
                    </div>
                  </div>
                );
              })}
            </section>
          </>
        )}
      </div>
    </Dialog>
  );
}

/** 예시 질문 = 브리핑 세트에 등록된 항목 앞 셋(개발서버 HelpModal samples) — 도움말을 연 동안만 읽는다 */
function Samples({ onAsk }: { onAsk: (q: string) => void }) {
  const { items } = useBriefingSet();
  const samples = items.slice(0, SAMPLE_COUNT);
  if (!samples.length) return <p className="help-note">등록된 브리핑 항목이 없습니다.</p>;
  return (
    <ul className="help-samples">
      {samples.map((it) => (
        <li key={it.id}>
          <button type="button" onClick={() => onAsk(it.question)}>
            <span>{it.question}</span>
            <ChevronIcon />
          </button>
        </li>
      ))}
    </ul>
  );
}

function Lines({ lines }: { lines: string[] }) {
  return (
    <ul className="help-lines">
      {lines.map((l) => <li key={l}>{l}</li>)}
    </ul>
  );
}

function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <circle cx="9" cy="9" r="5.6" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M13.2 13.2 17 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <circle cx="9" cy="9" r="8" fill="currentColor" />
      <path d="M9 4.4v.9M9 7.6v6" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg className="help-chevron" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="m7.5 4.5 6 5.5-6 5.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
