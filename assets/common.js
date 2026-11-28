/**
 * Haklar - ortak yardımcılar.
 * Diller, metin normalleştirme, JSON yükleme (önbellekli), dil tercihi ve dil düğmeleri.
 * Hem tarayıcıda (window.haklar) hem Node testlerinde (module.exports) kullanılabilir.
 */
(() => {
  "use strict";

  const LANGUAGES = {
    tr: { name: "Türkçe", short: "TR", html: "tr", locale: "tr-TR", error: "Türkçe içerik yüklenemedi. Sayfayı yenileyin." },
    hr: { name: "Hrvatski", short: "HR", html: "hr", locale: "hr-HR", error: "Sadržaj na hrvatskom nije moguće učitati. Osvježite stranicu." },
    sr: { name: "Srpski", short: "SR", html: "sr-Latn", locale: "sr-Latn-RS", error: "Sadržaj na srpskom nije moguće učitati. Osvežite stranicu." },
    bs: { name: "Bosanski", short: "BS", html: "bs", locale: "bs-BA", error: "Sadržaj na bosanskom nije moguće učitati. Osvježite stranicu." },
    ro: { name: "Română", short: "RO", html: "ro", locale: "ro-RO", error: "Conținutul în română nu s-a putut încărca. Reîncărcați pagina." },
    hu: { name: "Magyar", short: "HU", html: "hu", locale: "hu-HU", error: "A magyar tartalom nem tölthető be. Frissítse az oldalt." },
    sl: { name: "Slovenščina", short: "SL", html: "sl", locale: "sl-SI", error: "Vsebine v slovenščini ni bilo mogoče naložiti. Osvežite stran." },
    de: { name: "Deutsch", short: "DE", html: "de", locale: "de-AT", error: "Deutsche Inhalte konnten nicht geladen werden. Bitte laden Sie die Seite neu." },
    en: { name: "English", short: "EN", html: "en", locale: "en-GB", error: "English content could not be loaded. Please reload the page." }
  };
  const DEFAULT_LANGUAGE = "tr";
  const PREFERENCE_KEY = "haklar-language";

  // Diyakritikleri atar, küçük harfe çevirir ve NFD'ye çözülmeyen harfleri katlar (ß, ı, đ ...).
  const FOLD_MAP = { "ß": "ss", "ı": "i", "đ": "dj", "ł": "l", "ø": "o", "æ": "ae", "œ": "oe" };
  function normalize(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[ßıđłøæœ]/g, (ch) => FOLD_MAP[ch])
      .trim();
  }

  // "Annelik, izni!" -> "annelik izni" (yalnızca a-z0-9 sözcükleri, tek boşlukla)
  function words(value) {
    return normalize(value).replace(/[^a-z0-9]+/g, " ").trim();
  }

  // ---- JSON yükleme (önbellekli, hata olunca yeniden denenebilir) ----
  const jsonCache = new Map();
  function loadJson(path) {
    if (!jsonCache.has(path)) {
      const request = fetch(new URL(path, document.baseURI))
        .then((response) => {
          if (!response.ok) throw new Error(`Could not load ${path}`);
          return response.json();
        })
        .catch((error) => {
          jsonCache.delete(path);
          throw error;
        });
      jsonCache.set(path, request);
    }
    return jsonCache.get(path);
  }

  // ---- Dil tercihi ----
  function initialLanguage() {
    const supported = Object.keys(LANGUAGES);
    let saved;
    try {
      saved = window.localStorage.getItem(PREFERENCE_KEY);
    } catch (error) {
      console.warn("Could not read the saved language preference.", error);
    }
    if (supported.includes(saved)) return saved;

    const browserLanguages = Array.isArray(navigator.languages) && navigator.languages.length
      ? navigator.languages
      : [navigator.language];
    for (const locale of browserLanguages) {
      if (typeof locale !== "string") continue;
      const code = locale.split(/[-_]/, 1)[0].toLowerCase();
      if (supported.includes(code)) return code;
    }
    return DEFAULT_LANGUAGE;
  }

  function rememberLanguage(language) {
    try {
      window.localStorage.setItem(PREFERENCE_KEY, language);
    } catch (error) {
      console.warn("Could not save the language preference.", error);
    }
  }

  function renderLanguageSwitcher(container, activeLanguage, onSelect) {
    container.replaceChildren(...Object.entries(LANGUAGES).map(([code, details]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.lang = details.html;
      button.textContent = details.short;
      button.setAttribute("aria-label", details.name);
      button.setAttribute("aria-pressed", String(code === activeLanguage));
      button.addEventListener("click", () => {
        rememberLanguage(code);
        onSelect(code);
      });
      return button;
    }));
  }

  // ---- KV konu başlıkları ----
  // Konu bağlantısı: kaynak konu kimliği verdiyse sözleşmenin o bölümü (topic-id), yoksa sözleşmenin başı.
  function topicUrl(agreementUrl, topicId) {
    if (topicId === undefined || topicId === null || !agreementUrl) return agreementUrl;
    try {
      const url = new URL(agreementUrl);
      url.searchParams.set("topic-id", topicId);
      return url.toString();
    } catch (error) {
      return agreementUrl;
    }
  }

  /**
   * KV konu başlıklarını liste öğeleri olarak üretir: seçili dildeki kavram adları (semantic.topicLabels),
   * Almanca asıl başlık ipucu olarak, aramayla eşleşen başlık ★ (topic-hit), kimlik varsa bölüme bağlantı.
   * agreement: { url, topics, topicIds? }; options: { language, semantic, context, matchTitle }
   */
  function renderTopicItems(agreement, options) {
    const { language, semantic, context, matchTitle } = options;
    const seen = new Set();
    const items = [];
    agreement.topics.forEach((topic, index) => {
      const labels = semantic.topicLabels(topic, language);
      const text = [...new Set(labels)].join(" · ");
      if (seen.has(text)) return;
      seen.add(text);
      const hit = Boolean(context) && (semantic.topicMatches(topic, context) || semantic.scoreDocument(topic, context) >= 100);
      const topicId = agreement.topicIds ? agreement.topicIds[index] : undefined;
      const title = [language === "de" ? null : topic, hit ? matchTitle : null].filter(Boolean).join(" · ") || null;
      const content = topicId !== undefined
        ? el("a", { href: topicUrl(agreement.url, topicId), target: "_blank", rel: "noopener noreferrer", text })
        : text;
      items.push(el("li", { class: hit ? "topic-hit" : null, title }, content));
    });
    return items;
  }

  // ---- Küçük DOM yardımcıları ----
  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === "text") node.textContent = value;
      else if (key === "class") node.className = value;
      else node.setAttribute(key, value === true ? "" : value);
    }
    node.append(...children.filter(Boolean));
    return node;
  }

  function externalLink(url, label, className) {
    return el("a", { href: url, target: "_blank", rel: "noopener noreferrer", class: className, text: label });
  }

  // Sayfadaki [data-<attr>="anahtar"] öğelerinin metnini sözlükten doldurur.
  function applyStrings(attr, strings) {
    document.querySelectorAll(`[data-${attr}]`).forEach((node) => {
      const value = strings[node.dataset[toCamel(attr)]];
      if (value) node.textContent = value;
    });
  }
  function toCamel(attr) {
    return attr.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
  }

  // content/shared-ui.json: iki sayfada da kullanılan metinler (gönüllü uyarısı vb.)
  async function applySharedUi(language) {
    try {
      const shared = await loadJson("content/shared-ui.json");
      applyStrings("shared", shared[language] || shared.en || {});
    } catch (error) {
      console.warn("Could not load shared UI strings.", error);
    }
  }

  const api = {
    LANGUAGES, DEFAULT_LANGUAGE, normalize, words, loadJson, topicUrl, renderTopicItems,
    initialLanguage, rememberLanguage, renderLanguageSwitcher,
    el, externalLink, applyStrings, applySharedUi
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.haklar = api;
})();
