#!/usr/bin/env bun
/**
 * Expo管理パッケージの不足検出
 *
 * 目的:
 *   ワークスペースパッケージで具体的バージョンを使用しているExpo管理パッケージのうち、
 *   rootのcatalogに定義されていないものを検出する。
 *
 * 動作:
 *   1. 全ワークスペースパッケージをスキャン（Expoアプリを除く）
 *   2. 具体的バージョンを使用しているExpo管理パッケージを特定
 *   3. rootのcatalogに存在するかチェック
 *   4. 不足しているパッケージと使用箇所を報告
 *   5. インストールコマンドを提供
 */
import {
  type PackageJson,
  getRootPackageJson,
  findPackageJsonFiles,
  findExpoApp,
  isExpoManaged,
} from "./shared/expo-utils";

console.log("🔍 Detecting missing Expo-managed packages...\n");

const rootPkg = await getRootPackageJson(process.cwd());
const catalog = rootPkg.catalog || {};
const packageJsonFiles = await findPackageJsonFiles(rootPkg);
const expoAppPath = await findExpoApp(packageJsonFiles);

if (!expoAppPath) {
  console.error("❌ No Expo app found in workspace!");
  process.exit(1);
}

const expoAppDir = expoAppPath.replace(process.cwd() + "/", "");
const expoAppPkgPath = `${expoAppPath}/package.json`;

console.log(`🎯 Using Expo app: ${expoAppDir}\n`);

// パッケージ名 → 使用場所のマップ
const missingPackages = new Map<string, string[]>();

// 全パッケージをスキャン
for (const pkgPath of packageJsonFiles) {
  // apps/expoは除外（Source of Truth）
  if (pkgPath === expoAppPkgPath) continue;

  try {
    const pkgJson: PackageJson = await Bun.file(pkgPath).json();

    for (const depType of ["dependencies", "devDependencies"] as const) {
      const deps = pkgJson[depType];
      if (!deps) continue;

      for (const [name, version] of Object.entries(deps)) {
        if (typeof version !== "string") continue;

        // catalog:参照やworkspace:参照は除外
        if (version.startsWith("catalog:") || version.startsWith("workspace:")) {
          continue;
        }

        // Expo管理パッケージかチェック
        const isManaged = await isExpoManaged(name, expoAppPath);
        if (!isManaged) continue;

        // catalogに存在しないかチェック
        if (!catalog[name]) {
          if (!missingPackages.has(name)) {
            missingPackages.set(name, []);
          }
          missingPackages.get(name)!.push(pkgPath);
        }
      }
    }
  } catch (error) {
    console.warn(`⚠️  Could not process: ${pkgPath}`);
  }
}

console.log("=".repeat(70));
console.log("\n📊 Result:\n");

if (missingPackages.size === 0) {
  console.log("✅ No missing packages found!\n");
  console.log("All Expo-managed packages are already in the catalog.\n");
  process.exit(0);
}

console.log(`📦 Found ${missingPackages.size} package(s) missing from catalog:\n`);

for (const [pkg, locations] of Array.from(missingPackages.entries()).sort()) {
  const locationStr = locations.map((loc) => loc.replace(process.cwd() + "/", "")).join(", ");
  console.log(`   - ${pkg}`);
  console.log(`     (used in: ${locationStr})`);
}

const packageList = Array.from(missingPackages.keys()).sort().join(" ");

console.log("\n💡 To add these packages, run:\n");
console.log(`   bunx expo install ${packageList}\n`);
