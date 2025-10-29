import { z } from 'zod';

// This package incorrectly uses peerDependencies for Expo-managed packages
export const peerSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export type PeerData = z.infer<typeof peerSchema>;
