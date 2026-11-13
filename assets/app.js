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

    let renderRequest = 0;

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

    async function render(language) {
      const requestId = ++renderRequest;
      let current;
      let cardIcons;
      try {
        [current, cardIcons] = await Promise.all([loadContent(language), loadCardIcons()]);
        if (current.cards.some((card) => !cardIcons[card.id])) {
          throw new Error(`Missing card icon for ${language}`);
        }
      } catch (error) {
        if (requestId === renderRequest) {
          loadErrorEl.textContent = languages[language].error;
          loadErrorEl.hidden = false;
        }
        throw error;
      }
      if (requestId !== renderRequest) return;
      loadErrorEl.hidden = true;

      document.documentElement.lang = languages[language].html;
      languagesEl.setAttribute("aria-label", current.languageLabel);
      document.querySelector(".brand").setAttribute("aria-label", current.brand);
      document.title = current.title + " · " + current.brand;

      document.querySelectorAll("[data-i18n]").forEach((element) => {
        element.textContent = current[element.dataset.i18n];
      });

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

      cardsEl.replaceChildren(...current.cards.map((card) => {
        const details = document.createElement("details");
        details.className = "card";

        const summary = document.createElement("summary");
        const icon = document.createElement("span");
        icon.className = "card-icon";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = cardIcons[card.id];

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
      }));

      helpLinksEl.replaceChildren(...current.helpLinks.map((label, index) => {
        const link = document.createElement("a");
        link.href = helpResources[index].url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = label;
        return link;
      }));
    }
    const language = window.haklarLanguage.initialLanguage(Object.keys(languages), "tr");
    render(language).catch((error) => console.error("Language content could not be loaded.", error));
