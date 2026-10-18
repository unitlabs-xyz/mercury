import type { Dict } from "./en";

export const pt: Dict = {
  meta: {
    tagline: "A conta financeira feita para o mundo onchain.",
    description:
      "Tenha ações globais reais a partir de $5, invista em temas inteiros com cestas e tome crédito com suas ações em vez de vendê-las, tudo a partir de uma carteira que é sua.",
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
    heading: ["A conta financeira feita", "para o mundo onchain."],
    lead: "Tenha ações globais reais a partir de $5, invista em temas inteiros com cestas e tome crédito com suas ações em vez de vendê-las. Tudo a partir de uma carteira que é sua, aberta só com um e-mail.",
    imageLabel: "Imagem principal",
    builtOn: ["Construído na", ""],
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
      body: "Entre com um e-mail e a Mercury cria uma carteira que é só sua. Sem frase-semente, sem extensão.",
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
      body: "Mais de 450 ações globais e ETFs. Em cada ordem comparamos preços entre vários provedores e escolhemos o melhor para você.",
      points: [
        "A partir de $5, em frações de ação",
        "O melhor preço entre provedores, sempre",
        "Ordens longe do preço real da ação esperam ou são recusadas",
      ],
      alt: "Comprando Nvidia: dois emissores cotados, com o custo detalhado.",
    },
  },

  addCash: {
    title: "Adicionar saldo",
    lede: "Envie USDC para este endereço. Ele chega como saldo, pronto para investir.",
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
      stamp: "Cresça",
      title: "Dividendos viram ações.",
      body: "Dividendos chegam como mais ações. A Mercury conta as ações reais por trás de cada token, e seu número fica certo.",
      alt: "Uma quantidade de ações que subiu depois de um dividendo.",
      label: "Nvidia, posição real",
      value: "{n} ações",
      pill: "+{n}",
      note: "somadas pelos dividendos",
    },
    borrow: {
      stamp: "Crédito",
      title: "Dinheiro sem vender.",
      body: "Precisa de dólares? Tome crédito com suas ações em vez de vendê-las. O dinheiro cai no seu saldo, e as ações continuam suas.",
      alt: "Limite de crédito garantido pelas ações que você tem.",
      label: "Limite de crédito",
      note: "Com {amount} em garantia",
    },
    spend: {
      stamp: "Gaste · Em breve",
      title: "Um cartão para o seu saldo.",
      body: "O Cartão Mercury vem aí: seu saldo, para gastar em qualquer loja do mundo, enquanto seus investimentos continuam investidos.",
      alt: "O Cartão Mercury, em breve.",
      label: "Cartão Mercury",
      note: "Em breve",
    },
  },

  baskets: {
    heading: ["Um tema inteiro,", "em uma cesta."],
    lead: "Escolha um tema como as Magnificent Seven, IA ou energia nuclear e invista com um único pagamento. A cesta fica na sua própria conta, é rebalanceada todo dia e volta para você quando quiser sair.",
    alt: "A cesta Magnificent Seven e como uma cesta funciona",
    kind: "Cesta · Tecnologia",
    name: "Magnificent Seven",
    holdings: "{n} ativos",
    note: "Rebalanceada todo dia",
    weights: "Pesos-alvo",
    howTitle: "Como uma cesta funciona",
    how: [
      { label: "Onde fica", value: "Na sua própria conta" },
      { label: "Misturada com outros", value: "Nunca" },
    ],
    leave: { label: "Ao sair", value: "Em ativos ou em dinheiro" },
    howNote: "{n} cestas ativas, de IA a ouro, além de estratégias inspiradas em investidores conhecidos.",
  },

  custody: {
    heading: ["Guardado por custodiantes.", "Controlado por você."],
    lead: "Cada token que você tem é lastreado um para um por uma ação real em um custodiante regulado. Nunca temos acesso às suas chaves, e nenhuma parte deste produto pode mover seu dinheiro sem você.",
    alt: "Uma ação em um custodiante, espelhada como token na Solana, guardada na sua carteira",
    pins: ["Sua carteira", "Token na Solana", "Ação em um custodiante"],
    columns: [
      {
        title: "Lastro um para um",
        body: "Cada token corresponde a uma ação real mantida em um custodiante identificado, e mostramos qual provedor você vai receber antes da compra.",
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
        q: "O que acontece quando a bolsa está fechada?",
        a: "Os tokens continuam sendo negociados quando a bolsa não está, então o preço pode se descolar da ação real. Comparamos os dois e preferimos esperar a comprar uma ação para você a preço de pânico.",
      },
      {
        q: "Preciso verificar minha identidade?",
        a: "Não. Você entra com um e-mail e uma carteira é criada para você. Sem documentos, sem formulários.",
      },
      {
        q: "Quanto a Mercury cobra?",
        a: "Sem tarifa de conta e sem taxa da Mercury nas operações. Você paga o preço de mercado do token, e qualquer ágio ou custo de rede aparece antes de você confirmar.",
      },
      {
        q: "O que é uma cesta?",
        a: "Um portfólio pronto em torno de um tema, como as Magnificent Seven. Um único pagamento compra cada ativo no seu peso-alvo, em uma conta só sua, e a cesta é rebalanceada todo dia.",
      },
      {
        q: "Posso levar minhas ações para outro lugar?",
        a: "Sim. Elas são tokens na sua carteira, não um registro no nosso livro. Envie para onde aceitar, sem precisar da aprovação de ninguém aqui.",
      },
    ],
  },

  cta: {
    heading: ["A Mercury está aberta.", "Teste a beta hoje."],
    note: "Entre com um e-mail e tenha sua primeira ação em minutos.",
    label: "Teste a beta da Mercury",
  },
};
