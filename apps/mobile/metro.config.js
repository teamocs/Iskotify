// Learn more https://docs.expo.dev/guides/monorepos
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// 1. Watch all files within the monorepo so changes in shared packages trigger reloads
config.watchFolders = [...(config.watchFolders ?? []), workspaceRoot];

// 2. Let Metro know where to resolve packages (app first, workspace root second)
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules")
];

// 3. Treat .wasm and .svg files as binary assets
config.resolver.assetExts = [...(config.resolver.assetExts ?? []), 'wasm', 'svg'];

module.exports = withNativeWind(config, {
  input: path.resolve(projectRoot, "global.css")
});
