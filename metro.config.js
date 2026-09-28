const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Optimize the Metro bundler for production:
config.transformer.minifierConfig = {
  compress: {
    drop_console: false,
    drop_debugger: true,
    reduce_funcs: true,
    reduce_vars: true,
    unused: true,
    dead_code: true,
    if_return: true,
    join_vars: true,
    warnings: false,
  },
  output: { comments: false },
  mangle: {
    safari10: false,
  },
};

// Reduce RAM usage during bundling
config.maxWorkers = 2;

// Ignore unnecessary files
config.resolver.blockList = [
  /\.git.*/,
  /\.expo.*/,
  /android\/build\/.*/,
  /node_modules\/.*\/__tests__\/.*/,
  /node_modules\/.*\/android\/build\/.*/,
];

// Shim native-only modules that cannot run on web
const WEB_SHIM_PATH = path.resolve(__dirname, 'lib', 'web-shim-empty.js');
const nativeOnlyModules = [
  'react-native-maps',
  'mapbox-gl',
];

const _originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && nativeOnlyModules.includes(moduleName)) {
    return { type: 'sourceFile', filePath: WEB_SHIM_PATH };
  }
  if (_originalResolveRequest) {
    return _originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
