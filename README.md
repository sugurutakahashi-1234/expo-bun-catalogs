# Expo + Bun + Catalog Monorepo

Expo 53 + Bun Workspaces + Catalog機能を使った、**Expo管理パッケージの依存バージョン管理システム**の検証リポジトリ。

## 🎯 このリポジトリの目的

Expo SDK 53環境において、以下を実現するための仕組みを検証・実装します:

1. **Expo管理パッケージのみをCatalogで管理** - `bundledNativeModules.json`を基準に判定
2. **apps/expoを唯一の真実の源（Source of Truth）とする** - Expo CLIが管理するバージョンをワークスペース全体に伝播
3. **自動検証・修正スクリプト** - 手動管理を最小化し、一貫性を保つ

## 🏗 アーキテクチャ原則

### Expo管理パッケージのみをCatalogで管理

```json
// ✅ catalogに含める（Expo管理パッケージ）
{
  "catalog": {
    "react": "19.0.0",
    "react-native": "0.79.6",
    "expo-constants": "~17.0.3",
    "react-native-screens": "~4.11.1"
  }
}

// ❌ catalogに含めない（非Expo管理）
// - @react-navigation/native
// - next, zod, lodash など
```

### ワークフロー

```
apps/expo (具体的バージョン)
    ↓ sync:catalog
root catalog (Expo管理のみ)
    ↓ fix:catalog
packages/* (catalog: 参照)
```

## 🚀 クイックスタート

```bash
# 1. インストール
bun install

# 2. Expo依存を確定
cd apps/expo && bunx expo install --fix && cd ../..

# 3. catalogに同期
bun run sync:catalog && bun install

# 4. 検証
bun run check:managed
```

## 🛠 主要スクリプト

### `bun run check:managed` ⭐️ 最重要

依存関係の一貫性を検証し、問題を発見・修正方法を提示。

```bash
$ bun run check:managed

✅ apps/expo/package.json
  ✅ react: ✓

❌ packages/navigation/package.json
  ❌ expo-font: must use "catalog:", but not defined in root catalog
     Action: Add "expo-font" to apps/expo and run "bun run sync:catalog"
```

**検証内容**:
- Expo管理パッケージの判定（`bundledNativeModules.json`基準）
- Catalog整合性（非Expo管理パッケージがcatalogに含まれていないか）
- apps/expoは具体的バージョン使用
- 他パッケージはcatalog:参照使用

### 修正スクリプト

| スクリプト | 説明 |
|-----------|------|
| `bun run sync:catalog` | apps/expo → root catalog へ同期 |
| `bun run fix:catalog` | 具体的バージョン → `catalog:` に変換 |
| `bun run clean:catalog` | 未使用catalogエントリを削除 |

### Expoアプリ関連

| スクリプト | 説明 |
|-----------|------|
| `bun run expo:fix` | apps/expoで`expo install --fix` |
| `bun run expo:check` | apps/expoで`expo install --check` |
| `bun run expo:doctor` | apps/expoで`expo-doctor` |
| `bun run fix:all` | expo:fix + sync:catalog + bun install |

## 📋 典型的なワークフロー

### 新しいExpo管理パッケージを追加

```bash
# 1. 検証して問題を発見
bun run check:managed
# → ❌ expo-font: not defined in root catalog

# 2. apps/expoに追加
cd apps/expo && bunx expo install expo-font && cd ../..

# 3. 同期・変換
bun run sync:catalog
bun run fix:catalog
bun install

# 4. 再検証
bun run check:managed
```

### Expo SDKアップデート

```bash
# 1. apps/expoでSDK更新
cd apps/expo && bunx expo install expo@latest && bunx expo install --fix && cd ../..

# 2. 同期
bun run sync:catalog && bun install

# 3. 検証
bun run check:managed
```

## 🎯 設計原則

### 1. check:managed を起点とする

常に`bun run check:managed`から始め、エラーメッセージの指示に従う。

### 2. apps/expoはExpo CLI経由のみ

```bash
# ✅ Good
bunx expo install <package>

# ❌ Bad - 手動編集しない
# "expo-font": "~13.0.1" を直接編集
```

### 3. catalogは自動同期のみ

```bash
# ✅ Good
bun run sync:catalog

# ❌ Bad - 手動編集しない
# catalog に直接パッケージを追加
```

## 🔍 実装の詳細

### Expo管理判定

`expo/bundledNativeModules.json`を直接読み込み判定：

```typescript
// scripts/shared/expo-utils.ts
const bundledModulesPath = `${expoAppPath}/node_modules/expo/bundledNativeModules.json`;
const bundledModules = await Bun.file(bundledModulesPath).json();
const expoManagedPackages = new Set(Object.keys(bundledModules));
```

### エラー検出の分類

| 場所 | エラー | 意味 |
|-----|-------|------|
| apps/expo | catalog:使用 | 具体的バージョンを使うべき |
| 他パッケージ | 具体的バージョン使用 | catalog:を使うべき |
| 他パッケージ | catalogに未定義 | apps/expoに追加→syncが必要 |
| root catalog | 非Expo管理パッケージ | 原則違反、削除が必要 |

### 3つの主要なエラーケース

**1. catalogに存在しないExpo管理パッケージ**
```
❌ expo-font: must use "catalog:", but not defined in root catalog
   Action: Add to apps/expo and run sync:catalog
```
→ apps/expoに追加してsync

**2. catalogに存在するが参照していない**
```
❌ react: must use "catalog:", found "19.0.0"
```
→ `fix:catalog`で自動修正可能

**3. 非Expo管理パッケージがcatalogに含まれる**
```
❌ lodash: NOT Expo-managed
   Principle: Only Expo-managed packages should be in catalog
```
→ 手動でcatalogから削除

## 🐛 トラブルシューティング

### バージョン不一致エラー

```bash
cd apps/expo && bunx expo install --fix && cd ../..
bun run sync:catalog && bun install
```

### Metroがパッケージを解決できない

```bash
cd apps/expo && bunx expo start -c
```

## 📊 検証用パッケージ

このリポジトリには、エラーケースを検証するための`broken-*`パッケージが含まれています：

- `packages/broken-version` - バージョン不一致
- `packages/broken-mixed` - Expo管理・非管理混在
- `packages/broken-dev` - devDependencies配置
- `packages/broken-peer` - peerDependencies

## 📖 参考リンク

- [Bun Workspaces](https://bun.sh/docs/install/workspaces)
- [Bun Catalog](https://bun.sh/docs/install/workspaces#catalog)
- [Expo CLI](https://docs.expo.dev/more/expo-cli/)
- [Expo SDK 53](https://docs.expo.dev/versions/v53.0.0/)

## 📄 ライセンス

MIT
