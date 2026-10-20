import type { Dict } from "./en";

export const id: Dict = {
  meta: {
    tagline: "Akun keuangan yang dibangun untuk dunia onchain.",
    description:
      "Miliki saham global sungguhan mulai dari $5, investasi di satu tema utuh lewat keranjang, dan pinjam dengan jaminan sahammu tanpa harus menjualnya. Semua dari wallet milikmu.",
    ogAlt: "Mercury, akun keuangan yang dibangun untuk dunia onchain.",
  },

  ui: {
    skip: "Langsung ke konten",
    home: "Beranda Mercury",
    mainNav: "Utama",
    menuNav: "Menu",
    openMenu: "Buka menu",
    closeMenu: "Tutup menu",
    language: "Bahasa",
    cta: "Coba versi beta",
  },

  nav: {
    howItWorks: "Cara kerja",
    baskets: "Keranjang",
    card: "Kartu",
    faqs: "FAQ",
  },

  footer: {
    explore: "Jelajahi",
    company: "Perusahaan",
    follow: "Ikuti",
    legal: "Legal",
    about: "Tentang",
    contact: "Kontak",
    terms: "Ketentuan",
    privacy: "Privasi",
    rights: "Global · Hak cipta dilindungi.",
  },

  hero: {
    heading: ["Akun keuangan yang dibangun", "untuk dunia onchain."],
    lead: "Miliki saham global sungguhan mulai dari $5, investasi di satu tema utuh lewat keranjang, dan pinjam dengan jaminan sahammu tanpa harus menjualnya. Semua dari wallet milikmu, dibuka hanya dengan email.",
    imageLabel: "Gambar utama",
    builtOn: ["Dibangun di", ""],
  },

  trust: {
    caption: "Saham disimpan dan ditokenisasi oleh",
  },

  everything: {
    heading: ["Semua yang dilakukan uangmu,", "dalam satu akun."],
    lead: "Tanpa akun broker, tanpa verifikasi identitas, tanpa jalur bank. Kalau kamu bisa menyimpan stablecoin, kamu bisa memiliki Nvidia.",
    hold: {
      stamp: "SIMPAN",
      title: "Uangmu tetap di wallet-mu.",
      body: "Masuk dengan email dan Mercury membuatkan wallet yang hanya milikmu. Tanpa seed phrase, tanpa ekstensi.",
      points: [
        "USDC di Solana, masuk dan keluar, tanpa bank di tengah.",
        "Kirim dan terima kapan saja, termasuk akhir pekan",
        "Keluar cukup satu transaksi, tanpa izin siapa pun",
      ],
      alt: "Menambah dana: alamat deposit Solana dengan kode QR.",
    },
    invest: {
      stamp: "INVESTASI",
      title: "Ubah stablecoin jadi saham sungguhan.",
      body: "Lebih dari 450 saham global dan ETF. Di setiap order, kami membandingkan harga dari beberapa penyedia dan memilih yang terbaik untukmu.",
      points: [
        "Mulai dari $5, dalam pecahan saham",
        "Harga terbaik dari semua penyedia, setiap saat",
        "Order yang jauh dari harga saham asli akan menunggu atau ditolak",
      ],
      alt: "Membeli Nvidia: harga dari dua penerbit, dengan rincian biaya.",
    },
  },

  addCash: {
    title: "Tambah dana",
    lede: "Kirim USDC ke alamat ini. Masuk sebagai kas, siap diinvestasikan.",
    addressLabel: "Alamat Solana-mu",
    qrAlt: "Alamat deposit Solana {address} sebagai kode QR",
    copy: "Salin alamat",
    copied: "Alamat disalin",
  },

  buyQuote: {
    youPay: "Kamu bayar",
    pricePerShare: "Harga per saham",
    shares: "Saham",
    route: "Rute",
  },

  pillars: {
    grow: {
      stamp: "Tumbuh",
      title: "Dividen jadi saham.",
      body: "Dividen masuk sebagai tambahan saham. Mercury menghitung saham asli di balik tiap token, jadi angkamu tepat.",
      alt: "Jumlah saham yang naik setelah dividen.",
      label: "Nvidia, posisi sebenarnya",
      value: "{n} saham",
      pill: "+{n}",
      note: "ditambah dari dividen",
    },
    borrow: {
      stamp: "Pinjam",
      title: "Dapat kas tanpa menjual.",
      body: "Butuh dolar? Pinjam dengan jaminan sahammu, tanpa menjualnya. Kasnya masuk ke saldomu, dan sahamnya tetap milikmu.",
      alt: "Daya pinjam dengan jaminan saham yang dimiliki.",
      label: "Daya pinjam",
      note: "Dengan jaminan {amount}",
    },
    spend: {
      stamp: "Belanja · Segera",
      title: "Kartu untuk saldomu.",
      body: "Berikutnya, Kartu Mercury: saldo kasmu bisa dibelanjakan di toko mana pun di dunia, jadi investasimu tetap berjalan.",
      alt: "Kartu Mercury, segera hadir.",
      label: "Kartu Mercury",
      note: "Segera hadir",
    },
  },

  baskets: {
    heading: ["Satu tema utuh,", "dalam satu keranjang."],
    lead: "Pilih tema seperti Magnificent Seven, AI, atau energi nuklir, lalu danai dengan satu pembayaran. Keranjangnya ada di akunmu sendiri, diseimbangkan ulang setiap hari, dan kembali padamu kapan pun kamu keluar.",
    alt: "Keranjang Magnificent Seven, dan cara kerja keranjang",
    kind: "Keranjang · Teknologi",
    name: "Magnificent Seven",
    holdings: "{n} aset",
    note: "Diseimbangkan ulang setiap hari",
    weights: "Bobot target",
    howTitle: "Cara kerja keranjang",
    how: [
      { label: "Disimpan di mana", value: "Akunmu sendiri" },
      { label: "Digabung dengan orang lain", value: "Tidak pernah" },
    ],
    leave: { label: "Saat keluar", value: "Dalam bentuk saham atau kas" },
    howNote: "{n} keranjang aktif, dari AI hingga emas, plus strategi yang terinspirasi investor ternama.",
  },

  custody: {
    heading: ["Disimpan oleh kustodian.", "Dikendalikan olehmu."],
    lead: "Setiap token yang kamu miliki dijamin satu banding satu oleh saham sungguhan di kustodian yang teregulasi. Kami tidak pernah memegang kuncimu, dan tidak ada bagian produk ini yang bisa memindahkan uangmu tanpa kamu.",
    alt: "Saham di kustodian, dicerminkan sebagai token di Solana, disimpan di wallet-mu",
    pins: ["Wallet-mu", "Token di Solana", "Saham di kustodian"],
    columns: [
      {
        title: "Dijamin satu banding satu",
        body: "Setiap token mewakili satu saham asli yang disimpan di kustodian yang disebutkan namanya, dan kami tunjukkan penyedianya sebelum kamu membeli.",
      },
      {
        title: "Setiap angka ada sumbernya",
        body: "Harga menunjukkan dari mana dan kapan diambil. Angka tanpa asal-usul tidak akan kami tampilkan.",
      },
      {
        title: "Ditolak, bukan dieksekusi buruk",
        body: "Kalau harga token lebih mahal dari nilai sahamnya, order akan menunggu atau ditolak. Eksekusi buruk lebih parah daripada tidak dieksekusi.",
      },
    ],
  },

  faqs: {
    title: "FAQ",
    items: [
      {
        q: "Apakah saya benar-benar memiliki sahamnya?",
        a: "Setiap token dijamin satu banding satu oleh saham sungguhan yang disimpan kustodian teregulasi. Token ada di wallet-mu sendiri, dan bisa kamu pindahkan kapan pun.",
      },
      {
        q: "Apa yang terjadi saat bursa saham tutup?",
        a: "Token tetap diperdagangkan saat bursa tutup, jadi harganya bisa menyimpang dari saham aslinya. Kami membandingkan keduanya dan memilih menunggu daripada membelikanmu saham di harga panik.",
      },
      {
        q: "Apakah saya perlu verifikasi identitas?",
        a: "Tidak. Kamu masuk dengan email dan wallet langsung dibuatkan untukmu. Tanpa dokumen, tanpa formulir.",
      },
      {
        q: "Berapa biaya Mercury?",
        a: "Tanpa biaya akun dan tanpa biaya Mercury untuk transaksi. Kamu membayar harga pasar token, dan premi atau biaya jaringan apa pun ditampilkan sebelum kamu konfirmasi.",
      },
      {
        q: "Apa itu keranjang?",
        a: "Portofolio siap pakai seputar satu tema, seperti Magnificent Seven. Satu pembayaran membeli setiap aset sesuai bobot targetnya, di akun yang hanya milikmu, dan diseimbangkan ulang setiap hari.",
      },
      {
        q: "Bisakah saya memindahkan saham ke tempat lain?",
        a: "Bisa. Saham itu adalah token di wallet-mu, bukan catatan di buku besar kami. Kirim ke mana saja yang menerimanya, tanpa perlu persetujuan dari kami.",
      },
    ],
  },

  cta: {
    heading: ["Mercury sudah dibuka.", "Coba versi beta hari ini."],
    note: "Masuk dengan email dan miliki saham pertamamu dalam hitungan menit.",
    label: "Coba Mercury beta",
  },
};
