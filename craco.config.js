const webpack = require('webpack');
const ModuleScopePlugin = require('react-dev-utils/ModuleScopePlugin');

module.exports = {
  webpack: {
    configure: (config) => {
      config.resolve.plugins = (config.resolve.plugins || []).filter(
        (plugin) => !(plugin instanceof ModuleScopePlugin)
      );

      // Node core polyfills for xlsx-populate (Excel password encryption) in the browser
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        buffer: require.resolve('buffer/'),
        stream: require.resolve('stream-browserify'),
        crypto: require.resolve('crypto-browserify'),
        process: require.resolve('process/browser.js'),
        fs: false,
        path: false,
        os: false,
        net: false,
        tls: false,
        child_process: false,
        util: false,
        assert: false,
        http: false,
        https: false,
        url: false,
        zlib: false,
        vm: false,
        constants: false,
      };

      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        'process/browser': require.resolve('process/browser.js'),
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
