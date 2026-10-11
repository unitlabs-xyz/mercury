import type { Dict } from "./en";

export const id: Dict = {
  meta: {
    tagline: "Akun keuangan yang dibangun untuk dunia onchain.",
    description:
      "Simpan stablecoin, beli saham AS yang ditokenisasi, belanja dengan kartu, dan pinjam dengan jaminan aset milikmu. Semua dari wallet yang kamu kendalikan.",
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
    eyebrow: "Investasi. Pinjam. Belanja.",
    heading: ["Akun keuangan yang dibangun", "untuk dunia onchain."],
    lead: "Simpan uangmu, investasi di saham dan ETF, bangun portofolio yang terdiversifikasi, belanja dengan kartumu, dan akses kekayaanmu. Semua dari satu wallet.",
    imageLabel: "Gambar utama",
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
      body: "Pakai wallet yang sudah kamu gunakan, atau buat baru dengan alamat email. Mercury adalah antarmuka, bukan kustodian. Mercury tidak bisa memindahkan atau membekukan asetmu.",
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
      body: "590 saham dan reksa dana AS, atau satu keranjang utuh yang dibeli sekali klik dan disimpan sebagai satu posisi.",
      points: [
        "Mulai dari $5, dalam pecahan saham",
        "Keranjang adalah satu token yang bisa kamu simpan dan kirim",
        "Atur nominal yang masuk otomatis setiap minggu atau bulan",
      ],
      alt: "Membeli Nvidia: harga dari dua penerbit, dengan rincian biaya.",
    },
  },

  addCash: {
    title: "Tambah dana",
    lede: "Kirim USDC ke alamat ini. Langsung menghasilkan begitu tiba.",
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
      title: "Uang bekerja selagi menunggu.",
      body: "Dana yang menganggur di antara keputusan tetap menghasilkan, dan saham milikmu diam-diam bertambah jadi lebih banyak saham.",
      alt: "Saldo kas yang menghasilkan selagi mengendap.",
      label: "Tersedia untuk investasi",
      pill: "Menghasilkan {rate}",
      note: "dibayarkan ke saldo ini",
    },
    spend: {
      stamp: "Belanja",
      title: "Belanja tanpa menjual.",
      body: "Mercury Visa membayar dari limit yang dijamin portofoliomu, jadi beli makan siang tak pernah berarti menutup posisi.",
      alt: "Kartu Visa yang memakai saldo yang sama.",
      label: "Mercury Visa · Platinum",
      note: "Dibayar dari kas, tidak pernah dari saham",
    },
    borrow: {
      stamp: "Pinjam",
      title: "Pinjam dengan jaminan sahammu.",
      body: "Pinjam dengan jaminan aset yang sudah kamu miliki. Posisinya tetap milikmu, begitu juga semua hasilnya selama pinjaman berjalan.",
      alt: "Daya pinjam dengan jaminan saham yang dimiliki.",
      label: "Daya pinjam",
      note: "Dengan jaminan {amount}",
    },
  },

  oneNumber: {
    heading: ["Satu angka untuk", "semua yang kamu miliki."],
    lead: "Perusahaan yang sama bisa dimiliki lewat salah satu penerbit, dan tiap token bernilai pecahan saham yang berbeda. Mercury menghitung saham di baliknya, bukan tokennya.",
    alt: "Total portofolio, dan satu perusahaan yang dihitung di kedua penerbit",
    totalLabel: "Nilai portofolio",
    totalNote: "{amount} sepanjang waktu",
    stocks: "Saham",
    baskets: "Keranjang",
    cash: "Kas · {rate}",
    issuerTitle: "Nvidia, di semua penerbit",
    tokens: "{n} token",
    truePosition: "Posisi sebenarnya",
    shares: "{n} saham",
    issuerNote: "Kalau menghitung token, hasilnya 58. Tiap token punya pengalinya sendiri.",
  },

  custody: {
    heading: ["Disimpan oleh kustodian.", "Dikendalikan olehmu."],
    lead: "Setiap token yang kamu miliki dijamin satu banding satu oleh saham sungguhan di kustodian yang teregulasi. Kami tidak pernah memegang kuncimu, dan tidak ada bagian produk ini yang bisa memindahkan uangmu tanpa kamu.",
    alt: "Saham di kustodian, dicerminkan sebagai token di Solana, disimpan di wallet-mu",
    pins: ["Wallet-mu", "Token di Solana", "Saham di kustodian"],
    columns: [
      {
        title: "Dijamin satu banding satu",
        body: "Setiap token mewakili satu saham yang disimpan di kustodian yang disebutkan namanya. Backed dan Ondo menerbitkannya; kami beri tahu mana yang kamu dapat sebelum membeli.",
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
        q: "Apa yang terjadi saat pasar AS tutup?",
        a: "Token tetap diperdagangkan saat bursa tutup, jadi harganya bisa menyimpang dari saham aslinya. Kami membandingkan keduanya dan memilih menunggu daripada membelikanmu saham di harga panik.",
      },
      {
        q: "Apakah saya perlu verifikasi identitas?",
        a: "Untuk sebagian besar fitur di sini, tidak. Jika penerbit atau jaringan kartu mewajibkannya, kami beri tahu sebelum kamu mulai, bukan sesudahnya.",
      },
      {
        q: "Berapa biaya Mercury?",
        a: "Satu spread per transaksi, ditampilkan sebelum kamu konfirmasi. Tanpa biaya akun, tanpa biaya tidak aktif, dan tanpa potongan dari dividen.",
      },
      {
        q: "Bisakah saya memindahkan saham ke tempat lain?",
        a: "Bisa. Saham itu adalah token di wallet-mu, bukan catatan di buku besar kami. Kirim ke mana saja yang menerimanya, tanpa perlu persetujuan dari kami.",
      },
    ],
  },

  cta: {
    heading: ["Mercury sudah dibuka.", "Coba versi beta hari ini."],
    note: "Buka akunmu dalam hitungan menit dan mulai menyimpan, berinvestasi, dan belanja dari satu wallet.",
    label: "Coba Mercury beta",
  },
};
