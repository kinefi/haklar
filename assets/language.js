(() => {
  const preferenceKey = "haklar-language";

  function initialLanguage(supportedLanguages, fallback) {
    let savedLanguage;
    try {
      savedLanguage = window.localStorage.getItem(preferenceKey);
    } catch (error) {
      console.warn("Could not read the saved language preference.", error);
    }
    if (supportedLanguages.includes(savedLanguage)) return savedLanguage;

    const browserLanguages = Array.isArray(navigator.languages) && navigator.languages.length
      ? navigator.languages
      : [navigator.language];
    for (const locale of browserLanguages) {
      if (typeof locale !== "string") continue;
      const language = locale.split(/[-_]/, 1)[0].toLowerCase();
      if (supportedLanguages.includes(language)) return language;
    }
    return fallback;
  }

  function rememberLanguage(language) {
    try {
      window.localStorage.setItem(preferenceKey, language);
    } catch (error) {
      console.warn("Could not save the language preference.", error);
    }
  }

  window.haklarLanguage = { initialLanguage, rememberLanguage };
})();
