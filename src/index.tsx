import { runTUI } from './ui/index.tsx';
import { parseCLI } from './cli/parser.ts';

async function main() {
  const options = parseCLI();
  await runTUI(options);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
