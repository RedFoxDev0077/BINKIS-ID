import { z } from 'zod';
import { MIN_PASSWORD_LENGTH } from '../auth/password.ts';

/**
 * A handle is public. It appears on every passport page this collector owns,
 * so it has to be unambiguous and free of impersonation tricks: no unicode
 * lookalikes, no leading or trailing separators, no reserved words.
 */
const RESERVED_HANDLES = new Set([
  'admin', 'administrator', 'binkis', 'binkisid', 'official', 'support',
  'staff', 'moderator', 'mod', 'system', 'root', 'api', 'null', 'undefined',
  'me', 'you', 'anonymous', 'deleted', 'p', 'claim', 'passport',
]);

export const handleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Handle must be at least 3 characters')
  .max(24, 'Handle must be 24 characters or fewer')
  .regex(/^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/, 'Use letters, numbers, hyphen and underscore only')
  .refine((value) => !RESERVED_HANDLES.has(value), 'That handle is reserved');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(254)
  .email('That does not look like an email address');

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  .max(200, 'Password is too long');

export const signUpSchema = z.object({
  email: emailSchema,
  handle: handleSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(48).optional(),
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
