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
  const [configSource, androidVariables, androidBuild, iosProject] = await Promise.all([
    readFile(join(rootDirectory, "capacitor.config.json"), "utf8"),
    readFile(join(rootDirectory, "android/variables.gradle"), "utf8"),
    readFile(join(rootDirectory, "android/app/build.gradle"), "utf8"),
    readFile(join(rootDirectory, "ios/App/App.xcodeproj/project.pbxproj"), "utf8")
  ]);
  const config = JSON.parse(configSource);

  assert.equal(config.appId, "com.kivutar.chakuchaku");
  assert.equal(config.appName, "ChakuChaku");
  assert.equal(config.webDir, "dist");
  assert.equal(config.plugins.SplashScreen.launchShowDuration, 1600);
  assert.equal(config.plugins.SplashScreen.launchAutoHide, false);
  assert.match(androidVariables, /minSdkVersion = 24/u);
  assert.match(androidVariables, /compileSdkVersion = 36/u);
  assert.match(androidVariables, /targetSdkVersion = 36/u);
  assert.match(androidBuild, /applicationId "com\.kivutar\.chakuchaku"/u);
  assert.match(iosProject, /IPHONEOS_DEPLOYMENT_TARGET = 15\.0/u);
  assert.match(iosProject, /PRODUCT_BUNDLE_IDENTIFIER = com\.kivutar\.chakuchaku/u);
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

test("store and launcher artwork has the required native dimensions", async () => {
  const [iosIcon, androidForeground, notificationIcon] = await Promise.all([
    readFile(join(
      rootDirectory,
      "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"
    )),
    readFile(join(
      rootDirectory,
      "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png"
    )),
    readFile(join(
      rootDirectory,
      "android/app/src/main/res/drawable-xxxhdpi/ic_stat_chakuchaku.png"
    ))
  ]);

  assert.deepEqual(readPngDimensions(iosIcon), { width: 1024, height: 1024 });
  assert.deepEqual(readPngDimensions(androidForeground), { width: 432, height: 432 });
  assert.deepEqual(readPngDimensions(notificationIcon), { width: 96, height: 96 });
});
