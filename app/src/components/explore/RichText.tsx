"use client";
import { Fragment } from "react";
import type { Citation, EntityRef } from "@/lib/contract/agent";
import { useExplore } from "./ExploreCtx";

const ICON: Record<string, string> = { risk: "⚑", river: "≈", event: "◷", report119: "☎", damage: "▣", doc: "▤", advisory: "⚠", region: "◎" };

export function EntChip({ e }: { e: EntityRef }) {
  const x = useExplore();
  return (
    <span
      role="button"
      tabIndex={0}
      className={`ent t-${e.type} ${x.hovered === e.id ? "hot" : ""}`}
      onMouseEnter={() => x.hover(e.id)}
      onMouseLeave={() => x.hover(null)}
      onClick={() => x.openDetail(e)}
      onKeyDown={(ev) => ev.key === "Enter" && x.openDetail(e)}
      title={`${e.category ?? ""} ${e.name} — 클릭하면 상세, 마우스를 올리면 지도에 표시`}
    >
      <span className="eic">{ICON[e.type] ?? "●"}</span>
      {e.name}
    </span>
  );
}

export function CiteMark({ c, n }: { c: Citation; n: string }) {
  const x = useExplore();
  return (
    <button className="cite" title={`${c.title}${c.page ? ` p.${c.page}` : ""}${c.locator ? ` · ${c.locator}` : ""}`} onClick={() => x.openCitation(c)}>
      {n}
    </button>
  );
}

/** 토큰 : {{e:ID}} 엔티티 · [[c1]] 근거 · **굵게** */
export function RichText({ text }: { text: string }) {
  const x = useExplore();
  const parts = text.split(/(\{\{e:[^}]+\}\}|\[\[c\d+\]\]|\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (!p) return null;
        const em = p.match(/^\{\{e:([^}]+)\}\}$/);
        if (em) {
          const e = x.entityById(em[1]);
          return e ? <EntChip key={i} e={e} /> : <Fragment key={i}>{em[1]}</Fragment>;
        }
        const cm = p.match(/^\[\[(c\d+)\]\]$/);
        if (cm) {
          const c = x.citationById(cm[1]);
          return c ? <CiteMark key={i} c={c} n={cm[1].slice(1)} /> : null;
        }
        const bm = p.match(/^\*\*([^*]+)\*\*$/);
        if (bm) return <b key={i}>{bm[1]}</b>;
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}
