const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite's web worker loads SQLite as a WebAssembly asset.
config.resolver.assetExts.push('wasm');

module.exports = config;
