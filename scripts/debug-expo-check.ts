#!/usr/bin/env bun
import { $ } from "bun";

const testPackages = [
  "expo",
  "react",
  "react-native",
  "date-fns",
  "color",
  "@types/react",
];

console.log("🔍 Testing expo install --check output...\n");

process.chdir("apps/expo");

for (const pkg of testPackages) {
  console.log("=".repeat(70));
  console.log(`\n📦 Testing: ${pkg}\n`);

  try {
    const result = await $`bunx expo install ${pkg} --check`.text();
    console.log("✅ Success (no error)");
    console.log("📄 Output:");
    console.log(result);
  } catch (error: any) {
    console.log("❌ Error thrown");
    console.log("📄 stderr:");
    console.log(error.stderr?.toString() || "(empty)");
    console.log("\n📄 stdout:");
    console.log(error.stdout?.toString() || "(empty)");
  }

  console.log("");
}
