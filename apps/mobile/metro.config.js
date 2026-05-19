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

// 3. SVG transformer — import SVG files as React Native SVG components
config.transformer.babelTransformerPath = require.resolve('react-native-svg-transformer');
config.resolver.assetExts = (config.resolver.assetExts ?? []).filter(ext => ext !== 'svg');
config.resolver.sourceExts = [...(config.resolver.sourceExts ?? []), 'svg'];

// 4. Keep wasm as a binary asset
config.resolver.assetExts = [...config.resolver.assetExts, 'wasm'];

module.exports = withNativeWind(config, {
  input: path.resolve(projectRoot, "global.css")
});
