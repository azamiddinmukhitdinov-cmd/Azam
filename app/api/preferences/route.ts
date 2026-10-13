import { env } from "cloudflare:workers";
import { getPreferences, savePreferences } from "../../../lib/date-preferences";

export const dynamic = "force-dynamic";
export const GET = (request: Request) => getPreferences(request, env.DB);
export const POST = (request: Request) => savePreferences(request, env.DB);
