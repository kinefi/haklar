/**
 * Haklar - toplu sözleşme "önemli rakamlar" (content/kv-facts.json) biçimlendirmesi.
 *
 * Rakamlar dilden bağımsız saklanır (tutar + birim + ifade anahtarı); ekrandaki metin
 * content/kv-facts-ui.json şablonlarından seçili dilde üretilir. Uzun açıklama (note) yalnızca
 * Almanca ve İngilizcedir; İngilizce arayüzde İngilizce, diğer dillerde Almanca gösterilir
 * (sözleşmenin kendi dili; işverenle/AK ile konuşurken bu terimler gerekir).
 *
 * Tarayıcıda window.haklarFacts, Node testlerinde module.exports.
 */
(() => {
  "use strict";

  function fill(template, values) {
    return String(template || "").replace(/\{(\w+)\}/g, (_, key) => (values[key] ?? `{${key}}`));
  }

  function formatAmount(amount, unit, locale) {
    if (unit === "eur_month" || unit === "eur_hour") {
      return new Intl.NumberFormat(locale, {
        style: "currency", currency: "EUR",
        minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2
      }).format(amount);
    }
    if (unit === "percent") {
      return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 2 }).format(amount / 100);
    }
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(amount);
  }

  function formatDate(value, locale) {
    if (!value) return "";
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat(locale, { day: "numeric", month: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
  }

  function quantity(amount, unit, ui, locale) {
    const formatted = formatAmount(amount, unit, locale);
    const template = ui.units[unit];
    return template ? fill(template, { amount: formatted, n: formatted }) : formatted;
  }

  /** Bir KV kaydına uyan rakam girdisi (groupId ve çalışan türü eşleşmeli). */
  function entryFor(facts, agreement) {
    if (!facts || !agreement) return null;
    return (facts.agreements || []).find((entry) => entry.groupId === agreement.groupId
      && (!entry.employmentTypes || !agreement.employmentTypes?.length
        || agreement.employmentTypes.some((type) => entry.employmentTypes.includes(type)))) || null;
  }

  /**
   * Ekrana basılacak satırlar: { id, name, value, items, meta, note, noteLang, source, confidence }.
   * language: arayüz dili; ui: kv-facts-ui.json[language]; locale: Intl yerel ayarı.
   */
  function factRows(entry, language, ui, locale) {
    return entry.facts.map((fact) => {
      const parts = [];
      if (typeof fact.amount === "number" && fact.unit) parts.push(quantity(fact.amount, fact.unit, ui, locale));
      if (fact.phrase) parts.push(ui.phrases[fact.phrase] || fact.phrase);
      const items = (fact.items || []).map((item) =>
        `${ui.items[item.key] || item.key}: ${quantity(item.amount, item.unit, ui, locale)}`);
      const meta = [];
      if (fact.group) meta.push(`${ui.group}: ${fact.group}`);
      if (fact.validFrom) meta.push(`${ui.from} ${formatDate(fact.validFrom, locale)}`);
      const noteLang = language === "en" ? "en" : "de";
      return {
        id: fact.id,
        name: ui.facts[fact.id] || fact.id,
        value: parts.join(" · "),
        items,
        meta: meta.join(" · "),
        note: fact.note ? (fact.note[noteLang] || fact.note.de || "") : "",
        noteLang,
        source: fact.source,
        confidence: fact.confidence || "high"
      };
    });
  }

  const api = { factRows, entryFor, formatAmount, formatDate, fill };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.haklarFacts = api;
})();
