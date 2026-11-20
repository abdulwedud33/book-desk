import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { corsHeaders } from '../_shared/cors.ts';
import { BookRequestSchema, MAX_BODY_BYTES } from '../_shared/validation.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Enforce 4 KB request size cap
    const contentLength = parseInt(req.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_BODY_BYTES) {
      return new Response(JSON.stringify({ error: 'PAYLOAD_TOO_LARGE' }), {
        status: 413,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rawBody = await req.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return new Response(JSON.stringify({ error: 'PAYLOAD_TOO_LARGE' }), {
        status: 413,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const json = JSON.parse(rawBody);
    const parsed = BookRequestSchema.safeParse(json);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: 'VALIDATION', details: parsed.error.issues }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Honeypot check: reject bot submissions
    if (parsed.data.website && parsed.data.website.length > 0) {
      return new Response(JSON.stringify({ error: 'VALIDATION' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown-ip';
    const phone = parsed.data.phone;

    // 3. Layered Rate Limiting:
    // (a) 10 attempts per hour per IP
    const { data: allowedIp } = await supabaseAdmin.rpc('rate_limit_hit', {
      p_key: `public:book:ip:${clientIp}`,
      p_limit: 10,
      p_window_seconds: 3600,
    });
    if (!allowedIp) {
      return new Response(JSON.stringify({ error: 'RATE_LIMITED' }), {
        status: 429,
        headers: { ...corsHeaders, 'Retry-After': '3600', 'Content-Type': 'application/json' },
      });
    }

    // (b) 5 bookings per day per phone
    const { data: allowedPhone } = await supabaseAdmin.rpc('rate_limit_hit', {
      p_key: `public:book:phone:${phone}`,
      p_limit: 5,
      p_window_seconds: 86400,
    });
    if (!allowedPhone) {
      return new Response(JSON.stringify({ error: 'RATE_LIMITED' }), {
        status: 429,
        headers: { ...corsHeaders, 'Retry-After': '86400', 'Content-Type': 'application/json' },
      });
    }

    // (c) 300 attempts per hour per business
    const { data: allowedShop } = await supabaseAdmin.rpc('rate_limit_hit', {
      p_key: `public:book:shop:${parsed.data.slug}`,
      p_limit: 300,
      p_window_seconds: 3600,
    });
    if (!allowedShop) {
      return new Response(JSON.stringify({ error: 'RATE_LIMITED' }), {
        status: 429,
        headers: { ...corsHeaders, 'Retry-After': '3600', 'Content-Type': 'application/json' },
      });
    }

    // Hash client IP for event tracking without storing raw IP
    const encoder = new TextEncoder();
    const data = encoder.encode(clientIp + 'salt_book_desk');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const ipHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').substring(0, 32);

    // 4. Call authoritative database function
    const { data: result, error } = await supabaseAdmin.rpc('public_create_booking', {
      p_slug: parsed.data.slug,
      p_service: parsed.data.service_id,
      p_provider: parsed.data.provider_id ?? null,
      p_starts_at: parsed.data.starts_at,
      p_name: parsed.data.name,
      p_phone: parsed.data.phone,
      p_language: parsed.data.language,
      p_ip_hash: ipHash,
    });

    if (error) {
      const msg = error.message || '';
      if (msg.includes('SLOT_TAKEN')) {
        // Extract any parsed alternatives
        let alternatives: string[] = [];
        const altMatch = msg.match(/SLOT_TAKEN:\s*(\{.*\})/);
        if (altMatch) {
          try {
            const rawAlts = altMatch[1].replace(/[\{\}]/g, '').split(',').map((s: string) => s.trim()).filter(Boolean);
            alternatives = rawAlts;
          } catch {
            // Keep empty
          }
        }
        return new Response(
          JSON.stringify({
            error: 'SLOT_TAKEN',
            alternatives,
          }),
          {
            status: 409,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      if (msg.includes('LIMIT_REACHED')) {
        return new Response(JSON.stringify({ error: 'LIMIT_REACHED' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (msg.includes('BLOCKED')) {
        return new Response(JSON.stringify({ error: 'BLOCKED' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (msg.includes('TOO_SOON')) {
        return new Response(JSON.stringify({ error: 'TOO_SOON' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (msg.includes('OUTSIDE_HOURS')) {
        return new Response(JSON.stringify({ error: 'OUTSIDE_HOURS' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ error: 'GENERIC' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(result), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'GENERIC' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
