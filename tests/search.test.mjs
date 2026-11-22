// Çalıştırma: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { createEngine } = require("../assets/semantic.js");
const { rank } = require("../assets/rag-retriever.js");
const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), "utf8"));

const semantic = createEngine(read("content/concepts.json"));
const index = read("content/rag-index.json");
const search = (q, language, topK = 10) => rank(index, q, { language, topK, semantic });

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
      const ok = r.lang === lang || (r.lang === "de" && ["kv_catalog", "kv_fulltext"].includes(r.sourceType));
      assert.ok(ok, `${lang} aramasında ${r.lang}/${r.sourceType} döndü`);
    }
  }
});

test("'annelik' KV sonuçlarında Karenz/Mutterschutz konulu sözleşmeler çıkar", () => {
  const results = search("annelik", "tr");
  assert.ok(results.length > 0);
  assert.ok(results.every((r) => r.sourceType !== "guide_card"));
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
  assert.ok(!/GLB|Linksblock/.test(readFileSync(new URL("../content/rag-index.json", import.meta.url), "utf8")));
});
