// Çalıştırma: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { createEngine } = require("../assets/semantic.js");
const { rank } = require("../assets/search-retriever.js");
const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), "utf8"));

const semantic = createEngine(read("content/concepts.json"));
const index = read("content/search-index.json");
const agreements = read("content/collective-agreements.json").agreements;
const search = (q, language, topK = 10) => rank(index, q, { language, topK, semantic, agreements });

test("annelik -> Mutterschutz ipucu ve ilgili kavramlar", () => {
  const ctx = semantic.expandQuery("annelik");
  assert.equal(ctx.concepts[0].id, "maternity");
  assert.ok(ctx.hints.includes("Mutterschutz"));
  assert.ok(ctx.concepts.some((c) => c.id === "parental_leave"));
});

test("Mutterschutz her dilden aranabilir, ä/ae yazımı da", () => {
  for (const q of ["Mutterschutz", "mutterschutz", "doğum izni", "maternity leave", "trudnoća"]) {
    assert.equal(semantic.expandQuery(q).concepts[0].id, "maternity", q);
  }
  assert.equal(semantic.expandQuery("Kuendigung").concepts[0].id, "termination");
  assert.equal(semantic.expandQuery("Kündigung").concepts[0].id, "termination");
});

test("yazım hatası ve yazarken ön ek toleransı", () => {
  assert.equal(semantic.expandQuery("anelik izni").concepts[0].id, "maternity");
  assert.equal(semantic.expandQuery("mutters").concepts[0].id, "maternity");
});

test("kart metni: Türkçe 'annelik' Mutterschutz geçen kartı bulur", () => {
  const ctx = semantic.expandQuery("annelik");
  assert.ok(semantic.scoreDocument("Çocuk ve aile Mutterschutz Wochengeld Karenz", ctx) > 0);
  assert.equal(semantic.scoreDocument("Vergi dilimleri ve maaş pusulası", ctx), 0);
});

test("arama her dili döndürmez: yerelleştirilmiş kayıtlar yalnızca seçili dilde", () => {
  for (const lang of ["tr", "hr", "de"]) {
    for (const r of search("maaş plata Gehalt salary", lang)) {
      const ok = r.lang === lang || (r.lang === "de" && r.sourceType === "kv_catalog");
      assert.ok(ok, `${lang} aramasında ${r.lang}/${r.sourceType} döndü`);
    }
  }
});

test("'annelik' KV sonuçlarında Karenz/Mutterschutz konulu sözleşmeler çıkar", () => {
  const results = search("annelik", "tr");
  assert.ok(results.length > 0);
  assert.ok(results.every((r) => r.sourceType !== "guide_card"));
  const topics = results.filter((r) => r.sourceType === "kv_catalog").flatMap((r) => r.meta.topics).join(" ");
  assert.match(topics, /Karenz|Mutterschutz|Elternzeit/);
});

test("aynı sözleşme tekrarlanmaz", () => {
  const results = search("Kündigung", "de", 20);
  const keys = results.map((r) => `${r.sourceType}|${r.meta?.groupId || r.meta?.companyId || r.title}`);
  assert.equal(new Set(keys).size, keys.length);
});

test("GLB hiçbir içerikte geçmez", () => {
  for (const f of ["tr", "hr", "sr", "bs", "ro", "hu", "sl", "de", "en"]) {
    assert.ok(!/GLB|Linksblock/.test(readFileSync(new URL(`../content/${f}.json`, import.meta.url), "utf8")), f);
  }
  assert.ok(!/GLB|Linksblock/.test(readFileSync(new URL("../content/search-index.json", import.meta.url), "utf8")));
});

test("search-index küçük kalır (KV artık ayrı dosyadan aranır)", () => {
  assert.ok(readFileSync(new URL("../content/search-index.json", import.meta.url)).length < 400_000);
  assert.ok(!index.chunks.some((c) => c.sourceType === "kv_catalog"));
});

test("concepts.json: yapı geçerli, her dilde terim var, related kimlikleri mevcut", () => {
  const { concepts } = read("content/concepts.json");
  for (const [id, def] of Object.entries(concepts)) {
    assert.ok(def.display?.length, `${id}: display boş`);
    for (const lang of ["de", "tr", "sh", "ro", "hu", "sl", "en"]) {
      assert.ok(def.terms[lang]?.length, `${id}: ${lang} terimi yok`);
    }
    for (const r of def.related) assert.ok(concepts[r], `${id}: bilinmeyen related ${r}`);
  }
});

test("sık arananlar önerileri her dilde bir kavrama veya sonuca ulaşır", () => {
  const shared = read("content/shared-ui.json");
  for (const [lang, ui] of Object.entries(shared)) {
    assert.ok(ui.suggestions.length >= 4, lang);
    for (const term of ui.suggestions) {
      assert.ok(semantic.expandQuery(term).concepts.length > 0, `${lang}: "${term}" hiçbir kavrama eşleşmiyor`);
      assert.ok(search(term, lang).length > 0, `${lang}: "${term}" sonuç vermiyor`);
    }
  }
});

test("card-meta.json yalnızca var olan kartları içerir; tarihler geçerli", () => {
  const ids = read("content/tr.json").cards.map((c) => c.id);
  const { reviewed } = read("content/card-meta.json");
  for (const [id, date] of Object.entries(reviewed)) {
    assert.ok(ids.includes(id), `bilinmeyen kart ${id}`);
    assert.ok(date === null || !Number.isNaN(Date.parse(date)), `${id}: geçersiz tarih`);
  }
});

test("sihirbaz: her sektör ve her sektör etiketi 9 dilde, en az 3 sözleşmeye ulaşır (güvenlik: 1)", () => {
  const sectors = ["hospitality", "retail", "construction", "industry", "transport", "care_social", "cleaning", "crafts", "agriculture", "security"];
  const { words } = require("../assets/common.js");
  const ui = read("content/shared-ui.json");
  for (const lang of Object.keys(ui)) {
    for (const s of sectors) assert.ok(ui[lang].sectors?.[s], `${lang}.sectors.${s}`);
  }
  for (const s of sectors) {
    const hits = agreements.filter((a) => semantic.countConceptHits(` ${words(a.title)} `, s) > 0);
    const minimum = s === "security" ? 1 : 3; // Bewachungsgewerbe tek sözleşme; tek doğru sonuç da yeterli
    assert.ok(hits.length >= minimum, `${s}: ${hits.length} sözleşme`);
  }
});

test("yeni kavramlar: günlük ifadeler doğru kavrama gider", () => {
  const cases = {
    "evden çalışma": "telework", "home office": "telework", "rad od kuće": "telework",
    "işsizlik maaşı": "unemployment", "Arbeitslosengeld": "unemployment",
    "emeklilik": "retirement", "nyugdíj": "retirement",
    "ayrımcılık": "discrimination", "sexuelle Belästigung": "discrimination",
    "maaşımı alamadım": "unpaid_wages", "Verjährung": "unpaid_wages", "insolvency": "unpaid_wages",
    "gece zammı": "allowances", "Schmutzzulage": "allowances",
    "Deutschkurs": "training", "Almanca kursu": "training"
  };
  for (const [q, id] of Object.entries(cases)) {
    assert.ok(semantic.expandQuery(q).concepts.some((c) => c.id === id), `${q} -> ${id}`);
  }
});
