import { z } from 'zod';

export const credentialsSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Vul je e-mailadres in.')
    .email('Dit is geen geldig e-mailadres.'),
  password: z.string().min(8, 'Gebruik minimaal 8 tekens.'),
});

export type Credentials = z.infer<typeof credentialsSchema>;
