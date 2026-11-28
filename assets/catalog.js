const { LANGUAGES: languages, loadJson, normalize, words, renderLanguageSwitcher, applySharedUi } = window.haklar;

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
let shared;
let kvFacts = null;     // content/kv-facts.json (isteğe bağlı; yüklenemezse bölüm gösterilmez)
let kvFactsUi = null;   // content/kv-facts-ui.json
let currentLanguage = "tr";
let activeContext = null;   // aktif arama bağlamı (konu vurgusu için)
const profile = { sector: "", type: "", region: "" };   // "Hangi sözleşme?" seçimleri
const SECTOR_IDS = ["hospitality", "retail", "construction", "industry", "transport", "care_social", "cleaning", "crafts", "agriculture", "security"];
const TYPE_IDS = ["arb", "ang"];
const finderEls = {
  sector: document.querySelector("#finderSector"),
  type: document.querySelector("#finderType"),
  region: document.querySelector("#finderRegion"),
  status: document.querySelector("#finderStatus"),
  reset: document.querySelector("#finderReset")
};

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

function typeLabel(type) {
  const strings = shared[currentLanguage];
  return type === "arb" ? strings.typeArb : type === "ang" ? strings.typeAng : type;
}

// "Önemli rakamlar": kaynaklı, dilden bağımsız rakamlar + seçili dildeki şablonlar (assets/kv-facts.js).
function makeFactsSection(agreement, locale) {
  const entry = window.haklarFacts.entryFor(kvFacts, agreement);
  const ui = kvFactsUi?.[currentLanguage];
  if (!entry || !ui) return null;
  const el = window.haklar.el;
  const rows = window.haklarFacts.factRows(entry, currentLanguage, ui, locale);
  const list = el("dl", { class: "kv-facts-list" });
  for (const row of rows) {
    const value = el("dd", {},
      el("strong", { text: row.value || null }),
      row.items.length ? el("ul", {}, ...row.items.map((text) => el("li", { text }))) : null,
      row.meta ? el("span", { class: "kv-facts-meta", text: row.meta }) : null,
      row.note || row.source ? el("details", { class: "kv-facts-note" },
        el("summary", { text: ui.details }),
        row.note ? el("p", { lang: row.noteLang, text: row.note }) : null,
        row.source ? el("a", { href: row.source.url, target: "_blank", rel: "noopener noreferrer", lang: "de",
          text: `${ui.source}: ${row.source.label}` }) : null) : null);
    list.append(el("dt", { text: row.name }), value);
  }
  return el("details", { class: "kv-facts" },
    el("summary", { text: `${ui.title} · ${ui.checked} ${window.haklarFacts.formatDate(entry.checkedAt, locale)}` }),
    entry.reviewed ? null : el("p", { class: "kv-facts-unreviewed", text: ui.unreviewed }),
    list,
    el("p", { class: "kv-facts-disclaimer", text: ui.disclaimer }));
}

// Konularında "Verfall von Ansprüchen" (hak düşürücü süre) geçen sözleşmeler için kısa uyarı.
function makeDeadlineWarning(agreement) {
  const ui = kvFactsUi?.[currentLanguage];
  if (!ui) return null;
  const hasDeadlines = agreement.topics.some((topic) =>
    window.haklarSemantic.topicConcepts(topic).includes("claim_deadlines"));
  return hasDeadlines ? window.haklar.el("p", { class: "deadline-warning", text: ui.deadlineWarning }) : null;
}

function makeAgreementCard(agreement, ui, locale, reasons = []) {
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
    const typeLabels = agreement.employmentTypes.map((type) => typeLabel(type));
    applicability.push(`${ui.workerTypes}: ${typeLabels.join(", ")}`);
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
    if (agreement.topics.length) {
      topicList.append(...window.haklar.renderTopicItems(agreement, {
        language: currentLanguage,
        semantic: window.haklarSemantic,
        context: activeContext,
        matchTitle: shared[currentLanguage].topicMatch
      }));
    } else {
      const item = document.createElement("li");
      item.textContent = ui.topicUnavailable;
      topicList.append(item);
    }
    contents.push(topicHeading, topicList);
    const warning = makeDeadlineWarning(agreement);
    if (warning) contents.push(warning);
  }

  const facts = makeFactsSection(agreement, locale);
  if (facts) contents.push(facts);

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
  if (reasons.length) {
    const matched = document.createElement("p");
    matched.className = "match-line";
    matched.textContent = `${shared[currentLanguage].finderMatched} ${reasons.join(" · ")}`;
    card.append(matched);
  }
  if (date.textContent) card.append(date);
  if (applicabilityText.textContent) card.append(applicabilityText);
  card.append(...contents, openLink);
  return card;
}

function renderList(container, agreements, ui, locale, reasonsFor = () => []) {
  container.replaceChildren(...agreements.map((agreement) => makeAgreementCard(agreement, ui, locale, reasonsFor(agreement))));
}

// ---------- "Sana hangi sözleşme uygulanır?" ----------

const profileActive = () => Boolean(profile.sector || profile.type || profile.region);

function sectorScore(agreement, sector) {
  const names = [agreement.title, ...(agreement.companyExamples || []).map((example) => example.name)];
  return window.haklarSemantic.countConceptHits(` ${words(names.join(" "))} `, sector);
}

// Seçimlere uyuyor mu? Bölge/grup bilgisi olmayan kayıtlar (yalnızca şirket örneği) seçim yapılınca elenir.
function matchesProfile(agreement) {
  if (profile.region || profile.type) {
    if (agreement.sourceOnly) return false;
    if (profile.region && agreement.regions.length && !agreement.regions.includes(profile.region)) return false;
    if (profile.type && !agreement.employmentTypes.includes(profile.type)) return false;
  }
  if (profile.sector) return !agreement.sourceOnly && sectorScore(agreement, profile.sector) > 0;
  return true;
}

function profileReasons(agreement) {
  const strings = shared[currentLanguage];
  const reasons = [];
  if (profile.sector) reasons.push(strings.sectors[profile.sector]);
  if (profile.type) reasons.push(typeLabel(profile.type));
  if (profile.region && agreement.regions.includes(profile.region)) reasons.push(regionNames[profile.region]);
  return reasons;
}

function fillSelect(select, options, current) {
  const strings = shared[currentLanguage];
  select.replaceChildren(
    new Option(strings.finderAny, ""),
    ...options.map(([value, label]) => new Option(label, value))
  );
  select.value = current;
}

function renderFinderControls() {
  const strings = shared[currentLanguage];
  fillSelect(finderEls.sector, SECTOR_IDS.map((id) => [id, strings.sectors[id]]), profile.sector);
  fillSelect(finderEls.type, TYPE_IDS.map((id) => [id, typeLabel(id)]), profile.type);
  fillSelect(finderEls.region, Object.entries(regionNames), profile.region);
  finderEls.reset.hidden = !profileActive();
}

function onProfileChange() {
  profile.sector = finderEls.sector.value;
  profile.type = finderEls.type.value;
  profile.region = finderEls.region.value;
  renderAgreements();
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
  const rawQuery = searchInput.value.trim();
  const queryContext = rawQuery ? window.haklarSemantic.expandQuery(rawQuery) : null;
  activeContext = queryContext;
  const filtering = Boolean(queryContext) || profileActive();

  let scored = catalog.agreements.map((agreement) => {
    if (!queryContext) return { agreement, score: 1 };
    const searchable = [
      agreement.title,
      ...agreement.topics,
      ...agreement.topics.flatMap((topic) => window.haklarSemantic.topicLabels(topic, currentLanguage)),
      ...agreement.employmentTypes,
      ...agreement.regions.map((region) => regionNames[region] || region),
      ...(agreement.companyExamples || []).flatMap((example) => [
        example.name,
        example.notes?.[currentLanguage] || ""
      ])
    ].join(" ");
    return {
      agreement,
      score: window.haklarSemantic.scoreDocument(searchable, queryContext)
    };
  });

  if (queryContext) {
    scored = scored
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  if (profileActive()) {
    scored = scored.filter((item) => matchesProfile(item.agreement));
    if (!queryContext) {
      // Sorgu yoksa: sektör eşleşmesi güçlü olan ve öne çıkarılan sözleşmeler önce.
      scored.sort((a, b) => (profile.sector ? sectorScore(b.agreement, profile.sector) - sectorScore(a.agreement, profile.sector) : 0)
        || (a.agreement.popularOrder ?? 9999) - (b.agreement.popularOrder ?? 9999));
    }
  }

  const filtered = scored.map((item) => item.agreement);

  const strings = shared[currentLanguage];
  finderEls.reset.hidden = !profileActive();
  finderEls.status.textContent = profileActive()
    ? (filtered.length ? strings.finderCount.replace("{n}", filtered.length) : strings.finderNone)
    : "";
  resultCount.textContent = filtering
    ? `${filtered.length} ${ui.resultUnit}`
    : employerData.ui[currentLanguage].searchHint;
  noResults.textContent = ui.noResults;
  noResults.hidden = !filtering || filtered.length !== 0;
  popularContainer.replaceChildren();

  if (filtering) {
    popularSection.hidden = true;
    document.querySelector(".section-jump a[href='#popularSection']").hidden = true;
    allAgreementsSection.hidden = false;
    renderList(allContainer, filtered, ui, languages[currentLanguage].locale,
      profileActive() ? profileReasons : undefined);
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
  renderLanguageSwitcher(languageNav, language, setLanguage);
  applySharedUi(language);
  renderFinderControls();
  renderAgreements();
}

async function init() {
  try {
    [catalog, translations, employerData, shared] = await Promise.all([
      loadJson("content/collective-agreements.json"),
      loadJson("content/catalog-ui.json"),
      loadJson("content/employer-kv.json"),
      loadJson("content/shared-ui.json")
    ]);
  } catch (error) {
    catalogError.textContent = "Katalog verileri yüklenemedi. Sayfayı yenileyin.";
    catalogError.hidden = false;
    console.error("Could not load the collective agreement catalogue.", error);
    return;
  }

  [kvFacts, kvFactsUi] = await Promise.all([
    loadJson("content/kv-facts.json").catch(() => null),
    loadJson("content/kv-facts-ui.json").catch(() => null)
  ]);
  await window.haklarSemantic.ready;
  attachCompanyExamples();
  const params = new URLSearchParams(window.location.search);
  searchInput.value = params.get("q") || "";
  // Bağlantıyla ön seçim: collective-agreements.html?sector=hospitality&type=arb&region=w
  if (SECTOR_IDS.includes(params.get("sector"))) profile.sector = params.get("sector");
  if (TYPE_IDS.includes(params.get("type"))) profile.type = params.get("type");
  if (Object.hasOwn(regionNames, params.get("region"))) profile.region = params.get("region");
  let searchTimer;
  searchInput.addEventListener("input", () => {   // yazarken her tuşta değil, kısa bir duraklamadan sonra ara
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderAgreements, 120);
  });
  [finderEls.sector, finderEls.type, finderEls.region].forEach((select) => select.addEventListener("change", onProfileChange));
  finderEls.reset.addEventListener("click", () => {
    Object.assign(profile, { sector: "", type: "", region: "" });
    renderFinderControls();
    renderAgreements();
  });
  if (catalog.failures.length) {
    catalogError.textContent = translations[currentLanguage]?.partial || translations.tr.partial;
    catalogError.hidden = false;
  }
  setLanguage(window.haklar.initialLanguage());
}

init();
