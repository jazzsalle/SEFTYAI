"use client";
/**
 * 행동카드 본문 — 원문 순서대로 (번호 제목 · 글머리 · ※ 설명 · 표). 표준문안은 복사 버튼.
 * 대응절차 탭의 조치 펼침과 편집 화면 미리보기에서 함께 쓴다.
 */
import { useState } from "react";
import { useSession } from "@/lib/session";
import { codeLabel, type SopCard, type SopCardBlock, type SopManual, type SopOrgs, type SopTemplate } from "@/lib/sop";

const MARK = ["", "○", "-", "·"];

export function CardBlocks({ blocks }: { blocks: SopCardBlock[] }) {
  if (!blocks.length) return <div className="xs mute2">카드 본문이 없습니다.</div>;
  return (
    <div className="sp-cb">
      {blocks.map((b, i) => {
        if (b.k === "h")
          return (
            <div key={i} className="h">
              {b.n}. {b.t}
              {b.note && <span className="hn">※ {b.note}</span>}
            </div>
          );
        if (b.k === "p") return <div key={i} className={`p l${b.lv}`} data-m={b.sym ?? MARK[b.lv]}>{b.t}</div>;
        if (b.k === "note") return <div key={i} className="nt" data-m={b.sym === "*" ? "*" : "※"}>{b.t}</div>;
        if (b.role === "tpl" && b.items?.length) return <Templates key={i} items={b.items} />;
        return (
          <div key={i} className="sp-ct-wrap">
            <table className={`sp-ct ${b.role}`}>
              <tbody>
                {b.rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((c, ci) =>
                      c.h ? (
                        <th key={ci} rowSpan={c.rs} colSpan={c.cs}>{c.t}</th>
                      ) : (
                        <td key={ci} rowSpan={c.rs} colSpan={c.cs}>{c.t}</td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

/** ③ 표준문안 — 원문 그대로, 복사해서 문자·방송 문안으로 씀 */
function Templates({ items }: { items: SopTemplate[] }) {
  const { toast } = useSession();
  const [done, setDone] = useState<number | null>(null);
  const copy = async (i: number, t: string) => {
    try {
      await navigator.clipboard.writeText(t);
      setDone(i);
      toast("표준문안을 복사했습니다. ○ 표시는 상황에 맞게 바꿔 쓰세요.");
      setTimeout(() => setDone((v) => (v === i ? null : v)), 1800);
    } catch {
      toast("복사하지 못했습니다. 문안을 직접 선택해 복사하세요.");
    }
  };
  return (
    <div className="sp-tpl">
      <div className="lb">표준문안</div>
      {items.map((t, i) => (
        <div key={i} className="ti">
          {t.kind && <div className="k">{t.kind}</div>}
          <div className="tx">{t.text}</div>
          <button className="btn xs" onClick={() => copy(i, t.text)}>{done === i ? "복사함" : "복사"}</button>
        </div>
      ))}
    </div>
  );
}

export function Orgs({ o }: { o: SopOrgs | null | undefined }) {
  if (!o || !(o.lead || o.support?.length || o.collab?.length)) return null;
  return (
    <dl className="orgs">
      {o.lead && <><dt>주관</dt><dd>{o.lead}</dd></>}
      {o.support?.length ? <><dt>지원</dt><dd>{o.support.join(", ")}</dd></> : null}
      {o.collab?.length ? <><dt>협업</dt><dd>{o.collab.join(", ")}</dd></> : null}
    </dl>
  );
}

/** 조치 펼침 안의 행동카드 칸 (② 카드 머리 + 본문) */
export default function SopCardView({ m, card, orgs, onPage }: { m: SopManual; card: SopCard; orgs?: SopOrgs | null; onPage: (pdfPage: number) => void }) {
  return (
    <div className="sp-card">
      <div className="ch">
        <span className="kc">행동카드 {codeLabel(m, card.code)}</span>
        <span className="nm">{card.name}</span>
        {card.edit && <span className="ed">{card.edit === "추가" ? "새 카드" : "수정됨"}</span>}
        <span className="sp" />
        {card.pdfPages.map((p) => (
          <button key={p} className="pg" onClick={() => onPage(p)} title="행동카드 원문 쪽">p.{p}</button>
        ))}
      </div>
      {card.summary && <div className="sum"><span className="lb">조치내용</span>{card.summary}</div>}
      <Orgs o={orgs ?? card.orgs} />
      {card.link && <div className="lnk"><span className="lb">연계</span>{card.link}</div>}
      {card.resources?.length ? (
        <div className="res">
          <span className="lb">필요자원</span>
          {card.resources.map((r) => <span key={r} className="tag">{r}</span>)}
        </div>
      ) : null}
      <CardBlocks blocks={card.blocks} />
    </div>
  );
}
