import type { Dict } from "./en";

export const pt: Dict = {
  meta: {
    tagline: "A conta financeira feita para o mundo onchain.",
    description:
      "Guarde stablecoins, compre ações americanas tokenizadas, pague com cartão e tome crédito com base no que você tem, tudo a partir de uma carteira que você controla.",
    ogAlt: "Mercury, a conta financeira feita para o mundo onchain.",
  },

  ui: {
    skip: "Pular para o conteúdo",
    home: "Página inicial da Mercury",
    mainNav: "Principal",
    menuNav: "Menu",
    openMenu: "Abrir menu",
    closeMenu: "Fechar menu",
    language: "Idioma",
    cta: "Teste a beta",
  },

  nav: {
    howItWorks: "Como funciona",
    baskets: "Cestas",
    card: "Cartão",
    faqs: "Perguntas frequentes",
  },

  footer: {
    explore: "Explorar",
    company: "Empresa",
    follow: "Siga",
    legal: "Jurídico",
    about: "Sobre",
    contact: "Contato",
    terms: "Termos",
    privacy: "Privacidade",
    rights: "Global · Todos os direitos reservados.",
  },

  hero: {
    eyebrow: "Invista. Tome crédito. Gaste.",
    heading: ["A conta financeira feita", "para o mundo onchain."],
    lead: "Guarde seu dinheiro, invista em ações e ETFs, monte carteiras diversificadas, pague com seu cartão e acesse seu patrimônio, tudo a partir de uma única carteira.",
    imageLabel: "Imagem principal",
  },

  trust: {
    caption: "Ações custodiadas e tokenizadas por",
  },

  everything: {
    heading: ["Tudo o que seu dinheiro faz,", "em uma só conta."],
    lead: "Sem conta em corretora, sem verificação de identidade, sem trilhos fiat. Se você pode ter uma stablecoin, pode ter Nvidia.",
    hold: {
      stamp: "GUARDE",
      title: "Seu dinheiro fica na sua carteira.",
      body: "Use a carteira que você já tem ou crie uma com seu e-mail. A Mercury é uma interface, não uma custodiante. Ela não pode mover nem congelar o que é seu.",
      points: [
        "USDC na Solana, entrando e saindo sem banco no meio.",
        "Envie e receba a qualquer hora, inclusive nos fins de semana",
        "Sair leva uma transação e não depende da permissão de ninguém",
      ],
      alt: "Adicionar saldo: um endereço de depósito na Solana com QR code.",
    },
    invest: {
      stamp: "INVISTA",
      title: "Transforme stablecoins em ações de verdade.",
      body: "590 ações e fundos americanos, ou uma cesta inteira comprada em uma só ação e mantida depois como uma única posição.",
      points: [
        "A partir de $5, em frações de ação",
        "Uma cesta é um único token que você pode guardar e enviar",
        "Defina um valor para investir toda semana ou todo mês",
      ],
      alt: "Comprando Nvidia: dois emissores cotados, com o custo detalhado.",
    },
  },

  addCash: {
    title: "Adicionar saldo",
    lede: "Envie USDC para este endereço. Ele começa a render assim que chega.",
    addressLabel: "Seu endereço Solana",
    qrAlt: "Endereço de depósito Solana {address} em QR code",
    copy: "Copiar o endereço",
    copied: "Endereço copiado",
  },

  buyQuote: {
    youPay: "Você paga",
    pricePerShare: "Preço por ação",
    shares: "Ações",
    route: "Rota",
  },

  pillars: {
    grow: {
      stamp: "Renda",
      title: "Seu dinheiro trabalha enquanto espera.",
      body: "O saldo parado entre uma decisão e outra continua rendendo, e as ações que você tem viram, aos poucos, mais ações.",
      alt: "O saldo em caixa, rendendo enquanto espera.",
      label: "Disponível para investir",
      pill: "Rendendo {rate}",
      note: "creditado neste saldo",
    },
    spend: {
      stamp: "Gaste",
      title: "Gaste sem vender.",
      body: "O Mercury Visa paga com uma linha de crédito garantida pela sua carteira, então pagar o almoço nunca significa fechar uma posição.",
      alt: "Um cartão Visa usando o mesmo saldo.",
      label: "Mercury Visa · Platinum",
      note: "Gasta do saldo, nunca das ações",
    },
    borrow: {
      stamp: "Crédito",
      title: "Tome crédito com suas ações.",
      body: "Use o que você já tem como garantia. A posição continua sua, assim como tudo o que ela rende enquanto o empréstimo estiver aberto.",
      alt: "Limite de crédito garantido pelas ações que você tem.",
      label: "Limite de crédito",
      note: "Com {amount} em garantia",
    },
  },

  oneNumber: {
    heading: ["Um só número para", "tudo o que você tem."],
    lead: "A mesma empresa pode ser mantida por qualquer um dos emissores, e cada token vale uma fração diferente de uma ação. A Mercury conta as ações por trás deles, não os tokens.",
    alt: "O total da carteira, e uma empresa somada entre os dois emissores",
    totalLabel: "Valor da carteira",
    totalNote: "{amount} desde o início",
    stocks: "Ações",
    baskets: "Cestas",
    cash: "Saldo · {rate}",
    issuerTitle: "Nvidia, entre emissores",
    tokens: "{n} tokens",
    truePosition: "Posição real",
    shares: "{n} ações",
    issuerNote: "Contando tokens, daria 58. Cada um tem seu próprio multiplicador.",
  },

  custody: {
    heading: ["Guardado por custodiantes.", "Controlado por você."],
    lead: "Cada token que você tem é lastreado um para um por uma ação real em um custodiante regulado. Nunca temos acesso às suas chaves, e nenhuma parte deste produto pode mover seu dinheiro sem você.",
    alt: "Uma ação em um custodiante, espelhada como token na Solana, guardada na sua carteira",
    pins: ["Sua carteira", "Token na Solana", "Ação em um custodiante"],
    columns: [
      {
        title: "Lastro um para um",
        body: "Cada token corresponde a uma ação mantida em um custodiante identificado. Backed e Ondo emitem os tokens; dizemos qual você vai receber antes da compra.",
      },
      {
        title: "Todo número tem fonte",
        body: "Os preços mostram de onde e quando foram obtidos. Um número sem origem é um número que não mostraríamos a você.",
      },
      {
        title: "Recusada, não mal executada",
        body: "Quando o token custa mais do que a ação vale, a ordem espera ou é recusada. Uma execução ruim é pior do que nenhuma.",
      },
    ],
  },

  faqs: {
    title: "Perguntas frequentes",
    items: [
      {
        q: "Eu sou mesmo dono das ações?",
        a: "Cada token é lastreado um para um por uma ação real mantida por um custodiante regulado. O token fica na sua própria carteira, e você pode transferi-lo quando quiser.",
      },
      {
        q: "O que acontece quando o mercado americano está fechado?",
        a: "Os tokens continuam sendo negociados quando a bolsa não está, então o preço pode se descolar da ação real. Comparamos os dois e preferimos esperar a comprar uma ação para você a preço de pânico.",
      },
      {
        q: "Preciso verificar minha identidade?",
        a: "Para quase tudo o que você faz aqui, não. Quando o emissor ou a bandeira do cartão exige, avisamos antes de você começar, não depois.",
      },
      {
        q: "Quanto a Mercury cobra?",
        a: "Um único spread na operação, informado antes de você confirmar. Sem tarifa de conta, sem tarifa de inatividade e nada descontado dos seus dividendos.",
      },
      {
        q: "Posso levar minhas ações para outro lugar?",
        a: "Sim. Elas são tokens na sua carteira, não um registro no nosso livro. Envie para onde aceitar, sem precisar da aprovação de ninguém aqui.",
      },
    ],
  },

  cta: {
    heading: ["A Mercury está aberta.", "Teste a beta hoje."],
    note: "Abra sua conta em minutos e comece a guardar, investir e gastar a partir de uma única carteira.",
    label: "Teste a beta da Mercury",
  },
};
