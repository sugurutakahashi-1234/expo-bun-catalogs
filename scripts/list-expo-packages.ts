#!/usr/bin/env bun
import { $ } from "bun";

console.log("📦 Listing all Expo SDK managed packages...\n");

try {
  // apps/expo ディレクトリで expo install --check を実行
  $.cwd("apps/expo");
  const result = await $`bunx expo install --check`.text();

  console.log(result);
  console.log("\n✅ All packages listed above are Expo SDK managed");
} catch (error: any) {
  const errorText = error.stderr?.toString() || error.stdout?.toString() || "";

  if (errorText) {
    console.log(errorText);
  } else {
    console.log("⚠️  Could not list packages. Run 'bun install' first.");
  }
}
