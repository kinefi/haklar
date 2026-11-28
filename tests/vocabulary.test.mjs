// Kavram sözlüğü ve KV konu haritası testleri. Çalıştırma: node --test tests/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { createEngine } = require("../assets/semantic.js");
const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), "utf8"));

const conceptsData = read("content/concepts.json");
const topicMap = read("content/topic-concepts.json");
const engine = createEngine(conceptsData, topicMap);
const runtimeEngine = createEngine(conceptsData); // haritasız: yeni başlıklar çalışma anında böyle eşlenir
const golden = read("tests/golden-queries.json");
const { agreements } = read("content/collective-agreements.json");

const UI_LANGUAGES = ["tr", "hr", "sr", "bs", "ro", "hu", "sl", "de", "en"];
const TERM_LANGUAGES = ["de", "tr", "sh", "ro", "hu", "sl", "en"];

test("altın sorgular: beklenen kavramlar bulunur, bilinen yanlış eşleşmeler olmaz", () => {
  const failures = [];
  for (const { q, expect = [], forbid = [] } of golden.queries) {
    const primary = engine.expandQuery(q).concepts.filter((c) => c.primary).map((c) => c.id);
    const missing = expect.filter((id) => !primary.includes(id));
    const wrong = forbid.filter((id) => primary.includes(id));
    if (missing.length || wrong.length) {
      failures.push(`"${q}": got [${primary.join(", ")}]${missing.length ? ` missing [${missing}]` : ""}${wrong.length ? ` forbidden [${wrong}]` : ""}`);
    }
  }
  assert.deepEqual(failures, [], `\n${failures.join("\n")}`);
});

test("altın sorgular: geçerli kavram kimlikleri kullanır ve en az 150 sorgu içerir", () => {
  assert.ok(golden.queries.length >= 150, `${golden.queries.length} sorgu`);
  for (const { q, expect = [], forbid = [] } of golden.queries) {
    for (const id of [...expect, ...forbid]) assert.ok(engine.hasConcept(id), `"${q}": bilinmeyen kavram ${id}`);
  }
});

test("concepts.json: her kavramın 9 dilde etiketi, 7 dil anahtarında terimi var", () => {
  for (const [id, def] of Object.entries(conceptsData.concepts)) {
    for (const lang of UI_LANGUAGES) assert.ok(def.labels?.[lang]?.trim(), `${id}: labels.${lang} yok`);
    for (const lang of TERM_LANGUAGES) assert.ok(def.terms[lang]?.length, `${id}: terms.${lang} yok`);
    assert.ok(["topic", "sector"].includes(def.kind), `${id}: kind`);
  }
});

test("topic-concepts.json güncel: katalogdaki her konu başlığı haritada", () => {
  const missing = new Set();
  for (const agreement of agreements) {
    for (const topic of agreement.topics) if (!Object.hasOwn(topicMap.topics, topic)) missing.add(topic);
  }
  assert.equal(missing.size, 0, `Haritada olmayan başlıklar (node scripts/build-topic-map.mjs çalıştırın):\n${[...missing].slice(0, 20).join("\n")}`);
});

test("KV konu başlıklarının en az %99'u bir kavrama eşlenir", () => {
  let total = 0;
  let mapped = 0;
  for (const agreement of agreements) {
    for (const topic of agreement.topics) {
      total += 1;
      if (engine.topicConcepts(topic).length) mapped += 1;
    }
  }
  assert.ok(mapped / total >= 0.99, `kapsam ${(100 * mapped / total).toFixed(1)}%`);
});

test("haritasız (çalışma anı) eşleme de en az %98 kapsar: yeni başlıklar Almanca kalmaz", () => {
  const labels = Object.keys(topicMap.topics);
  const mapped = labels.filter((label) => runtimeEngine.topicConcepts(label).length).length;
  assert.ok(mapped / labels.length >= 0.98, `${mapped}/${labels.length}`);
});

test("örnek konu başlıkları doğru kavramlara eşlenir (sıra: başlıktaki sıra)", () => {
  for (const [label, ids] of Object.entries(golden.topics)) {
    assert.deepEqual(engine.topicConcepts(label), ids, label);
  }
});

test("topicLabels: Türkçe çeviri kavram etiketlerinden, Almancada asıl başlık", () => {
  assert.deepEqual(engine.topicLabels("Kündigung und Verfall von Ansprüchen", "tr"),
    ["İşten çıkış ve fesih", "Hak düşürücü süreler (talep son tarihi)"]);
  assert.deepEqual(engine.topicLabels("Kündigung und Verfall von Ansprüchen", "de"), ["Kündigung und Verfall von Ansprüchen"]);
  assert.deepEqual(engine.topicLabels("Urheberrecht und Werknutzung für Journalisten", "tr"),
    ["Urheberrecht und Werknutzung für Journalisten"], "eşlenemeyen başlık Almanca kalır");
});

test("en uzun eşleşme: bileşik sözcük kısa terimin kavramını tetiklemez", () => {
  const ids = (q) => engine.expandQuery(q).concepts.filter((c) => c.primary).map((c) => c.id);
  assert.ok(!ids("Pflegefreistellung").includes("care_social"));
  assert.ok(!ids("Urlaubsgeld").includes("annual_leave"));
  assert.ok(ids("Pflege").includes("care_social"));
});

test("topicMatches: ★ yalnızca sorgunun birincil kavramını taşıyan başlıkta", () => {
  const context = engine.expandQuery("fazla mesai");
  assert.ok(engine.topicMatches("Arbeitszeit und Überstunden", context));
  assert.ok(!engine.topicMatches("Urlaub und Urlaubsanspruch", context));
});
