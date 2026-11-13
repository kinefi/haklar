const languages = {
  tr: { name: "Türkçe", short: "TR", html: "tr", locale: "tr-TR" },
  hr: { name: "Hrvatski", short: "HR", html: "hr", locale: "hr-HR" },
  sr: { name: "Srpski", short: "SR", html: "sr-Latn", locale: "sr-Latn-RS" },
  bs: { name: "Bosanski", short: "BS", html: "bs", locale: "bs-BA" },
  ro: { name: "Română", short: "RO", html: "ro", locale: "ro-RO" },
  hu: { name: "Magyar", short: "HU", html: "hu", locale: "hu-HU" },
  sl: { name: "Slovenščina", short: "SL", html: "sl", locale: "sl-SI" },
  de: { name: "Deutsch", short: "DE", html: "de", locale: "de-AT" },
  en: { name: "English", short: "EN", html: "en", locale: "en-GB" }
};

const languageNav = document.querySelector("#languages");
const searchInput = document.querySelector("#agreementSearch");
const popularSection = document.querySelector("#popularSection");
const popularContainer = document.querySelector("#popularAgreements");
const allContainer = document.querySelector("#allAgreements");
const resultCount = document.querySelector("#resultCount");
const noResults = document.querySelector("#noResults");
const catalogError = document.querySelector("#catalogError");
const allAgreementsSection = document.querySelector(".all-agreements");
let catalog;
let translations;
let employerData;
let currentLanguage = "tr";

async function loadJson(path) {
  const response = await fetch(new URL(path, document.baseURI));
  if (!response.ok) throw new Error(`Could not load ${path}`);
  return response.json();
}

function normalize(value) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ß/g, "ss")
    .toLowerCase();
}

function translateTopic(topic, ui) {
  const normalized = normalize(topic);
  const match = Object.entries(ui.topics).find(([phrase]) => normalized.includes(phrase));
  return match ? match[1] : topic;
}

function formatDate(value, locale) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

const regionNames = {
  b: "Burgenland",
  k: "Kärnten",
  nö: "Niederösterreich",
  oö: "Oberösterreich",
  s: "Salzburg",
  st: "Steiermark",
  t: "Tirol",
  v: "Vorarlberg",
  w: "Wien"
};

function makeAgreementCard(agreement, ui, locale) {
  const card = document.createElement("article");
  card.className = "agreement-card";

  const heading = document.createElement("h3");
  const title = document.createElement("a");
  title.href = agreement.url;
  title.target = "_blank";
  title.rel = "noopener noreferrer";
  title.lang = "de";
  title.textContent = agreement.title;
  heading.append(title);

  const date = document.createElement("p");
  date.className = "agreement-date";
  const dates = [];
  const validFrom = formatDate(agreement.validFrom, locale);
  const updated = formatDate(agreement.lastContentUpdate, locale);
  if (validFrom) dates.push(`${ui.validFrom}: ${validFrom}`);
  if (updated) dates.push(`${ui.updated}: ${updated}`);
  date.textContent = dates.join(" · ");

  const applicability = [];
  if (agreement.employmentTypes.length) {
    applicability.push(`${ui.workerTypes}: ${agreement.employmentTypes.join(", ")}`);
  }
  if (agreement.regions.length) {
    const regions = agreement.regions.map((region) => regionNames[region] || region);
    applicability.push(`${ui.regions}: ${regions.join(", ")}`);
  }
  const applicabilityText = document.createElement("p");
  applicabilityText.className = "agreement-applicability";
  applicabilityText.textContent = applicability.join(" · ");

  const contents = [];
  if (!agreement.sourceOnly) {
    const topicHeading = document.createElement("p");
    topicHeading.className = "topic-label";
    topicHeading.textContent = ui.topicLabel;

    const topicList = document.createElement("ul");
    topicList.className = "topic-list";
    const topics = [...new Set(agreement.topics.map((topic) => translateTopic(topic, ui)))];
    if (topics.length) {
      topics.forEach((topic) => {
        const item = document.createElement("li");
        item.textContent = topic;
        topicList.append(item);
      });
    } else {
      const item = document.createElement("li");
      item.textContent = ui.topicUnavailable;
      topicList.append(item);
    }
    contents.push(topicHeading, topicList);
  }

  if (agreement.companyExamples?.length) {
    const examples = document.createElement("section");
    examples.className = "company-examples";
    const examplesHeading = document.createElement("h4");
    examplesHeading.textContent = employerData.ui[currentLanguage].companyExamplesTitle;
    const examplesList = document.createElement("ul");
    agreement.companyExamples.forEach((example) => {
      const item = document.createElement("li");
      const name = document.createElement("strong");
      name.textContent = example.name;
      item.append(name);
      if (example.notes?.[currentLanguage]) {
        const note = document.createElement("p");
        note.textContent = example.notes[currentLanguage];
        item.append(note);
      }
      if (!agreement.sourceOnly) {
        example.sources.forEach((source) => {
          const link = document.createElement("a");
          link.href = source.url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = source.label;
          item.append(link);
        });
      }
      examplesList.append(item);
    });
    examples.append(examplesHeading, examplesList);
    contents.push(examples);
  }

  const openLink = document.createElement("a");
  openLink.className = "agreement-open";
  openLink.href = agreement.url;
  openLink.target = "_blank";
  openLink.rel = "noopener noreferrer";
  openLink.lang = "de";
  openLink.textContent = agreement.sourceOnly
    ? employerData.ui[currentLanguage].openSource
    : ui.openAgreement;

  card.append(heading);
  if (date.textContent) card.append(date);
  if (applicabilityText.textContent) card.append(applicabilityText);
  card.append(...contents, openLink);
  return card;
}

function renderList(container, agreements, ui, locale) {
  container.replaceChildren(...agreements.map((agreement) => makeAgreementCard(agreement, ui, locale)));
}

function attachCompanyExamples() {
  const supplementalAgreements = [];
  employerData.entries.forEach((entry) => {
    const agreement = !entry.supplemental
      ? catalog.agreements.find((item) => item.groupId === entry.groupId)
      : null;
    if (agreement) {
      agreement.companyExamples = [...(agreement.companyExamples || []), entry];
      return;
    }

    const source = entry.sources[0];
    supplementalAgreements.push({
      title: entry.agreement,
      url: source.url,
      groupId: `company-${entry.id}`,
      variantId: `company-${entry.id}`,
      validFrom: null,
      lastContentUpdate: null,
      employmentTypes: [],
      regions: [],
      unions: [],
      topics: [],
      popularOrder: null,
      sourceOnly: true,
      companyExamples: [entry]
    });
  });
  catalog.agreements.push(...supplementalAgreements);
}

function renderAgreements() {
  const ui = translations[currentLanguage];
  const query = normalize(searchInput.value.trim());
  const filtered = catalog.agreements.filter((agreement) => {
    const searchable = normalize([
      agreement.title,
      ...agreement.topics,
      ...agreement.employmentTypes,
      ...agreement.regions.map((region) => regionNames[region] || region),
      ...(agreement.companyExamples || []).flatMap((example) => [
        example.name,
        example.notes?.[currentLanguage] || ""
      ])
    ].join(" "));
    return searchable.includes(query);
  });

  resultCount.textContent = query
    ? `${filtered.length} ${ui.resultUnit}`
    : employerData.ui[currentLanguage].searchHint;
  noResults.textContent = ui.noResults;
  noResults.hidden = !query || filtered.length !== 0;
  popularContainer.replaceChildren();

  if (query) {
    popularSection.hidden = true;
    document.querySelector(".section-jump a[href='#popularSection']").hidden = true;
    allAgreementsSection.hidden = false;
    renderList(allContainer, filtered, ui, languages[currentLanguage].locale);
    return;
  }

  popularSection.hidden = false;
  document.querySelector(".section-jump a[href='#popularSection']").hidden = false;
  allAgreementsSection.hidden = true;
  allContainer.replaceChildren();
  const popular = filtered.filter((agreement) => agreement.popularOrder !== null);
  renderList(popularContainer, popular, ui, languages[currentLanguage].locale);
}

function setLanguage(language) {
  currentLanguage = language;
  const ui = translations[language];
  document.documentElement.lang = languages[language].html;
  document.title = `${ui.pageTitle} · ${ui.brand}`;
  document.querySelector(".brand").setAttribute("aria-label", ui.brand);
  languageNav.setAttribute("aria-label", ui.languageLabel);
  document.querySelector("[data-employer-nav]").setAttribute("aria-label", employerData.ui[language].jumpLabel);
  document.querySelectorAll("[data-catalog]").forEach((element) => {
    element.textContent = ui[element.dataset.catalog];
  });
  document.querySelectorAll("[data-employer-ui]").forEach((element) => {
    element.textContent = employerData.ui[language][element.dataset.employerUi];
  });
  searchInput.placeholder = ui.searchPlaceholder;
  languageNav.replaceChildren(...Object.entries(languages).map(([code, details]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.lang = details.html;
    button.textContent = details.short;
    button.setAttribute("aria-label", details.name);
    button.setAttribute("aria-pressed", String(code === language));
    button.addEventListener("click", () => {
      window.haklarLanguage.rememberLanguage(code);
      setLanguage(code);
    });
    return button;
  }));
  renderAgreements();
}

async function init() {
  try {
    [catalog, translations, employerData] = await Promise.all([
      loadJson("content/collective-agreements.json"),
      loadJson("content/catalog-ui.json"),
      loadJson("content/employer-kv.json")
    ]);
  } catch (error) {
    catalogError.textContent = "Katalog verileri yüklenemedi. Sayfayı yenileyin.";
    catalogError.hidden = false;
    console.error("Could not load the collective agreement catalogue.", error);
    return;
  }

  attachCompanyExamples();
  searchInput.value = new URLSearchParams(window.location.search).get("q") || "";
  searchInput.addEventListener("input", renderAgreements);
  if (catalog.failures.length || (catalog.unavailableListings || []).length) {
    catalogError.textContent = translations.tr.partial;
    catalogError.hidden = false;
  }
  setLanguage(window.haklarLanguage.initialLanguage(Object.keys(languages), "tr"));
}

init();
