/**
 * Haklar - kavram tabanlı çok dilli arama motoru.
 *
 * Kavram sözlüğü content/concepts.json içindedir (tek kaynak). Örneğin Türkçe "annelik"
 * sorgusu `maternity` kavramına eşleşir ve Almanca "Mutterschutz", "Wochengeld" gibi
 * karşılıklarını ve ilgili "Karenz" kavramını arama terimlerine ekler.
 *
 * KV konu başlıkları (ör. "Kündigung und Verfall von Ansprüchen") content/topic-concepts.json
 * ile kavramlara bağlanır (scripts/build-topic-map.mjs üretir); başlığın çevirisi kavramların
 * `labels` alanından gelir. Haritada olmayan yeni başlıklar çalışma anında aynı kurallarla eşlenir.
 *
 * Tarayıcıda window.haklarSemantic, Node testlerinde ve betiklerde module.exports olarak kullanılır.
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

  /** concepts.json verisinden (ve isteğe bağlı topic-concepts.json haritasından) bir arama motoru kurar. */
  function createEngine(data, topicMapData) {
    const concepts = new Map();   // id -> { id, kind, display, related, labels, terms: Set<string> }
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
        labels: definition.labels || {},
        terms
      });
    }

    // En uzun eşleşme kuralı: bir terim, başka bir kavramın onu içeren daha uzun terimi aynı yerde eşleşiyorsa
    // sayılmaz. Örn. "pflege" (bakım sektörü) "pflegefreistellung" içinde, "odmor" (mola) "godisnji odmor"
    // (yıllık izin) içinde. containers: terim -> [{ other, offset }] (other terimi, offset konumunda terimi içerir).
    const allTerms = [...termIndex.keys()].sort();
    const containers = new Map();
    for (const other of allTerms) {
      const otherOwners = termIndex.get(other);
      for (let offset = 0; offset < other.length; offset++) {
        if (offset > 0 && other[offset - 1] !== " ") continue; // yalnızca sözcük başlarında
        for (let end = offset + 2; end <= other.length; end++) {
          if (offset === 0 && end === other.length) continue;
          const term = other.slice(offset, end);
          const owners = termIndex.get(term);
          if (!owners) continue;
          if (term.length < 5 && end < other.length && other[end] !== " ") continue; // kısa terim: tam sözcük
          if (![...otherOwners].some((id) => !owners.has(id))) continue;
          if (!containers.has(term)) containers.set(term, []);
          containers.get(term).push({ other, offset });
        }
      }
    }

    /** Terimin metindeki geçerli (başka kavramın daha uzun terimiyle örtülmeyen) ilk konumu; yoksa -1. */
    function termPosition(paddedWords, term, conceptId) {
      const needle = term.length >= 5 ? " " + term : " " + term + " ";
      const covers = containers.get(term);
      let from = 0;
      for (;;) {
        const index = paddedWords.indexOf(needle, from);
        if (index < 0) return -1;
        const dominated = covers && covers.some(({ other, offset }) =>
          (!conceptId || !termIndex.get(other).has(conceptId)) && index - offset >= 0
          && paddedWords.startsWith(" " + other, index - offset));
        if (!dominated) return index;
        from = index + 1;
      }
    }

    const fuzzyCandidates = allTerms.filter((term) => term.length >= 6 && !term.includes(" "));
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

      // 1) Tam terim eşleşmeleri (en uzun eşleşme kuralıyla).
      const covered = new Set(); // tam eşleşen terimlerin içinde kalan sorgu sözcükleri
      for (const [term, ids] of termIndex) {
        for (const id of ids) {
          if (termPosition(padded, term, id) >= 0) {
            raise(id, 1);
            term.split(" ").forEach((part) => tokens.forEach((token) => {
              if (part.startsWith(token) || token.startsWith(part)) covered.add(token);
            }));
          }
        }
      }

      // 2) Yazarken: sorgunun tamamı bir terimin başıysa ("mutters" -> mutterschutz). Tam eşleşme varsa atlanır.
      if (!weights.size && normalizedQuery.length >= MIN_PREFIX_QUERY) {
        for (const [term, ids] of termIndex) {
          if (term.startsWith(normalizedQuery)) ids.forEach((id) => raise(id, 0.7));
        }
      }

      // 3) Tek sözcüklü terimler için sözcük ön eki ("kündigungs" -> kündigungsfrist); başka bir tam eşleşmenin
      //    parçası olan sözcükler ("asgari ücret" içindeki "ücret") için yapılmaz.
      const loose = tokens.filter((token) => token.length >= MIN_PREFIX_TOKEN && !covered.has(token));
      if (loose.length) {
        for (const [term, ids] of termIndex) {
          if (term.includes(" ")) continue;
          if (loose.some((token) => term.startsWith(token))) ids.forEach((id) => raise(id, 0.6));
        }
      }

      // 4) Hiçbir kavram bulunamadıysa yazım hatalarını dene.
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

    // paddedWords: " sözcük sözcük " biçimli metin. Sonuçlar önbelleğe alınır: yazarken aynı belgeler
    // (KV kayıtları, kartlar) aynı kavramlarla tekrar tekrar puanlanır.
    const hitCache = new Map();
    const HIT_CACHE_LIMIT = 20000;
    function countConceptHits(paddedWords, id) {
      const concept = concepts.get(id);
      if (!concept) return 0;
      const key = id + "\u0000" + paddedWords;
      const cached = hitCache.get(key);
      if (cached !== undefined) return cached;
      let hits = 0;
      for (const term of concept.terms) if (termPosition(paddedWords, term, id) >= 0) hits += 1;
      if (hitCache.size >= HIT_CACHE_LIMIT) hitCache.clear();
      hitCache.set(key, hits);
      return hits;
    }

    /**
     * Metinde geçen kavramlar, metindeki ilk konumlarına göre sıralı.
     * options.kind: yalnızca bu türdeki kavramlar ("topic" | "sector").
     */
    function detectConcepts(text, options = {}) {
      const padded = ` ${words(text)} `;
      const found = [];
      for (const concept of concepts.values()) {
        if (options.kind && concept.kind !== options.kind) continue;
        let first = -1;
        for (const term of concept.terms) {
          const position = termPosition(padded, term, concept.id);
          if (position >= 0 && (first < 0 || position < first)) first = position;
        }
        if (first >= 0) found.push({ id: concept.id, position: first });
      }
      return found.sort((a, b) => a.position - b.position).map((item) => item.id);
    }

    // ---- KV konu başlığı -> kavramlar ----
    const topicMap = new Map(Object.entries((topicMapData && topicMapData.topics) || {}));
    const topicCache = new Map();
    function topicConcepts(label) {
      if (topicMap.has(label)) return topicMap.get(label);
      if (!topicCache.has(label)) topicCache.set(label, detectConcepts(label, { kind: "topic" }));
      return topicCache.get(label);
    }

    function label(id, language) {
      const concept = concepts.get(id);
      if (!concept) return id;
      return concept.labels[language] || concept.labels.en || concept.display[0] || id;
    }

    /** KV konu başlığının seçili dildeki karşılıkları; eşlenemeyen başlık Almanca kalır. */
    function topicLabels(topic, language) {
      if (language === "de") return [topic];
      const ids = topicConcepts(topic);
      return ids.length ? ids.map((id) => label(id, language)) : [topic];
    }

    /** Başlık, sorgunun birincil kavramlarından birini taşıyor mu (★ vurgusu için). */
    function topicMatches(topic, context) {
      if (!context || !context.concepts) return false;
      const ids = new Set(topicConcepts(topic));
      return context.concepts.some((concept) => concept.primary && ids.has(concept.id));
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

    return {
      expandQuery, scoreDocument, countConceptHits, conceptTerms, detectConcepts,
      topicConcepts, topicLabels, topicMatches, label,
      hasConcept: (id) => concepts.has(id),
      conceptIds: (kind) => [...concepts.values()].filter((c) => !kind || c.kind === kind).map((c) => c.id)
    };
  }

  const api = { createEngine, containsTerm, levenshtein };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    // Tarayıcı: sözlük yüklenene kadar boş motor; ready çözülünce gerçek motor devreye girer.
    let engine = createEngine({ concepts: {} });
    const topicMapRequest = common.loadJson("content/topic-concepts.json").catch((error) => {
      console.warn("Could not load content/topic-concepts.json; topic labels are matched at runtime.", error);
      return null;
    });
    const ready = Promise.all([common.loadJson("content/concepts.json"), topicMapRequest])
      .then(([data, topicMap]) => { engine = createEngine(data, topicMap); })
      .catch((error) => console.error("Could not load content/concepts.json; falling back to plain text search.", error));

    window.haklarSemantic = {
      ready,
      expandQuery: (query) => engine.expandQuery(query),
      scoreDocument: (text, context) => engine.scoreDocument(text, context),
      countConceptHits: (padded, id) => engine.countConceptHits(padded, id),
      topicConcepts: (topic) => engine.topicConcepts(topic),
      topicLabels: (topic, language) => engine.topicLabels(topic, language),
      topicMatches: (topic, context) => engine.topicMatches(topic, context),
      label: (id, language) => engine.label(id, language),
      containsTerm
    };
  }
})();
