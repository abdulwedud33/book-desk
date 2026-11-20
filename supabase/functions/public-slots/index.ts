import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { SlotsQuerySchema } from '../_shared/validation.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const query = {
      slug: url.searchParams.get('slug') || '',
      service_id: url.searchParams.get('service_id') || '',
      provider_id: url.searchParams.get('provider_id') || null,
      from_date: url.searchParams.get('from_date') || '',
      to_date: url.searchParams.get('to_date') || '',
    };

    const parsed = SlotsQuerySchema.safeParse(query);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: 'VALIDATION', details: parsed.error.issues }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Rate limits: 60/min per IP
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown-ip';
    const { data: allowedIp } = await supabaseAdmin.rpc('rate_limit_hit', {
      p_key: `public:slots:ip:${clientIp}`,
      p_limit: 60,
      p_window_seconds: 60,
    });

    if (!allowedIp) {
      return new Response(JSON.stringify({ error: 'RATE_LIMITED' }), {
        status: 429,
        headers: { ...corsHeaders, 'Retry-After': '60', 'Content-Type': 'application/json' },
      });
    }

    const { data, error } = await supabaseAdmin.rpc('public_slots', {
      p_slug: parsed.data.slug,
      p_service: parsed.data.service_id,
      p_provider: parsed.data.provider_id ?? null,
      p_from_date: parsed.data.from_date,
      p_to_date: parsed.data.to_date,
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message || 'NOT_FOUND' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ days: data || [] }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'NOT_FOUND' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
