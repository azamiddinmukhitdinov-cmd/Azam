export const calendarFileName = "our-date-2026-10-18.ics";

function text(value) {
  return value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
}

function fold(line) {
  const encoder = new TextEncoder();
  let output = "", part = "", size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (size + bytes > 75) {
      output += part + "\r\n";
      part = " ";
      size = 1;
    }
    part += char;
    size += bytes;
  }
  return output + part;
}

export function invitationCalendar(timestamp = new Date()) {
  const stamp = timestamp.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Love Letter//Date Invitation//RU",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:" + text("Наше свидание ♡"),
    "BEGIN:VEVENT",
    "UID:liannochka-20261018@love-letter",
    "DTSTAMP:" + stamp,
    "DTSTART;VALUE=DATE:20261018",
    "DTEND;VALUE=DATE:20261019",
    "SUMMARY:" + text("Свидание с любимым ♡"),
    "DESCRIPTION:" + text("Лианночка! Оставь этот день для нас двоих. Место и план — сюрприз. Время сообщу отдельно."),
    "STATUS:TENTATIVE",
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].map(fold).join("\r\n");
}
