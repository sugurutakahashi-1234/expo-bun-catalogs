import { $, Glob } from "bun";
import { dirname } from "node:path";

export type PackageJson = {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  catalog?: Record<string, string>;
  workspaces?: string[];
};

export type DependencyType = "dependencies" | "devDependencies" | "peerDependencies";

/**
 * Check if a package is managed by Expo SDK
 * @param pkg Package name to check
 * @param expoAppPath Path to Expo app directory
 * @returns true if package is Expo-managed
 */
export async function isExpoManaged(pkg: string, expoAppPath: string): Promise<boolean> {
  const originalCwd = process.cwd();

  try {
    process.chdir(expoAppPath);
    await $`bunx expo install ${pkg} --check`.quiet();
    process.chdir(originalCwd);
    return false; // 成功 = 非管理
  } catch (error: any) {
    process.chdir(originalCwd);

    const errorText = error.stderr?.toString() || error.stdout?.toString() || "";

    // Expo 管理パターン
    if (
      errorText.includes("should be updated") ||
      errorText.includes("expected version") ||
      errorText.includes("is using the correct version")
    ) {
      return true;
    }

    // 明示的に非管理
    if (
      errorText.includes("not found in the Expo SDK") ||
      errorText.includes("is not managed by the Expo SDK")
    ) {
      return false;
    }

    return false; // デフォルトは非管理
  }
}

/**
 * Read root package.json
 * @param baseDir Base directory (defaults to process.cwd())
 * @returns Parsed package.json
 */
export async function getRootPackageJson(baseDir: string = process.cwd()): Promise<PackageJson> {
  try {
    return await Bun.file(`${baseDir}/package.json`).json();
  } catch (error) {
    console.error("⚠️  Could not read root package.json");
    process.exit(1);
  }
}

/**
 * Find all package.json files in workspace
 * @param rootPkg Root package.json with workspaces configuration
 * @returns Array of package.json file paths
 */
export async function findPackageJsonFiles(rootPkg: PackageJson): Promise<string[]> {
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

/**
 * Find Expo app in workspace
 * @param packageJsonFiles Array of package.json file paths
 * @returns Path to Expo app directory, or null if not found
 */
export async function findExpoApp(packageJsonFiles: string[]): Promise<string | null> {
  for (const pkgPath of packageJsonFiles) {
    try {
      const pkgJson: PackageJson = await Bun.file(pkgPath).json();
      const deps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };

      if (deps.expo) {
        return dirname(pkgPath);
      }
    } catch (error) {
      // Skip unreadable files
    }
  }
  return null;
}

/**
 * Check if version string is a catalog reference
 * @param version Version string
 * @returns true if catalog reference
 */
export function isCatalogReference(version: string): boolean {
  return version.startsWith("catalog:");
}

/**
 * Check if version string is a workspace reference
 * @param version Version string
 * @returns true if workspace reference
 */
export function isWorkspaceReference(version: string): boolean {
  return version.startsWith("workspace:");
}

/**
 * Check if package is a types package
 * @param pkg Package name
 * @returns true if @types/* package
 */
export function isTypesPackage(pkg: string): boolean {
  return pkg.startsWith("@types/");
}
