const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const ANDROID_SDK_PATH = 'C:\\Android\\Sdk';
const VALID_NDK_VERSION = '27.1.12297006';

function ensureFileContains(filePath, content) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, content);
    return;
  }

  const existing = fs.readFileSync(filePath, 'utf8');
  const lines = existing.split(/\r?\n/);
  const filtered = lines.filter((line) => !line.trim().startsWith('sdk.dir=') && !line.trim().startsWith('android.ndkVersion=') && !line.trim().startsWith('Pkg.Revision'));
  filtered.push(`sdk.dir=${ANDROID_SDK_PATH}`);
  filtered.push(`android.ndkVersion=${VALID_NDK_VERSION}`);
  fs.writeFileSync(filePath, `${filtered.join('\n')}\n`);
}

function clearStaleNativeCaches(projectRoot) {
  const stalePaths = [
    path.join(projectRoot, 'android', '.gradle'),
    path.join(projectRoot, 'android', 'app', '.cxx'),
    path.join(projectRoot, 'android', 'build'),
    path.join(projectRoot, 'node_modules', 'expo-updates', 'android', '.cxx'),
    path.join(projectRoot, 'node_modules', 'expo-updates', 'android', 'build'),
  ];

  for (const stalePath of stalePaths) {
    if (fs.existsSync(stalePath)) {
      fs.rmSync(stalePath, { recursive: true, force: true });
    }
  }
}

module.exports = function withCustomAndroidBuild(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;

      const localPropsPath = path.join(projectRoot, 'android', 'local.properties');
      ensureFileContains(localPropsPath, `sdk.dir=${ANDROID_SDK_PATH}\n`);

      const gradlePropsPath = path.join(projectRoot, 'android', 'gradle.properties');
      if (fs.existsSync(gradlePropsPath)) {
        const gradleProps = fs.readFileSync(gradlePropsPath, 'utf8');
        const lines = gradleProps.split(/\r?\n/).filter((line) => !line.trim().startsWith('android.ndkVersion=') && !line.trim().startsWith('org.gradle.jvmargs=') && !line.trim().startsWith('android.enableJetifier='));
        lines.push('org.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=512m --enable-native-access=ALL-UNNAMED --add-opens=java.base/java.lang=ALL-UNNAMED -Dfile.encoding=UTF-8');
        lines.push('android.enableJetifier=true');
        lines.push(`android.ndkVersion=${VALID_NDK_VERSION}`);
        fs.writeFileSync(gradlePropsPath, `${lines.join('\n')}\n`);
      }

      const wrapperPropsPath = path.join(projectRoot, 'android', 'gradle', 'wrapper', 'gradle-wrapper.properties');
      if (fs.existsSync(wrapperPropsPath)) {
        const wrapperContent = fs.readFileSync(wrapperPropsPath, 'utf8');
        const fixed = wrapperContent.replace(/distributionUrl=.*/m, 'distributionUrl=https\\://services.gradle.org/distributions/gradle-9.3.1-bin.zip');
        fs.writeFileSync(wrapperPropsPath, fixed);
      }

      clearStaleNativeCaches(projectRoot);
      return config;
    },
  ]);
};