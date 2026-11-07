const webpack = require('webpack');
const ModuleScopePlugin = require('react-dev-utils/ModuleScopePlugin');

module.exports = {
  webpack: {
    configure: (config) => {
      config.resolve.plugins = config.resolve.plugins.filter(
        (plugin) => !(plugin instanceof ModuleScopePlugin)
      );
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        buffer: require.resolve('buffer/'),
        stream: require.resolve('stream-browserify'),
        crypto: require.resolve('crypto-browserify'),
        process: require.resolve('process/browser.js'),
        fs: false,
        path: false,
        util: false,
        vm: false,
      };
      config.plugins.push(
        new webpack.ProvidePlugin({
          Buffer: ['buffer', 'Buffer'],
          process: 'process/browser.js',
        })
      );
      return config;
    },
  },
};
