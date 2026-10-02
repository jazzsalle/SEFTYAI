import "server-only";
import raw from "@data/seed/manual_procedures.json";
import type { RegionId } from "../contract/agent";

export interface ManualTask {
  seq: number;
  code?: string;
  task: string;
  owner?: string;
  timing?: string;
  checkpoints?: string[];
  relatedObjects?: string[];
  page?: number;
}
export interface ManualStage {
  stageId: string;
  name: string;
  trigger: string;
  emergencyLevel: string;
  tasks: ManualTask[];
}
export interface Manual {
  id: string;
  region: string;
  title: string;
  version: string;
  date: string;
  file: string;
  pageCount: number;
  responsibleDept: string;
  pageNote: string;
  keyPages: Record<string, number | number[]>;
  images: { file: string; page: number; caption: string }[];
  stages: ManualStage[];
  fieldActions: { target: string; criteria: string; actions: string[]; page?: number }[];
  reporting: { what: string; to: string; when: string; page?: number }[];
  taskCount: number;
}

export const MANUALS = (raw as unknown as { manuals: Manual[] }).manuals;

export const MANUAL_BY_REGION: Record<Exclude<RegionId, "national">, Manual> = {
  busan: MANUALS.find((m) => m.id.includes("BUSAN"))!,
  yeongcheon: MANUALS.find((m) => m.id.includes("YEONGCHEON"))!,
  inje: MANUALS.find((m) => m.id.includes("INJE"))!,
};

/** 특보 → 매뉴얼 단계 인덱스 (0: 예비특보, 1: 주의보, 2: 경보, 피해발생, 복구) */
export function stageFor(m: Manual, level: "예비특보" | "주의보" | "경보" | "피해" | "복구" | null): ManualStage | null {
  const by = (re: RegExp) => m.stages.find((s) => re.test(s.name)) ?? null;
  switch (level) {
    case "예비특보":
      return by(/예비특보/);
    case "주의보":
      return by(/주의보/);
    case "경보":
      return by(/호우경보|경보 발/);
    case "피해":
      return by(/피해 발생|신고/);
    case "복구":
      return by(/해제|복구/);
    default:
      return null;
  }
}

export const STAGE_STEPS = ["예비특보", "주의보(비상1)", "경보(비상2)", "대규모 피해(비상3)", "수습·복구"];
export const stepIndex = (level: string | null) => (level === "예비특보" ? 0 : level === "주의보" ? 1 : level === "경보" ? 2 : level === "피해" ? 3 : level === "복구" ? 4 : -1);

/** 매뉴얼 원문 이미지 (공개 경로) */
export const manualImage = (m: Manual, page: number) => {
  const img = m.images.find((i) => i.page === page);
  return img ? `/docs/manual/${img.file}` : undefined;
};
export const pageInRange = (m: Manual, key: string) => m.keyPages[key];
