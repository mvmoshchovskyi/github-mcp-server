import * as z from 'zod/v4';

export const ownerSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9-]+$/, 'Owner must be a GitHub user or organization name');

export const repoSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(
    /^[A-Za-z0-9._-]+$/,
    'Repository must be a valid GitHub repository name',
  );

export function stateSchema(description: string) {
  return z
    .enum(['open', 'closed', 'all'])
    .default('open')
    .describe(description);
}

export function limitSchema(description: string) {
  return z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe(description);
}

/** Annotations shared by every read-only tool in this server. */
export const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};
