const fs = require('fs');
const path = require('path');
const {withAppBuildGradle} = require('expo/config-plugins');

module.exports = function withNativeScrollPerformance(config) {
  return withAppBuildGradle(config, cfg => {
    // Inline in app/build.gradle so AGP and the visitor share its classloader.
    // A separately applied script with its own AGP dependency duplicates API
    // classes, making InstrumentationScope/AsmClassVisitorFactory incompatible.
    const start = '// @generated begin cinehub-native-scroll-performance';
    const end = '// @generated end cinehub-native-scroll-performance';
    const source = fs.readFileSync(
      path.join(cfg.modRequest.projectRoot, 'native-src/android/gradle/with-native-scroll-performance.gradle'),
      'utf8',
    );
    const verification = fs.readFileSync(
      path.join(cfg.modRequest.projectRoot, 'scripts/verify-native-scroll-guard.gradle'),
      'utf8',
    );
    const content = cfg.modResults.contents
      .replace(/\n?\/\/ @generated begin cinehub-native-scroll-performance[\s\S]*?\/\/ @generated end cinehub-native-scroll-performance\n?/g, '\n')
      .replace(/^apply from: 'with-native-scroll-performance.gradle'\s*\r?\n/gm, '');
    cfg.modResults.contents = content.trimEnd() + '\n\n' + start + '\n' + source + '\n' + verification + '\n' + end + '\n';
    return cfg;
  });
};
