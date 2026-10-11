import type { Dict } from "./en";

export const de: Dict = {
  meta: {
    tagline: "Das Finanzkonto für die Onchain-Welt.",
    description:
      "Halte Stablecoins, kaufe tokenisierte US-Aktien, bezahle mit Karte und leih dir Geld gegen deine Bestände. Alles aus einer Wallet, die du kontrollierst.",
    ogAlt: "Mercury, das Finanzkonto für die Onchain-Welt.",
  },

  ui: {
    skip: "Zum Inhalt springen",
    home: "Mercury Startseite",
    mainNav: "Hauptmenü",
    menuNav: "Menü",
    openMenu: "Menü öffnen",
    closeMenu: "Menü schließen",
    language: "Sprache",
    cta: "Beta testen",
  },

  nav: {
    howItWorks: "So funktioniert’s",
    baskets: "Baskets",
    card: "Karte",
    faqs: "FAQ",
  },

  footer: {
    explore: "Entdecken",
    company: "Unternehmen",
    follow: "Folgen",
    legal: "Rechtliches",
    about: "Über uns",
    contact: "Kontakt",
    terms: "AGB",
    privacy: "Datenschutz",
    rights: "Global · Alle Rechte vorbehalten.",
  },

  hero: {
    eyebrow: "Investieren. Leihen. Ausgeben.",
    heading: ["Das Finanzkonto", "für die Onchain-Welt."],
    lead: "Halte dein Geld, investiere in Aktien und ETFs, baue diversifizierte Portfolios auf, bezahle mit deiner Karte und greif auf dein Vermögen zu. Alles aus einer einzigen Wallet.",
    imageLabel: "Titelbild",
  },

  trust: {
    caption: "Aktien verwahrt und tokenisiert von",
  },

  everything: {
    heading: ["Alles, was dein Geld kann,", "in einem Konto."],
    lead: "Kein Depot, keine Identitätsprüfung, keine Bankwege. Wenn du einen Stablecoin halten kannst, kannst du auch Nvidia halten.",
    hold: {
      stamp: "HALTEN",
      title: "Dein Geld bleibt in deiner Wallet.",
      body: "Nutze eine Wallet, die du schon hast, oder erstelle eine mit deiner E-Mail-Adresse. Mercury ist eine Oberfläche, kein Verwahrer. Wir können deine Bestände weder bewegen noch einfrieren.",
      points: [
        "USDC auf Solana, rein und raus, ohne Bank dazwischen.",
        "Senden und empfangen rund um die Uhr, auch am Wochenende",
        "Gehen kostet eine Transaktion und niemandes Erlaubnis",
      ],
      alt: "Geld einzahlen: eine Solana-Einzahlungsadresse mit QR-Code.",
    },
    invest: {
      stamp: "INVESTIEREN",
      title: "Mach aus Stablecoins echte Aktien.",
      body: "590 US-Aktien und Fonds, oder ein ganzer Basket mit einem Klick gekauft und danach als eine Position gehalten.",
      points: [
        "Ab $5, in Aktienbruchteilen",
        "Ein Basket ist ein Token, den du halten und senden kannst",
        "Leg einen Betrag fest, der jede Woche oder jeden Monat investiert wird",
      ],
      alt: "Nvidia kaufen: Kurse von zwei Emittenten, mit Kostenaufschlüsselung.",
    },
  },

  addCash: {
    title: "Geld einzahlen",
    lede: "Sende USDC an diese Adresse. Ab Eingang bringt es Rendite.",
    addressLabel: "Deine Solana-Adresse",
    qrAlt: "Solana-Einzahlungsadresse {address} als QR-Code",
    copy: "Adresse kopieren",
    copied: "Adresse kopiert",
  },

  buyQuote: {
    youPay: "Du zahlst",
    pricePerShare: "Preis pro Aktie",
    shares: "Aktien",
    route: "Route",
  },

  pillars: {
    grow: {
      stamp: "Wachsen",
      title: "Geld arbeitet, während es wartet.",
      body: "Cash zwischen zwei Entscheidungen verdient weiter, und aus deinen Aktien werden ganz nebenbei mehr Aktien.",
      alt: "Das Cash-Guthaben, das im Stillstand Rendite bringt.",
      label: "Verfügbar zum Investieren",
      pill: "{rate} Rendite",
      note: "wird diesem Guthaben gutgeschrieben",
    },
    spend: {
      stamp: "Ausgeben",
      title: "Ausgeben, ohne zu verkaufen.",
      body: "Die Mercury Visa zahlt aus einer Kreditlinie gegen dein Portfolio. Für das Mittagessen musst du nie eine Position schließen.",
      alt: "Eine Visa-Karte, die auf dasselbe Guthaben zugreift.",
      label: "Mercury Visa · Platinum",
      note: "Zahlt aus Cash, nie aus Aktien",
    },
    borrow: {
      stamp: "Leihen",
      title: "Leih dir Geld gegen deine Aktien.",
      body: "Leih dir Geld gegen das, was du schon besitzt. Die Position bleibt deine, ebenso alles, was sie während der Laufzeit erwirtschaftet.",
      alt: "Beleihungsrahmen gegen die gehaltenen Aktien.",
      label: "Beleihungsrahmen",
      note: "Gegen {amount} Bestand",
    },
  },

  oneNumber: {
    heading: ["Eine Zahl für", "alles, was du hältst."],
    lead: "Dasselbe Unternehmen kann über beide Emittenten gehalten werden, und jeder Token entspricht einem anderen Bruchteil einer Aktie. Mercury zählt die Aktien dahinter, nicht die Token.",
    alt: "Der Portfoliowert und ein Unternehmen, über beide Emittenten gezählt",
    totalLabel: "Portfoliowert",
    totalNote: "{amount} seit Beginn",
    stocks: "Aktien",
    baskets: "Baskets",
    cash: "Cash · {rate}",
    issuerTitle: "Nvidia, über alle Emittenten",
    tokens: "{n} Token",
    truePosition: "Tatsächliche Position",
    shares: "{n} Aktien",
    issuerNote: "Nach Token gezählt wären es 58. Jeder hat seinen eigenen Multiplikator.",
  },

  custody: {
    heading: ["Verwahrt von Verwahrern.", "Kontrolliert von dir."],
    lead: "Jeder Token ist eins zu eins durch eine echte Aktie bei einem regulierten Verwahrer gedeckt. Wir halten nie deine Schlüssel, und kein Teil dieses Produkts kann dein Geld ohne dich bewegen.",
    alt: "Eine Aktie beim Verwahrer, gespiegelt als Token auf Solana, in deiner Wallet",
    pins: ["Deine Wallet", "Token auf Solana", "Aktie beim Verwahrer"],
    columns: [
      {
        title: "Eins zu eins gedeckt",
        body: "Jeder Token steht für eine Aktie bei einem namentlich genannten Verwahrer. Backed und Ondo geben sie aus; wir sagen dir vor dem Kauf, welchen du bekommst.",
      },
      {
        title: "Jede Zahl hat eine Quelle",
        body: "Preise zeigen, wo und wann sie abgerufen wurden. Eine Zahl ohne Herkunft zeigen wir dir nicht.",
      },
      {
        title: "Lieber abgelehnt als schlecht ausgeführt",
        body: "Kostet der Token mehr, als die Aktie wert ist, wartet die Order oder wird abgelehnt. Eine schlechte Ausführung ist schlimmer als keine.",
      },
    ],
  },

  faqs: {
    title: "FAQ",
    items: [
      {
        q: "Gehören mir die Aktien wirklich?",
        a: "Jeder Token ist eins zu eins durch eine echte Aktie bei einem regulierten Verwahrer gedeckt. Du hältst den Token in deiner eigenen Wallet und kannst ihn jederzeit abziehen.",
      },
      {
        q: "Was passiert, wenn der US-Markt geschlossen ist?",
        a: "Token werden weiter gehandelt, wenn die Börse ruht, daher kann der Preis von der echten Aktie abweichen. Wir vergleichen beide und warten, statt dir eine Aktie zum Panikpreis zu kaufen.",
      },
      {
        q: "Muss ich meine Identität bestätigen?",
        a: "Für das meiste hier nicht. Wo der Emittent oder das Kartennetzwerk es verlangt, sagen wir es dir vorher, nicht erst danach.",
      },
      {
        q: "Was kostet Mercury?",
        a: "Ein Spread pro Trade, angezeigt bevor du bestätigst. Keine Kontogebühr, keine Inaktivitätsgebühr und kein Abzug von Dividenden.",
      },
      {
        q: "Kann ich meine Aktien woanders hin übertragen?",
        a: "Ja. Es sind Token in deiner Wallet, kein Eintrag in unserem Buch. Sende sie überall hin, wo sie akzeptiert werden, ohne dass wir zustimmen müssen.",
      },
    ],
  },

  cta: {
    heading: ["Mercury ist da.", "Teste die Beta heute."],
    note: "Eröffne dein Konto in Minuten und halte, investiere und bezahle aus einer Wallet.",
    label: "Mercury Beta testen",
  },
};
