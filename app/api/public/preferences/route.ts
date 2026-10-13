import { env } from "cloudflare:workers";
import { getPublicPreferences, publicPreferencesOptions, savePublicPreferences } from "../../../../lib/public-preferences";

export const dynamic = "force-dynamic";
export const GET = (request: Request) => getPublicPreferences(request, env.DB);
export const POST = (request: Request) => savePublicPreferences(request, env.DB);
export const OPTIONS = publicPreferencesOptions;
