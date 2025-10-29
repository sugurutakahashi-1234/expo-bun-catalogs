const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Monorepo: Watch all workspace packages
config.watchFolders = [workspaceRoot];

// Monorepo: Support resolving packages from workspace
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Monorepo: Support workspace protocol
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
