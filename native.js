(function initializeNativePlatform(global) {
  "use strict";

  const capacitor = global.Capacitor;
  const isNative = Boolean(capacitor?.isNativePlatform?.());
  const platform = capacitor?.getPlatform?.() || "web";

  if (!isNative) {
    global.JlptN5Native = Object.freeze({ isNative: false, platform: "web" });
    return;
  }

  const preferences = global.capacitorPreferences?.Preferences;

  if (!preferences) {
    throw new Error("The native Preferences plugin did not load.");
  }

  document.documentElement.dataset.nativePlatform = platform;
  global.JlptN5Storage.configurePersistentDriver({
    async getItem(key) {
      return (await preferences.get({ key })).value;
    },
    async setItem(key, value) {
      await preferences.set({ key, value });
    },
    async removeItem(key) {
      await preferences.remove({ key });
    }
  }, [
    global.JlptN5Srs.storageKey,
    global.JlptN5Stats.storageKey,
    global.JlptN5Settings.storageKey
  ]);

  global.JlptN5Native = Object.freeze({
    isNative: true,
    platform,
    plugins: Object.freeze({
      app: global.capacitorApp?.App,
      filesystem: global.capacitorFilesystemPluginCapacitor?.Filesystem,
      filesystemDirectory: global.capacitorFilesystemPluginCapacitor?.Directory,
      filesystemEncoding: global.capacitorFilesystemPluginCapacitor?.Encoding,
      haptics: global.capacitorHaptics?.Haptics,
      keyboard: global.capacitorKeyboard?.Keyboard,
      localNotifications: global.capacitorLocalNotifications?.LocalNotifications,
      splashScreen: global.capacitorSplashScreen?.SplashScreen,
      share: global.capacitorShare?.Share,
      statusBar: global.capacitorStatusBar?.StatusBar
    })
  });
})(globalThis);
