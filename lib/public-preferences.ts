import { INVITATION_ID, json, validatePreferences } from "./date-preferences.ts";

export const PUBLIC_INVITATION_ORIGIN = "https://azamiddinmukhitdinov-cmd.github.io";
const tokenPattern = /^[a-f0-9]{64}$/;

function allowedOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  return origin && (origin === PUBLIC_INVITATION_ORIGIN || origin === new URL(request.url).origin) ? origin : null;
}

function cors(request: Request, response: Response): Response {
  response.headers.set("Vary", "Origin");
  const origin = allowedOrigin(request);
  if (origin) response.headers.set("Access-Control-Allow-Origin", origin);
  return response;
}

async function guestId(request: Request): Promise<string | null> {
  const token = request.headers.get("x-invitation-token") ?? "";
  if (!tokenPattern.test(token)) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return "guest:" + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function publicPreferencesOptions(request: Request): Response {
  if (!allowedOrigin(request)) return json({ error: "Открой письмо по ссылке приглашения." }, 403);
  const requestedMethod = request.headers.get("access-control-request-method");
  if (requestedMethod && !["GET", "POST"].includes(requestedMethod)) return cors(request, json({ error: "Этот способ отправки недоступен." }, 405));
  const requestedHeaders = (request.headers.get("access-control-request-headers") ?? "").toLowerCase().split(",").map(value => value.trim()).filter(Boolean);
  if (requestedHeaders.some(value => !["content-type", "x-invitation-token"].includes(value))) return cors(request, json({ error: "Этот способ отправки недоступен." }, 403));
  const response = new Response(null, { status: 204, headers: {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Invitation-Token",
    "Access-Control-Max-Age": "600",
    "Cache-Control": "no-store",
  } });
  return cors(request, response);
}

export async function getPublicPreferences(request: Request, database?: D1Database): Promise<Response> {
  if (request.headers.has("origin") && !allowedOrigin(request)) return json({ error: "Открой письмо по ссылке приглашения." }, 403);
  const userId = await guestId(request);
  if (!userId) return cors(request, json({ error: "Не получилось открыть твой ответ. Обнови письмо ♡" }, 401));
  if (!database) return cors(request, json({ error: "Сохранение временно недоступно." }, 503));
  try {
    const row = await database.prepare("SELECT cuisines_json, wishes, updated_at FROM date_responses WHERE invitation_id = ? AND user_id = ? LIMIT 1")
      .bind(INVITATION_ID, userId).first<{ cuisines_json: string; wishes: string; updated_at: string }>();
    return cors(request, json({ preferences: row ? { cuisines: JSON.parse(row.cuisines_json), wishes: row.wishes, updatedAt: row.updated_at } : null }));
  } catch {
    return cors(request, json({ error: "Не получилось прочитать ответ. Попробуй чуть позже." }, 503));
  }
}

export async function savePublicPreferences(request: Request, database?: D1Database): Promise<Response> {
  if (!allowedOrigin(request)) return json({ error: "Открой письмо по ссылке приглашения." }, 403);
  const userId = await guestId(request);
  if (!userId) return cors(request, json({ error: "Не получилось сохранить твой ответ. Обнови письмо ♡" }, 401));
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return cors(request, json({ error: "Не получилось прочитать ответ." }, 415));
  if (!database) return cors(request, json({ error: "Сохранение временно недоступно." }, 503));
  let preferences;
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > 4096) return cors(request, json({ error: "Слишком длинный ответ." }, 413));
    preferences = validatePreferences(JSON.parse(body));
  } catch {
    return cors(request, json({ error: "Не получилось прочитать ответ." }, 400));
  }
  if (!preferences) return cors(request, json({ error: "Выбери кухню или напиши своё желание ♡" }, 400));
  const updatedAt = new Date().toISOString();
  try {
    await database.prepare("INSERT INTO date_responses (invitation_id, user_id, respondent_email, cuisines_json, wishes, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (invitation_id, user_id) DO UPDATE SET cuisines_json = excluded.cuisines_json, wishes = excluded.wishes, updated_at = excluded.updated_at")
      .bind(INVITATION_ID, userId, "", JSON.stringify(preferences.cuisines), preferences.wishes, updatedAt).run();
    return cors(request, json({ preferences: { ...preferences, updatedAt } }));
  } catch {
    return cors(request, json({ error: "Не получилось сохранить твой намёк. Попробуй ещё раз ♡" }, 503));
  }
}
