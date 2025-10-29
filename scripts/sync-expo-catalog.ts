#!/usr/bin/env bun
import {
  type PackageJson,
  getRootPackageJson,
  findPackageJsonFiles,
  findExpoApp,
  isExpoManaged,
  isWorkspaceReference,
  isCatalogReference,
  validateCatalogIntegrity,
} from "./shared/expo-utils";

type CatalogUpdate = {
  pkg: string;
  oldVersion: string | undefined;
  newVersion: string;
  action: "added" | "updated" | "unchanged";
};

async function syncExpoCatalog() {
  console.log("🔄 Syncing Expo catalog from Expo app...\n");

  // 1. Read root package.json
  const rootPkg = await getRootPackageJson();

  // 2. Find all package.json files in workspace
  const packageJsonFiles = await findPackageJsonFiles(rootPkg);

  // 3. Dynamically find Expo app
  const expoAppPath = await findExpoApp(packageJsonFiles);

  if (!expoAppPath) {
    console.error("❌ No Expo app found in workspace!");
    console.error("   Make sure you have a package with 'expo' dependency.\n");
    process.exit(1);
  }

  console.log(`🎯 Using Expo app: ${expoAppPath}\n`);

  const expoAppPkgPath = `${expoAppPath}/package.json`;

  let expoAppPkg: PackageJson;
  try {
    expoAppPkg = await Bun.file(expoAppPkgPath).json();
  } catch (error) {
    console.error(`❌ Could not read ${expoAppPkgPath}`);
    console.error("   Make sure you're running this from the workspace root.\n");
    process.exit(1);
  }
  const catalog = rootPkg.catalog || {};

  // 4. Get all dependencies from Expo app (dependencies + devDependencies)
  const expoDeps: Record<string, string> = {
    ...expoAppPkg.dependencies,
    ...expoAppPkg.devDependencies,
  };

  // Filter out workspace: and catalog: references
  const expoPackages = Object.entries(expoDeps)
    .filter(
      ([_, version]) =>
        !isWorkspaceReference(version) && !isCatalogReference(version)
    )
    .map(([name, version]) => ({ name, version }));

  console.log(`📦 Found ${expoPackages.length} packages in Expo app\n`);

  if (expoPackages.length === 0) {
    console.log("ℹ️  No packages to sync (all use workspace: or catalog:)\n");
    process.exit(0);
  }

  // 5. Check which are Expo-managed and update catalog
  const updates: CatalogUpdate[] = [];

  for (const { name, version } of expoPackages) {
    process.stdout.write(`   Checking ${name}...`);

    const isManaged = await isExpoManaged(name, expoAppPath);

    if (isManaged) {
      const oldVersion = catalog[name];
      const action =
        !oldVersion ? "added" : oldVersion !== version ? "updated" : "unchanged";

      catalog[name] = version;

      updates.push({
        pkg: name,
        oldVersion,
        newVersion: version,
        action,
      });

      const symbol = action === "added" ? "➕" : action === "updated" ? "🔄" : "✅";
      process.stdout.write(
        `\r   ${symbol} ${name.padEnd(50)} ${version}\n`
      );
    } else {
      process.stdout.write(
        `\r   ⚪ ${name.padEnd(50)} (not Expo-managed, use concrete version)\n`
      );
    }
  }

  // 6. Validate catalog integrity: Check if any non-Expo-managed packages are in catalog
  console.log("\n🔍 Validating catalog integrity...\n");
  const nonManagedInCatalog = await validateCatalogIntegrity(catalog, expoAppPath);

  if (nonManagedInCatalog.length > 0) {
    console.log("⚠️  Warning: Non-Expo-managed packages found in catalog:\n");
    for (const pkg of nonManagedInCatalog) {
      console.log(`   ⚠️  ${pkg}: NOT Expo-managed`);
      console.log(`      Principle: Only Expo-managed packages should be in the catalog`);
      console.log(`      Action: Remove "${pkg}" from root package.json catalog field\n`);
    }
  }

  // 7. Check for packages in catalog that are no longer in Expo app
  const removedPackages: string[] = [];
  for (const [pkg] of Object.entries(catalog)) {
    if (!expoDeps[pkg]) {
      removedPackages.push(pkg);
    }
  }

  // 7. Report and confirm
  console.log("\n" + "=".repeat(70));
  console.log("\n📊 Catalog Sync Summary:\n");

  const added = updates.filter((u) => u.action === "added");
  const updated = updates.filter((u) => u.action === "updated");
  const unchanged = updates.filter((u) => u.action === "unchanged");

  if (added.length > 0) {
    console.log("➕ Added to catalog:");
    added.forEach((u) => console.log(`   ${u.pkg}: ${u.newVersion}`));
    console.log("");
  }

  if (updated.length > 0) {
    console.log("🔄 Updated in catalog:");
    updated.forEach((u) =>
      console.log(`   ${u.pkg}: ${u.oldVersion} → ${u.newVersion}`)
    );
    console.log("");
  }

  if (unchanged.length > 0) {
    console.log(`✅ ${unchanged.length} packages already up-to-date\n`);
  }

  if (removedPackages.length > 0) {
    console.log("⚠️  Warning: Packages in catalog but not in Expo app:");
    removedPackages.forEach((pkg) => console.log(`   ${pkg}: ${catalog[pkg]}`));
    console.log("   (These will NOT be removed automatically)\n");
  }

  // 8. Write updated root package.json
  if (added.length > 0 || updated.length > 0) {
    rootPkg.catalog = catalog;
    await Bun.write("./package.json", JSON.stringify(rootPkg, null, 2) + "\n");
    console.log("✅ Root package.json updated successfully!\n");

    console.log("💡 Next steps:");
    console.log("   1. Review the changes: git diff package.json");
    console.log("   2. Run: bun install");
    console.log("   3. Run: bun run check:managed\n");
  } else {
    console.log("✅ Catalog is already synchronized, no changes needed!\n");
  }
}

syncExpoCatalog().catch((error) => {
  console.error("❌ Error syncing catalog:");
  console.error(error);
  process.exit(1);
});
