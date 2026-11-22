/**
 * Haklar - "Vergi ve maaş pusulası" kartının içindeki gelir vergisi dilimi tablosu.
 * Veri: content/income-tax-current.json (dilimler) ve content/pay-ui.json (çeviriler).
 */
(() => {
  "use strict";

  const { LANGUAGES, loadJson, el } = window.haklar;

  const AK_CALCULATOR_URL = "https://wien.arbeiterkammer.at/services/rechner/AK_Brutto-Netto-Rechner_Wie_viel_Netto_bleibt_vom_Brutt.html";

  function formatCurrency(value, locale) {
    return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
  }

  function formatBand(bracket, ui, locale) {
    if (bracket.lower === 0) {
      return ui.firstBand.replace("{amount}", formatCurrency(bracket.upper, locale));
    }
    const lower = formatCurrency(bracket.lower, locale);
    if (bracket.upper === null) return ui.overBand.replace("{lower}", lower);
    return ui.rangeBand.replace("{lower}", lower).replace("{upper}", formatCurrency(bracket.upper, locale));
  }

  /** Vergi paketini yükler; hata olursa null döner (kart tablo olmadan da çalışır). */
  async function loadBundle() {
    try {
      const [payUi, taxData] = await Promise.all([
        loadJson("content/pay-ui.json"),
        loadJson("content/income-tax-current.json")
      ]);
      return { payUi, taxData };
    } catch (error) {
      console.warn("Tax bracket data could not be loaded.", error);
      return null;
    }
  }

  function uiFor(bundle, language) {
    return bundle?.payUi?.[language] && bundle.taxData?.brackets ? bundle.payUi[language] : null;
  }

  function buildSection(bundle, language) {
    const ui = uiFor(bundle, language);
    if (!ui) return null;
    const locale = LANGUAGES[language].locale;

    const rows = bundle.taxData.brackets.map((bracket) => el("tr", {},
      el("td", { text: formatBand(bracket, ui, locale) }),
      el("td", { text: `${bracket.rate}%` })
    ));

    return el("div", { class: "tax-embedded" },
      el("h3", { class: "tax-embedded-title", text: ui.taxTitle }),
      el("p", { text: ui.taxIntro }),
      el("div", { class: "tax-table-wrap" },
        el("table", { class: "tax-table" },
          el("thead", {}, el("tr", {},
            el("th", { scope: "col", text: ui.incomeBand }),
            el("th", { scope: "col", text: ui.marginalRate })
          )),
          el("tbody", {}, ...rows)
        )
      ),
      el("p", { class: "pay-note", text: ui.taxNote })
    );
  }

  function extraLinks(bundle, language) {
    const ui = uiFor(bundle, language);
    if (!ui) return [];
    const links = [{ label: ui.calculatorLink, url: AK_CALCULATOR_URL }];
    const risUrl = bundle.taxData.source?.url;
    if (risUrl) links.unshift({ label: ui.risLink, url: risUrl });
    return links;
  }

  // Kart aramasında vergi sayfası içeriği de bulunsun (başlık, giriş ve dilim sınırları).
  function searchableText(bundle, language) {
    const ui = uiFor(bundle, language);
    if (!ui) return "";
    const limits = bundle.taxData.brackets.flatMap((b) => [b.lower, b.upper]).filter((v) => v !== null && v > 0);
    return [ui.taxTitle, ui.taxIntro, bundle.taxData.taxYear, ...limits].join(" ");
  }

  window.haklarTax = { loadBundle, buildSection, extraLinks, searchableText };
})();
