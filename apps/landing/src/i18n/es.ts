import type { Dict } from "./en";

export const es: Dict = {
  meta: {
    tagline: "La cuenta financiera creada para el mundo onchain.",
    description:
      "Guarda stablecoins, compra acciones estadounidenses tokenizadas, paga con tarjeta y pide prestado contra lo que tienes, todo desde una wallet que tú controlas.",
    ogAlt: "Mercury, la cuenta financiera creada para el mundo onchain.",
  },

  ui: {
    skip: "Ir al contenido",
    home: "Inicio de Mercury",
    mainNav: "Principal",
    menuNav: "Menú",
    openMenu: "Abrir menú",
    closeMenu: "Cerrar menú",
    language: "Idioma",
    cta: "Prueba la beta",
  },

  nav: {
    howItWorks: "Cómo funciona",
    baskets: "Canastas",
    card: "Tarjeta",
    faqs: "Preguntas frecuentes",
  },

  footer: {
    explore: "Explorar",
    company: "Empresa",
    follow: "Síguenos",
    legal: "Legal",
    about: "Nosotros",
    contact: "Contacto",
    terms: "Términos",
    privacy: "Privacidad",
    rights: "Global · Todos los derechos reservados.",
  },

  hero: {
    eyebrow: "Invierte. Pide prestado. Gasta.",
    heading: ["La cuenta financiera creada", "para el mundo onchain."],
    lead: "Guarda tu dinero, invierte en acciones y ETFs, arma portafolios diversificados, paga con tu tarjeta y accede a tu patrimonio, todo desde una sola wallet.",
    imageLabel: "Imagen principal",
  },

  trust: {
    caption: "Acciones en custodia y tokenizadas por",
  },

  everything: {
    heading: ["Todo lo que hace tu dinero,", "en una sola cuenta."],
    lead: "Sin cuenta de corretaje, sin verificación de identidad, sin rieles fiat. Si puedes tener una stablecoin, puedes tener Nvidia.",
    hold: {
      stamp: "GUARDA",
      title: "Tu dinero se queda en tu wallet.",
      body: "Usa la wallet que ya tienes o crea una con tu correo. Mercury es una interfaz, no un custodio. No puede mover ni congelar lo que tienes.",
      points: [
        "USDC en Solana, entra y sale sin un banco de por medio.",
        "Envía y recibe a cualquier hora, incluso los fines de semana",
        "Irte toma una transacción y no necesitas el permiso de nadie",
      ],
      alt: "Agregar fondos: una dirección de depósito en Solana con un código QR.",
    },
    invest: {
      stamp: "INVIERTE",
      title: "Convierte stablecoins en acciones reales.",
      body: "590 acciones y fondos de EE. UU., o una canasta completa comprada en un solo paso y guardada después como una sola posición.",
      points: [
        "Desde $5, en fracciones de acción",
        "Una canasta es un solo token que puedes guardar y enviar",
        "Define un monto para invertir cada semana o cada mes",
      ],
      alt: "Comprar Nvidia: dos emisores cotizados, con el costo desglosado.",
    },
  },

  addCash: {
    title: "Agregar fondos",
    lede: "Envía USDC a esta dirección. Empieza a generar rendimiento en cuanto llega.",
    addressLabel: "Tu dirección de Solana",
    qrAlt: "Dirección de depósito en Solana {address} como código QR",
    copy: "Copiar la dirección",
    copied: "Dirección copiada",
  },

  buyQuote: {
    youPay: "Pagas",
    pricePerShare: "Precio por acción",
    shares: "Acciones",
    route: "Ruta",
  },

  pillars: {
    grow: {
      stamp: "Crece",
      title: "Tu dinero trabaja mientras espera.",
      body: "El efectivo que espera tu próxima decisión sigue generando rendimiento, y tus acciones se convierten poco a poco en más acciones.",
      alt: "El saldo en efectivo, generando rendimiento mientras espera.",
      label: "Disponible para invertir",
      pill: "Generando {rate}",
      note: "abonado a este saldo",
    },
    spend: {
      stamp: "Gasta",
      title: "Gasta sin vender.",
      body: "La Mercury Visa paga con una línea respaldada por tu portafolio, así que pagar el almuerzo nunca implica cerrar una posición.",
      alt: "Una tarjeta Visa que usa el mismo saldo.",
      label: "Mercury Visa · Platinum",
      note: "Gasta del efectivo, nunca de tus acciones",
    },
    borrow: {
      stamp: "Pide prestado",
      title: "Pide prestado contra tus acciones.",
      body: "Pide prestado contra lo que ya tienes. La posición sigue siendo tuya, igual que todo lo que genera mientras el préstamo está abierto.",
      alt: "Capacidad de préstamo respaldada por tus acciones.",
      label: "Capacidad de préstamo",
      note: "Contra {amount} en tenencia",
    },
  },

  oneNumber: {
    heading: ["Un solo número para", "todo lo que tienes."],
    lead: "Una misma empresa puede tenerse a través de cualquiera de los dos emisores, y cada token vale una fracción distinta de una acción. Mercury cuenta las acciones detrás de ellos, no los tokens.",
    alt: "El total del portafolio, y una empresa contada entre ambos emisores",
    totalLabel: "Valor del portafolio",
    totalNote: "{amount} desde el inicio",
    stocks: "Acciones",
    baskets: "Canastas",
    cash: "Efectivo · {rate}",
    issuerTitle: "Nvidia, entre emisores",
    tokens: "{n} tokens",
    truePosition: "Posición real",
    shares: "{n} acciones",
    issuerNote: "Contando tokens habrían sido 58. Cada uno tiene su propio multiplicador.",
  },

  custody: {
    heading: ["En manos de custodios.", "Bajo tu control."],
    lead: "Cada token que tienes está respaldado uno a uno por una acción real en un custodio regulado. Nunca tenemos tus llaves, y ninguna parte de este producto puede mover tu dinero sin ti.",
    alt: "Una acción en un custodio, reflejada como token en Solana, guardada en tu wallet",
    pins: ["Tu wallet", "Token en Solana", "Acción en un custodio"],
    columns: [
      {
        title: "Respaldo uno a uno",
        body: "Cada token corresponde a una acción en un custodio identificado. Backed y Ondo los emiten; te decimos cuál recibes antes de comprar.",
      },
      {
        title: "Cada número tiene su fuente",
        body: "Los precios indican de dónde y cuándo se obtuvieron. Una cifra sin origen es una cifra que no te mostraríamos.",
      },
      {
        title: "Rechazada, no mal ejecutada",
        body: "Cuando el token cuesta más de lo que vale la acción, la orden espera o se rechaza. Una mala ejecución es peor que ninguna.",
      },
    ],
  },

  faqs: {
    title: "Preguntas frecuentes",
    items: [
      {
        q: "¿Realmente soy dueño de las acciones?",
        a: "Cada token está respaldado uno a uno por una acción real en manos de un custodio regulado. Tú guardas el token en tu propia wallet y puedes sacarlo cuando quieras.",
      },
      {
        q: "¿Qué pasa cuando el mercado de EE. UU. está cerrado?",
        a: "Los tokens siguen cotizando cuando la bolsa no, así que el precio puede alejarse del de la acción real. Comparamos ambos y preferimos esperar antes que comprarte una acción a precio de pánico.",
      },
      {
        q: "¿Necesito verificar mi identidad?",
        a: "Para casi todo lo que puedes hacer aquí, no. Cuando el emisor o la red de la tarjeta lo exigen, te lo decimos antes de empezar, no después.",
      },
      {
        q: "¿Cuánto cobra Mercury?",
        a: "Un solo spread en la operación, indicado antes de que la confirmes. Sin comisión por cuenta, sin comisión por inactividad y sin descuentos sobre tus dividendos.",
      },
      {
        q: "¿Puedo mover mis acciones a otro lugar?",
        a: "Sí. Son tokens en tu wallet, no un registro en nuestro libro contable. Envíalos a donde los acepten, sin que nadie aquí tenga que aprobarlo.",
      },
    ],
  },

  cta: {
    heading: ["Mercury ya está abierto.", "Prueba la beta hoy."],
    note: "Abre tu cuenta en minutos y empieza a guardar, invertir y gastar desde una sola wallet.",
    label: "Prueba la beta de Mercury",
  },
};
