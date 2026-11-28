// "Önemli rakamlar" (content/kv-facts.json) testleri. Çalıştırma: node --test tests/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { factRows, entryFor, formatAmount } = require("../assets/kv-facts.js");
const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), "utf8"));

const facts = read("content/kv-facts.json");
const ui = read("content/kv-facts-ui.json");
const { agreements } = read("content/collective-agreements.json");
const LANGUAGES = ["tr", "hr", "sr", "bs", "ro", "hu", "sl", "de", "en"];
const LOCALES = { tr: "tr-TR", hr: "hr-HR", sr: "sr-Latn-RS", bs: "bs-BA", ro: "ro-RO", hu: "hu-HU", sl: "sl-SI", de: "de-AT", en: "en-GB" };

test("her bilginin https kaynağı, kontrol tarihi ve bilinen birimi var", () => {
  const units = new Set(Object.keys(ui.en.units));
  for (const entry of facts.agreements) {
    assert.match(entry.checkedAt, /^\d{4}-\d{2}-\d{2}$/, entry.groupId);
    assert.equal(typeof entry.reviewed, "boolean", entry.groupId);
    for (const fact of entry.facts) {
      const where = `${entry.groupId}/${fact.id}`;
      assert.match(fact.source?.url || "", /^https:\/\//, `${where}: kaynak URL`);
      assert.ok(fact.source.label, `${where}: kaynak adı`);
      assert.ok(fact.amount !== undefined || fact.phrase || fact.items, `${where}: değer yok`);
      if (fact.unit) assert.ok(units.has(fact.unit), `${where}: birim ${fact.unit}`);
      for (const item of fact.items || []) assert.ok(units.has(item.unit), `${where}: birim ${item.unit}`);
      if (fact.note) assert.ok(fact.note.de && fact.note.en, `${where}: note de+en`);
    }
  }
});

test("arayüz metinleri 9 dilde eksiksiz (bilgi adları, birimler, ifadeler, maddeler)", () => {
  const required = new Set();
  for (const entry of facts.agreements) {
    for (const fact of entry.facts) {
      required.add(`facts.${fact.id}`);
      if (fact.unit) required.add(`units.${fact.unit}`);
      if (fact.phrase) required.add(`phrases.${fact.phrase}`);
      for (const item of fact.items || []) { required.add(`items.${item.key}`); required.add(`units.${item.unit}`); }
    }
  }
  for (const language of LANGUAGES) {
    const strings = ui[language];
    for (const key of ["title", "checked", "from", "group", "unreviewed", "disclaimer", "details", "source", "deadlineWarning"]) {
      assert.ok(strings[key], `${language}.${key}`);
    }
    for (const path of required) {
      const [section, key] = path.split(".");
      assert.ok(strings[section]?.[key], `${language}.${path}`);
    }
  }
});

test("factRows: her dilde boş olmayan değer üretir, şablon artığı ({...}) kalmaz", () => {
  for (const entry of facts.agreements) {
    for (const language of LANGUAGES) {
      for (const row of factRows(entry, language, ui[language], LOCALES[language])) {
        const text = [row.name, row.value, ...row.items, row.meta].join(" ");
        assert.ok(row.value || row.items.length, `${entry.groupId}/${row.id}/${language}: boş`);
        assert.ok(!/\{\w+\}/.test(text), `${entry.groupId}/${row.id}/${language}: ${text}`);
      }
    }
  }
});

test("rakam biçimi dile göre: Türkçe yüzde, Almanca para", () => {
  assert.equal(formatAmount(3, "percent", "tr-TR"), "%3");
  assert.match(formatAmount(2096.5, "eur_month", "de-AT"), /2\.096,50/);
});

test("her groupId katalogda var ve çalışan türüne göre doğru varyanta bağlanır", () => {
  for (const entry of facts.agreements) {
    const variants = agreements.filter((agreement) => agreement.groupId === entry.groupId);
    assert.ok(variants.length, `${entry.groupId} katalogda yok`);
    assert.ok(variants.some((agreement) => entryFor(facts, agreement) === entry), `${entry.groupId}: eşleşen varyant yok`);
  }
  const angOnly = { groupId: "bauindustrie-baugewerbe", employmentTypes: ["ang"] };
  assert.equal(entryFor(facts, angOnly), null, "Bau rakamları yalnızca işçiler (Arbeiter) için");
});
