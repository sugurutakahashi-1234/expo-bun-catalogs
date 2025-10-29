#!/usr/bin/env bun
import { $ } from "bun";

console.log("🔍 Checking Expo dependencies...\n");

try {
  // Check if expo dependencies match Expo SDK recommendations
  await $`bunx expo install --check -C apps/expo`;
  console.log("\n✅ All dependencies are correct!");

  // Run expo-doctor for additional health checks
  console.log("\n🏥 Running Expo Doctor...\n");
  await $`bunx expo-doctor -C apps/expo`;

  console.log("\n✅ All checks passed!");
  process.exit(0);
} catch (error) {
  console.error("\n❌ Dependency issues detected!");
  console.error("\nTo fix these issues, run:");
  console.error("  bun run fix:expo");
  process.exit(1);
}
