import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const PATREON_CLIENT_ID     = Deno.env.get('PATREON_CLIENT_ID')!;
const PATREON_CLIENT_SECRET = Deno.env.get('PATREON_CLIENT_SECRET')!;
const PATREON_REDIRECT_URI  = Deno.env.get('PATREON_REDIRECT_URI')!;
const DEFAULT_APP_URL       = Deno.env.get('APP_URL') ?? 'https://mtc.mamoscrypto.com';

// Allowed app origins that can be passed as app_url
const ALLOWED_APP_URLS = [
  'https://mtc.mamoscrypto.com',
  'https://trading.mamoscrypto.com',
  'https://options-analyzer.mamoscrypto.com',
];

serve(async (req: Request) => {
  const url = new URL(req.url);

  // ── /start ────────────────────────────────────────────────────────────────
  // Redirect the browser to Patreon's OAuth authorize page
  if (url.pathname.endsWith('/start')) {
    // Allow caller to specify which app to return to after auth
    const requestedAppUrl = url.searchParams.get('app_url') ?? '';
    const appUrl = ALLOWED_APP_URLS.includes(requestedAppUrl)
      ? requestedAppUrl
      : DEFAULT_APP_URL;

    // Encode app_url in OAuth state so callback knows where to redirect
    const state = btoa(JSON.stringify({ app_url: appUrl }));

    const params = new URLSearchParams({
      response_type: 'code',
      client_id:     PATREON_CLIENT_ID,
      redirect_uri:  PATREON_REDIRECT_URI,
      scope:         'identity identity[email] identity.memberships campaigns.members',
      state,
    });

    return Response.redirect(
      `https://www.patreon.com/oauth2/authorize?${params.toString()}`,
      302,
    );
  }

  // ── /callback ─────────────────────────────────────────────────────────────
  if (url.pathname.endsWith('/callback')) {
    const code  = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    // Recover app_url from OAuth state
    let APP_URL = DEFAULT_APP_URL;
    try {
      const stateRaw = url.searchParams.get('state') ?? '';
      const parsed = JSON.parse(atob(stateRaw));
      if (parsed?.app_url && ALLOWED_APP_URLS.includes(parsed.app_url)) {
        APP_URL = parsed.app_url;
      }
    } catch { /* ignore malformed state */ }

    if (error || !code) {
      return redirectToApp(APP_URL, `?patreon_error=${encodeURIComponent(error ?? 'no_code')}`);
    }

    try {
      // 1. Exchange code → access_token
      const tokenRes = await fetch('https://www.patreon.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          grant_type:    'authorization_code',
          client_id:     PATREON_CLIENT_ID,
          client_secret: PATREON_CLIENT_SECRET,
          redirect_uri:  PATREON_REDIRECT_URI,
        }),
      });

      if (!tokenRes.ok) {
        const body = await tokenRes.text();
        console.error('Patreon token exchange failed:', body);
        return redirectToApp(APP_URL, '?patreon_error=token_exchange_failed');
      }

      const { access_token } = await tokenRes.json();

      // Tier prices in cents
      const PREMIUM_TIER_CENTS = [2499, 3999];

      // 2. Fetch identity + memberships
      const identityParams = new URLSearchParams();
      identityParams.set('include', 'memberships.currently_entitled_tiers');
      identityParams.set('fields[user]', 'email,full_name');
      identityParams.set('fields[member]', 'patron_status');
      identityParams.set('fields[tier]', 'amount_cents,title');
      const identityRes = await fetch(
        `https://www.patreon.com/api/oauth2/v2/identity?${identityParams.toString()}`,
        { headers: { Authorization: `Bearer ${access_token}` } },
      );

      if (!identityRes.ok) {
        const body = await identityRes.text();
        console.error('Patreon identity fetch failed:', identityRes.status, body);
        return redirectToApp(APP_URL, `?patreon_error=identity_failed_${identityRes.status}`);
      }

      const identity = await identityRes.json();
      const email    = identity.data?.attributes?.email as string;
      const fullName = identity.data?.attributes?.full_name as string | undefined;
      const included = (identity.included ?? []) as Array<{
        type: string;
        attributes: { patron_status?: string; amount_cents?: number; title?: string };
      }>;

      // 3. Determine tier and plan
      const OWNER_EMAILS = ['crypto.mamos@gmail.com'];
      const isOwner = OWNER_EMAILS.includes(email);

      const activeMembership = included.find(
        i => i.type === 'member' && i.attributes.patron_status === 'active_patron'
      );
      const entitledTiers = included.filter(i => i.type === 'tier');
      const isPremium = isOwner || (activeMembership !== undefined && entitledTiers.some(
        t => PREMIUM_TIER_CENTS.includes(t.attributes.amount_cents ?? 0)
      ));

      const tierCents = entitledTiers[0]?.attributes?.amount_cents ?? 0;
      const planName = isOwner           ? 'Mamos Elite'
                     : tierCents >= 3999 ? 'Mamos Elite'
                     : tierCents >= 2499 ? 'Mamos Pro'
                     : tierCents >= 499  ? 'Mamos Signals'
                     : 'Free';

      if (!isPremium) {
        return redirectToApp(APP_URL, '?patreon_error=no_membership');
      }

      // 4. Build session payload and redirect — no Supabase Auth needed
      const sessionPayload = btoa(JSON.stringify({
        plan:  planName,
        email: email ?? '',
        name:  fullName ?? '',
        ts:    Date.now(),
      }));
      return redirectToApp(APP_URL, `?mamos_session=${sessionPayload}`);

    } catch (err) {
      console.error('patreon-oauth callback error:', err);
      return redirectToApp(APP_URL, '?patreon_error=server_error');
    }
  }

  return new Response('Not Found', { status: 404 });
});

function redirectToApp(appUrl: string, query = '') {
  return Response.redirect(`${appUrl}${query}`, 302);
}
