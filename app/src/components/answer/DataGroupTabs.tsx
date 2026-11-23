"use client";
import { useState } from "react";
import { GROUP_PAGE, type DataGroup, type GroupItem, type GroupRef } from "@/lib/dataGroups";

/**
 * 데이터군 탭 — 개발서버 features/search/components/DataGroupTabs 이식(SCR-UNE-203001 9번 · 12번, FUN-UFR-303008 · 302003).
 * T3Q result_groups 를 그대로 그린다. 군이 하나면 탭 없이 「유사재난 사례 3건」 머리글만. 군마다 5건씩 「N건 더보기」.
 * 이름을 누르면 유사사례는 재난사건 상세, 그 밖의 객체는 상세·지도, 문서는 우측 「근거 문서」. 조건과 다른 객체는 구분 표시(글자로).
 */
export default function DataGroupTabs({ id, groups, selected, onSelect, onEntity, onEvent, onDoc }: {
  id: string;
  groups: DataGroup[];
  /** 고른 군의 key. 없거나 목록에 없으면 첫 군 */
  selected: string | null;
  onSelect: (key: string) => void;
  onEntity: (ref: GroupRef) => void;
  /** 유사사례(EVENT) — 재난사건 상세 */
  onEvent?: (item: GroupItem) => void;
  /** 문서(근거 번호) — 우측 「근거 문서」 */
  onDoc?: (doc: string) => void;
}) {
  const [shownBy, setShownBy] = useState<Record<string, number>>({});
  if (groups.length === 0) return null;
  const group = groups.find((g) => g.key === selected) ?? groups[0];
  const shown = shownBy[group.key] ?? GROUP_PAGE;
  const visible = group.items.slice(0, shown);
  const rest = group.items.length - visible.length;
  const tabId = (key: string) => `${id}-tab-${key}`;
  return (
    <section className="dg" id={id} tabIndex={-1} aria-label="데이터군">
      {groups.length > 1 ? (
        <div className="dg-tabs" role="tablist" aria-label="데이터군">
          {groups.map((g) => (
            <button key={g.key} id={tabId(g.key)} type="button" role="tab" className="dg-tab" aria-selected={g.key === group.key} aria-controls={`${id}-panel`} onClick={() => onSelect(g.key)}>
              {g.label} <b>{g.count}</b>
            </button>
          ))}
        </div>
      ) : (
        <h4 className="dg-head">
          {group.label} {group.count}
          {group.unit}
        </h4>
      )}
      <ul className="dg-list" id={`${id}-panel`} role={groups.length > 1 ? "tabpanel" : undefined} aria-labelledby={groups.length > 1 ? tabId(group.key) : undefined}>
        {visible.map((it) => (
          <li key={it.key}>
            <ItemName item={it} onEntity={onEntity} onEvent={onEvent} onDoc={onDoc} />
            {(it.meta.length > 0 || it.marks.length > 0) && (
              <span className="dg-meta">
                {it.meta.join(" · ")}
                {it.marks.map((m) => <span key={m} className="dg-mark">{m}</span>)}
              </span>
            )}
          </li>
        ))}
      </ul>
      {rest > 0 && (
        <button type="button" className="ans-lnk dg-more" onClick={() => setShownBy((m) => ({ ...m, [group.key]: shown + GROUP_PAGE }))}>
          {rest}
          {group.unit} 더보기
        </button>
      )}
    </section>
  );
}

function ItemName({ item, onEntity, onEvent, onDoc }: { item: GroupItem; onEntity: (ref: GroupRef) => void; onEvent?: (item: GroupItem) => void; onDoc?: (doc: string) => void }) {
  const ref = item.ref;
  if (ref) {
    const open = ref.entity_type === "EVENT" && onEvent ? () => onEvent(item) : () => onEntity(ref);
    return <button type="button" className="ans-lnk dg-name" onClick={open}>{item.name}</button>;
  }
  if (item.doc && onDoc) {
    const doc = item.doc;
    return <button type="button" className="ans-lnk dg-name" title={`${item.name} — 우측 패널에서 보기`} onClick={() => onDoc(doc)}>{item.name}</button>;
  }
  if (item.docUrl && /^https?:\/\//i.test(item.docUrl)) {
    return <a className="ans-lnk dg-name" href={item.docUrl} target="_blank" rel="noopener noreferrer" title={`${item.name} 원문 보기 (새 창)`}>{item.name}</a>;
  }
  return <span className="dg-name">{item.name}</span>;
}
