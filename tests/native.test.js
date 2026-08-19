import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");
const nativeCode = await readFile(join(rootDirectory, "native.js"), "utf8");

function readPngDimensions(image) {
  assert.equal(image.subarray(1, 4).toString("ascii"), "PNG");
  return {
    width: image.readUInt32BE(16),
    height: image.readUInt32BE(20)
  };
}

test("web builds leave native integrations disabled", () => {
  const context = {
    Capacitor: {
      isNativePlatform: () => false,
      getPlatform: () => "web"
    }
  };

  context.globalThis = context;
  vm.runInNewContext(nativeCode, context);

  assert.equal(context.JlptN5Native.isNative, false);
  assert.equal(context.JlptN5Native.platform, "web");
});

test("native builds bind Preferences to all durable learner keys", async () => {
  const calls = [];
  let configuredDriver;
  let configuredKeys;
  const preferences = {
    async get({ key }) {
      calls.push(["get", key]);
      return { value: `saved:${key}` };
    },
    async set({ key, value }) {
      calls.push(["set", key, value]);
    },
    async remove({ key }) {
      calls.push(["remove", key]);
    }
  };
  const context = {
    Capacitor: {
      isNativePlatform: () => true,
      getPlatform: () => "android"
    },
    capacitorPreferences: { Preferences: preferences },
    capacitorHaptics: { Haptics: {} },
    document: { documentElement: { dataset: {} } },
    JlptN5Srs: { storageKey: "srs" },
    JlptN5Stats: { storageKey: "stats" },
    JlptN5Settings: { storageKey: "settings" },
    JlptN5Storage: {
      configurePersistentDriver(driver, keys) {
        configuredDriver = driver;
        configuredKeys = keys;
      }
    }
  };

  context.globalThis = context;
  vm.runInNewContext(nativeCode, context);

  assert.equal(context.JlptN5Native.isNative, true);
  assert.equal(context.JlptN5Native.platform, "android");
  assert.equal(context.document.documentElement.dataset.nativePlatform, "android");
  assert.deepEqual([...configuredKeys], ["srs", "stats", "settings"]);
  assert.equal(await configuredDriver.getItem("srs"), "saved:srs");
  await configuredDriver.setItem("srs", "value");
  await configuredDriver.removeItem("stats");
  assert.deepEqual(calls, [
    ["get", "srs"],
    ["set", "srs", "value"],
    ["remove", "stats"]
  ]);
});

test("native projects use stable identities, current targets, and coordinated splash", async () => {
  const [
    configSource,
    androidVariables,
    androidBuild,
    androidStyles,
    androidNightStyles,
    iosSplashContents,
    iosProject,
    iosInfo
  ] = await Promise.all([
    readFile(join(rootDirectory, "capacitor.config.json"), "utf8"),
    readFile(join(rootDirectory, "android/variables.gradle"), "utf8"),
    readFile(join(rootDirectory, "android/app/build.gradle"), "utf8"),
    readFile(join(rootDirectory, "android/app/src/main/res/values/styles.xml"), "utf8"),
    readFile(join(rootDirectory, "android/app/src/main/res/values-night/styles.xml"), "utf8"),
    readFile(join(
      rootDirectory,
      "ios/App/App/Assets.xcassets/Splash.imageset/Contents.json"
    ), "utf8"),
    readFile(join(rootDirectory, "ios/App/App.xcodeproj/project.pbxproj"), "utf8"),
    readFile(join(rootDirectory, "ios/App/App/Info.plist"), "utf8")
  ]);
  const config = JSON.parse(configSource);

  assert.equal(config.appId, "com.kivutar.chakuchaku");
  assert.equal(config.appName, "ChakuChaku");
  assert.equal(config.webDir, "dist");
  assert.equal(config.plugins.SplashScreen.launchShowDuration, 1600);
  assert.equal(config.plugins.SplashScreen.launchAutoHide, false);
  assert.equal(config.plugins.StatusBar.style, "DEFAULT");
  assert.match(androidVariables, /minSdkVersion = 24/u);
  assert.match(androidVariables, /compileSdkVersion = 36/u);
  assert.match(androidVariables, /targetSdkVersion = 36/u);
  assert.match(androidBuild, /applicationId "com\.kivutar\.chakuchaku"/u);
  assert.match(androidStyles, /name="windowSplashScreenBackground">#FAFAFA</u);
  assert.match(androidStyles, /name="windowSplashScreenAnimatedIcon">@drawable\/splash_icon</u);
  assert.match(androidStyles, /name="postSplashScreenTheme">@style\/AppTheme\.NoActionBar</u);
  assert.match(androidStyles, /name="android:windowBackground">#FAFAFA</u);
  assert.match(androidNightStyles, /name="windowSplashScreenBackground">#101412</u);
  assert.match(androidNightStyles, /name="windowSplashScreenAnimatedIcon">@drawable\/splash_icon_dark</u);
  assert.match(androidNightStyles, /name="android:windowBackground">#101412</u);
  assert.match(iosSplashContents, /"appearance" : "luminosity"/u);
  assert.match(iosSplashContents, /"value" : "dark"/u);
  assert.match(iosProject, /IPHONEOS_DEPLOYMENT_TARGET = 15\.0/u);
  assert.match(iosProject, /PRODUCT_BUNDLE_IDENTIFIER = com\.kivutar\.chakuchaku/u);
  assert.match(iosProject, /DEVELOPMENT_TEAM = ZE9XE938Z2/u);
  assert.match(iosInfo, /<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/u);
});

test("published GitHub releases build and attach a signed Android APK", async () => {
  const [workflow, androidBuild] = await Promise.all([
    readFile(join(rootDirectory, ".github/workflows/android-release.yml"), "utf8"),
    readFile(join(rootDirectory, "android/app/build.gradle"), "utf8")
  ]);

  assert.match(workflow, /release:\s+types: \[published\]/u);
  assert.doesNotMatch(workflow, /workflow_dispatch/u);
  assert.match(workflow, /contents: write/u);
  assert.match(workflow, /ref: \$\{\{ github\.event\.release\.tag_name \}\}/u);
  assert.match(workflow, /sdkmanager" --install "platforms;android-36" "build-tools;36\.0\.0"/u);
  assert.match(workflow, /sudo apt-get install --yes ffmpeg/u);
  assert.match(workflow, /ANDROID_KEYSTORE_BASE64: \$\{\{ secrets\.ANDROID_KEYSTORE_BASE64 \}\}/u);
  assert.match(workflow, /ANDROID_KEYSTORE_PASSWORD: \$\{\{ secrets\.ANDROID_KEYSTORE_PASSWORD \}\}/u);
  assert.match(workflow, /ANDROID_KEY_ALIAS: \$\{\{ secrets\.ANDROID_KEY_ALIAS \}\}/u);
  assert.match(workflow, /ANDROID_KEY_PASSWORD: \$\{\{ secrets\.ANDROID_KEY_PASSWORD \}\}/u);
  assert.match(workflow, /\.\/gradlew assembleRelease --no-daemon/u);
  assert.match(workflow, /version_code="\$\(\(GITHUB_RUN_NUMBER \+ 1000\)\)"/u);
  assert.match(workflow, /ANDROID_VERSION_CODE: \$\{\{ steps\.release\.outputs\.version_code \}\}/u);
  assert.match(workflow, /apksigner_path[\s\S]*verify --verbose --print-certs/u);
  assert.match(workflow, /gh release upload[\s\S]*--clobber/u);
  assert.match(androidBuild, /System\.getenv\('ANDROID_VERSION_CODE'\)/u);
  assert.match(androidBuild, /System\.getenv\('ANDROID_VERSION_NAME'\)/u);
  assert.match(androidBuild, /signingConfig signingConfigs\.release/u);
});

test("published GitHub releases build, sign, and upload an iOS IPA", async () => {
  const [workflow, exportOptions] = await Promise.all([
    readFile(join(rootDirectory, ".github/workflows/ios-release.yml"), "utf8"),
    readFile(join(rootDirectory, "ios/ExportOptions.plist"), "utf8")
  ]);

  assert.match(workflow, /release:\s+types: \[published\]/u);
  assert.doesNotMatch(workflow, /workflow_dispatch/u);
  assert.match(workflow, /runs-on: macos-15/u);
  assert.match(workflow, /ref: \$\{\{ github\.event\.release\.tag_name \}\}/u);
  assert.match(workflow, /npx cap sync ios/u);
  assert.match(workflow, /APP_STORE_CONNECT_KEY_BASE64: \$\{\{ secrets\.APP_STORE_CONNECT_KEY_BASE64 \}\}/u);
  assert.match(workflow, /IOS_DISTRIBUTION_CERTIFICATE_BASE64: \$\{\{ secrets\.IOS_DISTRIBUTION_CERTIFICATE_BASE64 \}\}/u);
  assert.match(workflow, /IOS_DISTRIBUTION_CERTIFICATE_PASSWORD: \$\{\{ secrets\.IOS_DISTRIBUTION_CERTIFICATE_PASSWORD \}\}/u);
  assert.match(workflow, /IOS_PROVISIONING_PROFILE_BASE64: \$\{\{ secrets\.IOS_PROVISIONING_PROFILE_BASE64 \}\}/u);
  assert.match(workflow, /security import[\s\S]*-f pkcs12/u);
  assert.match(workflow, /PROVISIONING_PROFILE_SPECIFIER='ChakuChaku App Store CI'/u);
  assert.match(workflow, /xcodebuild[\s\S]*-exportArchive/u);
  assert.match(workflow, /--validate-app[\s\S]*--upload-app/u);
  assert.match(workflow, /build_number="\$\(\(GITHUB_RUN_NUMBER \* 100 \+ GITHUB_RUN_ATTEMPT\)\)"/u);
  assert.match(exportOptions, /<string>app-store-connect<\/string>/u);
  assert.match(exportOptions, /<key>com\.kivutar\.chakuchaku<\/key>/u);
  assert.match(exportOptions, /<string>ChakuChaku App Store CI<\/string>/u);
  assert.match(exportOptions, /<string>ZE9XE938Z2<\/string>/u);
});

test("native release metadata minimizes permissions and includes Apple privacy reasons", async () => {
  const [manifest, privacyManifest, iosProject, html] = await Promise.all([
    readFile(join(rootDirectory, "android/app/src/main/AndroidManifest.xml"), "utf8"),
    readFile(join(rootDirectory, "ios/App/App/PrivacyInfo.xcprivacy"), "utf8"),
    readFile(join(rootDirectory, "ios/App/App.xcodeproj/project.pbxproj"), "utf8"),
    readFile(join(rootDirectory, "index.html"), "utf8")
  ]);

  assert.match(manifest, /SCHEDULE_EXACT_ALARM/u);
  assert.match(manifest, /tools:node="remove"/u);
  assert.match(privacyManifest, /NSPrivacyAccessedAPICategoryUserDefaults/u);
  assert.match(privacyManifest, /CA92\.1/u);
  assert.match(privacyManifest, /NSPrivacyAccessedAPICategoryFileTimestamp/u);
  assert.match(privacyManifest, /C617\.1/u);
  assert.match(privacyManifest, /NSPrivacyCollectedDataTypeOtherUserContent/u);
  assert.match(privacyManifest, /NSPrivacyCollectedDataTypePurposeAppFunctionality/u);
  assert.match(iosProject, /PrivacyInfo\.xcprivacy in Resources/u);
  assert.match(html, /href="https:\/\/kivutar\.github\.io\/jlptn5\/privacy\.html"/u);
  assert.match(html, /target="_blank"[\s\S]*?rel="noopener noreferrer"/u);
  assert.ok(html.indexOf("capacitor-synapse.js") < html.indexOf("capacitor-filesystem.js"));
  assert.ok(html.indexOf("native-synapse.js") < html.indexOf("capacitor-filesystem.js"));
});

test("store, launcher, and splash artwork has the required native dimensions", async () => {
  const [
    iosIcon,
    iosDarkSplash,
    androidForeground,
    androidSplashIcon,
    androidDarkSplashIcon,
    notificationIcon
  ] = await Promise.all([
    readFile(join(
      rootDirectory,
      "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"
    )),
    readFile(join(
      rootDirectory,
      "ios/App/App/Assets.xcassets/Splash.imageset/splash-dark-2732x2732.png"
    )),
    readFile(join(
      rootDirectory,
      "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png"
    )),
    readFile(join(
      rootDirectory,
      "android/app/src/main/res/drawable-nodpi/splash_icon.png"
    )),
    readFile(join(
      rootDirectory,
      "android/app/src/main/res/drawable-nodpi/splash_icon_dark.png"
    )),
    readFile(join(
      rootDirectory,
      "android/app/src/main/res/drawable-xxxhdpi/ic_stat_chakuchaku.png"
    ))
  ]);

  assert.deepEqual(readPngDimensions(iosIcon), { width: 1024, height: 1024 });
  assert.deepEqual(readPngDimensions(iosDarkSplash), { width: 2732, height: 2732 });
  assert.deepEqual(readPngDimensions(androidForeground), { width: 432, height: 432 });
  assert.deepEqual(readPngDimensions(androidSplashIcon), { width: 1254, height: 1254 });
  assert.deepEqual(readPngDimensions(androidDarkSplashIcon), { width: 1254, height: 1254 });
  assert.deepEqual(readPngDimensions(notificationIcon), { width: 96, height: 96 });
});
