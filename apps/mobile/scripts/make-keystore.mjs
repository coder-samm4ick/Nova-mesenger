import { ensureKeystore } from "./lib/android.mjs";

try {
  ensureKeystore();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
