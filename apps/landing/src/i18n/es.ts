import type { Dict } from "./en";

export const es: Dict = {
  meta: {
    tagline: "La cuenta financiera creada para el mundo onchain.",
    description:
      "Ten acciones globales reales desde $5, invierte en temas completos con canastas y pide prestado contra tus acciones en lugar de venderlas, todo desde una wallet que es tuya.",
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
    heading: ["La cuenta financiera creada", "para el mundo onchain."],
    lead: "Ten acciones globales reales desde $5, invierte en temas completos con canastas y pide prestado contra tus acciones en lugar de venderlas. Todo desde una wallet que es tuya, abierta solo con un correo.",
    imageLabel: "Imagen principal",
    builtOn: ["Construido en", ""],
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
      body: "Inicia sesión con un correo y Mercury crea una wallet que es solo tuya. Sin frase semilla, sin extensiones.",
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
      body: "Más de 450 acciones globales y ETFs. En cada orden comparamos precios entre varios proveedores y elegimos el mejor para ti.",
      points: [
        "Desde $5, en fracciones de acción",
        "El mejor precio entre proveedores, siempre",
        "Las órdenes lejos del precio real de la acción esperan o se rechazan",
      ],
      alt: "Comprar Nvidia: dos emisores cotizados, con el costo desglosado.",
    },
  },

  addCash: {
    title: "Agregar fondos",
    lede: "Envía USDC a esta dirección. Llega como efectivo, listo para invertir.",
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
      title: "Los dividendos se vuelven acciones.",
      body: "Los dividendos llegan en forma de más acciones. Mercury cuenta las acciones reales detrás de cada token, así tu número siempre es correcto.",
      alt: "Un número de acciones que subió tras un dividendo.",
      label: "Nvidia, posición real",
      value: "{n} acciones",
      pill: "+{n}",
      note: "sumadas por dividendos",
    },
    borrow: {
      stamp: "Pide prestado",
      title: "Efectivo sin vender.",
      body: "¿Necesitas dólares? Pide prestado contra tus acciones en lugar de venderlas. El efectivo llega a tu saldo y las acciones siguen siendo tuyas.",
      alt: "Capacidad de préstamo contra las acciones que tienes.",
      label: "Capacidad de préstamo",
      note: "Contra {amount} en tenencia",
    },
    spend: {
      stamp: "Gasta · Pronto",
      title: "Una tarjeta para tu saldo.",
      body: "La Tarjeta Mercury es lo que sigue: tu saldo en efectivo, para gastar en cualquier comercio del mundo, así tus inversiones siguen invertidas.",
      alt: "La Tarjeta Mercury, muy pronto.",
      label: "Tarjeta Mercury",
      note: "Muy pronto",
    },
  },

  baskets: {
    heading: ["Un tema completo,", "en una canasta."],
    lead: "Elige un tema como los Magnificent Seven, IA o energía nuclear y fondéalo con un solo pago. Vive en tu propia cuenta, se rebalancea a diario y vuelve a ti cuando decidas salir.",
    alt: "La canasta Magnificent Seven y cómo funciona una canasta",
    kind: "Canasta · Tecnología",
    name: "Magnificent Seven",
    holdings: "{n} posiciones",
    note: "Rebalanceo diario",
    weights: "Pesos objetivo",
    howTitle: "Cómo funciona una canasta",
    how: [
      { label: "Dónde vive", value: "En tu propia cuenta" },
      { label: "Mezclada con otros", value: "Nunca" },
    ],
    leave: { label: "Al salir", value: "En especie o en efectivo" },
    howNote:
      "{n} canastas activas, de la IA al oro, además de estrategias inspiradas en inversionistas reconocidos.",
  },

  custody: {
    heading: ["En manos de custodios.", "Bajo tu control."],
    lead: "Cada token que tienes está respaldado uno a uno por una acción real en un custodio regulado. Nunca tenemos tus llaves, y ninguna parte de este producto puede mover tu dinero sin ti.",
    alt: "Una acción en un custodio, reflejada como token en Solana, guardada en tu wallet",
    pins: ["Tu wallet", "Token en Solana", "Acción en un custodio"],
    columns: [
      {
        title: "Respaldo uno a uno",
        body: "Cada token corresponde a una acción real en un custodio identificado, y te mostramos qué proveedor recibes antes de comprar.",
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
        q: "¿Qué pasa cuando la bolsa está cerrada?",
        a: "Los tokens siguen cotizando cuando la bolsa no, así que el precio puede alejarse del de la acción real. Comparamos ambos y preferimos esperar antes que comprarte una acción a precio de pánico.",
      },
      {
        q: "¿Necesito verificar mi identidad?",
        a: "No. Inicias sesión con un correo y se crea una wallet para ti. Sin documentos ni formularios.",
      },
      {
        q: "¿Cuánto cobra Mercury?",
        a: "Sin comisión por cuenta y sin comisión de Mercury en las operaciones. Pagas el precio de mercado del token, y cualquier prima o costo de red se muestra antes de que confirmes.",
      },
      {
        q: "¿Qué es una canasta?",
        a: "Un portafolio listo en torno a un tema, como los Magnificent Seven. Un solo pago compra cada posición en su peso objetivo, en una cuenta que solo es tuya, y se rebalancea a diario.",
      },
      {
        q: "¿Puedo mover mis acciones a otro lugar?",
        a: "Sí. Son tokens en tu wallet, no un registro en nuestro libro contable. Envíalos a donde los acepten, sin que nadie aquí tenga que aprobarlo.",
      },
    ],
  },

  cta: {
    heading: ["Mercury ya está abierto.", "Prueba la beta hoy."],
    note: "Inicia sesión con un correo y ten tu primera acción en minutos.",
    label: "Prueba la beta de Mercury",
  },
};
