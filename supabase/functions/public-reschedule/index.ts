import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { withUniformTiming } from '../_shared/timing.ts';
import { RescheduleRequestSchema, MAX_BODY_BYTES } from '../_shared/validation.ts';

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
      const rawBody = await req.text();
      if (rawBody.length > MAX_BODY_BYTES) {
        return new Response(JSON.stringify({ error: 'PAYLOAD_TOO_LARGE' }), {
          status: 413,
          headers: manageHeaders,
        });
      }

      const json = JSON.parse(rawBody);
      const parsed = RescheduleRequestSchema.safeParse(json);
      if (!parsed.success) {
        return new Response(JSON.stringify({ error: 'VALIDATION', details: parsed.error.issues }), {
          status: 400,
          headers: manageHeaders,
        });
      }

      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown-ip';

      // Rate limit per IP (30/min) and per token (10/min)
      const { data: allowedIp } = await supabaseAdmin.rpc('rate_limit_hit', {
        p_key: `public:reschedule:ip:${clientIp}`,
        p_limit: 30,
        p_window_seconds: 60,
      });
      if (!allowedIp) {
        return new Response(JSON.stringify({ error: 'RATE_LIMITED' }), {
          status: 429,
          headers: { ...manageHeaders, 'Retry-After': '60' },
        });
      }

      const { data: allowedToken } = await supabaseAdmin.rpc('rate_limit_hit', {
        p_key: `public:reschedule:token:${parsed.data.token}`,
        p_limit: 10,
        p_window_seconds: 60,
      });
      if (!allowedToken) {
        return new Response(JSON.stringify({ error: 'RATE_LIMITED' }), {
          status: 429,
          headers: { ...manageHeaders, 'Retry-After': '60' },
        });
      }

      const { data, error } = await supabaseAdmin.rpc('public_reschedule', {
        p_token: parsed.data.token,
        p_new_start: parsed.data.new_start,
      });

      if (error) {
        const msg = error.message || '';
        if (msg.includes('CUTOFF_PASSED')) {
          return new Response(JSON.stringify({ error: 'CUTOFF_PASSED' }), {
            status: 400,
            headers: manageHeaders,
          });
        }
        if (msg.includes('SLOT_TAKEN')) {
          return new Response(JSON.stringify({ error: 'SLOT_TAKEN' }), {
            status: 409,
            headers: manageHeaders,
          });
        }
        if (msg.includes('OUTSIDE_HOURS') || msg.includes('TOO_SOON') || msg.includes('TOO_FAR')) {
          return new Response(JSON.stringify({ error: msg }), {
            status: 400,
            headers: manageHeaders,
          });
        }
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
      return new Response(JSON.stringify({ error: 'GENERIC' }), {
        status: 500,
        headers: manageHeaders,
      });
    }
  }, 100);
});
