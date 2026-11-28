/**
 * Haklar - tarayıcı tarafı arama (BM25 seyrek ağırlıklar + kavram genişletme). Yapay zekâ yanıtı üretmez; yalnızca kaynak bulur.
 * content/search-index.json dosyasını okur (scripts/build-search-index.py üretir).
 *
 * Dil kuralı: şirket notu ve vergi gibi yerelleştirilmiş kayıtlar yalnızca seçili arayüz dilinde döner.
 * Toplu sözleşme (KV) kayıtları kaynağı gereği Almancadır; her dilde döner. KV, search-index.json'a değil
 * doğrudan collective-agreements.json'a karşı aranır.
 */
(() => {
  "use strict";

  const common = typeof require !== "undefined" ? require("./common.js") : window.haklar;
  const { words } = common;

    const MIN_SCORE = 2.5;

  // Yerelleştirilmiş kayıtlar yalnızca seçili dilde görünür. Toplu sözleşmeler (rankAgreements)
  // kaynağı gereği Almancadır ve ayrı değerlendirilir.
  function isVisibleForLanguage(chunk, language) {
    return !language || chunk.lang === language;
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

  const agreementTextCache = new WeakMap();
  function agreementText(agreement, semantic) {
    if (!agreementTextCache.has(agreement)) {
      // Konu başlıklarının kavramları content/topic-concepts.json'dan (yoksa çalışma anında) gelir.
      const topicConcepts = new Map();
      for (const topic of agreement.topics || []) {
        for (const id of semantic.topicConcepts(topic)) topicConcepts.set(id, (topicConcepts.get(id) || 0) + 1);
      }
      agreementTextCache.set(agreement, {
        title: ` ${words(agreement.title)} `,
        topics: ` ${words((agreement.topics || []).join(" "))} `,
        topicConcepts
      });
    }
    return agreementTextCache.get(agreement);
  }

  /** content/collective-agreements.json kayıtlarını başlık ve konu etiketlerine göre puanlar. */
  function scoreAgreement(agreement, context, semantic) {
    const { title, topics, topicConcepts } = agreementText(agreement, semantic);
    let score = 0;
    for (const token of context.tokens) {
      if (includesToken(title, token)) score += 4;
      if (includesToken(topics, token)) score += 1.5;
    }
    if (title.includes(` ${context.normalizedQuery}`)) score += 6;
    for (const concept of context.concepts) {
      const titleHits = Math.min(semantic.countConceptHits(title, concept.id), 2);
      const topicHits = Math.min(topicConcepts.get(concept.id) || 0, 3);
      score += concept.weight * (titleHits * 4 + topicHits * 2.5);
    }
    if (score > 0 && agreement.popularOrder !== null && agreement.popularOrder !== undefined) score += 2; // ana sözleşmeler öne
    return score;
  }

  function agreementResult(agreement, score) {
    return {
      id: agreement.variantId,
      sourceType: "kv_catalog",
      lang: "de",
      title: agreement.title,
      section: "",
      text: "",
      url: agreement.url,
      meta: {
        groupId: agreement.groupId, popularOrder: agreement.popularOrder,
        topics: agreement.topics || [], topicIds: agreement.topicIds
      },
      score: Number(score.toFixed(2))
    };
  }

  /**
   * @param index   search-index.json içeriği
   * @param query   kullanıcı sorgusu
   * @param options { language, topK, sourceTypes, semantic, agreements }
   *                semantic: { expandQuery, countConceptHits, topicConcepts }, agreements: collective-agreements.json "agreements"
   */
  function rank(index, query, options) {
    const { language = null, topK = 8, sourceTypes = null, semantic, agreements = [] } = options;
    const context = semantic.expandQuery(query);
    if (!context.normalizedQuery) return [];

    const scored = [];
    for (const chunk of index.chunks || []) {
      if (sourceTypes && !sourceTypes.includes(chunk.sourceType)) continue;
      if (!isVisibleForLanguage(chunk, language)) continue;
      const score = scoreChunk(chunk, context);
      if (score >= MIN_SCORE) scored.push({ chunk, score });
    }
    if (!sourceTypes || sourceTypes.includes("kv_catalog")) {
      for (const agreement of agreements) {
        const score = scoreAgreement(agreement, context, semantic);
        if (score >= MIN_SCORE) scored.push({ chunk: agreementResult(agreement, score), score });
      }
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
    const loadSearchIndex = (url = "content/search-index.json") => common.loadJson(url);
    window.haklarSearch = {
      loadSearchIndex,
      isVisibleForLanguage,
      async retrieve(query, options = {}) {
        const [index, catalog] = await Promise.all([
          loadSearchIndex(options.indexUrl),
          common.loadJson("content/collective-agreements.json"),
          window.haklarSemantic.ready
        ]);
        return rank(index, query, { ...options, agreements: catalog.agreements, semantic: window.haklarSemantic });
      }
    };
  }
})();
