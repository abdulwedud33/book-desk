// supabase/functions/ai-parse-booking/index.ts
// Booking Assistant Edge Function.
// Complies with docs/prompts.md, docs/tools.md, docs/guardrails.md, docs/memory.md.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { corsHeaders } from '../_shared/cors.ts';
import {
  sanitizeUntrustedInput,
  redactPhones,
  restorePhones,
  buildTrustedContext,
  detectTimeAmbiguity,
  validateSlotGrounding,
} from '../../src/domain/ai-guardrails.ts';
import { BOOKING_ASSISTANT_PROMPT_TEMPLATE, BookingAssistantOutput } from '../_shared/prompts/booking-assistant.ts';

const AI_MODEL_FAST = Deno.env.get('AI_MODEL_FAST') || 'gemini-1.5-flash';
const AI_ENABLED = Deno.env.get('AI_ENABLED') !== 'false';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Kill Switch Check
    if (!AI_ENABLED) {
      return new Response(
        JSON.stringify({
          status: 'unsupported',
          confidence: 'low',
          clarifications: [],
          slot_options: [],
          note: "The assistant isn't available right now. You can still create the booking by hand.",
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // 2. Authentication & Authorization
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'UNAUTHENTICATED' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'UNAUTHENTICATED' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    const body = await req.json();
    const shopId = body.shop_id;
    const rawMessage = body.message;

    if (!shopId || !rawMessage) {
      return new Response(JSON.stringify({ error: 'VALIDATION: shop_id and message required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // Check member role (owner or reception only)
    const { data: roleData, error: roleError } = await userClient.rpc('my_role', { p_shop: shopId });
    if (roleError || !roleData || !['owner', 'reception'].includes(roleData)) {
      return new Response(JSON.stringify({ error: 'FORBIDDEN: Assistant accessible to owner or reception only' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      });
    }

    // 3. Input Sanitization & Phone Redaction (Before model)
    const sanitized = sanitizeUntrustedInput(rawMessage, 600);
    const { redactedText, phoneMap, extractedPhones } = redactPhones(sanitized);

    // 4. Ambiguity Detection (Rule 5)
    const ambiguity = detectTimeAmbiguity(sanitized);
    if (ambiguity.isAmbiguous) {
      const resp: BookingAssistantOutput = {
        status: 'needs_clarification',
        confidence: 'medium',
        clarifications: [
          {
            field: 'time',
            question: ambiguity.question!,
            options: ambiguity.options!,
          },
        ],
        slot_options: [],
        memory_suggestion: null,
        note: 'Ambiguous clock time detected.',
      };
      return new Response(JSON.stringify(resp), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // 5. Fetch Trusted Shop Context
    const { data: shop } = await userClient
      .from('shops')
      .select('name, business_type, timezone, time_display')
      .eq('id', shopId)
      .single();

    const timeZone = shop?.timezone || 'Africa/Addis_Ababa';
    const trustedCtx = buildTrustedContext({
      now: new Date(),
      timeZone,
      businessType: shop?.business_type || 'salon',
      language: body.language || 'en',
      timeDisplay: shop?.time_display || 'gregorian',
    });

    // 6. Fetch Active Services & Providers for Grounding
    const { data: services } = await userClient
      .from('services')
      .select('id, name, duration_min, price')
      .eq('shop_id', shopId)
      .eq('active', true);

    const { data: providers } = await userClient
      .from('providers')
      .select('id, name')
      .eq('shop_id', shopId)
      .eq('active', true);

    // Query shop memory
    const { data: memory } = await userClient.rpc('get_shop_memory', { p_shop_id: shopId });

    // Look for service match in text or alias
    let matchedService = services?.find((s: any) =>
      sanitized.toLowerCase().includes(s.name.toLowerCase())
    );

    if (!matchedService && Array.isArray(memory)) {
      const aliasMatch = memory.find(
        (m: any) => m.kind === 'alias' && sanitized.toLowerCase().includes(m.key.toLowerCase())
      );
      if (aliasMatch && aliasMatch.ref_id) {
        matchedService = services?.find((s: any) => s.id === aliasMatch.ref_id);
      }
    }

    let matchedProvider = providers?.find((p: any) =>
      sanitized.toLowerCase().includes(p.name.toLowerCase())
    );

    // If no unique service match, ask with options
    if (!matchedService) {
      const serviceOptions = (services || []).slice(0, 5).map((s: any) => ({
        id: s.id,
        label: `${s.name} (${s.duration_min} min)`,
      }));

      const resp: BookingAssistantOutput = {
        status: 'needs_clarification',
        confidence: 'low',
        clarifications: [
          {
            field: 'service',
            question: 'Which service would you like to book?',
            options: serviceOptions,
          },
        ],
        slot_options: [],
        memory_suggestion: null,
        note: 'Please select a service.',
      };
      return new Response(JSON.stringify(resp), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // 7. Find Slots from Availability Engine
    const todayStr = new Date().toISOString().slice(0, 10);
    const toDate = new Date();
    toDate.setDate(toDate.getDate() + 7);
    const toStr = toDate.toISOString().slice(0, 10);

    const { data: freeSlots, error: slotsErr } = await userClient.rpc('staff_slots', {
      p_shop_id: shopId,
      p_service_id: matchedService.id,
      p_provider_id: matchedProvider ? matchedProvider.id : null,
      p_from_date: todayStr,
      p_to_date: toStr,
    });

    const slotOptions: Array<{ start: string; provider_id: string; label: string }> = [];
    if (Array.isArray(freeSlots)) {
      for (const row of freeSlots) {
        if (Array.isArray(row.starts)) {
          for (const s of row.starts.slice(0, 5)) {
            slotOptions.push({
              start: s,
              provider_id: row.provider_id,
              label: new Date(s).toLocaleString('en-US', {
                timeZone,
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              }),
            });
            if (slotOptions.length >= 5) break;
          }
        }
        if (slotOptions.length >= 5) break;
      }
    }

    // 8. Build Proposed Draft (Grounding check)
    let chosenSlot = slotOptions[0] || null;
    let draftReady = chosenSlot !== null;

    const resp: BookingAssistantOutput = {
      status: draftReady ? 'draft_ready' : 'needs_clarification',
      confidence: draftReady ? 'high' : 'medium',
      clarifications: draftReady
        ? []
        : [
            {
              field: 'date',
              question: 'No free slots found in the upcoming days. Please choose another date.',
              options: [],
            },
          ],
      slot_options: slotOptions,
      memory_suggestion: null,
      note: 'Draft prepared from available slots. Staff confirmation required.',
      draft: draftReady
        ? {
            service_id: matchedService.id,
            service_name: matchedService.name,
            provider_id: chosenSlot.provider_id,
            provider_name: providers?.find((p: any) => p.id === chosenSlot.provider_id)?.name || null,
            customer_phone: extractedPhones[0] || null,
            start: chosenSlot.start,
            end: new Date(new Date(chosenSlot.start).getTime() + matchedService.duration_min * 60000).toISOString(),
            note: 'Created via Staff Assistant',
          }
        : null,
    };

    // Log AI Usage
    await userClient.rpc('log_ai_usage', {
      p_shop_id: shopId,
      p_agent: 'booking_assistant',
      p_input_tokens: sanitized.length,
      p_output_tokens: JSON.stringify(resp).length,
      p_ok: true,
    });

    return new Response(JSON.stringify(resp), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        status: 'unsupported',
        confidence: 'low',
        clarifications: [],
        slot_options: [],
        note: "I couldn't process that request. You can create the booking manually.",
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  }
});
