import { invitationCalendar } from "../../lib/invitation-calendar.mjs";

export function GET() {
  return new Response(invitationCalendar(), { headers: {
    "Content-Type": "text/calendar; charset=utf-8",
    "Content-Disposition": 'inline; filename="our-date-2026-10-18.ics"',
    "Cache-Control": "public, max-age=300",
    "X-Content-Type-Options": "nosniff",
  } });
}
