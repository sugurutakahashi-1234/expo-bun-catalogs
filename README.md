# Expo + Bun + Catalog Monorepo

Expo 54 + Bun Workspaces + Catalog機能を使った、**Expo管理パッケージの依存バージョン管理システム**の検証リポジトリ。

> **Catalog とは**: Bun 1.1.30以降で提供される、モノレポ内でパッケージバージョンを一元管理する機能です。rootの`package.json`に`catalog`フィールドを定義し、各パッケージが`"依存名": "catalog:"`と記述することで、ワークスペース全体で統一されたバージョンを参照できます。

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
  dependencies: {
    react: "catalog:",  // ❌ expo install --fix が動作しない
    expo: "catalog:"    // ❌ expo-doctor が正しくチェックできない
  }
}
```

**問題**: Expo CLIがバージョン文字列を解析できず、SDK互換性を判定できない

```ts
// apps/expo/package.json - ✅ OK例
{
  dependencies: {
    react: "19.1.0",     // ✅ 具体的バージョン
    expo: "^54.0.21"     // ✅ Expo CLIが管理可能
  }
}
```

**メリット**: `expo install --fix`で自動修正、`expo-doctor`で検証可能

### 2. 他パッケージは`catalog:`を使う

#### `catalog:` プロトコルとは

`catalog:` は Bun の Catalog 機能で使用する特殊な構文です：

- **自動バージョン参照**: `"react": "catalog:"` と記述すると、root の `catalog` フィールドから自動的にバージョンを参照
- **一元管理**: ワークスペース全体で一箇所（root `catalog`）だけバージョンを更新すれば、全パッケージに反映
- **型安全**: 存在しない catalog エントリを参照するとエラー

```ts
// packages/ui/package.json
{
  dependencies: {
    react: "catalog:",         // ✅ Expo管理 → root catalogから自動参照
    "react-native": "catalog:", // ✅ Expo管理 → SDK更新時も自動追従
    lodash: "^4.17.21"          // ⚪ 非Expo管理 → 具体的バージョン指定
  }
}
```

**メリット**: Expoアプリのバージョンと自動統一、バージョン不整合が起きない

### 3. Catalogには**Expo管理パッケージのみ**

```ts
// package.json (root) - ✅ OK例
{
  catalog: {
    react: "19.1.0",              // ✅ Expo SDK管理パッケージ
    "react-native": "0.81.5",     // ✅ bundledNativeModules.json に含まれる
    "expo-constants": "~18.0.10"  // ✅ apps/expo から自動同期される
  }
}
```

```ts
// package.json (root) - ❌ NG例
{
  catalog: {
    lodash: "^4.17.21",  // ❌ Expo管理外 → 各パッケージで個別指定すべき
    next: "^15.0.0"      // ❌ Expo管理外 → catalogに含めない
  }
}
```

#### Expo管理パッケージの判定方法

**判定基準**: Expoが提供する `bundledNativeModules.json` に含まれるパッケージのみがcatalogに含めるべきです。

このファイルは、Expo SDKが公式に管理しているネイティブモジュールの一覧を定義しており、`expo install`コマンドが互換性のあるバージョンを自動選択する際にも使用されます。

#### なぜ `bundledNativeModules.json` を基準にするのか

**このプロジェクトでの実装**

このプロジェクトは、インストール済みのExpoパッケージから`node_modules/expo/bundledNativeModules.json`を直接読み込んでいます。これにより、Expo CLIが使用するのと**全く同じファイル**を参照することで、完全な整合性を保証しています。

```typescript
// scripts/shared/expo-utils.ts:23-25
const bundledModulesPath = `${expoAppPath}/node_modules/expo/bundledNativeModules.json`;
const bundledModules = await Bun.file(bundledModulesPath).json();
return new Set(Object.keys(bundledModules));
```

**Expo公式ツールも同じファイルを使用**

Expo CLIツール群も、このプロジェクトと同じファイルを参照しています：

1. **`expo install`** - パッケージのバージョン解決に使用
   - 実装: [validateDependenciesVersions.ts](https://github.com/expo/expo-cli/blob/34d972657bad805ca09bd3956eaad255445ae3de/packages/expo-cli/src/commands/utils/validateDependenciesVersions.ts)
   - `getBundledNativeModulesAsync()`でSDK対応バージョンを取得

2. **`expo start`** - 依存関係の検証に使用
   - 実装: [Issue #599](https://github.com/expo/expo-cli/issues/599) / [PR #772](https://github.com/expo/expo-cli/pull/772)
   - 2019年6月に実装：起動時に`bundledNativeModules.json`との整合性をチェック

3. **`expo-doctor`** - バージョン整合性チェックのフォールバック
   - API障害時のフォールバックとして`bundledNativeModules.json`を使用

**参考リンク**

- 公式ファイル: [expo/bundledNativeModules.json](https://github.com/expo/expo/blob/main/packages/expo/bundledNativeModules.json)
- SDK 53には115+のパッケージが定義されている（react, react-native, expo-*, @react-native-*, コミュニティパッケージ）

**採用理由**

1. **公式との整合性**: Expo CLIと同じ情報源を使うことで、バージョン判定の一貫性を保証
2. **高速**: 1回のファイル読み込みで115+パッケージをO(1)で判定（`expo install --check`の100回以上のCLI呼び出しと比較）
3. **信頼性**: オフライン動作可能、CLIのバージョン間の違いに影響されない
4. **自動更新**: SDK更新時に自動的に最新のパッケージリストが反映される

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

## 📋 スクリプト（実行順）

**基本フロー**: `expo:sdk:sync` → `expo:sdk:fix` → `bun install` → `expo:sdk:validate`

### 1. `bun run expo:sdk:detect`
- **何をする**: catalog未定義のExpo管理パッケージを検出
- **ファイル変更**: なし（レポートのみ）
- **いつ使う**: 最初に。何が足りないか確認

### 2. `bun run expo:fix`
- **何をする**: Expoアプリで`expo install --fix`を実行
- **ファイル変更**: `apps/expo/package.json` - 依存バージョンをSDK互換に自動修正
- **いつ使う**: SDK更新後、パッケージ追加後

### 3. `bun run expo:sdk:sync`
- **何をする**: ExpoアプリのExpo管理パッケージをrootのcatalogに同期
- **ファイル変更**: `package.json`（root） - `catalog`フィールドを更新/追加
- **いつ使う**: expo:fix実行後

### 4. `bun run expo:sdk:fix`
- **何をする**: 他パッケージの具体的バージョンを`catalog:`に自動変換
- **ファイル変更**: `packages/*/package.json` - 依存関係を`catalog:`に変換
- **いつ使う**: expo:sdk:sync実行後

### 5. `bun run expo:sdk:clean`
- **何をする**: 未使用catalogエントリを削除
- **ファイル変更**: `package.json`（root） - `catalog`から未使用エントリ削除
- **いつ使う**: expo:sdk:fix実行後

### 6. `bun run expo:sdk:validate`
- **何をする**: 依存関係の整合性を検証（エラー検出）
- **ファイル変更**: なし（検証のみ）
- **いつ使う**: 変更後は必ず実行

### 7. `bun run expo:doctor`
- **何をする**: Expoアプリで`expo-doctor`を実行
- **ファイル変更**: なし（チェックのみ）
- **いつ使う**: 最終検証として（必ず実行）

## 🚀 基本ワークフロー

### 初回セットアップ

```bash
# 1. インストール
bun install

# 2. スクリプト実行（順番通り）
bun run expo:sdk:detect   # 不足確認
bun run expo:fix         # Expo依存修正
bun run expo:sdk:sync     # catalog同期
bun run expo:sdk:fix      # catalog:変換
bun run expo:sdk:clean    # 未使用削除
bun install              # 再インストール
bun run expo:sdk:validate    # 整合性検証
bun run expo:doctor      # Expo検証
```

### 新しいExpo管理パッケージを追加

```bash
# 1. 不足を検出
bun run expo:sdk:detect
# → 📦 expo-font, expo-image

# 2. Expoアプリに追加（Expo CLIで正しいバージョン取得）
cd apps/expo && bunx expo install expo-font expo-image && cd ../..

# 3. スクリプト実行
bun run expo:sdk:sync     # catalog同期
bun run expo:sdk:fix      # catalog:変換
bun run expo:sdk:clean    # 未使用削除
bun install              # 再インストール
bun run expo:sdk:validate    # 整合性検証
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
bun run expo:sdk:sync     # catalog同期
bun run expo:sdk:fix      # catalog:変換
bun run expo:sdk:clean    # 未使用削除

# 4. クリーンインストール（重複依存関係を解消）
bun run clean:lock       # 全node_modules + bun.lock削除
bun install              # クリーンインストール

# 5. 検証
bun run expo:sdk:validate    # 整合性検証
bun run expo:doctor      # Expo検証（17/17チェック合格が理想）
```

**Note**:
- SDK 54以降へのアップグレード時は、Metro configの変更が必要な場合があります。トラブルシューティングセクションを参照してください。
- `clean:lock`ステップは、expo-doctorの重複依存関係警告を解消するために重要です。

## 🎯 設計原則

### 1. expo:sdk:validate を起点とする

常に`bun run expo:sdk:validate`から始め、エラーメッセージの指示に従う。

### 2. ExpoアプリはExpo CLI経由のみ

```bash
# ✅ Good
bunx expo install <package>

# ❌ Bad - 手動編集しない
# "expo-font": "~13.0.1" を直接編集
```

### 3. catalogは自動同期のみ

```bash
# ✅ Good
bun run expo:sdk:sync

# ❌ Bad - 手動編集しない
# catalog に直接パッケージを追加
```

## 🐛 トラブルシューティング

### バージョン不一致エラー

```bash
bun run expo:fix
bun run expo:sdk:sync
bun install
bun run expo:doctor
```

### Metroがパッケージを解決できない

```bash
cd apps/expo && bunx expo start -c
```

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

**その他のクリーンコマンド**:
```bash
bun run clean        # node_modulesのみ削除（bun installは手動実行）
bun run clean:cache  # Bunのグローバルキャッシュもクリア
```

**補足**: `clean`コマンドは`find`を使用しているため、プロジェクトのどこから実行しても全てのnode_modulesを削除できます。

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
- [Expo SDK 54](https://docs.expo.dev/versions/v54.0.0/)

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
├── expo-sdk-detect-missing.ts
├── expo-sdk-validate-catalog.ts
├── expo-sdk-sync-catalog.ts
├── expo-sdk-fix-references.ts
└── expo-sdk-clean-catalog.ts
```

### package.json の変更

#### ルート package.json に追加

```ts
// package.json (root)
{
  catalog: {},  // 初期は空、expo:sdk:sync で Expo管理パッケージが同期される
  scripts: {
    // Expo CLIツールの実行（Expoアプリ配下で実行）
    "expo:fix": "bun run --cwd apps/expo fix",
    "expo:check": "bun run --cwd apps/expo check",
    "expo:doctor": "bun run --cwd apps/expo doctor",

    // Catalog管理用の自動化スクリプト
    "expo:sdk:sync": "bun run scripts/expo-sdk-sync-catalog.ts",
    "expo:sdk:validate": "bun run scripts/expo-sdk-validate-catalog.ts",
    "expo:sdk:detect": "bun run scripts/expo-sdk-detect-missing.ts",
    "expo:sdk:fix": "bun run scripts/expo-sdk-fix-references.ts",
    "expo:sdk:clean": "bun run scripts/expo-sdk-clean-catalog.ts"
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

### セットアップ完了後

ファイル配置が完了したら、上記の [🚀 基本ワークフロー](#-基本ワークフロー) セクションの「初回セットアップ」手順に従ってください。

### 重要なルール

- **Expo アプリ**: 具体的バージョンのみ（`catalog:` 使用禁止）
- **他の packages**: Expo 管理パッケージは `catalog:` を使用
- **カタログ**: Expo 管理パッケージのみ含める（`bundledNativeModules.json` 基準）

## 📄 ライセンス

MIT
