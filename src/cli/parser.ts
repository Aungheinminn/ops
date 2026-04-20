import { Command } from 'commander';
import { z } from 'zod';
import type { CLIOptions, CLIRawOptions } from './types.ts';

const CLIOptionsSchema = z.object({
  dir: z.string().default(process.cwd()),
  model: z.string().optional(),
});

export function parseCLI(args: string[] = process.argv): CLIOptions {
  const program = new Command()
    .name('ops')
    .description('Multi-session coding agent CLI with OpenTUI')
    .version('1.0.0')
    .option('-d, --dir <path>', 'Working directory', process.cwd())
    .option('-m, --model <model>', 'Default model to use')
    .parse(args);
  
  const options = program.opts<CLIRawOptions>();
  
  const merged: CLIRawOptions = {
    dir: process.env.OPS_DIR || options.dir,
    model: process.env.OPS_MODEL || options.model,
  };
  
  return CLIOptionsSchema.parse(merged);
}

export function parseCLISync(): CLIOptions {
  return parseCLI();
}
