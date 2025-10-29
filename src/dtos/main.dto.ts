import {z} from 'zod';

export const memorySchema = z.object({
  userId: z.string().uuid(),
  chatId: z.string().uuid(),
  userRole: z.enum(['user', 'ai']),
  content: z.string().min(1).max(5000),
});