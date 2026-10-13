export const INVITATION_ID = "2026-10-18";
const allowedCuisines = new Set(["japanese", "national", "italian", "other", "surprise"]);

export type Visitor = { userId: string; email: string };
export type Preferences = { cuisines: string[]; wishes: string };
type StoredResponse = {
  user_id: string;
  respondent_email: string;
  cuisines_json: string;
  wishes: string;
  updated_at: string;
};

// Identity headers are verified and injected by Sites dispatch.
export function visitorFrom(request: Request): Visitor | null {
  const userId = request.headers.get("oai-authenticated-user-id");
  const email = request.headers.get("oai-authenticated-user-email");
  return userId && email ? { userId, email } : null;
}

export function isOwner(visitor: Visitor | null, ownerEmail?: string): boolean {
  return Boolean(visitor && ownerEmail && visitor.email.toLowerCase() === ownerEmail.toLowerCase());
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff" } });
}

export function validatePreferences(payload: unknown): Preferences | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const { cuisines, wishes } = payload as Partial<Preferences>;
  if (!Array.isArray(cuisines) || cuisines.length > 5 || typeof wishes !== "string" || wishes.length > 500) return null;
  if (!cuisines.every(value => typeof value === "string" && allowedCuisines.has(value))) return null;
  if (new Set(cuisines).size !== cuisines.length) return null;
  const note = wishes.trim();
  if ((!cuisines.length && !note) || (cuisines.includes("other") && !note)) return null;
  if (cuisines.includes("surprise") && cuisines.length !== 1) return null;
  return { cuisines, wishes: note };
}

function preferencesFrom(row: StoredResponse) {
  return { cuisines: JSON.parse(row.cuisines_json) as string[], wishes: row.wishes, updatedAt: row.updated_at };
}

export async function getPreferences(request: Request, database?: D1Database): Promise<Response> {
  const visitor = visitorFrom(request);
  if (!visitor) return json({ error: "Войди в ChatGPT, чтобы открыть свой ответ." }, 401);
  if (!database) return json({ error: "Сохранение временно недоступно." }, 503);
  try {
    const row = await database.prepare("SELECT user_id, respondent_email, cuisines_json, wishes, updated_at FROM date_responses WHERE invitation_id = ? AND user_id = ? LIMIT 1")
      .bind(INVITATION_ID, visitor.userId).first<StoredResponse>();
    return json({ preferences: row ? preferencesFrom(row) : null });
  } catch {
    return json({ error: "Не получилось прочитать ответ. Попробуй чуть позже." }, 503);
  }
}

export async function savePreferences(request: Request, database?: D1Database): Promise<Response> {
  const visitor = visitorFrom(request);
  if (!visitor) return json({ error: "Войди в ChatGPT, чтобы сохранить свой ответ." }, 401);
  if (request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "Открой приглашение и сохрани выбор на его странице." }, 403);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return json({ error: "Не получилось прочитать ответ." }, 415);
  if (!database) return json({ error: "Сохранение временно недоступно." }, 503);
  let preferences: Preferences | null;
  try {
    const body = await request.text();
    if (body.length > 4096) return json({ error: "Слишком длинный ответ." }, 413);
    preferences = validatePreferences(JSON.parse(body));
  } catch {
    return json({ error: "Не получилось прочитать ответ." }, 400);
  }
  if (!preferences) return json({ error: "Выбери кухню или напиши своё желание ♡" }, 400);
  const updatedAt = new Date().toISOString();
  try {
    await database.prepare("INSERT INTO date_responses (invitation_id, user_id, respondent_email, cuisines_json, wishes, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (invitation_id, user_id) DO UPDATE SET respondent_email = excluded.respondent_email, cuisines_json = excluded.cuisines_json, wishes = excluded.wishes, updated_at = excluded.updated_at")
      .bind(INVITATION_ID, visitor.userId, visitor.email, JSON.stringify(preferences.cuisines), preferences.wishes, updatedAt).run();
    return json({ preferences: { ...preferences, updatedAt } });
  } catch {
    return json({ error: "Не получилось сохранить твой намёк. Попробуй ещё раз ♡" }, 503);
  }
}

export async function getOwnerResponses(request: Request, database?: D1Database, ownerEmail?: string): Promise<Response> {
  const visitor = visitorFrom(request);
  if (!visitor) return json({ error: "Войди в свой аккаунт ChatGPT." }, 401);
  if (!isOwner(visitor, ownerEmail)) return json({ error: "Эта страница доступна только владельцу приглашения." }, 403);
  if (!database) return json({ error: "Ответы временно недоступны." }, 503);
  try {
    const result = await database.prepare("SELECT user_id, respondent_email, cuisines_json, wishes, updated_at FROM date_responses WHERE invitation_id = ? ORDER BY updated_at DESC LIMIT 20")
      .bind(INVITATION_ID).all<StoredResponse>();
    return json({ responses: result.results.map(row => ({ ...preferencesFrom(row), isTest: row.respondent_email.toLowerCase() === ownerEmail!.toLowerCase() })) });
  } catch {
    return json({ error: "Не получилось прочитать ответы. Попробуй чуть позже." }, 503);
  }
}
