import { useForm } from 'react-hook-form';
import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const useLoginForm = () => {
  return useForm();
};
