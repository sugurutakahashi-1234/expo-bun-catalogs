#!/usr/bin/env bun
import {
  type PackageJson,
  getRootPackageJson,
  findPackageJsonFiles,
  isCatalogReference,
  isWorkspaceReference,
} from "./shared/expo-utils";

console.log("🧹 Cleaning unused catalog entries...\n");

// 1. Read root package.json and get catalog
const rootPkg = await getRootPackageJson(process.cwd());
const catalog = rootPkg.catalog || {};
const catalogEntries = Object.keys(catalog);

if (catalogEntries.length === 0) {
  console.log("ℹ️  No catalog entries found in root package.json\n");
  process.exit(0);
}

console.log(`📦 Found ${catalogEntries.length} catalog entries\n`);

// 2. Find all package.json files in workspace
const packageJsonFiles = await findPackageJsonFiles(rootPkg);

// 3. Track which catalog entries are used
const usedCatalogEntries = new Set<string>();

for (const pkgPath of packageJsonFiles) {
  try {
    const pkgJson: PackageJson = await Bun.file(pkgPath).json();

    // Check all dependency types
    for (const depType of ["dependencies", "devDependencies", "peerDependencies"] as const) {
      const deps = pkgJson[depType];
      if (!deps) continue;

      for (const [name, version] of Object.entries(deps)) {
        if (typeof version === "string" && isCatalogReference(version)) {
          usedCatalogEntries.add(name);
        }
      }
    }
  } catch (error) {
    // Skip unreadable files
  }
}

// 4. Find unused catalog entries
const unusedEntries: string[] = [];

for (const catalogPkg of catalogEntries) {
  if (!usedCatalogEntries.has(catalogPkg)) {
    unusedEntries.push(catalogPkg);
  }
}

console.log("=".repeat(70));
console.log("\n📊 Analysis:\n");

console.log(`✅ Used catalog entries: ${usedCatalogEntries.size}`);
for (const entry of Array.from(usedCatalogEntries).sort()) {
  console.log(`   - ${entry}`);
}

if (unusedEntries.length > 0) {
  console.log(`\n⚠️  Unused catalog entries: ${unusedEntries.length}`);
  for (const entry of unusedEntries.sort()) {
    console.log(`   - ${entry}: ${catalog[entry]}`);
  }

  // 5. Remove unused entries
  console.log("\n🗑️  Removing unused entries from catalog...\n");

  for (const entry of unusedEntries) {
    delete catalog[entry];
    console.log(`   ✓ Removed: ${entry}`);
  }

  // 6. Save updated root package.json
  rootPkg.catalog = catalog;
  await Bun.write("./package.json", JSON.stringify(rootPkg, null, 2) + "\n");

  console.log("\n✅ Root package.json updated successfully!\n");
  console.log("💡 Next steps:");
  console.log("   1. Review the changes: git diff package.json");
  console.log("   2. Run: bun install");
  console.log("   3. Run: bun run check:managed\n");
} else {
  console.log("\n✅ All catalog entries are in use!\n");
}
