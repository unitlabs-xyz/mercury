import type { Dict } from "./en";

export const tr: Dict = {
  meta: {
    tagline: "Zincir üstü dünya için tasarlanmış finansal hesap.",
    description:
      "Stablecoin tut, tokenize ABD hisseleri al, kartınla harca ve sahip olduklarını teminat göstererek borç al. Hepsi kontrolü sende olan bir cüzdandan.",
    ogAlt: "Mercury, zincir üstü dünya için tasarlanmış finansal hesap.",
  },

  ui: {
    skip: "İçeriğe geç",
    home: "Mercury ana sayfa",
    mainNav: "Ana menü",
    menuNav: "Menü",
    openMenu: "Menüyü aç",
    closeMenu: "Menüyü kapat",
    language: "Dil",
    cta: "Betayı dene",
  },

  nav: {
    howItWorks: "Nasıl çalışır",
    baskets: "Sepetler",
    card: "Kart",
    faqs: "SSS",
  },

  footer: {
    explore: "Keşfet",
    company: "Şirket",
    follow: "Takip et",
    legal: "Yasal",
    about: "Hakkımızda",
    contact: "İletişim",
    terms: "Koşullar",
    privacy: "Gizlilik",
    rights: "Global · Tüm hakları saklıdır.",
  },

  hero: {
    eyebrow: "Yatır. Borçlan. Harca.",
    heading: ["Zincir üstü dünya için", "tasarlanmış finansal hesap."],
    lead: "Paranı tut, hisse ve ETF’lere yatırım yap, çeşitlendirilmiş portföyler kur, kartınla harca ve varlığına ulaş. Hepsi tek bir cüzdandan.",
    imageLabel: "Ana görsel",
  },

  trust: {
    caption: "Hisselerin saklayıcısı ve tokenize eden kurumlar",
  },

  everything: {
    heading: ["Paranın yaptığı her şey,", "tek bir hesapta."],
    lead: "Aracı kurum hesabı yok, kimlik doğrulama yok, banka transferi yok. Stablecoin tutabiliyorsan Nvidia da tutabilirsin.",
    hold: {
      stamp: "TUT",
      title: "Paran cüzdanında kalır.",
      body: "Zaten kullandığın cüzdanı bağla ya da bir e-posta adresiyle yenisini oluştur. Mercury bir arayüzdür, saklayıcı değil. Varlıklarını ne taşıyabilir ne de dondurabilir.",
      points: [
        "Solana’da USDC giriş ve çıkışı, arada banka olmadan.",
        "Hafta sonları dahil, günün her saatinde gönder ve al",
        "Ayrılmak tek bir işlem sürer, kimsenin iznine gerek yok",
      ],
      alt: "Nakit ekleme: QR kodlu bir Solana yatırma adresi.",
    },
    invest: {
      stamp: "YATIR",
      title: "Stablecoin’leri gerçek hisselere dönüştür.",
      body: "590 ABD hissesi ve fonu ya da tek hamlede alınıp ardından tek bir pozisyon olarak tutulan koca bir sepet.",
      points: [
        "$5’tan başlayan tutarlarla, kesirli hisse",
        "Sepet, tutup gönderebildiğin tek bir tokendır",
        "Her hafta ya da her ay yatırılacak bir tutar belirle",
      ],
      alt: "Nvidia alımı: iki ihraççıdan fiyat ve ayrıntılı maliyet dökümü.",
    },
  },

  addCash: {
    title: "Nakit ekle",
    lede: "Bu adrese USDC gönder. Ulaştığı anda kazandırmaya başlar.",
    addressLabel: "Solana adresin",
    qrAlt: "QR kod olarak Solana yatırma adresi {address}",
    copy: "Adresi kopyala",
    copied: "Adres kopyalandı",
  },

  buyQuote: {
    youPay: "Ödediğin",
    pricePerShare: "Hisse başı fiyat",
    shares: "Hisse",
    route: "Rota",
  },

  pillars: {
    grow: {
      stamp: "Büyüt",
      title: "Paran beklerken de çalışır.",
      body: "Kararlar arasında bekleyen nakit kazanmaya devam eder, sahip olduğun hisseler de sessizce daha fazla hisseye dönüşür.",
      alt: "Beklerken kazandıran nakit bakiyesi.",
      label: "Yatırıma hazır",
      pill: "{rate} kazanç",
      note: "bu bakiyeye ödenir",
    },
    spend: {
      stamp: "Harca",
      title: "Satmadan harca.",
      body: "Mercury Visa, portföyüne karşı açılan bir limitten ödeme yapar. Öğle yemeği için asla pozisyon kapatman gerekmez.",
      alt: "Aynı bakiyeden harcayan bir Visa kart.",
      label: "Mercury Visa · Platinum",
      note: "Nakitten harcar, hisselerden asla",
    },
    borrow: {
      stamp: "Borç al",
      title: "Hisselerine karşı borç al.",
      body: "Zaten sahip olduklarına karşı borç al. Pozisyon senin kalır, kredi açıkken kazandığı her şey de öyle.",
      alt: "Tutulan hisselere karşı borçlanma gücü.",
      label: "Borçlanma gücü",
      note: "{amount} varlığa karşı",
    },
  },

  oneNumber: {
    heading: ["Tuttuğun her şey için", "tek bir rakam."],
    lead: "Aynı şirket iki ihraççıdan biri üzerinden tutulabilir ve her token bir hissenin farklı bir kesrine denk gelir. Mercury tokenları değil, arkalarındaki hisseleri sayar.",
    alt: "Portföy toplamı ve iki ihraççıda birlikte sayılan tek bir şirket",
    totalLabel: "Portföy değeri",
    totalNote: "Tüm zamanlar {amount}",
    stocks: "Hisseler",
    baskets: "Sepetler",
    cash: "Nakit · {rate}",
    issuerTitle: "İhraççılar genelinde Nvidia",
    tokens: "{n} token",
    truePosition: "Gerçek pozisyon",
    shares: "{n} hisse",
    issuerNote: "Tokenları saysaydık 58 derdik. Her birinin kendi çarpanı var.",
  },

  custody: {
    heading: ["Saklayıcıda tutulur.", "Kontrolü sendedir."],
    lead: "Tuttuğun her token, düzenlemeye tabi bir saklayıcıdaki gerçek bir hisseyle bire bir desteklenir. Anahtarlarını asla tutmayız ve bu ürünün hiçbir parçası paranı sensiz hareket ettiremez.",
    alt: "Saklayıcıdaki bir hisse, Solana’da token olarak yansıtılır ve senin cüzdanında durur",
    pins: ["Cüzdanın", "Solana’da token", "Saklayıcıdaki hisse"],
    columns: [
      {
        title: "Bire bir destekli",
        body: "Her token, adı belli bir saklayıcıda tutulan bir hisseye karşılık gelir. Bunları Backed ve Ondo ihraç eder; hangisini aldığını satın almadan önce söyleriz.",
      },
      {
        title: "Her rakamın bir kaynağı var",
        body: "Fiyatlar nereden ve ne zaman okunduğunu gösterir. Kaynağı belli olmayan bir rakamı sana göstermeyiz.",
      },
      {
        title: "Kötü dolum yerine ret",
        body: "Token, hissenin değerinden pahalıysa emir bekler ya da reddedilir. Kötü dolum, hiç dolmamasından daha kötüdür.",
      },
    ],
  },

  faqs: {
    title: "SSS",
    items: [
      {
        q: "Hisselerin sahibi gerçekten ben miyim?",
        a: "Her token, düzenlemeye tabi bir saklayıcıda tutulan gerçek bir hisseyle bire bir desteklenir. Token kendi cüzdanında durur ve istediğin zaman dışarı taşıyabilirsin.",
      },
      {
        q: "ABD piyasası kapalıyken ne olur?",
        a: "Borsa kapalıyken tokenlar işlem görmeye devam eder, bu yüzden fiyat gerçek hisseden sapabilir. İkisini karşılaştırır ve sana panik fiyatından hisse almak yerine bekleriz.",
      },
      {
        q: "Kimliğimi doğrulamam gerekiyor mu?",
        a: "Burada yapabileceklerinin çoğu için hayır. İhraççının ya da kart ağının gerektirdiği yerlerde bunu sonra değil, başlamadan önce söyleriz.",
      },
      {
        q: "Mercury ne kadar ücret alır?",
        a: "İşlemde tek bir spread, onaylamadan önce açıkça belirtilir. Hesap ücreti yok, hareketsizlik ücreti yok, temettüden de hiçbir kesinti yok.",
      },
      {
        q: "Hisselerimi başka bir yere taşıyabilir miyim?",
        a: "Evet. Onlar bizim defterimizde bir kayıt değil, cüzdanındaki tokenlardır. Kabul eden her yere gönder, burada hiçbir şeyin onay vermesi gerekmez.",
      },
    ],
  },

  cta: {
    heading: ["Mercury açıldı.", "Betayı bugün dene."],
    note: "Hesabını dakikalar içinde aç, tek bir cüzdandan tutmaya, yatırım yapmaya ve harcamaya başla.",
    label: "Mercury betasını dene",
  },
};
