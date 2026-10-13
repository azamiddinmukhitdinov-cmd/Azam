import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { getPreferences, getOwnerResponses, savePreferences } from "../lib/date-preferences.ts";

const ownerEmail = "owner@example.test";
const owner = { id: "owner-site-id", email: ownerEmail };
const wife = { id: "wife-site-id", email: "wife@example.test" };

function database(t) {
  const sqlite = new DatabaseSync(":memory:");
  const journal = JSON.parse(readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"));
  for (const entry of journal.entries) sqlite.exec(readFileSync(new URL(`../drizzle/${entry.tag}.sql`, import.meta.url), "utf8"));
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

function request(user, payload, overrides = {}) {
  const headers = { ...(user ? { "oai-authenticated-user-id": user.id, "oai-authenticated-user-email": user.email } : {}) };
  if (payload !== undefined) Object.assign(headers, { "content-type": "application/json", origin: "https://invitation.test" });
  return new Request("https://invitation.test/api/preferences", {
    method: payload === undefined ? "GET" : "POST",
    headers: { ...headers, ...overrides },
    ...(payload !== undefined ? { body: typeof payload === "string" ? payload : JSON.stringify(payload) } : {}),
  });
}

test("saved preferences survive another request and remain scoped to the signed-in visitor", async t => {
  const { db } = database(t);
  const selection = { cuisines: ["japanese", "italian"], wishes: "  Не остро; хочу тирамису ♡  " };
  assert.equal((await savePreferences(request(wife, selection), db)).status, 200);
  const stored = await (await getPreferences(request(wife), db)).json();
  assert.deepEqual(stored.preferences.cuisines, selection.cuisines);
  assert.equal(stored.preferences.wishes, selection.wishes.trim());
  assert.equal((await (await getPreferences(request(owner), db)).json()).preferences, null);
  assert.equal((await getPreferences(request(null), db)).status, 401);
  const visible = await (await getOwnerResponses(request(owner), db, ownerEmail)).json();
  assert.equal(visible.responses.length, 1);
  assert.equal(visible.responses[0].isTest, false);
  assert.equal(visible.responses[0].wishes, selection.wishes.trim());
  assert.ok(!JSON.stringify(visible).includes(wife.email));
});

test("repeated confirmation updates one response and does not replace another visitor's answer", async t => {
  const { db, sqlite } = database(t);
  await savePreferences(request(wife, { cuisines: ["japanese"], wishes: "" }), db);
  await savePreferences(request(owner, { cuisines: ["national"], wishes: "Пробный ответ" }), db);
  await savePreferences(request(wife, { cuisines: ["surprise"], wishes: "Десерт на двоих" }), db);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM date_responses").get().count, 2);
  const result = await (await getOwnerResponses(request(owner), db, ownerEmail)).json();
  const real = result.responses.find(row => !row.isTest);
  assert.deepEqual(real.cuisines, ["surprise"]);
  assert.equal(real.wishes, "Десерт на двоих");
  assert.equal(result.responses.filter(row => row.isTest).length, 1);
});

test("owner responses reject every non-owner and fail closed without owner configuration", async t => {
  const { db } = database(t);
  assert.equal((await getOwnerResponses(request(wife), db, ownerEmail)).status, 403);
  assert.equal((await getOwnerResponses(request(null), db, ownerEmail)).status, 401);
  assert.equal((await getOwnerResponses(request(owner), db)).status, 403);
});

test("writes reject cross-origin requests, missing identity, invalid content and invalid choices", async t => {
  const { db, sqlite } = database(t);
  const valid = { cuisines: ["italian"], wishes: "" };
  assert.equal((await savePreferences(request(null, valid), db)).status, 401);
  assert.equal((await savePreferences(request(wife, valid, { origin: "https://elsewhere.test" }), db)).status, 403);
  assert.equal((await savePreferences(request(wife, valid, { "content-type": "text/plain" }), db)).status, 415);
  for (const payload of [
    { cuisines: [], wishes: "  " },
    { cuisines: ["surprise", "italian"], wishes: "" },
    { cuisines: ["unknown"], wishes: "" },
    { cuisines: ["japanese", "japanese"], wishes: "" },
    { cuisines: ["other"], wishes: "" },
    { cuisines: ["italian"], wishes: "x".repeat(501) },
    null,
    "invalid JSON",
  ]) assert.equal((await savePreferences(request(wife, payload), db)).status, 400);
  assert.equal((await savePreferences(request(wife, "x".repeat(5000)), db)).status, 413);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM date_responses").get().count, 0);
});

test("custom wishes are stored as plain text and failures never claim a successful save", async t => {
  const { db } = database(t);
  const wishes = "<img src=x onerror=alert(1)> '; DROP TABLE date_responses; --";
  assert.equal((await savePreferences(request(wife, { cuisines: ["other"], wishes }), db)).status, 200);
  const stored = await (await getPreferences(request(wife), db)).json();
  assert.equal(stored.preferences.wishes, wishes);
  assert.equal((await savePreferences(request(wife, { cuisines: ["italian"], wishes: "" }))).status, 503);
  const broken = { prepare() { throw Error("Private database details"); } };
  const failure = await savePreferences(request(wife, { cuisines: ["italian"], wishes: "" }), broken);
  assert.equal(failure.status, 503);
  assert.ok(!(await failure.text()).includes("Private database details"));
});
