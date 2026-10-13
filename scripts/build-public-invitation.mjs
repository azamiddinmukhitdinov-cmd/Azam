import { mkdir, readFile, writeFile } from "node:fs/promises";
import { calendarFileName, invitationCalendar } from "../lib/invitation-calendar.mjs";

const root = new URL("../", import.meta.url);
const endpoint = "https://liannochka-malenkiy-sekret.creamy-bream-2918.chatgpt.site/api/public/preferences";
let invitation = await readFile(new URL("app/invitation.html", root), "utf8");
const marker = "const PREFERENCES_ENDPOINT='/api/public/preferences';";
if (!invitation.includes(marker)) throw new Error("Public invitation endpoint marker is missing");
invitation = invitation.replace(marker, `const PREFERENCES_ENDPOINT='${endpoint}';`).replace("<!-- OWNER_NAV -->", "");
invitation = invitation.replace('href="/calendar.ics"', `href="${calendarFileName}"`);
await mkdir(new URL("docs/", root), { recursive: true });
await writeFile(new URL("docs/index.html", root), invitation);
await writeFile(new URL("docs/.nojekyll", root), "");
await writeFile(new URL(`docs/${calendarFileName}`, root), invitationCalendar());
console.log("Public invitation is ready in docs/index.html");
