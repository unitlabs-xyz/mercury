import type { Dict } from "./en";

export const tr: Dict = {
  meta: {
    tagline: "Zincir üstü dünya için tasarlanmış finansal hesap.",
    description:
      "$5’tan başlayarak gerçek global hisselere sahip ol, sepetlerle tüm temalara yatırım yap ve hisselerini satmak yerine onlara karşı borç al. Hepsi sana ait bir cüzdandan.",
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
    heading: ["Zincir üstü dünya için", "tasarlanmış finansal hesap."],
    lead: "$5’tan başlayarak gerçek global hisselere sahip ol, sepetlerle tüm temalara yatırım yap ve hisselerini satmak yerine onlara karşı borç al. Hepsi sana ait, yalnızca bir e-postayla açılan bir cüzdandan.",
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
      body: "Bir e-postayla giriş yap, Mercury yalnızca sana ait bir cüzdan oluştursun. Kurtarma ifadesi yok, eklenti yok.",
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
      body: "450’den fazla global hisse ve ETF. Her emirde fiyatları birden fazla sağlayıcı arasında karşılaştırır, senin için en iyisini seçeriz.",
      points: [
        "$5’tan başlayan tutarlarla, kesirli hisse",
        "Sağlayıcılar arasında her seferinde en iyi fiyat",
        "Gerçek hisse fiyatından çok uzak emirler bekler ya da reddedilir",
      ],
      alt: "Nvidia alımı: iki ihraççıdan fiyat ve ayrıntılı maliyet dökümü.",
    },
  },

  addCash: {
    title: "Nakit ekle",
    lede: "Bu adrese USDC gönder. Nakit olarak ulaşır, yatırıma hazırdır.",
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
      title: "Temettüler hisseye dönüşür.",
      body: "Temettüler ek hisse olarak gelir. Mercury her tokenın ardındaki gerçek hisseleri sayar, rakamın hep doğru kalır.",
      alt: "Temettü sonrası artan hisse adedi.",
      label: "Nvidia, gerçek pozisyon",
      value: "{n} hisse",
      pill: "+{n}",
      note: "temettülerle eklendi",
    },
    borrow: {
      stamp: "Borç al",
      title: "Satmadan nakit.",
      body: "Dolara mı ihtiyacın var? Hisselerini satmak yerine onlara karşı borç al. Nakit bakiyene geçer, hisseler senin kalır.",
      alt: "Tutulan hisselere karşı borçlanma gücü.",
      label: "Borçlanma gücü",
      note: "{amount} varlığa karşı",
    },
    spend: {
      stamp: "Harca · Yakında",
      title: "Bakiyen için bir kart.",
      body: "Sırada Mercury Kart var: nakit bakiyeni dünyanın her yerindeki mağazalarda harca, yatırımların yatırımda kalsın.",
      alt: "Mercury Kart, çok yakında.",
      label: "Mercury Kart",
      note: "Çok yakında",
    },
  },

  baskets: {
    heading: ["Koca bir tema,", "tek bir sepette."],
    lead: "Magnificent Seven, yapay zeka ya da nükleer enerji gibi bir tema seç ve tek ödemeyle fonla. Sepet kendi hesabında durur, her gün yeniden dengelenir ve ayrıldığın anda sana geri döner.",
    alt: "Magnificent Seven sepeti ve bir sepetin nasıl çalıştığı",
    kind: "Sepet · Teknoloji",
    name: "Magnificent Seven",
    holdings: "{n} varlık",
    note: "Her gün yeniden dengelenir",
    weights: "Hedef ağırlıklar",
    howTitle: "Sepet nasıl çalışır",
    how: [
      { label: "Nerede durur", value: "Kendi hesabında" },
      { label: "Başkalarıyla havuzlanır mı", value: "Asla" },
    ],
    leave: { label: "Ayrılırken", value: "Varlık olarak ya da nakit" },
    howNote: "Yapay zekadan altına {n} aktif sepet, ayrıca tanınmış yatırımcılardan ilham alan stratejiler.",
  },

  custody: {
    heading: ["Saklayıcıda tutulur.", "Kontrolü sendedir."],
    lead: "Tuttuğun her token, düzenlemeye tabi bir saklayıcıdaki gerçek bir hisseyle bire bir desteklenir. Anahtarlarını asla tutmayız ve bu ürünün hiçbir parçası paranı sensiz hareket ettiremez.",
    alt: "Saklayıcıdaki bir hisse, Solana’da token olarak yansıtılır ve senin cüzdanında durur",
    pins: ["Cüzdanın", "Solana’da token", "Saklayıcıdaki hisse"],
    columns: [
      {
        title: "Bire bir destekli",
        body: "Her token, adı belli bir saklayıcıda tutulan gerçek bir hisseye karşılık gelir ve hangi sağlayıcıdan aldığını satın almadan önce gösteririz.",
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
        q: "Borsa kapalıyken ne olur?",
        a: "Borsa kapalıyken tokenlar işlem görmeye devam eder, bu yüzden fiyat gerçek hisseden sapabilir. İkisini karşılaştırır ve sana panik fiyatından hisse almak yerine bekleriz.",
      },
      {
        q: "Kimliğimi doğrulamam gerekiyor mu?",
        a: "Hayır. Bir e-postayla giriş yaparsın ve senin için bir cüzdan oluşturulur. Belge yok, form yok.",
      },
      {
        q: "Mercury ne kadar ücret alır?",
        a: "Hesap ücreti yok, işlemlerde Mercury ücreti yok. Tokenın piyasa fiyatını ödersin; varsa prim ya da ağ maliyeti onaylamadan önce gösterilir.",
      },
      {
        q: "Sepet nedir?",
        a: "Magnificent Seven gibi tek bir tema etrafında hazır bir portföy. Tek bir ödeme, her varlığı hedef ağırlığında, yalnızca sana ait bir hesapta satın alır ve sepet her gün yeniden dengelenir.",
      },
      {
        q: "Hisselerimi başka bir yere taşıyabilir miyim?",
        a: "Evet. Onlar bizim defterimizde bir kayıt değil, cüzdanındaki tokenlardır. Kabul eden her yere gönder, burada hiçbir şeyin onay vermesi gerekmez.",
      },
    ],
  },

  cta: {
    heading: ["Mercury açıldı.", "Betayı bugün dene."],
    note: "Bir e-postayla giriş yap ve dakikalar içinde ilk hisseni al.",
    label: "Mercury betasını dene",
  },
};
