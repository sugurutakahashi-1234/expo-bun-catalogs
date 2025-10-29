#!/usr/bin/env bun
import {
  type PackageJson,
  type DependencyType,
  getRootPackageJson,
  findPackageJsonFiles,
  findExpoApp,
  isExpoManaged,
  isCatalogReference,
  isWorkspaceReference,
  isTypesPackage,
  validateCatalogIntegrity,
} from "./shared/expo-utils";

console.log("🔍 Analyzing workspace dependencies and catalog usage...\n");

const rootPkg = await getRootPackageJson(process.cwd());
const catalog = rootPkg.catalog || {};
const packageJsonFiles = await findPackageJsonFiles(rootPkg);

console.log(`📦 Found ${packageJsonFiles.length} packages in workspace\n`);

// 各 package.json を解析
type DependencyInfo = {
  version: string;
  source: string;
  isCatalog: boolean;
  depType: DependencyType;
};

const allDeps = new Map<string, DependencyInfo[]>();

for (const pkgPath of packageJsonFiles) {
  try {
    const pkgJson: PackageJson = await Bun.file(pkgPath).json();

    console.log(`📄 ${pkgPath}:`);

    // dependencies, peerDependencies, devDependencies を全てチェック
    const depTypes: DependencyType[] = [
      "dependencies",
      "peerDependencies",
      "devDependencies",
    ];

    for (const depType of depTypes) {
      const deps = pkgJson[depType] || {};
      const hasAnyDeps = Object.keys(deps).length > 0;

      if (hasAnyDeps && depType !== "dependencies") {
        console.log(`   [${depType}]:`);
      }

      for (const [name, version] of Object.entries(deps)) {
        if (typeof version !== "string") continue;

        const isCatalog = isCatalogReference(version);
        const isWorkspace = isWorkspaceReference(version);

        if (!isWorkspace) {
          if (!allDeps.has(name)) {
            allDeps.set(name, []);
          }

          allDeps.get(name)!.push({
            version,
            source: pkgPath,
            isCatalog,
            depType,
          });

          const versionDisplay = isCatalog ? "catalog:" : version;
          const prefix = depType !== "dependencies" ? "     " : "   ";
          console.log(`${prefix}- ${name.padEnd(40)} ${versionDisplay}`);
        }
      }
    }

    console.log("");
  } catch (error) {
    if (!pkgPath.includes("node_modules")) {
      console.warn(`⚠️  Could not read: ${pkgPath}\n`);
    }
  }
}

// Expo アプリを検出
const expoAppPath = await findExpoApp(packageJsonFiles);

if (!expoAppPath) {
  console.error("❌ No Expo app found in workspace!");
  console.error("   Make sure you have a package with 'expo' dependency.\n");
  process.exit(1);
}

console.log(`🎯 Using Expo app: ${expoAppPath}\n`);

// apps/expo/package.json を読み込んでバージョン情報を取得
const expoAppPkgPath = `${expoAppPath}/package.json`;
const expoAppPkg: PackageJson = await Bun.file(expoAppPkgPath).json();
const expoAppVersions = new Map<string, string>();

// apps/expo の全依存関係のバージョンを記録
for (const depType of ["dependencies", "devDependencies"] as DependencyType[]) {
  const deps = expoAppPkg[depType] || {};
  for (const [name, version] of Object.entries(deps)) {
    if (typeof version === "string" && !isWorkspaceReference(version) && !isCatalogReference(version)) {
      expoAppVersions.set(name, version);
    }
  }
}

console.log("🔍 Checking which packages are managed by Expo SDK...\n");

// 全ユニークなパッケージを Expo 管理対象かチェック
const expoManagedStatus = new Map<string, boolean>();
const uniquePackages = Array.from(allDeps.keys()).sort();

for (const pkg of uniquePackages) {
  process.stdout.write(`   Checking ${pkg}...`);
  const isManaged = await isExpoManaged(pkg, expoAppPath);
  expoManagedStatus.set(pkg, isManaged);

  const status = isManaged ? "Expo managed" : "Not Expo managed";
  process.stdout.write(`\r   ${isManaged ? "✅" : "  "} ${pkg.padEnd(50)} ${status}\n`);
}

// Catalog整合性チェック: catalogに非Expo管理パッケージがないか検証
console.log("\n🔍 Validating catalog integrity...\n");
const nonManagedInCatalog = await validateCatalogIntegrity(catalog, expoAppPath);

if (nonManagedInCatalog.length > 0) {
  console.log("❌ Catalog Integrity Violations Found:\n");
  for (const pkg of nonManagedInCatalog) {
    console.log(`   ❌ ${pkg}: NOT Expo-managed`);
    console.log(`      Principle: Only Expo-managed packages should be in the catalog`);
    console.log(`      Action: Remove "${pkg}" from root package.json catalog field\n`);
  }
} else {
  console.log("✅ All catalog entries are Expo-managed packages\n");
}

console.log("=".repeat(70));
console.log("\n📋 Analysis Results:\n");

// 問題を検出（ファイル単位でグループ化）
type PackageStatus = {
  pkg: string;
  depType: "dependencies" | "devDependencies" | "peerDependencies" | "catalog";
  status: "error" | "warning" | "success";
  messages: string[];
};

const packagesByFile = new Map<string, PackageStatus[]>();

for (const [pkg, usages] of allDeps.entries()) {
  const isManaged = expoManagedStatus.get(pkg) || false;

  for (const usage of usages) {
    const messages: string[] = [];
    const warnings: string[] = [];
    const isExpoApp = usage.source === expoAppPkgPath;

    // Expo管理パッケージの検証
    if (isManaged) {
      if (isExpoApp) {
        // ===== apps/expo/package.json の検証 =====
        // [ERROR] Expo管理パッケージは具体的なバージョンを使用すべき
        if (usage.isCatalog && usage.depType === "dependencies") {
          messages.push(`Expo-managed package must use concrete version, found "catalog:"`);
        }

        // [WARNING] devDependencies に配置（@types/* 以外）
        if (usage.depType === "devDependencies" && !isTypesPackage(pkg)) {
          warnings.push(`Found in devDependencies, should be in dependencies`);
        }
      } else {
        // ===== 他のワークスペースパッケージの検証 =====
        // [ERROR] Expo管理パッケージはcatalogを使用すべき
        if (!usage.isCatalog && usage.depType === "dependencies") {
          messages.push(`Expo-managed package must use "catalog:", found "${usage.version}"`);
        }

        // [WARNING] 具体的なバージョンがapps/expoと異なる
        if (!usage.isCatalog && usage.depType === "dependencies") {
          const expoVersion = expoAppVersions.get(pkg);
          if (expoVersion && usage.version !== expoVersion) {
            warnings.push(`Version ${usage.version} differs from apps/expo ${expoVersion}`);
          }
        }

        // [WARNING] devDependencies に配置（@types/* 以外）
        if (usage.depType === "devDependencies" && !isTypesPackage(pkg)) {
          warnings.push(`Found in devDependencies, consider moving to dependencies`);
        }
      }
    }

    // catalog参照の検証（Expo管理の有無に関わらず）
    if (usage.isCatalog) {
      // [ERROR] catalogを参照しているがcatalog定義がない
      if (!catalog[pkg]) {
        messages.push(`Uses "catalog:" but not defined in root catalog`);
      }
    }

    // ファイル別にグループ化
    if (!packagesByFile.has(usage.source)) {
      packagesByFile.set(usage.source, []);
    }

    // Expo管理パッケージまたはエラー/警告がある場合のみ記録
    if (messages.length > 0) {
      packagesByFile.get(usage.source)!.push({
        pkg,
        depType: usage.depType,
        status: "error",
        messages,
      });
    } else if (warnings.length > 0) {
      packagesByFile.get(usage.source)!.push({
        pkg,
        depType: usage.depType,
        status: "warning",
        messages: warnings,
      });
    } else if (isManaged) {
      packagesByFile.get(usage.source)!.push({
        pkg,
        depType: usage.depType,
        status: "success",
        messages: [],
      });
    }
  }
}

// Catalog使用状況の追跡
const usedCatalogEntries = new Set<string>();

for (const [pkg, usages] of allDeps.entries()) {
  for (const usage of usages) {
    if (usage.isCatalog) {
      usedCatalogEntries.add(pkg);
    }
  }
}

// 未使用のcatalogエントリを検出
const unusedCatalogEntries: string[] = [];
for (const catalogPkg of Object.keys(catalog)) {
  if (!usedCatalogEntries.has(catalogPkg)) {
    unusedCatalogEntries.push(catalogPkg);
  }
}

// 未使用catalogエントリをエラーとして追加
if (unusedCatalogEntries.length > 0) {
  if (!packagesByFile.has("package.json")) {
    packagesByFile.set("package.json", []);
  }

  for (const pkg of unusedCatalogEntries) {
    packagesByFile.get("package.json")!.push({
      pkg,
      depType: "catalog",
      status: "warning",
      messages: ["Catalog entry not referenced by any package (consider removing from catalog)"],
    });
  }
}

// 結果表示
let totalErrors = 0;
let totalWarnings = 0;
let totalCorrect = 0;
let filesWithErrors = 0;
let filesWithWarnings = 0;

// ファイルごとに表示
for (const [file, packages] of packagesByFile.entries()) {
  const hasErrors = packages.some((p) => p.status === "error");
  const hasWarnings = packages.some((p) => p.status === "warning");
  const fileIcon = hasErrors ? "❌" : hasWarnings ? "⚠️ " : "✅";

  if (hasErrors) filesWithErrors++;
  if (hasWarnings && !hasErrors) filesWithWarnings++;

  console.log(`${fileIcon} ${file}`);

  for (const status of packages) {
    switch (status.status) {
      case "error":
        console.log(`  ❌ ${status.pkg}: ${status.messages.join(", ")}`);
        totalErrors++;
        break;
      case "warning":
        console.log(`  ⚠️  ${status.pkg}: ${status.messages.join(", ")}`);
        totalWarnings++;
        break;
      case "success":
        const depTypeLabel =
          status.depType === "catalog"
            ? " (root catalog)"
            : status.depType !== "dependencies"
              ? ` (${status.depType})`
              : "";
        const versionInfo = status.depType === "dependencies" || status.depType === "catalog" ? " ✓" : "";
        console.log(`  ✅ ${status.pkg}:${depTypeLabel}${versionInfo}`);
        totalCorrect++;
        break;
    }
  }

  console.log("");
}

// サマリー表示
console.log("─".repeat(70));

// Catalog整合性違反もエラーとしてカウント
const catalogIntegrityErrors = nonManagedInCatalog.length;
const totalErrorsIncludingCatalog = totalErrors + catalogIntegrityErrors;

if (totalErrorsIncludingCatalog > 0) {
  console.log(
    `\n📊 Summary: ${totalErrorsIncludingCatalog} error(s) in ${filesWithErrors + (catalogIntegrityErrors > 0 ? 1 : 0)} file(s), ${totalWarnings} warning(s)\n`
  );
  console.log("💡 Fix suggestions:");
  if (catalogIntegrityErrors > 0) {
    console.log("   1. Remove non-Expo-managed packages from root package.json catalog");
  }
  console.log("   2. For apps/expo: Use concrete versions for Expo-managed packages");
  console.log("   3. For other packages: Use \"catalog:\" for Expo-managed packages");
  console.log("   4. Remove unused catalog entries from package.json");
  console.log("   5. Run: bun run sync:catalog (after fixing apps/expo)\n");
  process.exit(1);
} else if (totalWarnings > 0) {
  console.log(
    `\n⚠️  Summary: ${totalWarnings} warning(s) in ${filesWithWarnings} file(s), ${totalCorrect} packages correctly configured\n`
  );
  console.log("💡 Warnings can be ignored, but consider reviewing them for best practices\n");
} else {
  console.log(`\n✅ All packages are correctly configured!`);
  console.log(`📊 Summary: ${totalCorrect} packages validated\n`);
}
