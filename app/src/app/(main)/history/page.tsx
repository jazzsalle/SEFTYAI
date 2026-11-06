"use client";
/**
 * 대화 이력 목록 (SCR-UNE-203002) — 개발서버 ConversationListPage·useConversationList 그대로(R53).
 *  · 본인 대화만(서버 /api/conversations 가 세션 계정으로 거른다)
 *  · 대화 제목 검색 · 대화기간(YYYY.MM.DD, 처음 = 최근 일주일) · 시·도 / 시·군·구 / 읍·면·동(「전국」 = 기준지역이 전국이었던 대화만) · [조회]
 *  · 「적용된 조건 N」 딱지(✕ 로 떼면 바로 다시 조회) · [초기화](기본값 = 최근 일주일) · 결과 N건
 *  · [선택 삭제] → 「선택한 대화 N건을 삭제하시겠습니까?」 — 실패하면 창을 두고 알림만
 *  · 표: 대화 제목(누르면 그 대화를 연다) · 기준지역 · 질문 건수 · 최종 대화일시(오늘 HH:MM / YYYY.MM.DD) · 한 쪽 10줄
 * 지역 선택지는 머리줄 기준지역과 같은 길(/api/regions — BasePicker loadAreas)
 */
import "./history.css";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, type Conversation } from "@/lib/session";
import { REGIONS } from "@/lib/config";
import { loadAreas } from "@/components/BasePicker";
import { Dialog } from "@/components/account/Dialog";
import type { AreaPick } from "@/lib/baseRegion";
import {
  NATION, PAGE_SIZE, appliedTags, dropTag, filterConvs, initialForm, lastTurnAt, pagerPages, whenLabel, type ConvForm,
} from "@/lib/convList";

/** 표의 기준지역 — 대화를 시작할 때 남긴 이름(R32). 모르면 「-」(빈 값을 전국으로 적지 않는다) */
const regionLabel = (c: Conversation) => c.baseName ?? (c.region === "national" ? "전국" : REGIONS[c.region]?.name) ?? "-";

/** 한 단계 선택지 — parent 가 없으면 빈 목록(꺼진 단계) */
function useAreas(level: "sido" | "sigungu" | "emd", parent: string | null) {
  const [items, setItems] = useState<AreaPick[]>([]);
  useEffect(() => {
    if (parent === null) return setItems([]);
    let alive = true;
    loadAreas(level, parent)
      .then((x) => alive && setItems(x))
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, [level, parent]);
  return items;
}

export default function HistoryPage() {
  const { convs, deleteConvs } = useSession();
  const router = useRouter();
  const [initial] = useState(() => initialForm());
  const [form, setForm] = useState<ConvForm>(initial);
  const [applied, setApplied] = useState<ConvForm>(initial);
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const sidos = useAreas("sido", "");
  const sigungus = useAreas("sigungu", form.sido && form.sido !== NATION ? form.sido : null);
  const emds = useAreas("emd", form.sigungu || null);
  // 딱지 이름은 조회에 쓴 값의 목록에서 찾는다(칸을 고치는 중에도 딱지가 따라 움직이지 않게)
  const tagSigungus = useAreas("sigungu", applied.sido && applied.sido !== NATION ? applied.sido : null);
  const tagEmds = useAreas("emd", applied.sigungu || null);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const list = useMemo(() => filterConvs(convs, applied), [convs, applied]);
  const tags = useMemo(() => {
    const pools = { sido: sidos, sigungu: tagSigungus, emd: tagEmds };
    return appliedTags(applied, (k, code) => pools[k].find((x) => x.code === code)?.name ?? code);
  }, [applied, sidos, tagSigungus, tagEmds]);
  const pageCount = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const at = Math.min(page, pageCount);
  const view = list.slice((at - 1) * PAGE_SIZE, at * PAGE_SIZE);

  const run = (f: ConvForm) => {
    setForm(f);
    setApplied(f);
    setPage(1);
  };
  const search = () => run(form);

  const onPage = view.map((c) => c.id);
  const allPicked = onPage.length > 0 && onPage.every((id) => picked.includes(id));
  const toggle = (id: string) => setPicked((now) => (now.includes(id) ? now.filter((x) => x !== id) : [...now, id]));
  const toggleAll = () => setPicked((now) => (allPicked ? now.filter((id) => !onPage.includes(id)) : [...new Set([...now, ...onPage])]));

  const remove = async () => {
    setDeleting(true);
    try {
      await deleteConvs(picked);
      setConfirming(false);
      setPicked([]);
      setToast("대화를 삭제했습니다.");
    } catch {
      // 실패하면 창을 그대로 두고 알림만 — 다시 누를 수 있어야 한다
      setToast("대화가 삭제되지 않았습니다. 잠시 후 다시 시도하세요.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="page conv-page">
      <main className="conv-body">
        <div className="conv-head">
          <h1 className="conv-title">대화 이력</h1>
          <div className="conv-keyword">
            <label htmlFor="conv-keyword">대화 제목</label>
            <div className="conv-keyword-box">
              <input
                id="conv-keyword"
                type="search"
                placeholder="검색어를 입력하세요."
                value={form.keyword}
                onChange={(e) => setForm({ ...form, keyword: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && search()}
              />
              <button type="button" aria-label="대화 제목으로 검색" onClick={search}>
                <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <section className="conv-filter" aria-label="검색 조건">
          <div className="conv-filter-row">
            <div className="conv-field conv-field--period">
              <span className="conv-label" id="conv-period">대화기간</span>
              <div className="conv-period" role="group" aria-labelledby="conv-period">
                <input type="text" inputMode="numeric" placeholder="YYYY.MM.DD" aria-label="대화기간 시작" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
                <span aria-hidden="true">~</span>
                <input type="text" inputMode="numeric" placeholder="YYYY.MM.DD" aria-label="대화기간 끝" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} />
              </div>
            </div>
            <div className="conv-field">
              <label className="conv-label" htmlFor="conv-sido">시·도</label>
              <select id="conv-sido" value={form.sido} onChange={(e) => setForm({ ...form, sido: e.target.value, sigungu: "", emd: "" })}>
                <option value="">시·도 전체</option>
                {/* 「전국」은 지역 조건 없음과 다르다 — 기준지역이 전국이었던 대화만 고른다 */}
                <option value={NATION}>전국</option>
                {sidos.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}
              </select>
            </div>
            <div className="conv-field">
              <label className="conv-label" htmlFor="conv-sigungu">시·군·구</label>
              <select id="conv-sigungu" value={form.sigungu} disabled={sigungus.length === 0} onChange={(e) => setForm({ ...form, sigungu: e.target.value, emd: "" })}>
                <option value="">시·군·구 전체</option>
                {sigungus.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}
              </select>
            </div>
            <div className="conv-field">
              <label className="conv-label" htmlFor="conv-emd">읍·면·동</label>
              <select id="conv-emd" value={form.emd} disabled={emds.length === 0} onChange={(e) => setForm({ ...form, emd: e.target.value })}>
                <option value="">읍·면·동 전체</option>
                {emds.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}
              </select>
            </div>
            <button type="button" className="conv-search" onClick={search}>조회</button>
          </div>

          <div className="conv-hints">
            <p>YYYY.MM.DD 형식으로 입력하세요. 예: 2026.07.25</p>
            <p>{sigungus.length === 0 ? "시·군·구는 시·도를 먼저 고르면 선택할 수 있습니다." : "읍·면·동은 시·군·구를 먼저 고르면 선택할 수 있습니다."}</p>
          </div>

          {/* 조건 상자 안 맨 아래에 늘 보인다 — 0개여도 자리를 지킨다 */}
          <div className="conv-applied">
            <strong>적용된 조건 {tags.length}</strong>
            <button type="button" className="conv-reset" onClick={() => run(initial)}>
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                <path d="M13 8a5 5 0 1 1-1.6-3.6M13 2v3h-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              초기화
            </button>
            {tags.length === 0 ? (
              <span className="conv-applied-none">적용된 필터가 없습니다. 검색 필터를 통해 상세한 검색을 해보세요.</span>
            ) : (
              <ul className="conv-tags">
                {tags.map((tag) => (
                  <li key={tag.key}>
                    <button type="button" onClick={() => run(dropTag(applied, tag.key))}>
                      {tag.label}
                      <span className="sr-only"> 조건 해제</span>
                      <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <span className="conv-count">결과 <strong>{list.length}</strong>건</span>
          </div>
        </section>

        <div className="conv-actions">
          <button type="button" className="conv-delete" disabled={picked.length === 0} onClick={() => setConfirming(true)}>선택 삭제</button>
        </div>

        <table className="conv-table">
          <caption className="sr-only">대화 이력 목록</caption>
          <thead>
            <tr>
              <th scope="col" className="conv-col-check">
                {view.length > 0 && <input type="checkbox" checked={allPicked} onChange={toggleAll} aria-label="전체 선택" />}
              </th>
              <th scope="col">대화 제목</th>
              <th scope="col" className="conv-col-region">기준지역</th>
              <th scope="col" className="conv-col-count">질문 건수</th>
              <th scope="col" className="conv-col-when">최종 대화일시</th>
            </tr>
          </thead>
          <tbody>
            {view.length === 0 ? (
              <tr>
                {/* 「조건에 맞는 것이 없다」와 「아예 없다」는 다른 말이다 — 기본 기간도 조건이다 */}
                <td colSpan={5} className="conv-state">
                  <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true" focusable="false" className="conv-empty-art">
                    <path d="M12 26h40v22a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2z" fill="#dbe4f4" />
                    <path d="M8 18h48v8H8z" fill="#b9cbe9" />
                    <path d="M26 26h12v6H26z" fill="#8fa9d4" />
                    <path d="M40 14c4-4 9-3 9 1s-5 4-9 1" fill="none" stroke="#8fa9d4" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="3 3" />
                  </svg>
                  {tags.length === 0 ? (
                    <p className="conv-state-head">대화 이력이 없습니다.</p>
                  ) : (
                    <>
                      <p className="conv-state-head">조건에 맞는 대화가 없습니다.</p>
                      <p>검색어나 기간을 바꿔 다시 조회하세요.</p>
                    </>
                  )}
                </td>
              </tr>
            ) : (
              view.map((c) => (
                <tr key={c.id}>
                  <td className="conv-col-check">
                    <input type="checkbox" checked={picked.includes(c.id)} onChange={() => toggle(c.id)} aria-label={`${c.title} 선택`} />
                  </td>
                  <td>
                    <button type="button" className="conv-link" onClick={() => router.push(`/explore?c=${encodeURIComponent(c.id)}`)}>{c.title}</button>
                  </td>
                  <td className="conv-col-region">{regionLabel(c)}</td>
                  <td className="conv-col-count">{c.turns.length}</td>
                  <td className="conv-col-when">{whenLabel(lastTurnAt(c))}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {pageCount > 1 && (
          <nav className="conv-pager" aria-label="쪽 넘기기">
            <button type="button" disabled={at <= 1} onClick={() => setPage(at - 1)}>이전</button>
            {pagerPages(at, pageCount).map((n) => (
              <button key={n} type="button" className={n === at ? "is-current" : undefined} aria-current={n === at ? "page" : undefined} onClick={() => setPage(n)}>{n}</button>
            ))}
            <button type="button" disabled={at >= pageCount} onClick={() => setPage(at + 1)}>다음</button>
          </nav>
        )}
      </main>

      {confirming && (
        <Dialog
          size="sm"
          title={`선택한 대화 ${picked.length}건을 삭제하시겠습니까?`}
          desc="삭제하면 대화 이력에서 사라집니다."
          onClose={() => setConfirming(false)}
          busy={deleting}
          footer={
            <>
              <button type="button" className="acm-btn" onClick={() => setConfirming(false)}>취소</button>
              <button type="button" className="acm-btn pri" disabled={deleting} onClick={remove}>삭제</button>
            </>
          }
        />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
