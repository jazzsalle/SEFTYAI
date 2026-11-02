import { claimStream, streamAbort, streamAlive, streamFinal, streamNotSse } from "@/lib/server/jobs";
import { hasDb } from "@/lib/server/db";
import { fail, whoami } from "@/lib/server/who";
import { t3qStream } from "@/lib/t3q/client";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/agent/jobs/{id}/stream — T3Q v0.4 스트리밍(STREAM) 중계.
 * 접수(POST /api/agent/jobs, stream:true)만 된 본인 작업을 T3Q 에 STREAM 으로 제출하고 meta·progress·refs·token·reset 을 그대로 넘긴다.
 * final(01-A 응답 JSON — 정본)은 받은 그대로 저장한 뒤 화면에는 `event: final` 만 알린다(화면은 저장본을 불러 바꿔 놓는다).
 * 스트림을 못 열거나 중간에 끊겨도 실행은 T3Q 에서 끝까지 돌고, 같은 request_id 를 폴링이 받는다(설명서 6.4). 응답 무가공 — 글 조각을 고치지 않는다
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const who = await whoami(req);
  if (!who) return fail(401, "로그인이 필요합니다.");
  if (!hasDb()) return fail(503, "서버 DB가 연결되지 않았습니다.");
  if (who.mustChangePw) return fail(403, "초기 비밀번호를 먼저 바꿔 주세요.");
  if (process.env.T3Q_MODE === "replay") return new Response(null, { status: 204 });
  const { id } = await ctx.params;
  const job = await claimStream(who, id);
  if (!job) return new Response(null, { status: 204 }); // 이미 제출됐거나 슬롯이 없음 → 화면은 폴링
  const up = await t3qStream({ ...job.request, response_mode: "STREAM" }, job.t3q_request_id!);
  if (!up.sse) {
    // 닿지 못했거나 봉투가 아닌 오류(예: 500 Internal server error)면 스트림을 포기하고 ASYNC 로 다시 제출하게 돌려놓는다
    if (up.http === 0 || !up.envelope) await streamAbort(id);
    else await streamNotSse(id, up.http, up.envelope, up.json, up.error);
    return new Response(null, { status: 204 });
  }

  const enc = new TextEncoder();
  const reader = up.sse.body!.getReader();
  let gone = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(ctl) {
      const send = (ev: string, data: string) => {
        if (gone) return;
        try {
          ctl.enqueue(enc.encode(`event: ${ev}\ndata: ${data}\n\n`));
        } catch {
          gone = true;
        }
      };
      const dec = new TextDecoder();
      let buf = "";
      let lastAlive = 0;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let cut: number;
          while ((cut = buf.search(/\r?\n\r?\n/)) >= 0) {
            const block = buf.slice(0, cut);
            buf = buf.slice(cut).replace(/^\r?\n\r?\n/, "");
            let ev = "message";
            const data: string[] = [];
            for (const line of block.split(/\r?\n/)) {
              if (line.startsWith("event:")) ev = line.slice(6).trim();
              else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
            }
            if (!data.length) continue; // keepalive 주석
            const d = data.join("\n");
            if (ev === "meta") {
              let conv: string | null = null;
              try {
                conv = (JSON.parse(d) as { conversation_id?: string }).conversation_id ?? null;
              } catch {
                /* 그대로 넘긴다 */
              }
              await streamAlive(id, conv);
              lastAlive = Date.now();
            } else if (Date.now() - lastAlive > 20_000) {
              await streamAlive(id).catch(() => {});
              lastAlive = Date.now();
            }
            if (ev === "final") {
              let body: { status?: string; conversation_id?: string } | null = null;
              try {
                body = JSON.parse(d);
              } catch {
                body = null;
              }
              await streamFinal(id, body);
              send("final", "{}");
            } else if (ev === "done") {
              send("done", "{}");
            } else send(ev, d);
          }
        }
      } catch (e) {
        console.error("[stream]", (e as Error).message);
      } finally {
        if (!gone) {
          try {
            ctl.close();
          } catch {
            /* 이미 닫힘 */
          }
        }
      }
    },
    cancel() {
      // 화면이 떠나도 T3Q 스트림은 끝까지 읽어 final 을 저장한다(함수 시간 안에서). 못 받으면 폴링이 받는다
      gone = true;
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no", Connection: "keep-alive" },
  });
}
