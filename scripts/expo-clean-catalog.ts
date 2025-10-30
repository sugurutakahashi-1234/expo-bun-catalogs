#!/usr/bin/env bun
/**
 * 未使用カタログエントリのクリーンアップ
 *
 * 目的:
 *   どのワークスペースパッケージからも参照されていないcatalogエントリを削除する。
 *   catalogを綺麗で保守しやすい状態に保つ。
 *
 * 動作:
 *   1. 全ワークスペースパッケージをスキャンし使用されているcatalogエントリを特定
 *   2. 参照のないcatalogエントリを識別
 *   3. rootのpackage.jsonのcatalogから未使用エントリを削除
 *   4. クリーンアップ内容を報告
 */
import {
  type PackageJson,
  getRootPackageJson,
  findPackageJsonFiles,
  isCatalogReference,
  isWorkspaceReference,
} from "./shared/expo-utils";

console.log("🧹 Cleaning unused catalog entries...\n");

// 1. root package.json を読み込み、catalogを取得
const rootPkg = await getRootPackageJson(process.cwd());
const catalog = rootPkg.catalog || {};
const catalogEntries = Object.keys(catalog);

if (catalogEntries.length === 0) {
  console.log("ℹ️  No catalog entries found in root package.json\n");
  process.exit(0);
}

console.log(`📦 Found ${catalogEntries.length} catalog entries\n`);

// 2. ワークスペース内の全 package.json を検索
const packageJsonFiles = await findPackageJsonFiles(rootPkg);

// 3. 使用されている catalog エントリを追跡
const usedCatalogEntries = new Set<string>();

for (const pkgPath of packageJsonFiles) {
  try {
    const pkgJson: PackageJson = await Bun.file(pkgPath).json();

    // 全依存関係タイプをチェック
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
    // 読み込めないファイルはスキップ
  }
}

// 4. 未使用の catalog エントリを検出
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

  // 5. 未使用エントリを削除
  console.log("\n🗑️  Removing unused entries from catalog...\n");

  for (const entry of unusedEntries) {
    delete catalog[entry];
    console.log(`   ✓ Removed: ${entry}`);
  }

  // 6. 更新された root package.json を保存
  rootPkg.catalog = catalog;
  await Bun.write("./package.json", JSON.stringify(rootPkg, null, 2) + "\n");

  console.log("\n✅ Root package.json updated successfully!\n");
} else {
  console.log("\n✅ All catalog entries are in use!\n");
}
