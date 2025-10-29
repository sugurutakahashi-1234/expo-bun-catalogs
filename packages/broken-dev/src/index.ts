import { z } from 'zod';

// This package incorrectly uses devDependencies for @types/react
export const devSchema = z.object({
  id: z.number(),
  title: z.string(),
});

export type DevData = z.infer<typeof devSchema>;
