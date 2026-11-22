/**
 * Haklar - tarayıcı tarafı arama (BM25 seyrek ağırlıklar + kavram genişletme).
 * content/rag-index.json dosyasını okur (scripts/build-rag-index.py üretir).
 *
 * Dil kuralı: rehber kartı, şirket notu ve vergi gibi yerelleştirilmiş kayıtlar yalnızca seçili
 * arayüz dilinde döner. Toplu sözleşme (KV) kayıtları kaynağı gereği Almancadır; her dilde döner.
 */
(() => {
  "use strict";

  const common = typeof require !== "undefined" ? require("./common.js") : window.haklar;
  const { words } = common;

  const GERMAN_SOURCE_TYPES = new Set(["kv_catalog", "kv_fulltext"]);
  const EXCLUDED_TYPES = new Set(["guide_card"]); // Rehber kartları sayfada zaten ayrıca listelenir.
  const MIN_SCORE = 2.5;

  function isVisibleForLanguage(chunk, language) {
    if (!language || chunk.lang === language) return true;
    return chunk.lang === "de" && GERMAN_SOURCE_TYPES.has(chunk.sourceType);
  }

  function includesToken(padded, token) {
    return token.length >= 4 ? padded.includes(token) : padded.includes(` ${token} `);
  }

  function scoreChunk(chunk, context) {
    const title = ` ${words(chunk.title)} `;
    const text = ` ${words(chunk.text)} `;
    const weights = chunk.tf || {};
    let score = 0;

    for (const token of context.tokens) {
      if (weights[token]) score += weights[token] * 2;
      if (includesToken(title, token)) score += 3;
      if (includesToken(text, token)) score += 1;
    }

    if (title.includes(` ${context.normalizedQuery}`)) score += 5;
    else if (text.includes(` ${context.normalizedQuery}`)) score += 3;

    // Kavram eşleşmesi: indeks oluşturulurken etiketlenen kavramlar (chunk.concepts).
    const tags = chunk.concepts || [];
    for (const concept of context.concepts) {
      if (tags.includes(concept.id)) score += concept.weight * (concept.primary ? 6 : 2.5);
    }
    return score;
  }

  /**
   * @param index   rag-index.json içeriği
   * @param query   kullanıcı sorgusu
   * @param options { language, topK, sourceTypes, semantic }  semantic: { expandQuery }
   */
  function rank(index, query, options) {
    const { language = null, topK = 8, sourceTypes = null, semantic } = options;
    const context = semantic.expandQuery(query);
    if (!context.normalizedQuery) return [];

    const scored = [];
    for (const chunk of index.chunks || []) {
      if (EXCLUDED_TYPES.has(chunk.sourceType)) continue;
      if (sourceTypes && !sourceTypes.includes(chunk.sourceType)) continue;
      if (!isVisibleForLanguage(chunk, language)) continue;
      const score = scoreChunk(chunk, context);
      if (score >= MIN_SCORE) scored.push({ chunk, score });
    }

    scored.sort((a, b) => b.score - a.score
      || (a.chunk.meta?.popularOrder ?? 9999) - (b.chunk.meta?.popularOrder ?? 9999));

    // Aynı sözleşme/şirket için tek kayıt (KV'nin çok sayıda varyantı var).
    const seen = new Set();
    const results = [];
    for (const { chunk, score } of scored) {
      const key = `${chunk.sourceType}|${chunk.meta?.groupId || chunk.meta?.companyId || chunk.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const { tf, ...rest } = chunk; // eslint-disable-line no-unused-vars
      results.push({ ...rest, score: Number(score.toFixed(2)) });
      if (results.length >= topK) break;
    }
    return results;
  }

  const api = { rank, isVisibleForLanguage };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    const loadRagIndex = (url = "content/rag-index.json") => common.loadJson(url);
    window.haklarRAG = {
      loadRagIndex,
      isVisibleForLanguage,
      async retrieve(query, options = {}) {
        const [index] = await Promise.all([loadRagIndex(options.indexUrl), window.haklarSemantic.ready]);
        return rank(index, query, { ...options, semantic: window.haklarSemantic });
      }
    };
  }
})();
