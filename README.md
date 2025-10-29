# Expo + Bun + Catalog Monorepo

Expo 53 ベースのモノレポ構成で、Bun の **catalog** 機能を使った依存バージョン管理のベストプラクティス実装。

## 📦 構成

```
expo-bun-catalogs/
├── package.json              # catalog + overrides + workspace
├── apps/
│   └── expo/                 # Expo 53 アプリ
│       ├── package.json      # catalog: 参照
│       ├── app.json
│       ├── App.tsx
│       └── metro.config.js
├── packages/
│   └── ui/                   # 共有UIコンポーネント
│       ├── package.json      # dependencies (catalog 参照)
│       └── src/
└── scripts/
    └── check-deps.mjs        # 依存チェックスクリプト
```

## 🚀 セットアップ

### 1. 依存をインストール

```bash
bun install
```

### 2. Expo の正解バージョンを確定

```bash
cd apps/expo
bunx expo install --fix
bunx expo-doctor
```

### 3. catalog に反映（必要に応じて）

`apps/expo/package.json` の依存バージョンをルートの `catalog` に反映：

```json
// package.json (ルート)
{
  "catalog": {
    "expo": "~53.0.0",
    "react": "18.3.1",
    "react-native": "0.76.5"
  }
}
```

### 4. アプリを起動

```bash
cd apps/expo
bun start
```

## 🛠 便利コマンド

### 依存チェック

```bash
# Expo 推奨バージョンとの比較
bun run check:expo

# ヘルスチェック
bun run doctor

# 特定パッケージの重複確認
bun run why:rn
```

### 依存修正

```bash
# Expo SDK に合わせて自動修正
bun run fix:expo
```

### 全体チェック（CI用）

```bash
bun run check:deps
```

## 📚 catalog の使い方

### catalog で管理するパッケージ

```json
// package.json (ルート)
{
  "catalog": {
    "expo": "~53.0.0",
    "react": "18.3.1",
    "react-native": "0.76.5"
  }
}
```

### catalog を参照

```json
// apps/expo/package.json
{
  "dependencies": {
    "expo": "catalog:",
    "react": "catalog:"
  }
}
```

```json
// packages/ui/package.json
{
  "dependencies": {
    "react": "catalog:",
    "react-native": "catalog:"
  }
}
```

## 🔄 バージョンアップデートフロー

### Expo SDK をアップデートする場合

```bash
# 1. apps/expo で Expo SDK をアップデート
cd apps/expo
bunx expo install expo@latest

# 2. 依存を自動修正
bunx expo install --fix

# 3. ルートの catalog に反映
# apps/expo/package.json → ルート package.json の catalog へコピー

# 4. ルートで再インストール
cd ../..
bun install

# 5. チェック
bun run check:expo
```

### 個別パッケージをアップデートする場合

```bash
# 1. catalog のバージョンを更新
# package.json の catalog セクションを編集

# 2. 再インストール
bun install

# 3. チェック
bun run check:expo
```

## 🧩 overrides の使い方

間接依存のバージョンを強制統一する場合：

```json
// package.json (ルート)
{
  "overrides": {
    "react": "18.3.1",
    "react-native": "0.76.5",
    "react-native-reanimated": "~3.16.1"
  }
}
```

## 🏗 新しい共有パッケージの追加

```bash
# 1. パッケージディレクトリを作成
mkdir -p packages/new-package/src

# 2. package.json を作成
cat > packages/new-package/package.json << 'EOF'
{
  "name": "@packages/new-package",
  "version": "1.0.0",
  "main": "./src/index.ts",
  "dependencies": {
    "react": "catalog:",
    "react-native": "catalog:"
  }
}
EOF

# 3. 再インストール
bun install
```

## 🔍 トラブルシューティング

### バージョン不一致エラー

```bash
# Expo の推奨バージョンに修正
bun run fix:expo

# ロックファイルを再生成
bun install --force
```

### Metro がパッケージを解決できない

```bash
# Metro キャッシュをクリア
cd apps/expo
bunx expo start -c
```

### TypeScript エラー

```bash
# 依存をインストール
bun install

# TypeScript キャッシュをクリア
rm -rf apps/expo/.expo
```

## 📝 CI/CD 設定例

```yaml
# .github/workflows/check.yml
name: Check Dependencies

on: [pull_request]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run check:deps
```

## 🎯 ベストプラクティス

1. **catalog で一元管理**
   - React/RN 系は必ず catalog に登録
   - バージョンアップは catalog だけ更新

2. **overrides で衝突防止**
   - 間接依存で問題が出たら overrides でピン

3. **定期的にチェック**
   - PR ごとに `bun run check:deps` を実行
   - Expo SDK アップデート前後は `bunx expo-doctor` を実行

4. **共有パッケージは軽量に**
   - 必要最小限の依存のみ
   - catalog 参照で統一

## 📖 参考リンク

- [Bun Workspaces](https://bun.sh/docs/install/workspaces)
- [Bun Catalog](https://bun.sh/docs/install/workspaces#catalog)
- [Expo CLI](https://docs.expo.dev/more/expo-cli/)
- [Expo Doctor](https://docs.expo.dev/more/expo-cli/#doctor)
