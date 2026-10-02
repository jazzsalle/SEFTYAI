"use client";
/** 탐색 화면 밖(재난사건·카탈로그 등)에서 상세 패널을 재사용하기 위한 경량 컨텍스트 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Citation, EntityRef } from "@/lib/contract/agent";
import { ExploreContext, type ExploreApi } from "./explore/ExploreCtx";
import { DetailPane, DocPane } from "./explore/RightPanel";

export default function StandaloneDetail({ entity, onChange }: { entity: EntityRef; onChange?: (e: EntityRef) => void }) {
  const router = useRouter();
  const [stack, setStack] = useState<EntityRef[]>([]);
  const [doc, setDoc] = useState<Citation | null>(null);
  const cur = stack.at(-1) ?? entity;
  const api: ExploreApi = {
    hovered: null,
    selectedId: cur.id,
    hover: () => {},
    entityById: () => undefined,
    citationById: () => undefined,
    openDetail: (e) => {
      setStack((s) => [...s, e]);
      onChange?.(e);
    },
    openList: () => {},
    openCitation: setDoc,
    openMap: () => router.push(`/explore?q=${encodeURIComponent(`${cur.name} 위치와 주변 위험지역`)}`),
    openWx: () => router.push("/explore?panel=wx"),
    ask: (q) => router.push(`/explore?q=${encodeURIComponent(q)}`),
  };
  return (
    <ExploreContext.Provider value={api}>
      {stack.length > 0 && (
        <div style={{ padding: "12px 24px 0" }}>
          <button className="btn xs ghost" onClick={() => setStack((s) => s.slice(0, -1))}>‹ {stack.length > 1 ? stack[stack.length - 2].name : entity.name}</button>
        </div>
      )}
      <DetailPane key={cur.type + cur.id} e={cur} sub={cur.type === "event" ? "info" : undefined} />
      {doc && (
        <div className="ovl" onClick={() => setDoc(null)}>
          <div className="modal" style={{ width: "min(860px,100%)" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-hd"><span className="sp" /><button className="btn sm" onClick={() => setDoc(null)}>닫기</button></div>
            <div className="modal-bd" style={{ paddingTop: 0 }}><DocPane c={doc} /></div>
          </div>
        </div>
      )}
    </ExploreContext.Provider>
  );
}
