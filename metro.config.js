const { getDefaultConfig } = require('expo/metro-config');

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

module.exports = config;
