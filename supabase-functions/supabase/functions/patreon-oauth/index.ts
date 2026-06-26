import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PATREON_CLIENT_ID     = Deno.env.get('PATREON_CLIENT_ID')!;
const PATREON_CLIENT_SECRET = Deno.env.get('PATREON_CLIENT_SECRET')!;
const PATREON_REDIRECT_URI  = Deno.env.get('PATREON_REDIRECT_URI')!;
const PATREON_CAMPAIGN_ID   = Deno.env.get('PATREON_CAMPAIGN_ID') ?? '';
const DEFAULT_APP_URL       = Deno.env.get('APP_URL') ?? 'https://mtc.mamoscrypto.com';
const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

      // Tier prices in cents — Tier 1 ($4.99) = no MTC access
      // Tier 2 ($24.99) and Tier 3 ($39.99) = MTC premium access
      const PREMIUM_TIER_CENTS = [2499, 3999];

      // 2. Fetch identity + memberships (include currently_entitled_tiers for price)
      const identityParams = new URLSearchParams();
      identityParams.set('include', 'memberships.currently_entitled_tiers');
      identityParams.set('fields[user]', 'email,full_name');
      identityParams.set('fields[member]', 'patron_status');
      identityParams.set('fields[tier]', 'amount_cents,title');
      const identityRes = await fetch(
        `https://www.patreon.com/api/oauth2/v2/identity?${identityParams.toString()}`,
        {
          headers: { Authorization: `Bearer ${access_token}` },
        },
      );

      if (!identityRes.ok) {
        const body = await identityRes.text();
        console.error('Patreon identity fetch failed:', identityRes.status, body);
        return redirectToApp(APP_URL, `?patreon_error=identity_failed_${identityRes.status}`);
      }

      const identity = await identityRes.json();
      const patreonId = identity.data?.id as string;
      const email     = identity.data?.attributes?.email as string;
      const fullName  = identity.data?.attributes?.full_name as string | undefined;
      const included  = (identity.included ?? []) as Array<{
        type: string;
        id: string;
        attributes: { patron_status?: string; amount_cents?: number; title?: string };
      }>;

      // 3. Determine tier and premium status
      // Creator/owner accounts — always get Mamos Elite regardless of patron status
      const OWNER_EMAILS = ['crypto.mamos@gmail.com'];
      const isOwner = OWNER_EMAILS.includes(email);

      // Find active membership
      const activeMembership = included.find(
        i => i.type === 'member' && i.attributes.patron_status === 'active_patron'
      );

      // Find entitled tiers for this membership
      const entitledTiers = included.filter(i => i.type === 'tier');

      // Check if any entitled tier qualifies for premium (Tier 2 or 3)
      const isPremium = isOwner || (activeMembership !== undefined && entitledTiers.some(
        t => PREMIUM_TIER_CENTS.includes(t.attributes.amount_cents ?? 0)
      ));

      // Determine plan name based on tier price
      const tierCents = entitledTiers[0]?.attributes?.amount_cents ?? 0;
      const planName = isOwner          ? 'Mamos Elite'
                     : tierCents >= 3999 ? 'Mamos Elite'
                     : tierCents >= 2499 ? 'Mamos Pro'
                     : tierCents >= 499  ? 'Mamos Signals'
                     : 'Free';

      // 4. Find or create Supabase user
      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
        auth: { persistSession: false },
      });

      let supabaseUserId: string;

      const { data: existing } = await admin.auth.admin.listUsers();
      const found = existing?.users?.find(u => u.email === email);

      if (found) {
        supabaseUserId = found.id;
        // Update metadata
        await admin.auth.admin.updateUserById(supabaseUserId, {
          user_metadata: {
            ...found.user_metadata,
            premium_active: isPremium,
            plan:           planName,
            patreon_id:     patreonId,
            full_name:      fullName ?? found.user_metadata?.full_name,
          },
        });
      } else {
        // Create a new user — no password needed (magic-link only)
        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: {
            premium_active: isPremium,
            plan:           planName,
            patreon_id:     patreonId,
            full_name:      fullName,
          },
        });

        if (createErr || !created?.user) {
          console.error('createUser failed:', createErr);
          return redirectToApp(APP_URL, '?patreon_error=create_user_failed');
        }

        supabaseUserId = created.user.id;
      }

      // 5. Create a session via magic link then extract access_token + refresh_token
      //    so we can redirect directly to the target app with tokens in the URL hash.
      //    This bypasses Supabase Auth's site_url redirect which always goes to the default.
      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type:  'magiclink',
        email,
        options: { redirectTo: APP_URL },
      });

      if (linkErr || !linkData?.properties?.hashed_token) {
        console.error('generateLink failed:', linkErr);
        return redirectToApp(APP_URL, '?patreon_error=link_failed');
      }

      // Follow the magic link server-side to get the session tokens
      const verifyUrl = `${SUPABASE_URL}/auth/v1/verify?token=${linkData.properties.hashed_token}&type=magiclink&redirect_to=${encodeURIComponent(APP_URL)}`;
      const verifyRes = await fetch(verifyUrl, {
        method: 'GET',
        redirect: 'manual',
      });

      // Supabase returns a 303 redirect to APP_URL#access_token=...&refresh_token=...
      const location = verifyRes.headers.get('location') ?? '';

      if (location.includes('access_token')) {
        // Replace whatever base URL Supabase used with the correct APP_URL
        // The hash contains: #access_token=...&refresh_token=...&type=bearer&...
        const hashIndex = location.indexOf('#');
        const hash = hashIndex !== -1 ? location.slice(hashIndex) : '';
        return Response.redirect(`${APP_URL}/auth/callback${hash}`, 302);
      }

      // Fallback: redirect to action_link (may redirect to site_url but better than error)
      return Response.redirect(linkData.properties.action_link, 302);

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
