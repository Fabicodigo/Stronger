const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Asegurarse de que el bundler Metro resuelva correctamente los archivos TTF
if (config.resolver) {
  if (!config.resolver.assetExts.includes('ttf')) {
    config.resolver.assetExts.push('ttf');
  }
}

module.exports = config;
