import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { corsHeaders } from '../_shared/cors.ts';
import { withUniformTiming } from '../_shared/timing.ts';
import { ManageTokenSchema } from '../_shared/validation.ts';

const manageHeaders = {
  ...corsHeaders,
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
  'Content-Type': 'application/json',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: manageHeaders });
  }

  return withUniformTiming(async () => {
    try {
      const url = new URL(req.url);
      const token = url.searchParams.get('token') || '';

      const parsed = ManageTokenSchema.safeParse({ token });
      if (!parsed.success) {
        return new Response(JSON.stringify({ error: 'NOT_FOUND' }), {
          status: 404,
          headers: manageHeaders,
        });
      }

      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown-ip';

      // Rate limit per IP: 30 per min
      const { data: allowedIp } = await supabaseAdmin.rpc('rate_limit_hit', {
        p_key: `public:manage:ip:${clientIp}`,
        p_limit: 30,
        p_window_seconds: 60,
      });
      if (!allowedIp) {
        return new Response(JSON.stringify({ error: 'RATE_LIMITED' }), {
          status: 429,
          headers: { ...manageHeaders, 'Retry-After': '60' },
        });
      }

      // Rate limit per token: 10 per min
      const { data: allowedToken } = await supabaseAdmin.rpc('rate_limit_hit', {
        p_key: `public:manage:token:${parsed.data.token}`,
        p_limit: 10,
        p_window_seconds: 60,
      });
      if (!allowedToken) {
        return new Response(JSON.stringify({ error: 'RATE_LIMITED' }), {
          status: 429,
          headers: { ...manageHeaders, 'Retry-After': '60' },
        });
      }

      const { data, error } = await supabaseAdmin.rpc('public_get_booking', {
        p_token: parsed.data.token,
      });

      if (error || !data) {
        return new Response(JSON.stringify({ error: 'NOT_FOUND' }), {
          status: 404,
          headers: manageHeaders,
        });
      }

      return new Response(JSON.stringify(data), {
        status: 200,
        headers: manageHeaders,
      });
    } catch {
      return new Response(JSON.stringify({ error: 'NOT_FOUND' }), {
        status: 404,
        headers: manageHeaders,
      });
    }
  }, 100);
});
