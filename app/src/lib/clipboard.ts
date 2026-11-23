/**
 * 클립보드에 일반 텍스트 하나를 넣는다(개발서버 shared/lib/clipboard.ts copyPlain — FUN-UFR-303006 「일반 텍스트 하나로 복사」).
 * navigator.clipboard 는 안전한 주소(https · localhost)에서만 열린다. 막히면 복사 이벤트(execCommand)로 대신한다. 성공하면 true.
 */
export async function copyPlain(plain: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard && (typeof window === "undefined" || window.isSecureContext !== false)) {
    try {
      await navigator.clipboard.writeText(plain);
      return true;
    } catch {
      // 아래 옛 방식으로 한 번 더
    }
  }
  return copyByEvent(plain);
}

function copyByEvent(plain: string): boolean {
  if (typeof document === "undefined" || typeof document.execCommand !== "function") return false;
  const onCopy = (e: ClipboardEvent) => {
    e.clipboardData?.setData("text/plain", plain);
    e.preventDefault();
  };
  const holder = document.createElement("textarea");
  holder.value = plain || " ";
  holder.setAttribute("readonly", "");
  holder.style.position = "fixed";
  holder.style.opacity = "0";
  holder.style.pointerEvents = "none";
  document.body.appendChild(holder);
  holder.select();
  document.addEventListener("copy", onCopy);
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.removeEventListener("copy", onCopy);
    holder.remove();
  }
}
