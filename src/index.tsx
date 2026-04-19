import { runTUI } from "./ui/App.tsx";
import { parseCLI } from "./config/cli.ts";

export async function main() {
  const options = parseCLI();
  await runTUI(options);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
