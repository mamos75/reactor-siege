import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PATREON_CLIENT_ID     = Deno.env.get('PATREON_CLIENT_ID')!;
const PATREON_CLIENT_SECRET = Deno.env.get('PATREON_CLIENT_SECRET')!;
const PATREON_REDIRECT_URI  = Deno.env.get('PATREON_REDIRECT_URI')!;
const PATREON_CAMPAIGN_ID   = Deno.env.get('PATREON_CAMPAIGN_ID') ?? '';
const APP_URL               = Deno.env.get('APP_URL') ?? 'https://mtc.mamoscrypto.com';
const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req: Request) => {
  const url = new URL(req.url);

  // ── /start ────────────────────────────────────────────────────────────────
  // Redirect the browser to Patreon's OAuth authorize page
  if (url.pathname.endsWith('/start')) {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id:     PATREON_CLIENT_ID,
      redirect_uri:  PATREON_REDIRECT_URI,
      scope:         'identity identity[email] identity.memberships campaigns.members',
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

    if (error || !code) {
      return redirectToApp(`?patreon_error=${encodeURIComponent(error ?? 'no_code')}`);
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
        return redirectToApp('?patreon_error=token_exchange_failed');
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
        return redirectToApp(`?patreon_error=identity_failed_${identityRes.status}`);
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
      // Find active membership
      const activeMembership = included.find(
        i => i.type === 'member' && i.attributes.patron_status === 'active_patron'
      );

      // Find entitled tiers for this membership
      const entitledTiers = included.filter(i => i.type === 'tier');

      // Check if any entitled tier qualifies for premium (Tier 2 or 3)
      const isPremium = activeMembership !== undefined && entitledTiers.some(
        t => PREMIUM_TIER_CENTS.includes(t.attributes.amount_cents ?? 0)
      );

      // Determine plan name based on tier price
      const tierCents = entitledTiers[0]?.attributes?.amount_cents ?? 0;
      const planName = tierCents >= 3999 ? 'Mamos Elite'
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
          return redirectToApp('?patreon_error=create_user_failed');
        }

        supabaseUserId = created.user.id;
      }

      // 5. Generate a magic link so the browser gets a real session
      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type:  'magiclink',
        email,
        options: { redirectTo: APP_URL },
      });

      if (linkErr || !linkData?.properties?.hashed_token) {
        console.error('generateLink failed:', linkErr);
        return redirectToApp('?patreon_error=link_failed');
      }

      // The magic link contains the token — redirect the browser to it
      // Supabase will swap it for a session then redirect to APP_URL
      return Response.redirect(linkData.properties.action_link, 302);

    } catch (err) {
      console.error('patreon-oauth callback error:', err);
      return redirectToApp('?patreon_error=server_error');
    }
  }

  return new Response('Not Found', { status: 404 });
});

function redirectToApp(query = '') {
  return Response.redirect(`${APP_URL}${query}`, 302);
}
