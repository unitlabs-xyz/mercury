import type { Dict } from "./en";

export const fr: Dict = {
  meta: {
    tagline: "Le compte financier conçu pour le monde onchain.",
    description:
      "Détenez des stablecoins, achetez des actions américaines tokenisées, payez par carte et empruntez sur ce que vous possédez, le tout depuis un wallet que vous contrôlez.",
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
    eyebrow: "Investir. Emprunter. Dépenser.",
    heading: ["Le compte financier conçu", "pour le monde onchain."],
    lead: "Gardez votre argent, investissez en actions et en ETF, construisez des portefeuilles diversifiés, payez avec votre carte et accédez à votre patrimoine, le tout depuis un seul wallet.",
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
      body: "Utilisez le wallet que vous avez déjà, ou créez-en un avec une adresse e-mail. Mercury est une interface, pas un dépositaire. Elle ne peut ni déplacer ni geler ce que vous détenez.",
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
      body: "590 actions et fonds américains, ou un panier entier acheté en une seule opération et détenu ensuite comme une position unique.",
      points: [
        "Dès $5, en fractions d’action",
        "Un panier est un seul token que vous pouvez détenir et envoyer",
        "Programmez un montant à investir chaque semaine ou chaque mois",
      ],
      alt: "Acheter Nvidia : deux émetteurs cotés, avec le détail des coûts.",
    },
  },

  addCash: {
    title: "Ajouter des fonds",
    lede: "Envoyez de l’USDC à cette adresse. Il commence à rapporter dès son arrivée.",
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
      title: "Votre argent travaille pendant qu’il attend.",
      body: "Le cash qui attend votre prochaine décision continue de rapporter, et vos actions se transforment discrètement en davantage d’actions.",
      alt: "Le solde en cash, qui rapporte pendant qu’il attend.",
      label: "Disponible pour investir",
      pill: "Rapporte {rate}",
      note: "versé sur ce solde",
    },
    spend: {
      stamp: "Dépenser",
      title: "Dépensez sans vendre.",
      body: "La Mercury Visa paie via une ligne de crédit adossée à votre portefeuille : payer un déjeuner ne vous oblige jamais à clôturer une position.",
      alt: "Une carte Visa qui puise dans le même solde.",
      label: "Mercury Visa · Platinum",
      note: "Puise dans le cash, jamais dans les actions",
    },
    borrow: {
      stamp: "Emprunter",
      title: "Empruntez sur vos actions.",
      body: "Empruntez sur ce que vous possédez déjà. La position reste à vous, tout comme ce qu’elle rapporte pendant la durée du prêt.",
      alt: "La capacité d’emprunt adossée aux actions détenues.",
      label: "Capacité d’emprunt",
      note: "Sur {amount} détenus",
    },
  },

  oneNumber: {
    heading: ["Un seul chiffre pour", "tout ce que vous détenez."],
    lead: "Une même entreprise peut être détenue via l’un ou l’autre émetteur, et chaque token vaut une fraction d’action différente. Mercury compte les actions derrière les tokens, pas les tokens eux-mêmes.",
    alt: "La valeur totale du portefeuille, et une entreprise comptée sur les deux émetteurs",
    totalLabel: "Valeur du portefeuille",
    totalNote: "{amount} depuis le début",
    stocks: "Actions",
    baskets: "Paniers",
    cash: "Cash · {rate}",
    issuerTitle: "Nvidia, tous émetteurs confondus",
    tokens: "{n} tokens",
    truePosition: "Position réelle",
    shares: "{n} actions",
    issuerNote: "En comptant les tokens, on aurait obtenu 58. Chacun a son propre multiplicateur.",
  },

  custody: {
    heading: ["Conservé par des dépositaires.", "Contrôlé par vous."],
    lead: "Chaque token que vous détenez est adossé à une action réelle, à un pour un, chez un dépositaire régulé. Nous ne détenons jamais vos clés, et aucune partie de ce produit ne peut déplacer votre argent sans vous.",
    alt: "Une action chez un dépositaire, répliquée en token sur Solana, détenue dans votre wallet",
    pins: ["Votre wallet", "Token sur Solana", "Action chez un dépositaire"],
    columns: [
      {
        title: "Adossé à un pour un",
        body: "Chaque token correspond à une action conservée chez un dépositaire identifié. Backed et Ondo les émettent ; nous vous disons lequel vous recevez avant l’achat.",
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
        q: "Que se passe-t-il quand le marché américain est fermé ?",
        a: "Les tokens continuent de s’échanger quand la Bourse est fermée, donc leur prix peut s’écarter de celui de l’action réelle. Nous comparons les deux et préférons attendre plutôt que de vous acheter une action au prix de la panique.",
      },
      {
        q: "Dois-je vérifier mon identité ?",
        a: "Pour l’essentiel de ce que vous faites ici, non. Lorsque l’émetteur ou le réseau de la carte l’exige, nous vous le disons avant de commencer, pas après.",
      },
      {
        q: "Combien coûte Mercury ?",
        a: "Un seul spread sur la transaction, affiché avant que vous ne la confirmiez. Pas de frais de tenue de compte, pas de frais d’inactivité, et rien de prélevé sur vos dividendes.",
      },
      {
        q: "Puis-je transférer mes actions ailleurs ?",
        a: "Oui. Ce sont des tokens dans votre wallet, pas une ligne dans notre registre. Envoyez-les partout où ils sont acceptés, sans que personne ici n’ait à l’approuver.",
      },
    ],
  },

  cta: {
    heading: ["Mercury est ouvert.", "Essayez la bêta aujourd’hui."],
    note: "Ouvrez votre compte en quelques minutes et commencez à détenir, investir et dépenser depuis un seul wallet.",
    label: "Essayer la bêta de Mercury",
  },
};
