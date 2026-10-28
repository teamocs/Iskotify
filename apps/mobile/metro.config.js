// Learn more https://docs.expo.dev/guides/monorepos
const { getDefaultConfig } = require("expo/metro-config");
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

// 5. Ship only what the app uses (install size)
//    - Lineicons: both icon packages re-export every icon (two full sets,
//      ~6.8 MB of source). lib/lineicons.js holds the imported ones; regenerate
//      it with `node scripts/lineicons-subset.js`.
//    - expo-symbols (pulled into Android by expo-router's native tabs) imports
//      useFonts from the Material Symbols package root, whose index requires all
//      18 font files (~17 MB). It only ever loads the regular weight, which it
//      imports by subpath.
const lineiconsSubset = path.resolve(projectRoot, 'lib/lineicons.js');
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@lineiconshq/free-icons') {
    return { type: 'sourceFile', filePath: lineiconsSubset };
  }
  if (moduleName === '@expo-google-fonts/material-symbols') {
    return context.resolveRequest(context, '@expo-google-fonts/material-symbols/useFonts', platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
