#!/usr/bin/env bun
import { $ } from "bun";

console.log("🔄 Restoring catalog references after expo install --fix...\n");

// ルート package.json を取得
const rootPkgPath = "./package.json";
const rootPkg = await Bun.file(rootPkgPath).json();

if (!rootPkg.catalog) {
  rootPkg.catalog = {};
}

// Expo 管理パッケージの判定（check-expo-managed.ts から共通化すべきだが、簡易版）
async function isExpoManaged(pkg: string): Promise<boolean> {
  // Expo アプリを探す
  const expoAppPath = "apps/expo"; // 仮に固定

  try {
    const originalCwd = process.cwd();
    process.chdir(expoAppPath);

    await $`bunx expo install ${pkg} --check`.quiet();

    process.chdir(originalCwd);
    return false; // 成功 = 非管理
  } catch (error: any) {
    process.chdir(process.cwd());

    const errorText = error.stderr?.toString() || "";
    if (
      errorText.includes("should be updated") ||
      errorText.includes("expected version") ||
      errorText.includes("is using the correct version")
    ) {
      return true; // Expo 管理対象
    }

    return false;
  }
}

// Git diff で変更されたファイルを検出
let changedFiles: string[] = [];
try {
  const diffOutput = await $`git diff --name-only`.text();
  changedFiles = diffOutput
    .split("\n")
    .filter((f) => f.endsWith("package.json") && !f.includes("node_modules"));

  if (changedFiles.length === 0) {
    console.log("ℹ️  No package.json changes detected. Nothing to restore.\n");
    process.exit(0);
  }

  console.log(`📝 Detected changes in ${changedFiles.length} file(s):\n`);
  changedFiles.forEach((f) => console.log(`   - ${f}`));
  console.log("");
} catch (error) {
  console.error("⚠️  Git not available. Running full scan instead.\n");
  // Gitがない場合は全ファイルをスキャン
  changedFiles = [
    "apps/expo/package.json",
    "packages/ui/package.json",
    "packages/forms/package.json",
    "packages/navigation/package.json",
    "packages/utils/package.json",
  ].filter((f) => {
    try {
      return Bun.file(f).size > 0;
    } catch {
      return false;
    }
  });
}

// 変更を検出してcatalogを更新
const catalogUpdates = new Map<string, string>();
const restoredFiles: string[] = [];

for (const filePath of changedFiles) {
  try {
    const pkgJson = await Bun.file(filePath).json();
    let hasChanges = false;

    // dependencies, peerDependencies, devDependencies をチェック
    const depTypes = ["dependencies", "peerDependencies", "devDependencies"] as const;

    for (const depType of depTypes) {
      const deps = pkgJson[depType] || {};

      for (const [pkgName, version] of Object.entries(deps)) {
        if (typeof version !== "string") continue;
        if (version.startsWith("workspace:")) continue;

        // catalogを使っていないExpo管理パッケージを検出
        if (!version.startsWith("catalog:")) {
          const isManaged = await isExpoManaged(pkgName);

          if (isManaged) {
            // catalogに追加・更新
            catalogUpdates.set(pkgName, version as string);

            // package.jsonを catalog: に書き換え
            deps[pkgName] = "catalog:";
            hasChanges = true;
          }
        }
      }
    }

    // 変更があればファイルを保存
    if (hasChanges) {
      await Bun.write(filePath, JSON.stringify(pkgJson, null, 2) + "\n");
      restoredFiles.push(filePath);
    }
  } catch (error) {
    console.warn(`⚠️  Could not process: ${filePath}`);
  }
}

// ルート package.json の catalog を更新
if (catalogUpdates.size > 0) {
  console.log("✏️  Updating root catalog:\n");

  for (const [pkg, version] of catalogUpdates.entries()) {
    const isNew = !rootPkg.catalog[pkg];
    const symbol = isNew ? "+" : "~";
    console.log(`   ${symbol} ${pkg}: "${version}"`);
    rootPkg.catalog[pkg] = version;
  }

  await Bun.write(rootPkgPath, JSON.stringify(rootPkg, null, 2) + "\n");
  console.log("");
}

// 復元されたファイルを表示
if (restoredFiles.length > 0) {
  console.log("🔧 Restored catalog references in:\n");
  for (const file of restoredFiles) {
    console.log(`   ✅ ${file}`);
  }
  console.log("");
}

// bun install を実行
if (catalogUpdates.size > 0 || restoredFiles.length > 0) {
  console.log("📦 Running bun install...\n");
  await $`bun install`.quiet();
  console.log("✅ Done! All Expo packages now use catalog.\n");
} else {
  console.log("ℹ️  No changes needed. All packages already use catalog.\n");
}
