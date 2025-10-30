#!/usr/bin/env bun
/**
 * カタログ参照の自動修正
 *
 * 目的:
 *   ワークスペースパッケージ（Expoアプリを除く）内の全Expo管理パッケージの
 *   具体的バージョン文字列を自動的に'catalog:'プロトコルに変換する。
 *
 * 動作:
 *   1. bundledNativeModules.jsonを読み込みExpo管理パッケージを特定
 *   2. 全ワークスペースパッケージをスキャン（Expoアプリを除く）
 *   3. Expo管理パッケージの具体的バージョンを'catalog:'に変換
 *   4. 非Expo管理パッケージとworkspace:参照はそのまま維持
 */
import {
  type PackageJson,
  getRootPackageJson,
  findPackageJsonFiles,
  findExpoApp,
} from "./shared/expo-utils";

console.log("🔧 Fixing catalog references for Expo-managed packages...\n");

// 1. bundledNativeModules.json から Expo管理パッケージのリストを取得
const rootPkg = await getRootPackageJson(process.cwd());
const packageJsonFiles = await findPackageJsonFiles(rootPkg);
const expoAppPath = await findExpoApp(packageJsonFiles);

if (!expoAppPath) {
  console.error("❌ No Expo app found in workspace!");
  process.exit(1);
}

const expoAppDir = expoAppPath.replace(process.cwd() + "/", "");
const expoAppPkgPath = `${expoAppPath}/package.json`;
console.log(`🎯 Expo app detected: ${expoAppDir}\n`);

// bundledNativeModules.json を読み込んで Expo管理パッケージを取得
const bundledModulesPath = `${expoAppPath}/node_modules/expo/bundledNativeModules.json`;
let expoManagedPackages: Set<string>;

try {
  const bundledModules = await Bun.file(bundledModulesPath).json();
  expoManagedPackages = new Set(Object.keys(bundledModules));
  console.log(`📦 Found ${expoManagedPackages.size} Expo-managed packages\n`);
} catch (error) {
  console.error("❌ Could not read expo/bundledNativeModules.json");
  console.error("   Make sure expo is installed in the Expo app.\n");
  process.exit(1);
}

// 2. Expoアプリを除く全 package.json を処理
let totalFixed = 0;
const fixedFiles: string[] = [];

for (const pkgPath of packageJsonFiles) {
  // Expoアプリはスキップ（具体的バージョンを使用すべき）
  if (pkgPath === expoAppPkgPath) {
    continue;
  }

  try {
    const pkgJson: PackageJson = await Bun.file(pkgPath).json();
    let hasChanges = false;

    // dependencies と devDependencies をチェック
    for (const depType of ["dependencies", "devDependencies"] as const) {
      const deps = pkgJson[depType];
      if (!deps) continue;

      for (const [name, version] of Object.entries(deps)) {
        // すでに catalog: または workspace: を使用している場合はスキップ
        if (
          typeof version === "string" &&
          !version.startsWith("catalog:") &&
          !version.startsWith("workspace:")
        ) {
          // Expo管理パッケージかチェック
          if (expoManagedPackages.has(name)) {
            deps[name] = "catalog:";
            hasChanges = true;
            totalFixed++;
            console.log(`   ✓ ${pkgPath}`);
            console.log(`     ${name}: "${version}" → "catalog:"`);
          }
        }
      }
    }

    if (hasChanges) {
      await Bun.write(pkgPath, JSON.stringify(pkgJson, null, 2) + "\n");
      fixedFiles.push(pkgPath);
    }
  } catch (error) {
    console.warn(`⚠️  Could not process: ${pkgPath}`);
  }
}

console.log("\n" + "=".repeat(70));
console.log("\n📊 Summary:\n");

if (totalFixed > 0) {
  console.log(`✅ Fixed ${totalFixed} package reference(s) in ${fixedFiles.length} file(s)\n`);
  console.log("📝 Modified files:");
  for (const file of fixedFiles) {
    console.log(`   - ${file}`);
  }
  console.log();
} else {
  console.log("✅ No fixes needed - all Expo-managed packages already use catalog:\n");
}
