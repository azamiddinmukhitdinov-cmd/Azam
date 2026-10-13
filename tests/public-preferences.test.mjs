import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { getOwnerResponses, INVITATION_ID } from "../lib/date-preferences.ts";
import {
  getPublicPreferences,
  PUBLIC_INVITATION_ORIGIN,
  publicPreferencesOptions,
  savePublicPreferences,
} from "../lib/public-preferences.ts";

const siteRoot = new URL("../", import.meta.url);
const apiUrl = "https://invitation.test/api/public/preferences";
const tokenA = "a".repeat(64);
const tokenB = "b".repeat(64);
const ownerEmail = "owner@example.test";

function database(t) {
  const sqlite = new DatabaseSync(":memory:");
  const journal = JSON.parse(readFileSync(new URL("drizzle/meta/_journal.json", siteRoot), "utf8"));
  for (const entry of journal.entries) {
    sqlite.exec(readFileSync(new URL(`drizzle/${entry.tag}.sql`, siteRoot), "utf8"));
  }
  t.after(() => sqlite.close());
  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      return { bind(...values) { return {
        async first() { return statement.get(...values) ?? null; },
        async all() { return { results: statement.all(...values), success: true }; },
        async run() { statement.run(...values); return { success: true }; },
      }; } };
    },
  };
  return { sqlite, db };
}

function request(token = tokenA, payload, options = {}) {
  const method = options.method ?? (payload === undefined ? "GET" : "POST");
  const headers = { ...options.headers };
  if (token !== null) headers["x-invitation-token"] = token;
  if (options.origin !== null) headers.origin = options.origin ?? PUBLIC_INVITATION_ORIGIN;
  if (payload !== undefined) headers["content-type"] = options.contentType ?? "application/json";
  return new Request(apiUrl, {
    method,
    headers,
    ...(payload !== undefined ? { body: typeof payload === "string" ? payload : JSON.stringify(payload) } : {}),
  });
}

function ownerRequest(identity) {
  return new Request("https://invitation.test/api/owner/responses", {
    headers: identity ? {
      "oai-authenticated-user-id": identity.id,
      "oai-authenticated-user-email": identity.email,
    } : {},
  });
}

async function expectStatus(response, status) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("cache-control"), "no-store");
  return response.json();
}

test("anonymous visitors save, reload, and update their own response without identity headers", async t => {
  const { db, sqlite } = database(t);
  const empty = await expectStatus(await getPublicPreferences(request(), db), 200);
  assert.equal(empty.preferences, null);
  const input = { cuisines: ["japanese", "italian"], wishes: "  Не остро; тирамису ♡  " };
  const saved = await expectStatus(await savePublicPreferences(request(tokenA, input), db), 200);
  assert.deepEqual(saved.preferences.cuisines, input.cuisines);
  assert.equal(saved.preferences.wishes, input.wishes.trim());
  assert.ok(Number.isFinite(Date.parse(saved.preferences.updatedAt)));
  const reloaded = await expectStatus(await getPublicPreferences(request(), db), 200);
  assert.deepEqual(reloaded, saved);
  const updated = await expectStatus(await savePublicPreferences(request(tokenA, { cuisines: ["surprise"], wishes: "Десерт на двоих" }), db), 200);
  assert.deepEqual(updated.preferences.cuisines, ["surprise"]);
  assert.equal(updated.preferences.wishes, "Десерт на двоих");
  assert.deepEqual(await (await getPublicPreferences(request(), db)).json(), updated);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM date_responses").get().count, 1);
});

test("two 64-hex tokens are isolated and only their SHA-256 hashes enter storage", async t => {
  const { db, sqlite } = database(t);
  const first = { cuisines: ["national"], wishes: "Первый ответ" };
  const second = { cuisines: ["other"], wishes: "Второй ответ" };
  await expectStatus(await savePublicPreferences(request(tokenA, first), db), 200);
  assert.equal((await (await getPublicPreferences(request(tokenB), db)).json()).preferences, null);
  await expectStatus(await savePublicPreferences(request(tokenB, second), db), 200);
  await expectStatus(await savePublicPreferences(request(tokenA, { cuisines: ["italian"], wishes: "Обновлённый первый" }), db), 200);
  const reloadedB = await (await getPublicPreferences(request(tokenB), db)).json();
  assert.deepEqual(reloadedB.preferences.cuisines, second.cuisines);
  assert.equal(reloadedB.preferences.wishes, second.wishes);
  const rows = sqlite.prepare("SELECT * FROM date_responses ORDER BY user_id").all();
  assert.equal(rows.length, 2);
  assert.deepEqual(new Set(rows.map(row => row.user_id)), new Set([tokenA, tokenB].map(token => `guest:${createHash("sha256").update(token).digest("hex")}`)));
  for (const row of rows) {
    assert.equal(row.invitation_id, INVITATION_ID);
    assert.equal(row.respondent_email, "");
    assert.equal(JSON.stringify(row).includes(tokenA), false);
    assert.equal(JSON.stringify(row).includes(tokenB), false);
  }
  for (const token of [tokenA, tokenB]) {
    const serialized = await (await getPublicPreferences(request(token), db)).text();
    assert.equal(serialized.includes(token), false);
    assert.equal(serialized.includes("guest:"), false);
    assert.equal(serialized.includes("respondent_email"), false);
  }
});

test("supplied respondent_email cannot become owner identity or mark a guest response as an owner test", async t => {
  const { db, sqlite } = database(t);
  const input = {
    cuisines: ["italian"], wishes: "Настоящий гостевой ответ",
    respondent_email: ownerEmail, email: ownerEmail, user_id: "owner-site-id",
  };
  await expectStatus(await savePublicPreferences(request(tokenA, input), db), 200);
  assert.equal(sqlite.prepare("SELECT respondent_email FROM date_responses").get().respondent_email, "");
  assert.equal((await getOwnerResponses(request(tokenA), db, ownerEmail)).status, 401);
  assert.equal((await getOwnerResponses(ownerRequest(null), db, ownerEmail)).status, 401);
  assert.equal((await getOwnerResponses(ownerRequest({ id: "visitor", email: "visitor@example.test" }), db, ownerEmail)).status, 403);
  const owner = ownerRequest({ id: "owner-site-id", email: ownerEmail });
  assert.equal((await getOwnerResponses(owner, db)).status, 403);
  const visible = await expectStatus(await getOwnerResponses(owner, db, ownerEmail), 200);
  assert.equal(visible.responses.length, 1);
  assert.equal(visible.responses[0].isTest, false);
  assert.equal(visible.responses[0].wishes, input.wishes);
  assert.equal(JSON.stringify(visible).includes(ownerEmail), false);
  assert.equal(JSON.stringify(visible).includes(tokenA), false);
});

test("CORS grants only the configured GitHub Pages origin and the API's own origin", async t => {
  const { db, sqlite } = database(t);
  for (const origin of [PUBLIC_INVITATION_ORIGIN, new URL(apiUrl).origin]) {
    const get = await getPublicPreferences(request(tokenA, undefined, { origin }), db);
    const post = await savePublicPreferences(request(tokenA, { cuisines: ["italian"], wishes: "" }, { origin }), db);
    for (const response of [get, post]) {
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("access-control-allow-origin"), origin);
      assert.equal(response.headers.get("access-control-allow-credentials"), null);
      assert.equal(response.headers.get("vary"), "Origin");
    }
  }
  const count = sqlite.prepare("SELECT COUNT(*) AS count FROM date_responses").get().count;
  for (const origin of [
    "https://elsewhere.test", "https://other.github.io", "null",
    `${PUBLIC_INVITATION_ORIGIN}.elsewhere.test`, "http://azamiddinmukhitdinov-cmd.github.io",
    `${PUBLIC_INVITATION_ORIGIN}/`,
  ]) {
    const get = await getPublicPreferences(request(tokenA, undefined, { origin }), db);
    const post = await savePublicPreferences(request(tokenB, { cuisines: ["national"], wishes: "" }, { origin }), db);
    const preflight = publicPreferencesOptions(request(tokenA, undefined, { method: "OPTIONS", origin }));
    for (const response of [get, post, preflight]) {
      assert.equal(response.status, 403);
      assert.equal(response.headers.get("access-control-allow-origin"), null);
    }
  }
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM date_responses").get().count, count);
  assert.equal((await savePublicPreferences(request(tokenA, { cuisines: ["italian"], wishes: "" }, { origin: null }), db)).status, 403);
});

test("preflight accepts GET and POST with the token header and rejects other methods or headers", () => {
  for (const method of ["GET", "POST"]) {
    const response = publicPreferencesOptions(request(null, undefined, {
      method: "OPTIONS", headers: {
        "access-control-request-method": method,
        "access-control-request-headers": " Content-Type, X-Invitation-Token ",
      },
    }));
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), PUBLIC_INVITATION_ORIGIN);
    assert.equal(response.headers.get("access-control-allow-methods"), "GET, POST, OPTIONS");
    assert.equal(response.headers.get("access-control-allow-headers"), "Content-Type, X-Invitation-Token");
    assert.equal(response.headers.get("access-control-max-age"), "600");
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  for (const method of ["DELETE", "PUT", "PATCH", "TRACE", "get"]) {
    const response = publicPreferencesOptions(request(null, undefined, { method: "OPTIONS", headers: { "access-control-request-method": method } }));
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("access-control-allow-methods"), null);
  }
  for (const header of ["authorization", "cookie", "oai-authenticated-user-email", "x-unknown"]) {
    const response = publicPreferencesOptions(request(null, undefined, { method: "OPTIONS", headers: {
      "access-control-request-method": "POST",
      "access-control-request-headers": `Content-Type, X-Invitation-Token, ${header}`,
    } }));
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("access-control-allow-headers"), null);
  }
  assert.equal(publicPreferencesOptions(request(null, undefined, { method: "OPTIONS", origin: null })).status, 403);
});

test("missing, malformed, uppercase, and wrong-length tokens receive 401 and cannot write", async t => {
  const { db, sqlite } = database(t);
  for (const token of [null, "", "a".repeat(63), "a".repeat(65), "A".repeat(64), "g".repeat(64), `${"a".repeat(62)};!`]) {
    for (const response of [
      await getPublicPreferences(request(token), db),
      await savePublicPreferences(request(token, { cuisines: ["italian"], wishes: "" }), db),
    ]) {
      await expectStatus(response, 401);
      assert.equal(response.headers.get("access-control-allow-origin"), PUBLIC_INVITATION_ORIGIN);
    }
  }
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM date_responses").get().count, 0);
});

test("invalid cuisines, invalid JSON, wish length, content type, and request size reject the write", async t => {
  const { db, sqlite } = database(t);
  const invalid = [
    null, [], "invalid JSON", { cuisines: [], wishes: "  " },
    { cuisines: ["unknown"], wishes: "" }, { cuisines: ["other"], wishes: "" },
    { cuisines: ["italian", "italian"], wishes: "" },
    { cuisines: ["surprise", "japanese"], wishes: "" },
    { cuisines: ["italian"], wishes: "x".repeat(501) },
    { cuisines: "italian", wishes: "" }, { cuisines: ["italian"], wishes: 42 },
    { cuisines: ["japanese", "national", "italian", "other", "surprise", "national"], wishes: "Да" },
  ];
  for (const payload of invalid) {
    await expectStatus(await savePublicPreferences(request(tokenA, payload), db), 400);
  }
  await expectStatus(await savePublicPreferences(request(tokenA, { cuisines: ["italian"], wishes: "" }, { contentType: "text/plain" }), db), 415);
  await expectStatus(await savePublicPreferences(request(tokenA, "x".repeat(4097)), db), 413);
  const oversizedUtf8 = JSON.stringify({ cuisines: ["italian"], wishes: "", padding: "я".repeat(2200) });
  assert.ok(oversizedUtf8.length < 4096 && Buffer.byteLength(oversizedUtf8) > 4096);
  await expectStatus(await savePublicPreferences(request(tokenA, oversizedUtf8), db), 413);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM date_responses").get().count, 0);
  const accepted = await expectStatus(await savePublicPreferences(request(tokenA, { cuisines: [], wishes: "x".repeat(500) }, { contentType: "application/json; charset=utf-8" }), db), 200);
  assert.equal(accepted.preferences.wishes.length, 500);
});

test("guest wishes are stored and returned as plain text without executing HTML or SQL", async t => {
  const { db, sqlite } = database(t);
  const wishes = "<img src=x onerror=alert(1)> '; DROP TABLE date_responses; --";
  await expectStatus(await savePublicPreferences(request(tokenA, { cuisines: ["other"], wishes }), db), 200);
  const stored = await expectStatus(await getPublicPreferences(request(tokenA), db), 200);
  assert.equal(stored.preferences.wishes, wishes);
  assert.equal(sqlite.prepare("SELECT wishes FROM date_responses").get().wishes, wishes);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM date_responses").get().count, 1);
});

test("missing or failed database fails closed with 503 without disclosing internals", async () => {
  const broken = { prepare() { throw Error("Private database credentials and internals"); } };
  for (const db of [undefined, broken]) {
    for (const response of [
      await getPublicPreferences(request(tokenA), db),
      await savePublicPreferences(request(tokenA, { cuisines: ["italian"], wishes: "" }), db),
    ]) {
      const body = await expectStatus(response, 503);
      assert.equal(Object.hasOwn(body, "preferences"), false);
      assert.equal(JSON.stringify(body).includes("Private database"), false);
      assert.equal(response.headers.get("access-control-allow-origin"), PUBLIC_INVITATION_ORIGIN);
    }
  }
});
