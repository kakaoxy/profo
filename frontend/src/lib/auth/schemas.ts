import { z } from "zod";

/**
 * Backend `/api/v1/auth/token` response schema.
 * Shared by admin loginAction and (future) C-end login.
 */
export const LoginResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  token_type: z.string().min(1),
  expires_in: z.number().int().positive(),
});

export type LoginResponse = z.infer<typeof LoginResponseSchema>;
