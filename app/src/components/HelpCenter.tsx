"use client";
/**
 * 온라인 도움말 (UFR-008-001-06 · SCR-UNE-102002)
 *  · 모든 화면(로그인 포함) 같은 위치 — 화면 오른쪽 위 [도움말] 버튼 · 키보드 ? 로 열기 · Esc 로 닫기(입력 중에는 동작하지 않음) — 우리 틀
 *  · 글과 짜임은 개발서버 HelpModal 대로(R60): 지금 보는 화면 · 이렇게 질문해 보세요(브리핑 세트 항목, 누르면 바로 질문) · 전체 도움말(접었다 폄),
 *    검색하면 걸린 묶음·줄만. 시스템 운영자는 사용자 매뉴얼 ↔ 운영자 매뉴얼을 단추로 오간다. 끝 줄 「문의처 · 확정 후 기재」
 *  · 내용은 lib/help.ts
 */
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ADMIN_SECTIONS, HELP_SECTIONS, screenHelpOf, searchSections, type HelpSection } from "@/lib/help";
import { useBriefingSet } from "@/lib/briefing";
import { useSession } from "@/lib/session";

/** 예시 질문 수(개발서버 HelpModal SampleCount) */
const SAMPLE_COUNT = 3;

/** 다른 화면에서 도움말을 특정 묶음을 펼친 채로 여는 방법 : openHelp("account") */
export function openHelp(sectionId?: string) {
  window.dispatchEvent(new CustomEvent("sa-help", { detail: sectionId }));
}

export default function HelpCenter() {
  const path = usePathname() ?? "/";
  const router = useRouter();
  const { account } = useSession();
  const op = account?.role === "운영자";
  const [open, setOpen] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [q, setQ] = useState("");
  const [opened, setOpened] = useState<string[]>([]);
  const btn = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLInputElement>(null);

  const mine = (s: HelpSection) => !s.roles || (!!account && s.roles.includes(account.role));
  const sections = useMemo(() => (admin && op ? ADMIN_SECTIONS : HELP_SECTIONS).filter(mine), [admin, op, account]); // eslint-disable-line react-hooks/exhaustive-deps
  const searching = q.trim() !== "";
  const found = useMemo(() => (searching ? searchSections(q, sections) : sections), [q, searching, sections]);
  const screen = screenHelpOf(path);

  const show = (section?: string) => {
    setOpen(true);
    setQ("");
    setAdmin(op);
    setOpened(section ? [section] : []);
    window.setTimeout(() => box.current?.focus(), 60);
  };
  const close = () => {
    setOpen(false);
    btn.current?.focus();
  };
  const switchTo = (next: boolean) => {
    setAdmin(next);
    setQ("");
    setOpened([]);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
      if (e.key === "Escape" && open) { e.preventDefault(); close(); }
      else if (e.key === "?" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); if (open) close(); else show(); }
    };
    const onEvt = (e: Event) => show((e as CustomEvent<string | undefined>).detail);
    window.addEventListener("keydown", onKey);
    window.addEventListener("sa-help", onEvt);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("sa-help", onEvt); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, path, op]);

  const ask = (text: string) => {
    close();
    router.push(`/explore?q=${encodeURIComponent(text)}`);
  };
  const toggle = (id: string) => setOpened((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const Lines = ({ lines }: { lines: string[] }) => (
    <ul>{lines.map((l) => <li key={l}>{l}</li>)}</ul>
  );

  return (
    <>
      <button ref={btn} className="help-btn" onClick={() => (open ? close() : show())} aria-haspopup="dialog" aria-expanded={open} title="도움말 (단축키 ?)">
        <span aria-hidden>?</span> 도움말
      </button>
      {open && (
        <>
          <div className="ovl help-ovl" onClick={close} />
          <aside className="drawer help-drawer" role="dialog" aria-label="도움말">
            <div className="hd">
              <h2 style={{ fontSize: "var(--fs-hs)" }}>도움말</h2>
              <span className="sp" />
              <button className="btn xs ghost" onClick={close} aria-label="도움말 닫기">닫기 (Esc)</button>
            </div>
            {op && (
              <div className="help-mode">
                <b className="s">{admin ? "운영자 매뉴얼" : "사용자 매뉴얼"}</b>
                <button type="button" className="btn xs" onClick={() => switchTo(!admin)}>{admin ? "사용자 매뉴얼 보기" : "운영자 매뉴얼 보기"}</button>
              </div>
            )}
            <div style={{ padding: "0 22px 8px" }}>
              <input ref={box} type="search" className="input sm" style={{ width: "100%" }} placeholder="도움말 검색어를 입력하세요." value={q} onChange={(e) => setQ(e.target.value)} aria-label="도움말 검색" />
            </div>
            <div className="bd">
              {searching ? (
                found.length === 0 ? (
                  <p className="xs mute2" style={{ marginTop: 12 }}>검색어와 일치하는 도움말이 없습니다. 다른 검색어로 다시 검색하세요.</p>
                ) : (
                  <section aria-label="검색 결과">
                    <h4>검색 결과</h4>
                    {found.map((s) => (
                      <div key={s.id} className="help-item on">
                        <p className="help-q" style={{ margin: 0 }}>{s.title}</p>
                        <div className="help-a"><Lines lines={s.lines} /></div>
                      </div>
                    ))}
                  </section>
                )
              ) : (
                <>
                  {!admin && (
                    <>
                      <section aria-label="지금 보는 화면">
                        <h4>지금 보는 화면 · {screen.name}</h4>
                        {screen.cards.map((c) => (
                          <div key={c.title} className="help-item on">
                            <p className="help-q" style={{ margin: 0 }}>{c.title}</p>
                            <div className="help-a"><Lines lines={c.lines} /></div>
                          </div>
                        ))}
                      </section>
                      <section aria-label="이렇게 질문해 보세요">
                        <h4>이렇게 질문해 보세요</h4>
                        {account ? <Samples onAsk={ask} /> : <p className="xs mute2">예시 질문은 로그인한 뒤에 쓸 수 있습니다.</p>}
                      </section>
                    </>
                  )}
                  <section aria-label={admin ? "운영 안내" : "전체 도움말"}>
                    <h4>{admin ? "운영 안내" : "전체 도움말"}</h4>
                    {sections.map((s) => {
                      const on = opened.includes(s.id);
                      return (
                        <div key={s.id} className={`help-item ${on ? "on" : ""}`}>
                          <button className="help-q" aria-expanded={on} aria-controls={`help-${s.id}`} onClick={() => toggle(s.id)}>
                            <span>{s.title}</span><span aria-hidden>{on ? "−" : "+"}</span>
                          </button>
                          <div id={`help-${s.id}`} className="help-a" hidden={!on}><Lines lines={s.lines} /></div>
                        </div>
                      );
                    })}
                  </section>
                </>
              )}
              <p className="xs mute2 help-contact">문의처 · 확정 후 기재</p>
            </div>
          </aside>
        </>
      )}
    </>
  );
}

/** 예시 질문 = 브리핑 세트에 등록된 항목 앞 셋(개발서버 HelpModal samples) — 도움말을 연 동안만 읽는다 */
function Samples({ onAsk }: { onAsk: (q: string) => void }) {
  const { items } = useBriefingSet();
  const samples = items.slice(0, SAMPLE_COUNT);
  if (!samples.length) return <p className="xs mute2">등록된 브리핑 항목이 없습니다.</p>;
  return (
    <div className="help-ex">
      {samples.map((it) => <button key={it.id} className="qitem" onClick={() => onAsk(it.question)}>{it.question}<span className="cq">질문하기 ›</span></button>)}
    </div>
  );
}
