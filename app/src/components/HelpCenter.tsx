"use client";
/**
 * 온라인 도움말 (UFR-008-001-06)
 *  · 모든 화면(로그인 포함) 같은 위치 — 화면 오른쪽 위 [도움말] 버튼
 *  · 지금 보고 있는 화면의 도움말을 먼저 보여주고, 검색할 수 있다
 *  · 예시 질문을 누르면 현재 기준지역·조건으로 바로 질문한다
 *  · 키보드 : ? 로 열기 · Esc 로 닫기 (입력 중에는 동작하지 않음)
 *  · 내용은 lib/help.ts 에 분리
 */
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { HELP_TOPICS, SCREEN_NAME, type HelpTopic } from "@/lib/help";
import { useSession } from "@/lib/session";

/** 다른 화면에서 도움말을 특정 항목으로 여는 방법 : openHelp("verify") */
export function openHelp(topicId?: string) {
  window.dispatchEvent(new CustomEvent("sa-help", { detail: topicId }));
}

export default function HelpCenter() {
  const path = usePathname() ?? "/";
  const router = useRouter();
  const { account } = useSession();
  const op = account?.role === "운영자";
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cur, setCur] = useState<string | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLInputElement>(null);

  const here = (t: HelpTopic) => t.screens.some((s) => s !== "*" && path.startsWith(s));
  const screen = SCREEN_NAME.find(([p]) => path.startsWith(p))?.[1] ?? "이 화면";
  const list = useMemo(() => {
    const kw = q.trim().toLowerCase();
    const hit = (t: HelpTopic) => !kw || [t.title, ...t.body, ...(t.steps ?? []), ...(t.examples ?? [])].some((x) => x.toLowerCase().includes(kw));
    // 운영관리 도움말은 운영자에게만, 대응절차 도움말은 지자체 계정에만 보인다
    const all = HELP_TOPICS.filter((t) => op || !t.screens.includes("/admin")).filter((t) => !t.roles || (!!account && t.roles.includes(account.role))).filter(hit);
    return { mine: all.filter(here), common: all.filter((t) => t.screens.includes("*")), other: all.filter((t) => !here(t) && !t.screens.includes("*")) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, path, op, account]);

  const show = (topic?: string) => {
    setOpen(true);
    setQ("");
    setCur(topic ?? HELP_TOPICS.find(here)?.id ?? null);
    window.setTimeout(() => box.current?.focus(), 60);
  };
  const close = () => {
    setOpen(false);
    btn.current?.focus();
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
  }, [open, path]);

  const ask = (text: string) => {
    close();
    router.push(`/explore?q=${encodeURIComponent(text)}`);
  };
  const Topic = ({ t }: { t: HelpTopic }) => {
    const on = cur === t.id || !!q.trim();
    return (
      <div className={`help-item ${on ? "on" : ""}`}>
        <button className="help-q" aria-expanded={on} onClick={() => setCur(cur === t.id ? null : t.id)}>
          <span>{t.title}</span><span aria-hidden>{on ? "−" : "+"}</span>
        </button>
        {on && (
          <div className="help-a">
            {t.body.map((b, i) => <p key={i}>{b}</p>)}
            {t.steps && <ol>{t.steps.map((x, i) => <li key={i}>{x}</li>)}</ol>}
            {t.examples && (
              account ? (
                <div className="help-ex">
                  {t.examples.map((x) => <button key={x} className="qitem" onClick={() => ask(x)}>{x}<span className="cq">질문하기 ›</span></button>)}
                </div>
              ) : <ul>{t.examples.map((x) => <li key={x}>{x}</li>)}</ul>
            )}
          </div>
        )}
      </div>
    );
  };
  const none = !list.mine.length && !list.common.length && !list.other.length;

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
              <h2 style={{ fontSize: 19 }}>도움말</h2>
              <span className="xs mute2">지금 화면 : {screen}</span>
              <span className="sp" />
              <button className="btn xs ghost" onClick={close} aria-label="도움말 닫기">닫기 (Esc)</button>
            </div>
            <div style={{ padding: "0 22px 8px" }}>
              <input ref={box} className="input sm" style={{ width: "100%" }} placeholder="도움말 검색 — 예: 특보, 조건, 지도, 판정" value={q} onChange={(e) => setQ(e.target.value)} aria-label="도움말 검색" />
            </div>
            <div className="bd">
              {none && <p className="xs mute2" style={{ marginTop: 12 }}>‘{q}’에 맞는 도움말이 없습니다. 다른 말로 검색해 보세요.</p>}
              {list.mine.length > 0 && <h4>이 화면 도움말</h4>}
              {list.mine.map((t) => <Topic key={t.id} t={t} />)}
              {list.common.length > 0 && <h4>공통</h4>}
              {list.common.map((t) => <Topic key={t.id} t={t} />)}
              {list.other.length > 0 && <h4>다른 화면</h4>}
              {list.other.map((t) => <Topic key={t.id} t={t} />)}
              <p className="xs mute2" style={{ marginTop: 18 }}>어느 화면에서나 오른쪽 위 [도움말] 버튼 또는 키보드 ? 로 열고, Esc 로 닫습니다.</p>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
