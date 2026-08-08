(function initializeSettings(global) {
  "use strict";

  const storageKey = "jlpt-n5.settings.v1";
  const schemaVersion = 1;
  const defaults = Object.freeze({
    version: schemaVersion,
    userLanguage: "en",
    furigana: true,
    autoPlayAudio: false,
    tokenColoring: true,
    translationTooltips: true
  });
  const booleanSettingNames = [
    "furigana",
    "autoPlayAudio",
    "tokenColoring",
    "translationTooltips"
  ];

  function getStorage(storage) {
    if (storage !== undefined) {
      return storage;
    }

    try {
      return global.localStorage;
    } catch {
      return undefined;
    }
  }

  function normalizeSettings(value) {
    const normalized = {
      version: schemaVersion,
      userLanguage: value?.userLanguage === "en" ? "en" : defaults.userLanguage
    };

    for (const name of booleanSettingNames) {
      normalized[name] = typeof value?.[name] === "boolean" ? value[name] : defaults[name];
    }

    return normalized;
  }

  function readSettings({ storage } = {}) {
    const resolvedStorage = getStorage(storage);

    try {
      const storedValue = resolvedStorage?.getItem(storageKey);

      if (!storedValue) {
        return { ...defaults };
      }

      const parsed = JSON.parse(storedValue);
      return parsed?.version === schemaVersion ? normalizeSettings(parsed) : { ...defaults };
    } catch {
      return { ...defaults };
    }
  }

  function writeSettings(changes, { storage } = {}) {
    const resolvedStorage = getStorage(storage);
    const settings = normalizeSettings({ ...readSettings({ storage: resolvedStorage }), ...changes });

    try {
      resolvedStorage?.setItem(storageKey, JSON.stringify(settings));
    } catch {
      // Settings still apply for this page when storage is unavailable or full.
    }

    return settings;
  }

  global.JlptN5Settings = Object.freeze({
    storageKey,
    schemaVersion,
    defaults,
    readSettings,
    writeSettings
  });
})(globalThis);
