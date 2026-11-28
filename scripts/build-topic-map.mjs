#!/usr/bin/env node
/**
 * KV konu başlıklarını (collective-agreements.json -> agreements[].topics) kavramlara bağlar ve
 * content/topic-concepts.json dosyasını yazar. Tarayıcıdaki motorla (assets/semantic.js) aynı kod kullanılır,
 * bu yüzden eşleme kuralları iki yerde ayrı ayrı bakım istemez.
 *
 *   node scripts/build-topic-map.mjs            # haritayı yaz, eşlenemeyen başlıkları listele
 *   node scripts/build-topic-map.mjs --check    # yalnızca kontrol et (dosya yazmaz)
 *
 * Elle düzeltmeler: content/topic-overrides.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createEngine } = require("../assets/semantic.js");
const root = new URL("../", import.meta.url);
const read = (path) => JSON.parse(readFileSync(new URL(path, root), "utf8"));

const concepts = read("content/concepts.json");
const engine = createEngine(concepts);
const overrides = read("content/topic-overrides.json").topics || {};
const { agreements } = read("content/collective-agreements.json");

const counts = new Map();
for (const agreement of agreements) {
  for (const topic of agreement.topics || []) counts.set(topic, (counts.get(topic) || 0) + 1);
}

const topics = {};
const unmapped = [];
for (const label of [...counts.keys()].sort((a, b) => a.localeCompare(b, "de"))) {
  const ids = Object.hasOwn(overrides, label) ? overrides[label] : engine.detectConcepts(label, { kind: "topic" });
  for (const id of ids) {
    if (!engine.hasConcept(id)) throw new Error(`topic-overrides.json: unknown concept "${id}" for "${label}"`);
  }
  topics[label] = ids;
  if (!ids.length) unmapped.push(label);
}

const total = [...counts.values()].reduce((a, b) => a + b, 0);
const unmappedOccurrences = unmapped.reduce((sum, label) => sum + counts.get(label), 0);
const coverage = total ? 1 - unmappedOccurrences / total : 1;
const output = {
  generatedAt: new Date().toISOString(),
  stats: { labels: counts.size, unmapped: unmapped.length, coverage: Number(coverage.toFixed(4)) },
  unmapped,
  topics
};

console.log(`${counts.size} topic labels, ${unmapped.length} unmapped, coverage ${(coverage * 100).toFixed(1)}%`);
if (unmapped.length) console.log("Unmapped (add terms to concepts.json or an entry to topic-overrides.json):\n  " + unmapped.join("\n  "));
if (!process.argv.includes("--check")) {
  writeFileSync(new URL("content/topic-concepts.json", root), JSON.stringify(output, null, 0) + "\n");
  console.log("Wrote content/topic-concepts.json");
}
