    const languages = {
      tr: { name: "Türkçe", short: "TR", html: "tr", error: "Türkçe içerik yüklenemedi. Sayfayı yenileyin." },
      hr: { name: "Hrvatski", short: "HR", html: "hr", error: "Sadržaj na hrvatskom nije moguće učitati. Osvježite stranicu." },
      sr: { name: "Srpski", short: "SR", html: "sr-Latn", error: "Sadržaj na srpskom nije moguće učitati. Osvežite stranicu." },
      bs: { name: "Bosanski", short: "BS", html: "bs", error: "Sadržaj na bosanskom nije moguće učitati. Osvježite stranicu." },
      ro: { name: "Română", short: "RO", html: "ro", error: "Conținutul în română nu s-a putut încărca. Reîncărcați pagina." },
      hu: { name: "Magyar", short: "HU", html: "hu", error: "A magyar tartalom nem tölthető be. Frissítse az oldalt." },
      sl: { name: "Slovenščina", short: "SL", html: "sl", error: "Vsebine v slovenščini ni bilo mogoče naložiti. Osvežite stran." },
      de: { name: "Deutsch", short: "DE", html: "de", error: "Deutsche Inhalte konnten nicht geladen werden. Bitte laden Sie die Seite neu." },
      en: { name: "English", short: "EN", html: "en", error: "English content could not be loaded. Please reload the page." }
    };

    const contentCache = new Map();
    let cardIconsRequest;

    const helpResources = [
      { url: "https://stmk.arbeiterkammer.at/ueberuns/kontakt/Kontakt.html" },
      { url: "https://www.oegb.at/themen/arbeitsrecht" },
      { url: "https://www.glb.at/thema/die-arbeit/" },
      { url: "https://www.ris.bka.gv.at/" }
    ];

    const languagesEl = document.querySelector("#languages");
    const cardsEl = document.querySelector("#cards");
    const helpLinksEl = document.querySelector("#helpLinks");
    const loadErrorEl = document.querySelector("#loadError");
    const searchInputEl = document.querySelector("#guideSearch");
    const searchStatusEl = document.querySelector("#guideSearchStatus");
    const noCardResultsEl = document.querySelector("#noCardResults");

    let renderRequest = 0;
    let activeContent = null;
    let activeCardIcons = null;

    async function loadContent(language) {
      if (!contentCache.has(language)) {
        const request = fetch(new URL(`content/${language}.json`, document.baseURI))
          .then((response) => {
            if (!response.ok) throw new Error(`Could not load content/${language}.json`);
            return response.json();
          })
          .catch((error) => {
            contentCache.delete(language);
            throw error;
          });
        contentCache.set(language, request);
      }
      return contentCache.get(language);
    }

    async function loadCardIcons() {
      if (!cardIconsRequest) {
        cardIconsRequest = fetch(new URL("content/card-icons.json", document.baseURI))
          .then((response) => {
            if (!response.ok) throw new Error("Could not load content/card-icons.json");
            return response.json();
          })
          .catch((error) => {
            cardIconsRequest = undefined;
            throw error;
          });
      }
      return cardIconsRequest;
    }

    function buildCardElement(card, current, cardIcons, autoOpen) {
      const details = document.createElement("details");
      details.className = "card";
      if (autoOpen) details.open = true;

      const summary = document.createElement("summary");
      const icon = document.createElement("span");
      icon.className = "card-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = cardIcons[card.id] || "📌";

      const heading = document.createElement("span");
      const title = document.createElement("span");
      title.className = "card-title";
      title.textContent = card.title;
      const teaser = document.createElement("span");
      teaser.className = "card-teaser";
      teaser.textContent = card.teaser;
      heading.append(title, teaser);

      const chevron = document.createElement("span");
      chevron.className = "chevron";
      chevron.setAttribute("aria-hidden", "true");
      chevron.textContent = "⌄";
      summary.append(icon, heading, chevron);

      const body = document.createElement("div");
      body.className = "card-body";
      const intro = document.createElement("p");
      intro.textContent = card.intro;
      const list = document.createElement("ul");
      card.bullets.forEach((bullet) => {
        const item = document.createElement("li");
        item.textContent = bullet;
        list.append(item);
      });

      const sourceList = document.createElement("div");
      sourceList.className = "sources";
      const sourceHeading = document.createElement("span");
      sourceHeading.textContent = current.sources + ":";
      sourceList.append(sourceHeading);
      card.links.forEach((reference) => {
        const link = document.createElement("a");
        link.href = reference.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = reference.label;
        sourceList.append(link);
      });
      body.append(intro, list, sourceList);
      details.append(summary, body);
      return details;
    }

    function renderFilteredCards() {
      if (!activeContent || !activeCardIcons) return;
      const rawQuery = searchInputEl ? searchInputEl.value.trim() : "";
      const queryContext = rawQuery ? window.haklarSemantic.expandQuery(rawQuery) : null;

      let matchedCards = activeContent.cards.map((card) => {
        if (!queryContext) return { card, score: 1 };
        const searchable = [
          card.id,
          card.title,
          card.teaser,
          card.intro,
          ...(card.keywords || []),
          ...card.bullets
        ].join(" ");
        return {
          card,
          score: window.haklarSemantic.scoreDocument(searchable, queryContext)
        };
      });

      if (queryContext) {
        matchedCards = matchedCards
          .filter((item) => item.score > 0)
          .sort((a, b) => b.score - a.score);
      }

      const autoOpen = Boolean(queryContext && matchedCards.length > 0 && matchedCards.length <= 2);
      cardsEl.replaceChildren(
        ...matchedCards.map(({ card }) => buildCardElement(card, activeContent, activeCardIcons, autoOpen))
      );

      if (searchStatusEl) {
        searchStatusEl.textContent = queryContext
          ? `${matchedCards.length} / ${activeContent.cards.length}`
          : "";
      }

      if (noCardResultsEl) {
        noCardResultsEl.textContent = activeContent.noResults || "Sonuç bulunamadı.";
        noCardResultsEl.hidden = !queryContext || matchedCards.length > 0;
      }
    }

    async function render(language) {
      const requestId = ++renderRequest;
      let current;
      let cardIcons;
      try {
        [current, cardIcons] = await Promise.all([loadContent(language), loadCardIcons()]);
      } catch (error) {
        if (requestId === renderRequest) {
          loadErrorEl.textContent = languages[language].error;
          loadErrorEl.hidden = false;
        }
        throw error;
      }
      if (requestId !== renderRequest) return;
      loadErrorEl.hidden = true;
      activeContent = current;
      activeCardIcons = cardIcons;

      document.documentElement.lang = languages[language].html;
      languagesEl.setAttribute("aria-label", current.languageLabel);
      document.querySelector(".brand").setAttribute("aria-label", current.brand);
      document.title = current.title + " · " + current.brand;

      document.querySelectorAll("[data-i18n]").forEach((element) => {
        if (current[element.dataset.i18n]) {
          element.textContent = current[element.dataset.i18n];
        }
      });

      if (searchInputEl && current.searchPlaceholder) {
        searchInputEl.placeholder = current.searchPlaceholder;
      }

      languagesEl.replaceChildren(...Object.entries(languages).map(([code, value]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.lang = value.html;
        button.textContent = value.short;
        button.setAttribute("aria-label", value.name);
        button.setAttribute("aria-pressed", String(code === language));
        button.addEventListener("click", () => {
          window.haklarLanguage.rememberLanguage(code);
          render(code).catch((error) => console.error(error));
        });
        return button;
      }));

      renderFilteredCards();

      helpLinksEl.replaceChildren(...current.helpLinks.map((label, index) => {
        const link = document.createElement("a");
        link.href = helpResources[index].url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = label;
        return link;
      }));
    }

    if (searchInputEl) {
      searchInputEl.addEventListener("input", renderFilteredCards);
    }

    const language = window.haklarLanguage.initialLanguage(Object.keys(languages), "tr");
    render(language).catch((error) => console.error("Language content could not be loaded.", error));
