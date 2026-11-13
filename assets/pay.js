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
const taxBrackets = document.querySelector("#taxBrackets");
let translations;
let taxData;

async function loadJson(path) {
  const response = await fetch(new URL(path, document.baseURI));
  if (!response.ok) throw new Error(`Could not load ${path}`);
  return response.json();
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

function setLanguage(language) {
  const ui = translations[language];
  const locale = languages[language].locale;
  document.documentElement.lang = languages[language].html;
  document.title = `${ui.title} · ${ui.brand}`;
  document.querySelector(".brand").setAttribute("aria-label", ui.brand);
  languageNav.setAttribute("aria-label", ui.languageLabel);
  document.querySelectorAll("[data-pay]").forEach((element) => {
    element.textContent = ui[element.dataset.pay];
  });

  taxBrackets.replaceChildren(...taxData.brackets.map((bracket) => {
    const row = document.createElement("tr");
    const band = document.createElement("td");
    band.textContent = formatBand(bracket, ui, locale);
    const rate = document.createElement("td");
    rate.textContent = `${bracket.rate}%`;
    row.append(band, rate);
    return row;
  }));

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
}

async function init() {
  try {
    [translations, taxData] = await Promise.all([
      loadJson("content/pay-ui.json"),
      loadJson("content/income-tax-2026.json")
    ]);
  } catch (error) {
    const message = document.createElement("p");
    message.className = "load-error";
    message.setAttribute("role", "alert");
    message.textContent = "Seite konnte nicht geladen werden. Bitte aktualisieren Sie die Seite.";
    document.querySelector("main").prepend(message);
    console.error("Could not load pay and tax data.", error);
    return;
  }
  setLanguage(window.haklarLanguage.initialLanguage(Object.keys(languages), "tr"));
}

init();
