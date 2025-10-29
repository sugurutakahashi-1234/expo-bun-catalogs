#!/usr/bin/env bun
import { $, Glob } from "bun";
import { dirname } from "node:path";

// ルート package.json から workspaces と catalog を取得
async function getRootPackageJson(baseDir: string) {
  try {
    return await Bun.file(`${baseDir}/package.json`).json();
  } catch (error) {
    console.error("⚠️  Could not read root package.json");
    process.exit(1);
  }
}

// Expo 依存を持つパッケージを自動検出
async function findExpoApp(packageJsonFiles: string[]): Promise<string | null> {
  for (const pkgPath of packageJsonFiles) {
    try {
      const pkgJson = await Bun.file(pkgPath).json();
      const deps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };

      if (deps.expo) {
        return dirname(pkgPath);
      }
    } catch (error) {
      // package.json が読めない場合はスキップ
    }
  }
  return null;
}

// ワークスペース内の全 package.json を検索
async function findPackageJsonFiles(rootPkg: any): Promise<string[]> {
  const workspacePatterns = rootPkg.workspaces || [];
  const packageJsonPaths: string[] = [];

  for (const pattern of workspacePatterns) {
    const globPattern = pattern.endsWith("/*")
      ? `${pattern}/package.json`
      : `${pattern}/*/package.json`;

    const globber = new Glob(globPattern);

    for await (const file of globber.scan(".")) {
      packageJsonPaths.push(file);
    }
  }

  return packageJsonPaths;
}

// パッケージが Expo 管理対象かチェック
async function isExpoManaged(pkg: string, expoAppPath: string): Promise<boolean> {
  const originalCwd = process.cwd();

  try {
    process.chdir(expoAppPath);

    // 出力内容を取得して解析
    await $`bunx expo install ${pkg} --check`.text();

    process.chdir(originalCwd);

    // "Dependencies are up to date" = バージョン情報なし = Expo 非管理
    // エラーなく完了した場合は非管理
    return false;
  } catch (error: any) {
    process.chdir(originalCwd);

    const errorText = error.stderr?.toString() || error.stdout?.toString() || "";

    // "should be updated" / "expected version" = Expo 管理対象
    if (
      errorText.includes("should be updated") ||
      errorText.includes("expected version") ||
      errorText.includes("is using the correct version")
    ) {
      return true; // Expo 管理対象
    }

    // "not found in the Expo SDK" = 明示的に非管理
    if (
      errorText.includes("not found in the Expo SDK") ||
      errorText.includes("is not managed by the Expo SDK") ||
      errorText.includes("not supported") ||
      errorText.includes("not included")
    ) {
      return false; // 明示的に非管理
    }

    // その他のエラーは非管理として扱う
    return false;
  }
}

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
  depType: "dependencies" | "peerDependencies" | "devDependencies";
};

const allDeps = new Map<string, DependencyInfo[]>();

for (const pkgPath of packageJsonFiles) {
  try {
    const pkgJson = await Bun.file(pkgPath).json();

    console.log(`📄 ${pkgPath}:`);

    // dependencies, peerDependencies, devDependencies を全てチェック
    const depTypes: Array<"dependencies" | "peerDependencies" | "devDependencies"> = [
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

        const isCatalog = version.startsWith("catalog:");
        const isWorkspace = version.startsWith("workspace:");

        if (!isWorkspace) {
          if (!allDeps.has(name)) {
            allDeps.set(name, []);
          }

          allDeps.get(name)!.push({
            version: version as string,
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
console.log("🔍 Checking which packages are managed by Expo SDK...\n");

// 全ユニークなパッケージを Expo 管理対象かチェック
const expoManagedStatus = new Map<string, boolean>();
const uniquePackages = Array.from(allDeps.keys()).sort();

for (const pkg of uniquePackages) {
  process.stdout.write(`   Checking ${pkg}...`);
  const isManaged = await isExpoManaged(pkg, expoAppPath);
  expoManagedStatus.set(pkg, isManaged);

  // デバッグ: 判定結果を確認
  const status = isManaged ? "Expo managed" : "Not Expo managed";
  process.stdout.write(`\r   ${isManaged ? "✅" : "  "} ${pkg.padEnd(50)} ${status}\n`);
}

console.log("\n" + "=".repeat(70));
console.log("\n📋 Analysis Results:\n");

// 問題を検出（ファイル単位でグループ化）
type PackageStatus = {
  pkg: string;
  hasError: boolean;
  messages: string[];
  depType: string;
};

const packagesByFile = new Map<string, PackageStatus[]>();

for (const [pkg, usages] of allDeps.entries()) {
  const isManaged = expoManagedStatus.get(pkg) || false;

  // Expo管理パッケージのみを対象
  if (!isManaged) continue;

  for (const usage of usages) {
    const messages: string[] = [];

    // [ERROR 1] Expo管理対象なのにcatalogを使っていない
    if (!usage.isCatalog && usage.depType === "dependencies") {
      messages.push(`Should use "catalog:" but found "${usage.version}"`);
    }

    // [ERROR 2] Expo管理対象が devDependencies に配置されている（@types/* 以外）
    // peerDependencies は許容（React Native ライブラリの標準パターン）
    if (usage.depType === "devDependencies" && !pkg.startsWith("@types/")) {
      messages.push(`Found in devDependencies, should be in dependencies`);
    }

    // [ERROR 3] catalogを参照しているがcatalog定義がない
    if (usage.isCatalog && !catalog[pkg]) {
      messages.push(`Uses "catalog:" but not defined in root catalog`);
    }

    // [ERROR 4] catalogに定義があるがバージョンが異なる
    if (
      !usage.isCatalog &&
      catalog[pkg] &&
      usage.version !== catalog[pkg] &&
      usage.depType === "dependencies"
    ) {
      messages.push(`Version mismatch with catalog: expected "${catalog[pkg]}"`);
    }

    // ファイル別にグループ化（エラーの有無に関わらず）
    if (!packagesByFile.has(usage.source)) {
      packagesByFile.set(usage.source, []);
    }

    packagesByFile.get(usage.source)!.push({
      pkg,
      hasError: messages.length > 0,
      messages,
      depType: usage.depType,
    });
  }
}

// 結果表示
let totalIssues = 0;
let totalCorrect = 0;
let filesWithErrors = 0;

// ファイルごとに表示
for (const [file, packages] of packagesByFile.entries()) {
  const hasErrors = packages.some((p) => p.hasError);
  const fileIcon = hasErrors ? "❌" : "✅";

  if (hasErrors) filesWithErrors++;

  console.log(`${fileIcon} ${file}`);

  for (const status of packages) {
    if (status.hasError) {
      const message = status.messages.join(", ");
      console.log(`  ❌ ${status.pkg}: ${message}`);
      totalIssues++;
    } else {
      const depTypeLabel = status.depType !== "dependencies" ? ` (${status.depType})` : "";
      console.log(`  ✅ ${status.pkg}: catalog${depTypeLabel}`);
      totalCorrect++;
    }
  }

  console.log("");
}

// サマリー表示
console.log("─".repeat(70));
if (totalIssues > 0) {
  console.log(
    `\n📊 Summary: ${totalIssues} issue(s) found in ${filesWithErrors} file(s), ${totalCorrect} packages correctly configured\n`
  );
  console.log("💡 Fix: Use \"catalog:\" for all Expo-managed packages in dependencies\n");
  process.exit(1);
} else {
  console.log(`\n✅ All Expo-managed packages are correctly configured!`);
  console.log(`📊 Summary: ${totalCorrect} packages using catalog correctly\n`);
}
