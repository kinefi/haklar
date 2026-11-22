/**
 * Haklar - kavram tabanlı çok dilli arama motoru.
 *
 * Kavram sözlüğü content/concepts.json içindedir (tek kaynak). Örneğin Türkçe "annelik"
 * sorgusu `maternity` kavramına eşleşir ve Almanca "Mutterschutz", "Wochengeld" gibi
 * karşılıklarını ve ilgili "Karenz" kavramını arama terimlerine ekler.
 *
 * Tarayıcıda window.haklarSemantic, Node testlerinde module.exports olarak kullanılır.
 */
(() => {
  "use strict";

  const common = typeof require !== "undefined" ? require("./common.js") : window.haklar;
  const { words } = common;

  const GERMAN_DIGRAPHS = { "ä": "ae", "ö": "oe", "ü": "ue", "Ä": "Ae", "Ö": "Oe", "Ü": "Ue" };
  const RELATED_FACTOR = 0.5;   // "related" kavramların ağırlık çarpanı
  const MIN_PREFIX_QUERY = 4;   // yazarken ("mutters") ön ek eşleşmesi için en kısa sorgu
  const MIN_PREFIX_TOKEN = 5;   // sorgudaki tek sözcüğün terim başına eşleşmesi için en kısa uzunluk

  // Metin " sözcük sözcük " biçiminde; 5+ harfli terimler sözcük başında eşleşir
  // (Türkçe ekler ve Almanca bileşik sözcükler için), kısa terimler yalnızca tam sözcük olarak.
  function containsTerm(paddedWords, term) {
    return term.length >= 5
      ? paddedWords.includes(" " + term)
      : paddedWords.includes(" " + term + " ");
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const current = [i];
      for (let j = 1; j <= b.length; j++) {
        current[j] = Math.min(
          previous[j] + 1,
          current[j - 1] + 1,
          previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }
      previous = current;
    }
    return previous[b.length];
  }

  function typoTolerance(length) {
    return length >= 9 ? 2 : 1;
  }

  function termVariants(raw) {
    const variants = new Set([words(raw)]);
    if (/[äöüÄÖÜ]/.test(raw)) {
      variants.add(words(raw.replace(/[äöüÄÖÜ]/g, (ch) => GERMAN_DIGRAPHS[ch])));
    }
    variants.delete("");
    return [...variants];
  }

  /** concepts.json verisinden bir arama motoru kurar. */
  function createEngine(data) {
    const concepts = new Map();   // id -> { id, kind, display, related, terms: Set<string> }
    const termIndex = new Map();  // normalleştirilmiş terim -> Set<conceptId>

    for (const [id, definition] of Object.entries((data && data.concepts) || {})) {
      const terms = new Set();
      for (const list of Object.values(definition.terms || {})) {
        for (const raw of list) {
          for (const variant of termVariants(raw)) {
            terms.add(variant);
            if (!termIndex.has(variant)) termIndex.set(variant, new Set());
            termIndex.get(variant).add(id);
          }
        }
      }
      concepts.set(id, {
        id,
        kind: definition.kind || "topic",
        display: definition.display || [],
        related: definition.related || [],
        terms
      });
    }

    const fuzzyCandidates = [...termIndex.keys()].filter((term) => term.length >= 6 && !term.includes(" "));
    const fuzzyCache = new Map();

    function fuzzyConceptsForToken(token) {
      if (fuzzyCache.has(token)) return fuzzyCache.get(token);
      const matched = new Set();
      if (token.length >= 6) {
        const maxDistance = typoTolerance(token.length);
        for (const term of fuzzyCandidates) {
          if (Math.abs(term.length - token.length) > maxDistance) continue;
          if (levenshtein(token, term) <= maxDistance) {
            termIndex.get(term).forEach((id) => matched.add(id));
          }
        }
      }
      fuzzyCache.set(token, matched);
      return matched;
    }

    function expandQuery(rawQuery) {
      const normalizedQuery = words(rawQuery);
      if (!normalizedQuery) return { raw: rawQuery, normalizedQuery: "", tokens: [], concepts: [], hints: [] };

      const tokens = normalizedQuery.split(" ").filter((token) => token.length >= 2);
      const padded = ` ${normalizedQuery} `;
      const weights = new Map(); // conceptId -> ağırlık
      const raise = (id, weight) => {
        if ((weights.get(id) || 0) < weight) weights.set(id, weight);
      };

      for (const [term, ids] of termIndex) {
        let weight = 0;
        if (containsTerm(padded, term)) {
          weight = 1;
        } else if (normalizedQuery.length >= MIN_PREFIX_QUERY && term.startsWith(normalizedQuery)) {
          weight = 0.7;
        } else if (tokens.some((token) => token.length >= MIN_PREFIX_TOKEN && term.startsWith(token))) {
          weight = 0.6;
        }
        if (weight) ids.forEach((id) => raise(id, weight));
      }

      // Hiçbir kavram bulunamadıysa yazım hatalarını dene.
      if (!weights.size) {
        for (const token of tokens) fuzzyConceptsForToken(token).forEach((id) => raise(id, 0.5));
      }

      const primary = [...weights.entries()];
      for (const [id, weight] of primary) {
        for (const relatedId of concepts.get(id).related) {
          if (concepts.has(relatedId)) raise(relatedId, weight * RELATED_FACTOR);
        }
      }

      const primaryIds = new Set(primary.map(([id]) => id));
      const matched = [...weights.entries()]
        .map(([id, weight]) => ({ id, weight, primary: primaryIds.has(id), concept: concepts.get(id) }))
        .sort((a, b) => b.weight - a.weight);

      const hints = [];
      for (const item of matched) {
        if (!item.primary || item.weight < 0.6) continue;
        for (const label of item.concept.display) {
          if (!hints.includes(label) && words(label) !== normalizedQuery) hints.push(label);
        }
      }

      return {
        raw: rawQuery,
        normalizedQuery,
        tokens,
        concepts: matched.map(({ id, weight, primary: isPrimary }) => ({ id, weight, primary: isPrimary })),
        hints
      };
    }

    function conceptTerms(id) {
      const concept = concepts.get(id);
      return concept ? [...concept.terms] : [];
    }

    // paddedWords: " sözcük sözcük " biçimli metin
    function countConceptHits(paddedWords, id) {
      const concept = concepts.get(id);
      if (!concept) return 0;
      let hits = 0;
      for (const term of concept.terms) if (containsTerm(paddedWords, term)) hits += 1;
      return hits;
    }

    /** Belgenin (kart, KV başlığı vb.) sorguyla ne kadar eşleştiğini puanlar. 0 = eşleşme yok. */
    function scoreDocument(searchableText, context) {
      if (!context || !context.normalizedQuery) return 1;
      const text = words(searchableText);
      if (!text) return 0;
      const padded = ` ${text} `;

      let score = 0;
      if (padded.includes(` ${context.normalizedQuery}`)) score += 100;

      for (const token of context.tokens) {
        const hit = token.length >= 4 ? padded.includes(token) : padded.includes(` ${token} `);
        if (hit) score += 30;
      }

      for (const concept of context.concepts) {
        const hits = countConceptHits(padded, concept.id);
        if (hits) score += concept.weight * (25 + 5 * Math.min(hits, 3));
      }

      if (score === 0) {
        const textWords = text.split(" ").filter((word) => word.length >= 5);
        for (const token of context.tokens) {
          if (token.length < 5) continue;
          const maxDistance = typoTolerance(token.length);
          if (textWords.some((word) => Math.abs(word.length - token.length) <= maxDistance
            && levenshtein(word, token) <= maxDistance)) {
            score += 15;
          }
        }
      }
      return score;
    }

    return { expandQuery, scoreDocument, countConceptHits, conceptTerms, hasConcept: (id) => concepts.has(id) };
  }

  const api = { createEngine, containsTerm, levenshtein };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    // Tarayıcı: sözlük yüklenene kadar boş motor; ready çözülünce gerçek motor devreye girer.
    let engine = createEngine({ concepts: {} });
    const ready = common.loadJson("content/concepts.json")
      .then((data) => { engine = createEngine(data); })
      .catch((error) => console.error("Could not load content/concepts.json; falling back to plain text search.", error));

    window.haklarSemantic = {
      ready,
      expandQuery: (query) => engine.expandQuery(query),
      scoreDocument: (text, context) => engine.scoreDocument(text, context),
      countConceptHits: (padded, id) => engine.countConceptHits(padded, id),
      containsTerm
    };
  }
})();
