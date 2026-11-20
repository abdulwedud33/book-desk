import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { corsHeaders } from '../_shared/cors.ts';
import { withUniformTiming } from '../_shared/timing.ts';
import { ShopQuerySchema } from '../_shared/validation.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  return withUniformTiming(async () => {
    try {
      const url = new URL(req.url);
      const slug = url.searchParams.get('slug') || '';

      const parsed = ShopQuerySchema.safeParse({ slug });
      if (!parsed.success) {
        return new Response(JSON.stringify({ error: 'NOT_FOUND' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      // Check per-IP rate limit: 60/min
      const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown-ip';
      const { data: allowedIp } = await supabaseAdmin.rpc('rate_limit_hit', {
        p_key: `public:shop:ip:${clientIp}`,
        p_limit: 60,
        p_window_seconds: 60,
      });

      if (!allowedIp) {
        return new Response(JSON.stringify({ error: 'RATE_LIMITED' }), {
          status: 429,
          headers: { ...corsHeaders, 'Retry-After': '60', 'Content-Type': 'application/json' },
        });
      }

      const { data, error } = await supabaseAdmin.rpc('public_shop_info', {
        p_slug: parsed.data.slug,
      });

      if (error || !data) {
        return new Response(JSON.stringify({ error: 'NOT_FOUND' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify(data), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=60, s-maxage=60',
        },
      });
    } catch {
      return new Response(JSON.stringify({ error: 'NOT_FOUND' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  });
});
