const { withGradleProperties } = require('@expo/config-plugins');

module.exports = function withAndroidBuildOptimizations(config) {
  return withGradleProperties(config, (config) => {
    const props = config.modResults;

    function setProp(key, value) {
      const existing = props.findIndex((p) => p.key === key);
      if (existing >= 0) {
        props[existing].value = value;
      } else {
        props.push({ type: 'property', key, value });
      }
    }

    // Enable R8/ProGuard code shrinking & resource shrinking for release builds
    setProp('android.enableMinifyInReleaseBuilds', 'true');
    setProp('android.enableShrinkResourcesInReleaseBuilds', 'true');

    // Enable JS bundle compression
    setProp('android.enableBundleCompression', 'true');

    // Restrict to only arm64-v8a for release APK (modern devices only)
    // Change to 'armeabi-v7a,arm64-v8a' if older 32-bit device support needed
    setProp('reactNativeArchitectures', 'arm64-v8a');

    // Enable legacy packaging to compress native libs in the APK
    setProp('expo.useLegacyPackaging', 'true');

    return config;
  });
};
