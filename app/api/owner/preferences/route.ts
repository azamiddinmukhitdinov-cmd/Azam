import { env } from "cloudflare:workers";
import { getOwnerResponses } from "../../../../lib/date-preferences";

export const dynamic = "force-dynamic";
export const GET = (request: Request) => getOwnerResponses(request, env.DB, env.OWNER_EMAIL);
