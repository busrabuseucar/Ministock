import type { Database } from "./types.ts";
import { ApiError, productInput, movementInput } from "./domain.ts";
import {
  workspaceExists,
  initializeWorkspace,
  snapshot,
  createProduct,
  createMovement,
} from "./store.ts";
const COOKIE = "ministock_session";
const sessionPattern = /^[0-9a-f]{64}$/;
function cookieToken(request: Request) {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(COOKIE + "="))
    ?.slice(COOKIE.length + 1);
  return token && sessionPattern.test(token) ? token : null;
}
async function hash(token: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
      ...extra,
    },
  });
}
function protectWrite(request: Request) {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new ApiError(
      415,
      "JSON_REQUIRED",
      "JSON biçiminde veri gönderilmeli.",
    );
  if (request.headers.get("x-ministock-request") !== "1")
    throw new ApiError(
      403,
      "REQUEST_HEADER",
      "İstek doğrulanamadı. Sayfayı yenile.",
    );
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    throw new ApiError(
      403,
      "ORIGIN",
      "Bu kaynaktan yazma isteği kabul edilmiyor.",
    );
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new ApiError(
      403,
      "ORIGIN",
      "Siteler arası yazma isteği kabul edilmiyor.",
    );
}
async function body(request: Request) {
  if (Number(request.headers.get("content-length") || 0) > 8192)
    throw new ApiError(413, "BODY_TOO_LARGE", "İstek çok büyük.");
  if (!request.body)
    throw new ApiError(400, "INVALID_JSON", "İstek gövdesi gerekli.");
  const reader = request.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 8192) {
      await reader.cancel();
      throw new ApiError(413, "BODY_TOO_LARGE", "İstek çok büyük.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Geçerli JSON gönderilmeli.");
  }
}
export async function handleApi(
  request: Request,
  db: Database,
): Promise<Response> {
  try {
    const path = new URL(request.url).pathname;
    if (request.method === "POST") protectWrite(request);
    if (path === "/api/workspace" && request.method === "POST") {
      await body(request);
      const current = cookieToken(request);
      if (current && (await workspaceExists(db, await hash(current))))
        return json(await snapshot(db, await hash(current)));
      const token = Array.from(
        crypto.getRandomValues(new Uint8Array(32)),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("");
      const workspace = await hash(token);
      await initializeWorkspace(db, workspace);
      const secure =
        new URL(request.url).protocol === "https:" ? "; Secure" : "";
      return json(await snapshot(db, workspace), 201, {
        "Set-Cookie": `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${secure}`,
      });
    }
    const token = cookieToken(request);
    if (!token)
      throw new ApiError(
        401,
        "SESSION_REQUIRED",
        "Çalışma alanını yeniden açmak için sayfayı yenile.",
      );
    const workspace = await hash(token);
    if (!(await workspaceExists(db, workspace)))
      throw new ApiError(
        401,
        "SESSION_REQUIRED",
        "Çalışma alanı bulunamadı. Sayfayı yenile.",
      );
    if (path === "/api/inventory" && request.method === "GET")
      return json(await snapshot(db, workspace));
    if (path === "/api/products" && request.method === "POST") {
      const parsed = productInput.safeParse(await body(request));
      if (!parsed.success)
        throw new ApiError(
          400,
          "INVALID_PRODUCT",
          "Ürün alanlarını kontrol et. Kod ve ad gerekli; adetler 0–999.999 arasında tam sayı olmalı.",
        );
      const result = await createProduct(db, workspace, parsed.data);
      return json(result, result.replayed ? 200 : 201);
    }
    if (path === "/api/movements" && request.method === "POST") {
      const parsed = movementInput.safeParse(await body(request));
      if (!parsed.success)
        throw new ApiError(
          400,
          "INVALID_MOVEMENT",
          "Ürün, yön, 1–999.999 arasında tam sayı adet ve 2–200 karakter açıklama gerekli.",
        );
      const result = await createMovement(db, workspace, parsed.data);
      return json(result, result.replayed ? 200 : 201);
    }
    throw new ApiError(404, "NOT_FOUND", "Bu API yolu bulunamadı.");
  } catch (error) {
    if (error instanceof ApiError)
      return json(
        { error: { code: error.code, message: error.message } },
        error.status,
      );
    console.error(
      "MiniStock request failed",
      error instanceof Error ? error.message : "Storage failure",
    );
    return json(
      {
        error: {
          code: "UNAVAILABLE",
          message:
            "Kayıtlara şu an ulaşılamıyor. Girdiğin bilgileri koruduk; birazdan tekrar dene.",
        },
      },
      503,
    );
  }
}
