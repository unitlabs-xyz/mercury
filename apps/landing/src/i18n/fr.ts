import type { Dict } from "./en";

export const fr: Dict = {
  meta: {
    tagline: "Le compte financier conçu pour le monde onchain.",
    description:
      "Détenez de vraies actions internationales dès $5, investissez dans des thèmes entiers avec les paniers et empruntez sur vos actions au lieu de les vendre, le tout depuis un wallet qui vous appartient.",
    ogAlt: "Mercury, le compte financier conçu pour le monde onchain.",
  },

  ui: {
    skip: "Aller au contenu",
    home: "Accueil Mercury",
    mainNav: "Principale",
    menuNav: "Menu",
    openMenu: "Ouvrir le menu",
    closeMenu: "Fermer le menu",
    language: "Langue",
    cta: "Essayer la bêta",
  },

  nav: {
    howItWorks: "Comment ça marche",
    baskets: "Paniers",
    card: "Carte",
    faqs: "FAQ",
  },

  footer: {
    explore: "Découvrir",
    company: "Entreprise",
    follow: "Suivre",
    legal: "Mentions légales",
    about: "À propos",
    contact: "Contact",
    terms: "Conditions",
    privacy: "Confidentialité",
    rights: "Global · Tous droits réservés.",
  },

  hero: {
    heading: ["Le compte financier conçu", "pour le monde onchain."],
    lead: "Détenez de vraies actions internationales dès $5, investissez dans des thèmes entiers avec les paniers et empruntez sur vos actions au lieu de les vendre. Le tout depuis un wallet qui vous appartient, ouvert avec une simple adresse e-mail.",
    imageLabel: "Image principale",
  },

  trust: {
    caption: "Actions conservées et tokenisées par",
  },

  everything: {
    heading: ["Tout ce que fait votre argent,", "dans un seul compte."],
    lead: "Pas de compte-titres, pas de vérification d’identité, pas de rails fiat. Si vous pouvez détenir un stablecoin, vous pouvez détenir Nvidia.",
    hold: {
      stamp: "DÉTENIR",
      title: "Votre argent reste dans votre wallet.",
      body: "Connectez-vous avec une adresse e-mail et Mercury crée un wallet qui n’appartient qu’à vous. Pas de phrase de récupération, pas d’extension.",
      points: [
        "De l’USDC sur Solana, en entrée comme en sortie, sans banque au milieu.",
        "Envoyez et recevez à toute heure, week-ends compris",
        "Partir tient en une transaction, sans l’accord de personne",
      ],
      alt: "Ajouter des fonds : une adresse de dépôt Solana avec un QR code.",
    },
    invest: {
      stamp: "INVESTIR",
      title: "Transformez vos stablecoins en vraies actions.",
      body: "Plus de 450 actions et ETF internationaux. À chaque ordre, nous comparons les prix de plusieurs fournisseurs et choisissons le meilleur pour vous.",
      points: [
        "Dès $5, en fractions d’action",
        "Le meilleur prix parmi les fournisseurs, à chaque fois",
        "Les ordres trop éloignés du prix réel de l’action attendent ou sont refusés",
      ],
      alt: "Acheter Nvidia : deux émetteurs cotés, avec le détail des coûts.",
    },
  },

  addCash: {
    title: "Ajouter des fonds",
    lede: "Envoyez de l’USDC à cette adresse. Il arrive en cash, prêt à être investi.",
    addressLabel: "Votre adresse Solana",
    qrAlt: "Adresse de dépôt Solana {address} sous forme de QR code",
    copy: "Copier l’adresse",
    copied: "Adresse copiée",
  },

  buyQuote: {
    youPay: "Vous payez",
    pricePerShare: "Prix par action",
    shares: "Actions",
    route: "Route",
  },

  pillars: {
    grow: {
      stamp: "Faire fructifier",
      title: "Les dividendes deviennent des actions.",
      body: "Les dividendes arrivent en actions. Mercury compte les actions réelles derrière chaque token : votre chiffre reste juste.",
      alt: "Un nombre d’actions en hausse après un dividende.",
      label: "Nvidia, position réelle",
      value: "{n} actions",
      pill: "+{n}",
      note: "ajoutées par les dividendes",
    },
    borrow: {
      stamp: "Emprunter",
      title: "Du cash sans vendre.",
      body: "Besoin de dollars ? Empruntez sur vos actions au lieu de les vendre. Le cash arrive sur votre solde, et les actions restent à vous.",
      alt: "La capacité d’emprunt adossée aux actions détenues.",
      label: "Capacité d’emprunt",
      note: "Sur {amount} détenus",
    },
    spend: {
      stamp: "Dépenser · Bientôt",
      title: "Une carte pour votre solde.",
      body: "La Carte Mercury arrive : votre solde en cash, utilisable dans n’importe quel commerce du monde, pour que vos investissements restent investis.",
      alt: "La Carte Mercury, bientôt disponible.",
      label: "Carte Mercury",
      note: "Bientôt disponible",
    },
  },

  baskets: {
    heading: ["Tout un thème,", "dans un panier."],
    lead: "Choisissez un thème comme les Magnificent Seven, l’IA ou l’énergie nucléaire et financez-le en un seul paiement. Il reste dans votre propre compte, est rééquilibré chaque jour et vous revient dès que vous partez.",
    alt: "Le panier Magnificent Seven, et le fonctionnement d’un panier",
    kind: "Panier · Technologie",
    name: "Magnificent Seven",
    holdings: "{n} positions",
    note: "Rééquilibré chaque jour",
    weights: "Pondérations cibles",
    howTitle: "Comment fonctionne un panier",
    how: [
      { label: "Où il se trouve", value: "Votre propre compte" },
      { label: "Mutualisé avec d’autres", value: "Jamais" },
    ],
    leave: { label: "En partant", value: "En titres ou en cash" },
    howNote:
      "{n} paniers disponibles, de l’IA à l’or, ainsi que des stratégies inspirées d’investisseurs célèbres.",
  },

  custody: {
    heading: ["Conservé par des dépositaires.", "Contrôlé par vous."],
    lead: "Chaque token que vous détenez est adossé à une action réelle, à un pour un, chez un dépositaire régulé. Nous ne détenons jamais vos clés, et aucune partie de ce produit ne peut déplacer votre argent sans vous.",
    alt: "Une action chez un dépositaire, répliquée en token sur Solana, détenue dans votre wallet",
    pins: ["Votre wallet", "Token sur Solana", "Action chez un dépositaire"],
    columns: [
      {
        title: "Adossé à un pour un",
        body: "Chaque token correspond à une vraie action conservée chez un dépositaire identifié, et nous vous indiquons le fournisseur avant l’achat.",
      },
      {
        title: "Chaque chiffre a sa source",
        body: "Les prix indiquent où et quand ils ont été relevés. Un chiffre sans provenance est un chiffre que nous ne vous montrerions pas.",
      },
      {
        title: "Refusé plutôt que mal exécuté",
        body: "Quand le token coûte plus que la valeur de l’action, l’ordre attend ou est refusé. Une mauvaise exécution est pire qu’aucune.",
      },
    ],
  },

  faqs: {
    title: "FAQ",
    items: [
      {
        q: "Est-ce que je possède vraiment les actions ?",
        a: "Chaque token est adossé à un pour un à une action réelle conservée par un dépositaire régulé. Le token est dans votre propre wallet, et vous pouvez le transférer quand vous le souhaitez.",
      },
      {
        q: "Que se passe-t-il quand la Bourse est fermée ?",
        a: "Les tokens continuent de s’échanger quand la Bourse est fermée, donc leur prix peut s’écarter de celui de l’action réelle. Nous comparons les deux et préférons attendre plutôt que de vous acheter une action au prix de la panique.",
      },
      {
        q: "Dois-je vérifier mon identité ?",
        a: "Non. Vous vous connectez avec une adresse e-mail et un wallet est créé pour vous. Pas de documents, pas de formulaires.",
      },
      {
        q: "Combien coûte Mercury ?",
        a: "Pas de frais de tenue de compte ni de frais Mercury sur les transactions. Vous payez le prix de marché du token, et toute prime ou tout coût de réseau est affiché avant que vous ne confirmiez.",
      },
      {
        q: "Qu’est-ce qu’un panier ?",
        a: "Un portefeuille clé en main autour d’un thème, comme les Magnificent Seven. Un seul paiement achète chaque position à sa pondération cible, dans un compte qui n’appartient qu’à vous, et il est rééquilibré chaque jour.",
      },
      {
        q: "Puis-je transférer mes actions ailleurs ?",
        a: "Oui. Ce sont des tokens dans votre wallet, pas une ligne dans notre registre. Envoyez-les partout où ils sont acceptés, sans que personne ici n’ait à l’approuver.",
      },
    ],
  },

  cta: {
    heading: ["Mercury est ouvert.", "Essayez la bêta aujourd’hui."],
    note: "Connectez-vous avec une adresse e-mail et détenez votre première action en quelques minutes.",
    label: "Essayer la bêta de Mercury",
  },
};
