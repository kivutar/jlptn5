(function initializeSettings(global) {
  "use strict";

  const storageKey = "jlpt-n5.settings.v1";
  const openAiApiKeyStorageKey = "jlpt-n5.openai-api-key.v1";
  const schemaVersion = 1;
  const defaults = Object.freeze({
    version: schemaVersion,
    userLanguage: "en",
    furigana: true,
    autoPlayAudio: false,
    tokenColoring: true,
    translationTooltips: true,
    aiAutoCorrect: false,
    reviewReminder: false,
    reviewReminderTime: "19:00"
  });
  const booleanSettingNames = [
    "furigana",
    "autoPlayAudio",
    "tokenColoring",
    "translationTooltips",
    "aiAutoCorrect",
    "reviewReminder"
  ];

  function getStorage(storage) {
    if (storage !== undefined) {
      return storage;
    }

    try {
      return global.JlptN5Storage?.storage || global.localStorage;
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

    normalized.reviewReminderTime = /^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(value?.reviewReminderTime)
      ? value.reviewReminderTime
      : defaults.reviewReminderTime;

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

  function getSessionStorage(storage) {
    if (storage !== undefined) {
      return storage;
    }

    try {
      return global.sessionStorage;
    } catch {
      return undefined;
    }
  }

  function readOpenAiApiKey({ storage } = {}) {
    try {
      return getSessionStorage(storage)?.getItem(openAiApiKeyStorageKey)?.trim() || "";
    } catch {
      return "";
    }
  }

  function writeOpenAiApiKey(apiKey, { storage } = {}) {
    const resolvedStorage = getSessionStorage(storage);
    const normalizedApiKey = typeof apiKey === "string" ? apiKey.trim() : "";

    try {
      if (normalizedApiKey) {
        resolvedStorage?.setItem(openAiApiKeyStorageKey, normalizedApiKey);
      } else if (typeof resolvedStorage?.removeItem === "function") {
        resolvedStorage.removeItem(openAiApiKeyStorageKey);
      } else {
        resolvedStorage?.setItem(openAiApiKeyStorageKey, "");
      }
    } catch {
      // The key remains available in the input for this page even if storage is disabled.
    }

    return normalizedApiKey;
  }

  global.JlptN5Settings = Object.freeze({
    storageKey,
    openAiApiKeyStorageKey,
    schemaVersion,
    defaults,
    readSettings,
    writeSettings,
    readOpenAiApiKey,
    writeOpenAiApiKey
  });
})(globalThis);
