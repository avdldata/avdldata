import { z } from 'zod';
import { CONVENIENCE_PREFERENCES } from '@/domain/optimization/config';
import { TRANSPORT_MODES } from '@/domain/trip/trip-cost';

/**
 * Validation for the week settings form.
 *
 * Deliberately its own module: a `'use server'` file may only export async
 * functions, so the schema cannot live next to the action that uses it.
 * Keeping it here also means the client form and the server action validate
 * against exactly the same rules.
 */
const euroString = z
  .string()
  .trim()
  .refine(
    (value) => value === '' || /^\d+([.,]\d{1,2})?$/.test(value),
    'Vul een bedrag in, bijvoorbeeld 60 of 62,50.',
  );

export const weekSettingsSchema = z.object({
  selectedChainIds: z.array(z.string()).min(1, 'Kies minimaal één supermarkt.'),
  maxStores: z.coerce.number().int().min(0).max(3),
  conveniencePreference: z.enum(CONVENIENCE_PREFERENCES),
  budgetMode: z.enum(['geen', 'richtbedrag', 'maximum']),
  budgetAmount: euroString,
  transportMode: z.enum(TRANSPORT_MODES),
  costPerKm: euroString,
  maxMinutes: z.string().trim(),
});

export type WeekSettingsInput = z.input<typeof weekSettingsSchema>;
