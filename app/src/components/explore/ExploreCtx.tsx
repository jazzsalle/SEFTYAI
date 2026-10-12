"use client";
import { createContext, useContext } from "react";
import type { Citation, EntityRef } from "@/lib/contract/agent";

export type TabKind = "map" | "list" | "detail" | "wx" | "doc" | "sop";
export interface PanelTab {
  key: string;
  kind: TabKind;
  title: string;
  /** 닫을 수 없는 고정 탭 (지자체 계정의 「대응절차」) */
  pinned?: boolean;
  entity?: EntityRef; // detail
  list?: { label: string; items: EntityRef[]; groupKey: string }; // list
  citation?: Citation; // doc
  sub?: string; // detail 하위 탭 초기값
}

export interface ExploreApi {
  openDetail: (e: EntityRef, sub?: string) => void;
  openList: (label: string, groupKey: string, items: EntityRef[]) => void;
  openCitation: (c: Citation) => void;
  openMap: (focusIds?: string[], extra?: EntityRef[]) => void;
  openWx: () => void;
  hover: (id: string | null) => void;
  hovered: string | null;
  ask: (q: string, presetKey?: string, ref?: EntityRef) => void;
  entityById: (id: string) => EntityRef | undefined;
  citationById: (id: string) => Citation | undefined;
  selectedId: string | null;
}

export const ExploreContext = createContext<ExploreApi | null>(null);
export const useExplore = () => {
  const v = useContext(ExploreContext);
  if (!v) throw new Error("ExploreContext 누락");
  return v;
};
