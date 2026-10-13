import { configureSigning } from "./lib/android.mjs";

try {
  configureSigning();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
