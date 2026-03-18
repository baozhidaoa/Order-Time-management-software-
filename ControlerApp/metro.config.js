const os = require('os');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

if (typeof os.availableParallelism !== 'function') {
  os.availableParallelism = () => {
    const cpus = typeof os.cpus === 'function' ? os.cpus() : [];
    return Array.isArray(cpus) && cpus.length > 0 ? cpus.length : 1;
  };
}

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
