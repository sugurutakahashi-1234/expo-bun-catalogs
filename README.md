# Expo + Bun + Catalog Monorepo

Expo 54 + Bun Workspaces + Catalog機能を使った、**Expo管理パッケージの依存バージョン管理システム**の検証リポジトリ。

> **Catalog とは**: Bun 1.1.30以降で提供される、モノレポ内でパッケージバージョンを一元管理する機能です。root `package.json` に`catalog`フィールドを定義し、各パッケージが`"依存名": "catalog:"`と記述することで、ワークスペース全体で統一されたバージョンを参照できます。
> - [Bun Workspaces](https://bun.sh/docs/install/workspaces)
> - [Bun Catalog](https://bun.sh/docs/install/workspaces#catalog)

## 🎯 このリポジトリの目的

Expo SDK環境下で、**Expo CLIを活用した依存管理**と**Bun Catalogによる一元管理**を両立させるシステムの検証・実装。

## 💡 なぜこのアプローチか

### 課題: Expo管理パッケージの特殊性

Expo SDKは`react`, `react-native`などのパッケージを厳密にバージョン管理しています。

- ❌ 手動でバージョンを指定すると、Expo SDKと非互換になりやすい
- ❌ モノレポで各パッケージが独自にバージョン管理すると不整合が起きる
- ❌ `expo install --fix`や`expo-doctor`などのExpo CLIツールが使えない

### 解決策: Expo CLIを唯一の真実の源（Source of Truth）に

1. **Expoアプリで`expo install`を使う**
   - `bunx expo install <package>` - SDK互換の正しいバージョンを自動取得
   - `bunx expo install --fix` - SDK互換バージョンに自動修正
   - `bunx expo-doctor` - 依存関係の健全性チェック

2. **Bun Catalogで全体に伝播**
   - Expoアプリのバージョン → Catalog に同期
   - 他パッケージは`catalog:`で参照
   - ワークスペース全体でバージョン統一

3. **自動化で手間を削減**
   - スクリプトで同期・変換・検証を自動化
   - 手動管理のミスを防ぐ

### メリット

✅ **Expo CLIの恩恵を受けられる**
- `expo install --fix`で自動修正
- `expo-doctor`で問題検出
- SDK互換性が保証される

✅ **ワークスペース全体で一貫性**
- Catalog経由で全パッケージが同じバージョン
- バージョン不整合がなくなる

✅ **SDK更新が楽**
- Expoアプリで更新 → 自動で全体に反映
- 複数パッケージを個別に更新する必要がない

## 🏗 アーキテクチャの原則

### 1. Expoアプリは`catalog:`を使わない ⚠️ 重要

**理由**: Expo CLIのツールが正しく動作するため

```ts
// apps/expo/package.json - ❌ NG例
{
  "dependencies": {
    "react": "catalog:",  // ❌ expo install --fix が動作しない
    "expo": "catalog:"    // ❌ expo-doctor が正しくチェックできない
  }
}
```

**問題**: Expo CLIがバージョン文字列を解析できず、SDK互換性を判定できない

```ts
// apps/expo/package.json - ✅ OK例
{
  "dependencies": {
    "react": "19.1.0",     // ✅ 具体的バージョン
    "expo": "^54.0.21"     // ✅ Expo CLIが管理可能
  }
}
```

**メリット**: `expo install --fix`で自動修正、`expo-doctor`で検証可能

### 2. 他パッケージは`catalog:`を使う

```ts
// packages/ui/package.json
{
  "dependencies": {
    "react": "catalog:",         // ✅ Expo管理 → root catalogから自動参照
    "react-native": "catalog:", // ✅ Expo管理 → SDK更新時も自動追従
    "lodash": "^4.17.21"          // ⚪ 非Expo管理 → 具体的バージョン指定
  }
}
```

**メリット**: Expoアプリのバージョンと自動統一、バージョン不整合が起きない

### 3. Catalogには**Expo管理パッケージのみ**

```ts
// package.json (root) - ✅ OK例
{
  "catalog": {
    "react": "19.1.0",              // ✅ Expo SDK管理パッケージ
    "react-native": "0.81.5",     // ✅ bundledNativeModules.json に含まれる
    "expo-constants": "~18.0.10"  // ✅ apps/expo から自動同期される
  }
}
```

```ts
// package.json (root) - ❌ NG例
{
  "catalog": {
    "lodash": "^4.17.21",  // ❌ Expo管理外 → 各パッケージで個別指定すべき
    "next": "^15.0.0"      // ❌ Expo管理外 → catalogに含めない
  }
}
```

#### Expo管理パッケージの判定

**判定基準**: `expo/bundledNativeModules.json` に含まれるパッケージのみ

このプロジェクトは `node_modules/expo/bundledNativeModules.json` を直接読み込み、Expo CLIと同じ基準で判定します。

```typescript
// scripts/shared/expo-utils.ts:23-25
const bundledModulesPath = `${expoAppPath}/node_modules/expo/bundledNativeModules.json`;
const bundledModules = await Bun.file(bundledModulesPath).json();
return new Set(Object.keys(bundledModules));
```

**Expo公式ツールも同じファイルを使用**

- **`expo install`** - パッケージのバージョン解決に使用
- **`expo start`** - 起動時に依存関係の整合性をチェック
- **`expo-doctor`** - バージョン整合性チェック

**参考**: [expo/bundledNativeModules.json](https://github.com/expo/expo/blob/main/packages/expo/bundledNativeModules.json) - Expo公式リポジトリ

これにより、Expo CLIとの完全な整合性を保証し、高速（O(1)）かつオフラインで動作します。

### ワークフロー

```
┌─────────────────────┐
│ apps/expo           │  ← Expo CLI が管理
│ bunx expo install   │     expo install --fix
│ (具体的バージョン)   │     expo-doctor
└──────────┬──────────┘
           │ apps/expoのバージョンをcatalogに同期
           ↓
┌─────────────────────┐
│ root catalog        │  ← Expo管理パッケージのみ
│ (バージョン一元管理) │
└──────────┬──────────┘
           │ 他パッケージを catalog: に変換
           ↓
┌─────────────────────┐
│ packages/*          │  ← catalog: 参照
│ (自動でバージョン統一)│
└─────────────────────┘
```

## 📋 スクリプト


| スクリプト | 変更対象ファイル | 実行内容 |
|-----------|--------------|---------|
| `expo:catalog:find` | なし | catalog未定義を検出 |
| `expo:fix` | `apps/expo/package.json` | `expo install --fix`実行 |
| `expo:catalog:sync` | root `package.json` の `catalog` | catalogに同期 |
| `expo:catalog:apply` | `packages/*/package.json` | `catalog:`に変換 |
| `expo:catalog:clean` | root `package.json` の `catalog` | 未使用削除 |
| `expo:catalog:validate` | なし | 整合性検証 |
| `expo:doctor` | なし | 健全性チェック |

## 🚀 基本ワークフロー

### 初回セットアップ

```bash
# 1. インストール
bun install

# 2. スクリプト実行（順番通り）
bun run expo:catalog:find     # 不足確認
bun run expo:fix         # Expo依存修正
bun run expo:catalog:sync     # catalog同期
bun run expo:catalog:apply    # catalog:変換
bun run expo:catalog:clean    # 未使用削除
bun install              # 再インストール
bun run expo:catalog:validate    # 整合性検証
bun run expo:doctor      # Expo検証
```

### 新しいExpo管理パッケージを追加

```bash
# 1. 不足を検出
bun run expo:catalog:find
# → 📦 expo-font, expo-image

# 2. Expoアプリに追加（Expo CLIで正しいバージョン取得）
cd apps/expo && bunx expo install expo-font expo-image && cd ../..

# 3. スクリプト実行
bun run expo:catalog:sync     # catalog同期
bun run expo:catalog:apply    # catalog:変換
bun run expo:catalog:clean    # 未使用削除
bun install              # 再インストール
bun run expo:catalog:validate    # 整合性検証
bun run expo:doctor      # Expo検証
```

### Expo SDKアップデート

```bash
# 1. Expo SDKをアップデート
cd apps/expo && bunx expo install expo@latest && cd ../..

# 2. Peer dependencyの確認と追加
# SDKアップデート後、peer dependencyエラーが出る場合があります
cd apps/expo && bun install
# 例: "react-native-reanimated requires react-native-worklets" のようなエラーが表示された場合

# エラーメッセージで要求されたパッケージを追加
bunx expo install react-native-worklets  # 実際のエラーに応じてパッケージ名を変更
cd ../..

# 3. スクリプト実行
bun run expo:fix         # SDK互換バージョンに修正
bun run expo:catalog:sync     # catalog同期
bun run expo:catalog:apply    # catalog:変換
bun run expo:catalog:clean    # 未使用削除

# 4. クリーンインストール（重複依存関係を解消）
bun run clean:lock       # 全node_modules + bun.lock削除
bun install              # クリーンインストール

# 5. 検証
bun run expo:catalog:validate    # 整合性検証
bun run expo:doctor      # Expo検証（17/17チェック合格が理想）
```

**Note**:
- SDK 54以降へのアップグレード時は、Metro configの変更が必要な場合があります。トラブルシューティングセクションを参照してください。
- `clean:lock`ステップは、expo-doctorの重複依存関係警告を解消するために重要です。

## 🐛 トラブルシューティング

### Metro Config: SDK 54+での変更

SDK 54にアップグレードする際、`apps/expo/metro.config.js`の以下の変更が推奨されます：

**変更前（SDK 53以前）**:
```javascript
config.watchFolders = [workspaceRoot];
config.resolver.disableHierarchicalLookup = true;
```

**変更後（SDK 54+）**:
```javascript
// ExpoのデフォルトwatchFoldersを保持しつつworkspace rootを追加
config.watchFolders = [...(config.watchFolders || []), workspaceRoot];

// disableHierarchicalLookupの行を削除（Expoのデフォルト: false を使用）
// これによりMonorepo環境でモジュール解決が正しく動作します
```

**理由**: SDK 54以降、Expoのデフォルト設定が改善され、monorepo対応が強化されました。`disableHierarchicalLookup: false`により、Metroが親ディレクトリのnode_modulesを正しく解決できます。

### expo-doctor: 重複依存関係の警告

`bunx expo-doctor`を実行すると、重複した依存関係の警告が表示されることがあります：

```
✖ Check that no duplicate dependencies are installed
Found duplicates for expo, expo-constants, react-native...
```

**原因**: Bunのcontent-addressable storageシステムが、異なるpeer dependencyコンテキストで同じバージョンを複数インストールすることがあります。

**解決方法**: 以下のクリーンインストールで解消できます：

```bash
bun run clean:lock  # 全node_modules + bun.lockを削除
bun install         # クリーンインストール
```

**重要**: `bun.lock`も削除することで、Bunが依存関係を再計算し、重複のない最適な構造で再インストールします。

## 📦 他のプロジェクトへの適用方法

このカタログ管理システムを既存のExpo + Bunモノレポに適用する最小限の手順です。

### 前提条件

- Bun workspaces が設定済み
- Expo アプリが workspace 内に存在（`expo` パッケージがインストール済み）
- Expo アプリでは具体的バージョン（`"react": "19.0.0"` など）を使用

### コピーするファイル

以下のファイルを同じディレクトリ構造でコピー：

```
scripts/
├── shared/
│   └── expo-utils.ts
├── expo-find-catalog-gaps.ts
├── expo-validate-catalog.ts
├── expo-sync-catalog.ts
├── expo-apply-catalog-references.ts
└── expo-clean-catalog.ts
```

### package.json の変更

#### root package.json に追加

```ts
// package.json (root)
{
  catalog: {},  // 初期は空、expo:catalog:sync で Expo管理パッケージが同期される
  scripts: {
    // Expo CLIツールの実行（Expoアプリ配下で実行）
    "expo:fix": "bun run --cwd apps/expo fix",
    "expo:check": "bun run --cwd apps/expo check",
    "expo:doctor": "bun run --cwd apps/expo doctor",

    // Catalog管理用の自動化スクリプト
    "expo:catalog:find": "bun run scripts/expo-find-catalog-gaps.ts",
    "expo:catalog:sync": "bun run scripts/expo-sync-catalog.ts",
    "expo:catalog:apply": "bun run scripts/expo-apply-catalog-references.ts",
    "expo:catalog:clean": "bun run scripts/expo-clean-catalog.ts",
    "expo:catalog:validate": "bun run scripts/expo-validate-catalog.ts"
  }
}
```

**注**: `apps/expo` は実際の Expo アプリのパスに置き換えてください。

#### Expo アプリの package.json に追加

```ts
// apps/expo/package.json
{
  scripts: {
    fix: "bunx expo install --fix",      // SDK互換バージョンに自動修正
    check: "bunx expo install --check",  // 依存関係の互換性チェック
    doctor: "bunx expo-doctor"           // 健全性チェック
  }
}
```

## 📖 参考リンク

- [Bun Workspaces](https://bun.sh/docs/install/workspaces)
- [Bun Catalog](https://bun.sh/docs/install/workspaces#catalog)
- [Expo CLI](https://docs.expo.dev/more/expo-cli/)
- [Expo SDK 54](https://docs.expo.dev/versions/v54.0.0/)


## 📄 ライセンス

MIT
