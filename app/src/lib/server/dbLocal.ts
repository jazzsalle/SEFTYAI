import "server-only";

/**
 * 로컬 개발·하네스 전용 DB — DATABASE_URL=pglite:<폴더> 이면 프로세스 안 Postgres(PGlite)를 쓴다.
 * 운영 Neon(DATABASE_URL=postgres://…) 에 개발 중 테스트 데이터가 섞이지 않게 하기 위함이다(운영 배포에서는 쓰지 않는다).
 * neon() 과 같은 꼴만 흉내 낸다: query(text, params) → 행 배열(await 할 때 실행), transaction([query…]) → 결과 배열.
 */
type Lazy = { text: string; params: unknown[]; then: <A, B>(ok?: (rows: unknown[]) => A, bad?: (e: unknown) => B) => Promise<A | B> };
type PG = { query: (t: string, p?: unknown[]) => Promise<{ rows: unknown[] }>; transaction: <T>(cb: (tx: { query: PG["query"] }) => Promise<T>) => Promise<T> };

const g = globalThis as unknown as { __saPglite?: Promise<PG> };

export function localDb(url: string) {
  if (process.env.VERCEL_ENV === "production") throw new Error("pglite 로컬 DB 는 운영에서 쓸 수 없다");
  const dir = url.replace(/^pglite:(\/\/)?/, "") || ".localdb";
  // 개발 서버 핫 리로드에도 같은 인스턴스(같은 폴더를 두 번 열면 깨진다)
  g.__saPglite ??= import("@electric-sql/pglite").then(({ PGlite }) => PGlite.create(dir) as unknown as Promise<PG>);
  const pg = g.__saPglite;
  const query = (text: string, params: unknown[] = []): Lazy => ({
    text,
    params,
    then: (ok, bad) => pg.then((c) => c.query(text, params)).then((r) => r.rows).then(ok, bad),
  });
  const transaction = async (list: Lazy[]) =>
    (await pg).transaction(async (tx) => {
      const out: unknown[][] = [];
      for (const q of list) out.push((await tx.query(q.text, q.params)).rows);
      return out;
    });
  return { query, transaction };
}
