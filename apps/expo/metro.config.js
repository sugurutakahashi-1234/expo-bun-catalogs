const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Monorepo: Augment Expo's default watchFolders with workspace root
config.watchFolders = [...(config.watchFolders || []), workspaceRoot];

// Monorepo: Support resolving packages from workspace
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Use Expo's default disableHierarchicalLookup (false)
// This allows Metro to resolve modules correctly in monorepo setups

module.exports = config;
