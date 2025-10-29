import { format } from 'date-fns';
import { z } from 'zod';
import { debounce } from 'lodash';

export const formatDate = (date: Date) => format(date, 'PPP');

export const userSchema = z.object({
  name: z.string(),
  email: z.string().email(),
});

export const debouncedSearch = debounce((query: string) => {
  console.log('Searching:', query);
}, 300);
