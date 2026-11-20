import { z } from 'zod';

export const MAX_BODY_BYTES = 4096; // 4 KB request size cap per docs/security.md

export const ShopQuerySchema = z.object({
  slug: z
    .string()
    .min(3)
    .max(40)
    .regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, 'Invalid slug format'),
});

export const SlotsQuerySchema = z.object({
  slug: z
    .string()
    .min(3)
    .max(40)
    .regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/),
  service_id: z.string().uuid(),
  provider_id: z.string().uuid().nullable().optional(),
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const BookRequestSchema = z.object({
  slug: z
    .string()
    .min(3)
    .max(40)
    .regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/),
  service_id: z.string().uuid(),
  provider_id: z.string().uuid().nullable().optional(),
  starts_at: z.string().datetime(),
  name: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(4).max(30),
  language: z.enum(['en', 'am', 'om']).default('en'),
  // Honeypot field: must be empty. If filled by a bot, request is rejected.
  website: z.string().max(0, 'Bot detected').optional().default(''),
});
