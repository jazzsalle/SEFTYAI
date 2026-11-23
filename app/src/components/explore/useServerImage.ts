"use client";
import { useEffect, useState } from "react";
import { isWithheldCode } from "@/lib/evidence/rules";

export type ImageState = "loading" | "ok" | "error" | "withheld";

/**
 * 우리 서버가 대신 받아 주는 근거 쪽 이미지·문서 그림(<img src> 로 로그인 쿠키와 함께 부른다)의 상태.
 * 못 받으면 같은 주소를 한 번 더 물어 까닭 코드를 읽는다 — T3Q 가 개인정보 때문에 주지 않은 것(403 PAGE_IMAGE_WITHHELD · FIGURE_WITHHELD)은
 * 「불러오지 못함」과 따로 알린다(개발서버 imageWithheld — FUN-UFR-903005 작업 중 반영분).
 */
export function useServerImage(src: string | null) {
  const [state, setState] = useState<ImageState>(src ? "loading" : "error");
  useEffect(() => setState(src ? "loading" : "error"), [src]);
  const onLoad = () => setState("ok");
  const onError = () => {
    if (!src) return setState("error");
    fetch(src)
      .then((r) => (r.ok ? null : r.json().catch(() => null)))
      .then((j: { code?: unknown } | null) => setState(isWithheldCode(j?.code) ? "withheld" : "error"))
      .catch(() => setState("error"));
  };
  return { state, onLoad, onError };
}
