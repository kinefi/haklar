(() => {
  const CONCEPT_CLUSTERS = [
    {
      id: "termination",
      terms: [
        "kundigung", "entlassung", "einvernehmliche", "losung", "arbeitsende", "kuendigung",
        "isten atilma", "isten cikarilma", "kovulma", "fesih", "istifa", "ihbar suresi", "tazminat", "cikis",
        "otkaz", "otpustanje", "prestanak rada", "otkazni rok", "sporazumni",
        "concediere", "demisie", "preaviz", "incetare",
        "felmondas", "elbocsatas", "felmondasi ido",
        "odpoved", "odpuscanje", "prenehanje",
        "dismissal", "fired", "termination", "resignation", "notice period", "severance"
      ]
    },
    {
      id: "vorsorge",
      terms: [
        "vorsorge", "vorsorgekasse", "abfertigung", "abfertigung neu", "bvk", "betriebliche vorsorge", "pensionskasse",
        "kidem", "kidem tazminati", "emeklilik fonu", "birikim", "fon", "1.53",
        "otpremnina", "mirovinski fond", "stednja",
        "compensatie", "fond de pensii", "vechime",
        "vegkielegites", "nyugdijpenztar", "elotakarekossag",
        "odpravnina", "pokojninski sklad",
        "severance pay", "provident fund", "pension fund"
      ]
    },
    {
      id: "bonus",
      terms: [
        "bonus", "sonderzahlung", "sonderzahlungen", "urlaubsgeld", "urlaubszuschuss", "weihnachtsgeld", "weihnachtsremuneration", "13", "14", "jahressechstel", "praemie", "pramie",
        "ikramiye", "prim", "13. maas", "14. maas", "tatil parasi", "noel ikramiyesi", "ek odeme",
        "regres", "bozicnica", "13. plata", "14. plata", "13. placa", "14. placa", "nagrada",
        "prima", "al 13-lea", "al 14-lea", "sporuri",
        "jutalom", "13. havi", "14. havi", "udulesi", "karacsonyi",
        "regres", "bozicnica", "13. placa", "14. placa", "nagrada",
        "holiday pay", "christmas bonus", "13th salary", "14th salary", "special payment"
      ]
    },
    {
      id: "hospitality",
      terms: [
        "hotel", "gastgewerbe", "gastronomie", "restaurant", "kuche", "kellner", "koch", "tourismus",
        "otel", "restoran", "garson", "asci", "mutfak", "turizm", "konaklama",
        "konobar", "kuhar", "ugostiteljstvo",
        "ospatar", "bucatar", "turism",
        "pincer", "szakacs", "vendeglatas", "szalloda",
        "natakar", "kuhar", "gostinstvo",
        "waiter", "chef", "hospitality", "catering"
      ]
    },
    {
      id: "retail",
      terms: [
        "handel", "handelsangestellte", "handelsarbeiter", "einzelhandel", "supermarkt", "verkauf", "kassa", "lager",
        "ticaret", "magaza", "market", "kasiyer", "satis", "depo", "perakende",
        "trgovina", "prodavac", "blagajna", "skladiste",
        "comert", "magazin", "vanzator", "casier", "depozit",
        "kereskedelem", "bolt", "elado", "penztaros", "raktar",
        "trgovina", "prodajalec", "blagajna", "skladisce",
        "retail", "shop", "store", "cashier", "warehouse", "sales"
      ]
    },
    {
      id: "construction",
      terms: [
        "bau", "baugewerbe", "bauindustrie", "baunebengewerbe", "maurer", "zimmerer", "elektriker", "installateur", "buak",
        "insaat", "santiye", "duvarci", "usta", "elektrikci", "tesisatci",
        "gradevina", "gradjevina", "gradiliste", "zidar",
        "constructii", "santier", "zidar", "electrician",
        "epitoipar", "epitkezes", "komuves", "villanyszerelo",
        "gradbenistvo", "gradbisce", "zidar",
        "construction", "building", "builder", "site"
      ]
    },
    {
      id: "it_metal",
      terms: [
        "it", "edv", "informationstechnologie", "software", "metall", "metalltechnische", "industrie", "elektro", "elektronik", "fahrzeugindustrie",
        "bilisim", "yazilim", "metal", "sanayi", "fabrika", "otomotiv",
        "racunarstvo", "metalurgija", "industrija", "tvornica",
        "informatica", "industrie", "fabrica", "auto",
        "informatika", "femipar", "ipar", "gyar", "autoipar",
        "racunalnistvo", "kovinska", "industrija", "tovarna",
        "software", "engineering", "manufacturing", "factory", "automotive"
      ]
    },
    {
      id: "transport_care",
      terms: [
        "gueterbefoerderung", "transport", "fahrer", "lkw", "logistik", "pflege", "sozialwirtschaft", "swoe", "reinigung",
        "nakliye", "sofor", "tir", "kamyon", "lojistik", "bakim", "temizlik", "sosyal hizmet",
        "prijevoz", "prevoz", "vozac", "kamion", "njega", "nega", "ciscenje",
        "transport", "sofer", "camion", "ingrijire", "curatenie",
        "fuvarozas", "sofor", "teherauto", "apolas", "takaritas",
        "prevoz", "voznik", "tovornjak", "nega", "ciscenje",
        "driver", "truck", "logistics", "care", "nursing", "cleaning"
      ]
    },
    {
      id: "overtime_hours",
      terms: [
        "arbeitszeit", "ueberstunden", "mehrarbeit", "pause", "ruhezeit", "schicht", "teilzeit", "vollzeit", "dienstplan",
        "mesai", "fazla mesai", "calisma saati", "mola", "vardiya", "yari zamanli", "dinlenme",
        "radno vrijeme", "radno vreme", "prekovremeni", "pauza", "smjena", "smena",
        "program", "ore suplimentare", "pauza", "tura",
        "munkaido", "tulora", "szunet", "muszak", "reszmunkaido",
        "delovni cas", "nadure", "odmor", "izmena",
        "working hours", "overtime", "shift", "part-time", "rest"
      ]
    },
    {
      id: "sick_leave",
      terms: [
        "krankheit", "krankenstand", "arzt", "pflegefreistellung", "urlaub", "feiertag", "entgeltfortzahlung",
        "hastalik", "rapor", "doktor", "izin", "yillik izin", "resmi tatil", "bakim izni",
        "bolovanje", "bolest", "lijecnik", "lekar", "godisnji odmor", "praznik",
        "boala", "concediu medical", "concediu anual", "sarbatoare",
        "betegseg", "tappenz", "orvos", "szabadsag", "unnepnap",
        "bolezen", "bolniska", "zdravnik", "dopust", "praznik",
        "sick leave", "illness", "doctor", "annual leave", "holiday"
      ]
    },
    {
      id: "tax_pay",
      terms: [
        "lohn", "gehalt", "steuer", "lohnzettel", "brutto", "netto", "arbeitnehmerveranlagung", "familienbonus", "pendlerpauschale", "mindestlohn",
        "maas", "ucret", "vergi", "bordro", "vergi iadesi", "asgari ucret", "yol parasi",
        "plata", "placa", "zarada", "porez", "platna lista", "povrat poreza", "minimalac",
        "salariu", "impozit", "fluturas", "restituire impozit",
        "ber", "fizetes", "ado", "berjegyzek", "adovisszaterites",
        "placa", "davek", "placilna lista", "vracilo davka",
        "salary", "wage", "tax", "payslip", "tax refund", "minimum wage"
      ]
    }
  ];

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/ß/g, "ss")
      .replace(/ı/g, "i")
      .toLowerCase()
      .trim();
  }

  const NORMALIZED_CLUSTERS = CONCEPT_CLUSTERS.map((cluster) => ({
    id: cluster.id,
    terms: cluster.terms.map(normalize)
  }));

  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    const matrix = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }
    return matrix[a.length][b.length];
  }

  function tokenMatchesTerm(token, term) {
    if (term.includes(token) || (token.length >= 4 && token.includes(term))) return true;
    if (token.length >= 5 && term.length >= 5) {
      const maxDist = token.length >= 8 ? 2 : 1;
      return levenshtein(token, term) <= maxDist;
    }
    return false;
  }

  function expandQuery(rawQuery) {
    const normalizedQuery = normalize(rawQuery);
    if (!normalizedQuery) return { tokens: [], expandedTerms: [] };

    const tokens = normalizedQuery.split(/[\s,.;:!?()[\]"'/-]+/).filter((t) => t.length >= 2);
    const expanded = new Set(tokens);

    for (const token of tokens) {
      for (const cluster of NORMALIZED_CLUSTERS) {
        if (cluster.terms.some((term) => tokenMatchesTerm(token, term))) {
          cluster.terms.forEach((term) => expanded.add(term));
        }
      }
    }

    return {
      normalizedQuery,
      tokens,
      expandedTerms: [...expanded]
    };
  }

  function scoreDocument(searchableText, queryContext) {
    if (!queryContext || !queryContext.normalizedQuery) return 1;
    const text = normalize(searchableText);
    if (!text) return 0;

    let score = 0;
    if (text.includes(queryContext.normalizedQuery)) {
      score += 100;
    }

    let directHits = 0;
    for (const token of queryContext.tokens) {
      if (text.includes(token)) {
        directHits += 1;
        score += 30;
      }
    }

    let semanticHits = 0;
    for (const term of queryContext.expandedTerms) {
      if (text.includes(term)) {
        semanticHits += 1;
        score += 8;
      }
    }

    if (directHits === 0 && semanticHits === 0) {
      const words = text.split(/[\s,.;:!?()[\]"'/-]+/).filter((w) => w.length >= 5);
      for (const token of queryContext.tokens) {
        if (token.length < 5) continue;
        const maxDist = token.length >= 8 ? 2 : 1;
        if (words.some((w) => Math.abs(w.length - token.length) <= maxDist && levenshtein(w, token) <= maxDist)) {
          score += 15;
        }
      }
    }

    return score;
  }

  window.haklarSemantic = {
    normalize,
    expandQuery,
    scoreDocument
  };
})();
