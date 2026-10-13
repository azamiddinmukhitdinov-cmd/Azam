import { env } from "cloudflare:workers";
import invitation from "./invitation.html?raw";
import { isOwner, visitorFrom } from "../lib/date-preferences";

export const dynamic = "force-dynamic";
export function GET(request: Request) {
  const visitor = visitorFrom(request);
  const ownerLink = isOwner(visitor, env.OWNER_EMAIL) ? '<a class="owner-link" href="/responses">Посмотреть ответы</a>' : "";
  return new Response(invitation.replace("<!-- OWNER_NAV -->", ownerLink), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff" },
  });
}
