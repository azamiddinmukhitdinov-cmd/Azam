import test from "node:test";
import assert from "node:assert/strict";
import { invitationCalendar } from "../lib/invitation-calendar.mjs";
import { GET } from "../app/calendar.ics/route.ts";

test("calendar contains one all-day event with an exclusive end date and valid UTF-8 folding", () => {
  const calendar = invitationCalendar(new Date("2026-10-13T12:00:00Z"));
  assert.ok(calendar.endsWith("\r\n"));
  assert.equal((calendar.match(/BEGIN:VEVENT/g) ?? []).length, 1);
  assert.equal((calendar.match(/END:VEVENT/g) ?? []).length, 1);
  for (const line of calendar.split("\r\n")) assert.ok(Buffer.byteLength(line, "utf8") <= 75);
  const unfolded = calendar.replace(/\r\n[ \t]/g, "");
  assert.match(unfolded, /DTSTAMP:20261013T120000Z\r\n/);
  assert.match(unfolded, /DTSTART;VALUE=DATE:20261018\r\nDTEND;VALUE=DATE:20261019\r\n/);
  assert.match(unfolded, /SUMMARY:Свидание с любимым ♡\r\n/);
  assert.ok(unfolded.includes("Время сообщу отдельно."));
  assert.ok(!unfolded.includes("TZID") && !unfolded.includes("ATTENDEE"));
});

test("calendar endpoint opens inline without visitor authentication or forced download", async () => {
  const response = GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "text/calendar; charset=utf-8");
  assert.match(response.headers.get("Content-Disposition"), /^inline;/);
  assert.equal(response.headers.get("Location"), null);
  assert.match(await response.text(), /^BEGIN:VCALENDAR\r\n/);
});
