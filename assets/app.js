    const languages = {
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

    const contentCache = new Map();
    let cardIconsRequest;
    let taxBundleRequest;

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
    let activeLanguage = "tr";
    let activeContent = null;
    let activeCardIcons = null;
    let activeTaxBundle = null;

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

    async function loadTaxBundle() {
      if (!taxBundleRequest) {
        taxBundleRequest = Promise.all([
          fetch(new URL("content/pay-ui.json", document.baseURI)).then((r) => {
            if (!r.ok) throw new Error("Could not load content/pay-ui.json");
            return r.json();
          }),
          fetch(new URL("content/income-tax-current.json", document.baseURI)).then((r) => {
            if (!r.ok) throw new Error("Could not load content/income-tax-current.json");
            return r.json();
          })
        ]).then(([payUi, taxData]) => ({ payUi, taxData }))
          .catch((error) => {
            taxBundleRequest = undefined;
            return null;
          });
      }
      return taxBundleRequest;
    }

    function formatCurrency(value, locale) {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0
      }).format(value);
    }

    function formatBand(bracket, ui, locale) {
      const lower = formatCurrency(bracket.lower, locale);
      if (bracket.lower === 0) {
        return ui.firstBand.replace("{amount}", formatCurrency(bracket.upper, locale));
      }
      if (bracket.upper === null) {
        return ui.overBand.replace("{lower}", lower);
      }
      return ui.rangeBand
        .replace("{lower}", lower)
        .replace("{upper}", formatCurrency(bracket.upper, locale));
    }

    function buildTaxSection(language) {
      if (!activeTaxBundle || !activeTaxBundle.payUi?.[language] || !activeTaxBundle.taxData?.brackets) {
        return null;
      }
      const ui = activeTaxBundle.payUi[language];
      const locale = languages[language].locale;

      const wrapper = document.createElement("div");
      wrapper.className = "tax-embedded";

      const heading = document.createElement("h3");
      heading.className = "tax-embedded-title";
      heading.textContent = ui.taxTitle;

      const intro = document.createElement("p");
      intro.textContent = ui.taxIntro;

      const tableWrap = document.createElement("div");
      tableWrap.className = "tax-table-wrap";

      const table = document.createElement("table");
      table.className = "tax-table";

      const thead = document.createElement("thead");
      const headRow = document.createElement("tr");
      const thBand = document.createElement("th");
      thBand.scope = "col";
      thBand.textContent = ui.incomeHeader;
      const thRate = document.createElement("th");
      thRate.scope = "col";
      thRate.textContent = ui.rateHeader;
      headRow.append(thBand, thRate);
      thead.append(headRow);

      const tbody = document.createElement("tbody");
      activeTaxBundle.taxData.brackets.forEach((bracket) => {
        const row = document.createElement("tr");
        const tdBand = document.createElement("td");
        tdBand.textContent = formatBand(bracket, ui, locale);
        const tdRate = document.createElement("td");
        tdRate.textContent = `${bracket.rate}%`;
        row.append(tdBand, tdRate);
        tbody.append(row);
      });

      table.append(thead, tbody);
      tableWrap.append(table);

      const note = document.createElement("p");
      note.className = "pay-note";
      note.textContent = ui.taxNote;

      wrapper.append(heading, intro, tableWrap, note);
      return wrapper;
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

      body.append(intro, list);

      if (card.id === "tax") {
        const taxSection = buildTaxSection(activeLanguage);
        if (taxSection) {
          body.append(taxSection);
        }
      }

      const sourceList = document.createElement("div");
      sourceList.className = "sources";
      const sourceHeading = document.createElement("span");
      sourceHeading.textContent = current.sources + ":";
      sourceList.append(sourceHeading);

      const links = [...card.links];
      if (card.id === "tax" && activeTaxBundle?.payUi?.[activeLanguage]) {
        const ui = activeTaxBundle.payUi[activeLanguage];
        links.push(
          { label: ui.bmfLink, url: "https://bruttonetto.bmf.gv.at/" },
          { label: ui.akTaxLink, url: "https://www.arbeiterkammer.at/beratung/steuerundeinkommen/steuertipps/Lohnsteuertabelle.html" }
        );
      }

      links.forEach((reference) => {
        const link = document.createElement("a");
        link.href = reference.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = reference.label;
        sourceList.append(link);
      });
      body.append(sourceList);
      details.append(summary, body);
      return details;
    }

    function renderFilteredCards() {
      if (!activeContent || !activeCardIcons) return;
      const rawQuery = searchInputEl ? searchInputEl.value.trim() : "";
      const queryContext = rawQuery ? window.haklarSemantic.expandQuery(rawQuery) : null;

      let matchedCards = activeContent.cards.map((card) => {
        if (!queryContext) return { card, score: 1 };
        const extraTaxText = card.id === "tax" && activeTaxBundle?.payUi?.[activeLanguage]
          ? `${activeTaxBundle.payUi[activeLanguage].taxTitle} ${activeTaxBundle.payUi[activeLanguage].taxIntro} 2026 13539 21992 36458 70365 104859`
          : "";
        const searchable = [
          card.id,
          card.title,
          card.teaser,
          card.intro,
          ...(card.keywords || []),
          ...card.bullets,
          extraTaxText
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
      let taxBundle;
      try {
        [current, cardIcons, taxBundle] = await Promise.all([
          loadContent(language),
          loadCardIcons(),
          loadTaxBundle()
        ]);
      } catch (error) {
        if (requestId === renderRequest) {
          loadErrorEl.textContent = languages[language].error;
          loadErrorEl.hidden = false;
        }
        throw error;
      }
      if (requestId !== renderRequest) return;
      loadErrorEl.hidden = true;
      activeLanguage = language;
      activeContent = current;
      activeCardIcons = cardIcons;
      activeTaxBundle = taxBundle;

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
