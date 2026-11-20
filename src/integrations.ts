/**
 * Integration Billing Config
 *
 * Configure who pays for each integration's API calls.
 *
 * - 'developer': The app owner pays (default).
 * - 'user': The calling user pays.
 *
 * Every integration requires a signed-in caller. Set `anonymous: true` on a
 * 'developer' integration to let signed-out visitors call it too — the owner
 * then pays for anyone who can reach the app.
 *
 * Integrations not listed here default to 'developer' with sign-in required.
 *
 * `browser: true` lets the browser call an integration directly through
 * /api/integrations/:name/:endpoint (src/server/http-routes.ts). Without it,
 * a 'developer'-billed integration is server-only: reachable from actions
 * (tools.integration), never from the browser, so signed-in users can't spend
 * the owner's credits on it directly.
 *
 * IMPORTANT: any integration backed by per-user connected accounts (Google,
 * Composio) must be 'user' — the api-worker resolves the account from the
 * JWT subject. With 'developer' the app owner's JWT is forwarded, so every
 * signed-in user connects and acts on the app owner's account. Server code
 * that acts for a user in the background (e.g. a cron job) uses
 * `callComposio(env, ..., { asUser })` from 'deepspace/worker' instead.
 */

export const integrations: Record<
  string,
  { billing: 'developer' | 'user'; anonymous?: boolean; browser?: boolean }
> = {
  google: { billing: 'user' },
  composio: { billing: 'user' },
  // Must be 'user': the token's LiveKit identity comes from the forwarded JWT.
  // Under 'developer' every participant would get the app owner's identity and
  // LiveKit kicks the previous joiner. generate-token is free either way.
  livekit: { billing: 'user', browser: true },
  // Share and friend notices (src/email/notify.ts), sent by actions only. The owner pays
  // ($0.013 per email), capped per sender per day.
  email: { billing: 'developer' },
  // openai: { billing: 'developer', anonymous: true },
}

/**
 * May the browser call this integration through the /api/integrations proxy?
 * Only if it's listed and either marked `browser: true` or billed to the
 * caller. Unlisted integrations default to the owner paying, so they're
 * server-only.
 */
export function browserMayCall(name: string): boolean {
  const config = Object.hasOwn(integrations, name) ? integrations[name] : undefined
  return !!config && (config.browser === true || config.billing === 'user')
}
