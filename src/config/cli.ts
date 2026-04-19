import { Command } from 'commander';
import { z } from 'zod';

const cliOptionsSchema = z.object({
  dir: z.string().default(process.cwd()),
  model: z.string().optional(),
});

export type CLIOptions = z.infer<typeof cliOptionsSchema>;

export function parseCLI(): CLIOptions {
  return cliOptionsSchema.parse({
    dir: process.env.OPS_DIR,
    model: process.env.OPS_MODEL,
  });
}
