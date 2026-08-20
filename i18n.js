(function initializeI18n(global) {
  "use strict";

  const supportedLocales = Object.freeze(["en", "fr"]);
  const defaultLocale = "en";
  const catalogCache = new Map();
  let locale = defaultLocale;
  let catalog = {};
  let fallbackCatalog = {};

  function normalizeLocale(value) {
    const language = String(value || "").trim().toLocaleLowerCase("en").split(/[-_]/u)[0];

    return supportedLocales.includes(language) ? language : undefined;
  }

  function resolveLocale(preference = "auto", languages = global.navigator?.languages) {
    const explicitLocale = normalizeLocale(preference);

    if (explicitLocale) {
      return explicitLocale;
    }

    const candidates = Array.isArray(languages) && languages.length > 0
      ? languages
      : [global.navigator?.language];

    return candidates.map(normalizeLocale).find(Boolean) || defaultLocale;
  }

  async function fetchCatalog(language, fetchImpl = global.fetch) {
    if (catalogCache.has(language)) {
      return catalogCache.get(language);
    }

    const response = await fetchImpl(`locales/${language}.json`);

    if (!response.ok) {
      throw new Error(`The ${language} translation catalogue could not be loaded.`);
    }

    const value = await response.json();

    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`The ${language} translation catalogue is invalid.`);
    }

    catalogCache.set(language, value);
    return value;
  }

  async function initialize(preference, options = {}) {
    locale = resolveLocale(preference, options.languages);
    const fetchImpl = options.fetchImpl || global.fetch;

    fallbackCatalog = await fetchCatalog(defaultLocale, fetchImpl);
    catalog = locale === defaultLocale
      ? fallbackCatalog
      : await fetchCatalog(locale, fetchImpl);

    return locale;
  }

  function interpolate(value, parameters) {
    return String(value).replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/gu, (_match, name) => {
      return Object.hasOwn(parameters, name) ? String(parameters[name]) : `{${name}}`;
    });
  }

  function chooseMessage(value, parameters) {
    if (typeof value === "string") {
      return value;
    }

    if (value && typeof value === "object" && Number.isFinite(parameters.count)) {
      const category = new Intl.PluralRules(locale).select(parameters.count);
      return value[category] || value.other;
    }

    return undefined;
  }

  function t(key, parameters = {}) {
    const message = chooseMessage(catalog[key], parameters) ??
      chooseMessage(fallbackCatalog[key], parameters);

    return message === undefined ? key : interpolate(message, parameters);
  }

  function applyDocument(root = global.document) {
    if (!root) {
      return;
    }

    root.documentElement.lang = locale;

    for (const element of root.querySelectorAll("[data-i18n]")) {
      element.textContent = t(element.dataset.i18n);
    }

    for (const element of root.querySelectorAll("[data-i18n-html]")) {
      const template = root.createElement("template");
      template.innerHTML = t(element.dataset.i18nHtml);
      element.replaceChildren(template.content);
    }

    for (const element of root.querySelectorAll("[data-i18n-aria-label]")) {
      element.setAttribute("aria-label", t(element.dataset.i18nAriaLabel));
    }

    for (const element of root.querySelectorAll("[data-i18n-placeholder]")) {
      element.setAttribute("placeholder", t(element.dataset.i18nPlaceholder));
    }

    for (const element of root.querySelectorAll("[data-i18n-title]")) {
      element.setAttribute("title", t(element.dataset.i18nTitle));
    }

    for (const element of root.querySelectorAll("[data-user-language]")) {
      element.lang = locale;
    }
  }

  function getLocale() {
    return locale;
  }

  function formatDate(value, options) {
    return new Intl.DateTimeFormat(locale, options).format(value);
  }

  function formatNumber(value, options) {
    return new Intl.NumberFormat(locale, options).format(value);
  }

  global.JlptN5I18n = Object.freeze({
    supportedLocales,
    defaultLocale,
    normalizeLocale,
    resolveLocale,
    initialize,
    applyDocument,
    getLocale,
    t,
    formatDate,
    formatNumber
  });
})(globalThis);
