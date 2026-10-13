import { env } from "cloudflare:workers";
import ownerPage from "../responses.html?raw";
import { chatGPTSignInPath } from "../chatgpt-auth";
import { isOwner, visitorFrom } from "../../lib/date-preferences";

export const dynamic = "force-dynamic";
export function GET(request: Request) {
  const visitor = visitorFrom(request);
  if (!visitor) return Response.redirect(new URL(chatGPTSignInPath("/responses"), request.url), 302);
  if (!isOwner(visitor, env.OWNER_EMAIL)) return new Response("Эта страница доступна только владельцу приглашения.", {
    status: 403, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
  return new Response(ownerPage, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff" },
  });
}
