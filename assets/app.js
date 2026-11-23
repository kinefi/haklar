/**
 * Haklar - ana sayfa: çok dilli rehber kartları, kavram tabanlı arama ve KV sonuçları.
 * Bağımlılıklar: common.js, semantic.js, rag-retriever.js, tax-section.js
 */
(() => {
  "use strict";

  const { LANGUAGES, loadJson, el, externalLink, renderLanguageSwitcher, applySharedUi } = window.haklar;
  const SEARCH_DEBOUNCE_MS = 150;
  const RAG_TOP_K = 6;

  const languagesEl = document.querySelector("#languages");
  const cardsEl = document.querySelector("#cards");
  const helpLinksEl = document.querySelector("#helpLinks");
  const loadErrorEl = document.querySelector("#loadError");
  const searchInputEl = document.querySelector("#guideSearch");
  const searchStatusEl = document.querySelector("#guideSearchStatus");
  const conceptHintEl = document.querySelector("#conceptHint");
  const suggestionsEl = document.querySelector("#searchSuggestions");
  const noCardResultsEl = document.querySelector("#noCardResults");
  const ragResultsEl = document.querySelector("#ragSearchResults");

  const state = {
    language: "tr",
    content: null,       // content/<dil>.json
    icons: null,         // content/card-icons.json
    taxBundle: null,     // vergi dilimleri (yüklenemezse null)
    cardMeta: {},        // content/card-meta.json -> reviewed
    shared: {},          // content/shared-ui.json içinden seçili dil
    topicMap: {},        // content/catalog-ui.json -> KV konu çevirileri (seçili dil)
    context: null        // son arama bağlamı (konu vurgusu için)
  };
  let renderRequest = 0;
  let searchRequest = 0;
  let searchTimer;

  // ---------- Kartlar ----------

  function buildCard(card, autoOpen) {
    const { content, icons, taxBundle, language } = state;

    const summary = el("summary", {},
      el("span", { class: "card-icon", "aria-hidden": "true", text: icons[card.id] || "📌" }),
      el("span", {},
        el("span", { class: "card-title", text: card.title }),
        el("span", { class: "card-teaser", text: card.teaser })
      ),
      el("span", { class: "chevron", "aria-hidden": "true", text: "⌄" })
    );

    const links = [...card.links];
    const body = el("div", { class: "card-body" },
      el("p", { text: card.intro }),
      el("ul", {}, ...card.bullets.map((bullet) => el("li", { text: bullet })))
    );

    if (card.id === "tax") {
      const taxSection = window.haklarTax.buildSection(taxBundle, language);
      if (taxSection) body.append(taxSection);
      links.push(...window.haklarTax.extraLinks(taxBundle, language));
    }

    const reviewLine = buildReviewLine(card);
    if (reviewLine) body.append(reviewLine);

    body.append(el("div", { class: "sources" },
      el("span", { text: `${content.sources}:` }),
      ...links.map((link) => externalLink(link.url, link.label))
    ));

    const details = el("details", { class: "card" }, summary, body);
    details.open = autoOpen;
    return details;
  }

  const STALE_AFTER_DAYS = 365;

  // Son kontrol tarihi: vergi kartı veriyi CI'ın yenilediği tarihten, diğerleri card-meta.json'dan alır.
  function reviewedDate(card) {
    const value = card.id === "tax" ? state.taxBundle?.taxData?.updatedAt : state.cardMeta[card.id];
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.valueOf()) ? date : null;
  }

  function buildReviewLine(card) {
    const date = reviewedDate(card);
    if (!date) return null;
    const stale = (Date.now() - date.valueOf()) / 86_400_000 > STALE_AFTER_DAYS;
    const formatted = new Intl.DateTimeFormat(LANGUAGES[state.language].locale, { dateStyle: "medium", timeZone: "UTC" }).format(date);
    return el("p", { class: stale ? "review-line stale" : "review-line" },
      `${state.shared.lastChecked}: `,
      el("time", { datetime: date.toISOString().slice(0, 10), text: formatted }),
      stale ? ` · ${state.shared.staleNote}` : null
    );
  }

  function cardSearchText(card) {
    const extra = card.id === "tax" ? window.haklarTax.searchableText(state.taxBundle, state.language) : "";
    return [card.id, card.title, card.teaser, card.intro, ...(card.keywords || []), ...card.bullets, extra].join(" ");
  }

  // ---------- KV / mevzuat sonuçları ----------

  function resultBody(item) {
    const topics = item.meta?.topics;
    if (!topics?.length) {
      const text = item.text || "";
      return el("p", { text: text.length > 220 ? `${text.slice(0, 220)}…` : text });
    }
    // Aramayla eşleşen konu başlığı ★ ile vurgulanır; kullanıcı sözleşmede hangi bölüme bakacağını görür.
    const byLabel = new Map();
    for (const topic of topics) {
      const label = window.haklar.translateTopic(topic, state.topicMap);
      if (!byLabel.has(label)) byLabel.set(label, topic);
    }
    return el("ul", { class: "topic-list" }, ...[...byLabel].map(([label, topic]) => {
      const hit = state.context && window.haklarSemantic.scoreDocument(topic, state.context) > 0;
      return el("li", { class: hit ? "topic-hit" : null, title: hit ? state.shared.topicMatch : null, text: label });
    }));
  }

  function buildRagCard(item) {
    const { shared, language } = state;
    const isGermanSource = item.lang === "de" && language !== "de";
    const link = item.url && item.url.startsWith("http")
      ? externalLink(item.url, `${shared.viewSource} ↗`)
      : null;
    return el("div", { class: "rag-result-card" },
      el("h4", {}, item.title || "—", isGermanSource ? el("span", { class: "lang-badge", lang: "de", text: "DE" }) : null),
      item.section ? el("span", { class: "rag-meta", text: item.section }) : null,
      resultBody(item),
      link
    );
  }

  function externalLinkSameTab(url, label) {
    return el("a", { href: url, class: "finder-link", text: label });
  }

  function renderRagResults(results) {
    if (!results.length) {
      ragResultsEl.hidden = true;
      ragResultsEl.replaceChildren();
      return;
    }
    ragResultsEl.hidden = false;
    ragResultsEl.replaceChildren(
      el("h3", { class: "rag-results-title", text: state.shared.ragTitle }),
      externalLinkSameTab("collective-agreements.html#finder", state.shared.findAgreement),
      el("div", { class: "rag-results-list" }, ...results.map(buildRagCard))
    );
  }

  // ---------- Kavram ipucu ("Almancada: Mutterschutz · Wochengeld") ----------

  function renderConceptHint(hints) {
    const show = state.language !== "de" && hints.length > 0;
    conceptHintEl.hidden = !show;
    if (!show) {
      conceptHintEl.replaceChildren();
      return;
    }
    conceptHintEl.replaceChildren(
      el("span", { text: `${state.shared.conceptHint} ` }),
      ...hints.slice(0, 4).map((term) => {
        const button = el("button", { type: "button", class: "concept-chip", lang: "de", text: term });
        button.addEventListener("click", () => {
          searchInputEl.value = term;
          runSearch();
        });
        return button;
      })
    );
  }

  // ---------- Sık arananlar ----------

  function renderSuggestions() {
    const terms = state.shared.suggestions || [];
    suggestionsEl.replaceChildren(
      el("span", { text: `${state.shared.suggestionsLabel} ` }),
      ...terms.map((term) => {
        const button = el("button", { type: "button", class: "concept-chip", text: term });
        button.addEventListener("click", () => {
          searchInputEl.value = term;
          runSearch();
          searchInputEl.focus();
        });
        return button;
      })
    );
  }

  // Arama dosyalarını kullanıcı yazmaya başlamadan önce (odaklanınca) arka planda indir.
  function warmUpSearch() {
    window.haklarRAG.loadRagIndex().catch(() => {});
    window.haklar.loadJson("content/collective-agreements.json").catch(() => {});
  }

  // ---------- Arama ----------

  async function runSearch() {
    const request = ++searchRequest;
    const { content, language } = state;
    if (!content) return;

    const rawQuery = searchInputEl.value.trim();
    await window.haklarSemantic.ready;
    if (request !== searchRequest) return;

    const context = rawQuery ? window.haklarSemantic.expandQuery(rawQuery) : null;
    state.context = context;
    suggestionsEl.hidden = Boolean(rawQuery);

    let ragResults = [];
    if (context && rawQuery.length >= 2) {
      try {
        ragResults = await window.haklarRAG.retrieve(rawQuery, { language, topK: RAG_TOP_K });
      } catch (error) {
        console.error("KV search failed.", error);
      }
      if (request !== searchRequest) return; // daha yeni bir arama başladı
    }

    let matched = content.cards.map((card) => ({
      card,
      score: context ? window.haklarSemantic.scoreDocument(cardSearchText(card), context) : 1
    }));
    if (context) matched = matched.filter((item) => item.score > 0).sort((a, b) => b.score - a.score);

    const autoOpen = Boolean(context && matched.length > 0 && matched.length <= 2);
    cardsEl.replaceChildren(...matched.map(({ card }) => buildCard(card, autoOpen)));
    renderRagResults(ragResults);
    renderConceptHint(context ? context.hints : []);

    searchStatusEl.textContent = context ? `${matched.length} / ${content.cards.length}` : "";
    noCardResultsEl.textContent = content.noResults;
    noCardResultsEl.hidden = !context || matched.length > 0 || ragResults.length > 0;
  }

  function scheduleSearch() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, SEARCH_DEBOUNCE_MS);
  }

  // ---------- Sayfa ----------

  function renderHelpLinks(helpLinks) {
    helpLinksEl.replaceChildren(...helpLinks.map((link) => externalLink(link.url, link.label)));
  }

  async function render(language) {
    const request = ++renderRequest;
    let content, icons, shared, taxBundle, cardMeta, catalogUi;
    try {
      [content, icons, shared, taxBundle, cardMeta, catalogUi] = await Promise.all([
        loadJson(`content/${language}.json`),
        loadJson("content/card-icons.json"),
        loadJson("content/shared-ui.json"),
        window.haklarTax.loadBundle(),
        loadJson("content/card-meta.json").catch(() => ({ reviewed: {} })),
        loadJson("content/catalog-ui.json").catch(() => ({})),
        window.haklarSemantic.ready
      ]);
    } catch (error) {
      if (request === renderRequest) {
        loadErrorEl.textContent = LANGUAGES[language].error;
        loadErrorEl.hidden = false;
      }
      throw error;
    }
    if (request !== renderRequest) return;

    loadErrorEl.hidden = true;
    Object.assign(state, { language, content, icons, taxBundle, cardMeta: cardMeta.reviewed || {}, topicMap: catalogUi[language]?.topics || {}, shared: shared[language] || shared.en });

    document.documentElement.lang = LANGUAGES[language].html;
    document.title = `${content.title} · ${content.brand}`;
    languagesEl.setAttribute("aria-label", content.languageLabel);
    document.querySelector(".brand").setAttribute("aria-label", content.brand);
    document.querySelectorAll("[data-i18n]").forEach((node) => {
      if (content[node.dataset.i18n]) node.textContent = content[node.dataset.i18n];
    });
    applySharedUi(language);
    if (content.searchPlaceholder) searchInputEl.placeholder = content.searchPlaceholder;

    renderLanguageSwitcher(languagesEl, language, (code) => {
      render(code).catch((error) => console.error(error));
    });
    renderHelpLinks(content.helpLinks);
    renderSuggestions();
    runSearch();
  }

  searchInputEl.addEventListener("input", scheduleSearch);
  searchInputEl.addEventListener("focus", warmUpSearch, { once: true });
  render(window.haklar.initialLanguage()).catch((error) => console.error("Language content could not be loaded.", error));
})();
