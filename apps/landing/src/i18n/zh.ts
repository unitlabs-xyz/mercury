import type { Dict } from "./en";

export const zh: Dict = {
  meta: {
    tagline: "为链上世界打造的金融账户。",
    description:
      "持有稳定币，买入代币化美股，刷卡消费，以持仓抵押借款，全部在你自己掌控的钱包中完成。",
    ogAlt: "Mercury，为链上世界打造的金融账户。",
  },

  ui: {
    skip: "跳至正文",
    home: "Mercury 首页",
    mainNav: "主导航",
    menuNav: "菜单",
    openMenu: "打开菜单",
    closeMenu: "关闭菜单",
    language: "语言",
    cta: "体验测试版",
  },

  nav: {
    howItWorks: "运作方式",
    baskets: "投资组合篮",
    card: "卡片",
    faqs: "常见问题",
  },

  footer: {
    explore: "探索",
    company: "公司",
    follow: "关注",
    legal: "法律",
    about: "关于我们",
    contact: "联系我们",
    terms: "条款",
    privacy: "隐私",
    rights: "全球 · 保留所有权利。",
  },

  hero: {
    eyebrow: "投资。借款。消费。",
    heading: ["为链上世界打造的", "金融账户。"],
    lead: "存放资金，投资股票和ETF，构建多元化投资组合，刷卡消费，随时调用你的财富，一个钱包全部搞定。",
    imageLabel: "主视觉图片",
  },

  trust: {
    caption: "股票托管与代币化合作方",
  },

  everything: {
    heading: ["资金的一切用途，", "尽在一个账户。"],
    lead: "无需券商账户，无需身份验证，无需法币通道。能持有稳定币，就能持有 Nvidia。",
    hold: {
      stamp: "持有",
      title: "钱始终在你的钱包里。",
      body: "直接连接你常用的钱包，或用邮箱地址新建一个。Mercury 是交互界面，不是托管方，既无法转移也无法冻结你的资产。",
      points: [
        "基于 Solana 的 USDC 出入金，中间没有银行。",
        "随时收付款，周末也不例外",
        "离开只需一笔交易，无需任何人批准",
      ],
      alt: "充值：带二维码的 Solana 充值地址。",
    },
    invest: {
      stamp: "投资",
      title: "把稳定币变成真实股票。",
      body: "590 只美股与基金，也可一键买入整个投资组合篮，并作为单一仓位持有。",
      points: [
        "$5 起投，支持碎股",
        "一个投资组合篮就是一个可持有、可转账的代币",
        "设定金额，每周或每月自动定投",
      ],
      alt: "买入 Nvidia：两家发行方报价及费用明细。",
    },
  },

  addCash: {
    title: "充值",
    lede: "将 USDC 发送到此地址，到账即开始产生收益。",
    addressLabel: "你的 Solana 地址",
    qrAlt: "Solana 充值地址 {address} 的二维码",
    copy: "复制地址",
    copied: "地址已复制",
  },

  buyQuote: {
    youPay: "支付金额",
    pricePerShare: "每股价格",
    shares: "股数",
    route: "路由",
  },

  pillars: {
    grow: {
      stamp: "增值",
      title: "等待时，钱也在工作。",
      body: "决策间隙闲置的现金照样生息，你持有的股票也在悄然增加股数。",
      alt: "闲置时仍在生息的现金余额。",
      label: "可投资金额",
      pill: "收益 {rate}",
      note: "收益计入此余额",
    },
    spend: {
      stamp: "消费",
      title: "消费，无需卖出。",
      body: "Mercury Visa 从以投资组合为抵押的额度中支付，吃顿午饭也不必平仓。",
      alt: "从同一余额支付的 Visa 卡。",
      label: "Mercury Visa · Platinum",
      note: "从现金支付，绝不动用股票",
    },
    borrow: {
      stamp: "借款",
      title: "以股票抵押借款。",
      body: "用已有资产作抵押借款。借款期间仓位仍归你所有，其间产生的全部收益也归你所有。",
      alt: "基于所持股票的可借额度。",
      label: "可借额度",
      note: "基于持仓 {amount}",
    },
  },

  oneNumber: {
    heading: ["你的全部持仓，", "汇成一个数字。"],
    lead: "同一家公司可以通过任一发行方持有，而每个代币对应的股份比例各不相同。Mercury 统计的是代币背后的真实股数，而不是代币数量。",
    alt: "投资组合总值，以及同一家公司在两家发行方的合并持仓",
    totalLabel: "投资组合价值",
    totalNote: "累计 {amount}",
    stocks: "股票",
    baskets: "投资组合篮",
    cash: "现金 · {rate}",
    issuerTitle: "Nvidia，跨发行方汇总",
    tokens: "{n} 个代币",
    truePosition: "真实仓位",
    shares: "{n} 股",
    issuerNote: "按代币数量计算会得出 58。每个代币都有各自的乘数。",
  },

  custody: {
    heading: ["资产由托管方保管，", "控制权在你手中。"],
    lead: "你持有的每个代币，都由受监管托管机构保管的真实股票一比一支持。我们从不保管你的私钥，产品的任何环节都无法在未经你操作的情况下转移你的资金。",
    alt: "托管机构中的股票映射为 Solana 上的代币，并存放在你的钱包中",
    pins: ["你的钱包", "Solana 上的代币", "托管机构中的股票"],
    columns: [
      {
        title: "一比一足额支持",
        body: "每个代币都对应一股由指定托管机构保管的股票。代币由 Backed 和 Ondo 发行，买入前我们会告诉你具体来自哪一家。",
      },
      {
        title: "每个数字都有来源",
        body: "价格会标明读取来源与时间。没有出处的数字，我们不会展示给你。",
      },
      {
        title: "宁可拒绝，不做劣质成交",
        body: "当代币价格高于股票实际价值时，订单会等待或被拒绝。劣质成交不如不成交。",
      },
    ],
  },

  faqs: {
    title: "常见问题",
    items: [
      {
        q: "我真的拥有这些股票吗？",
        a: "每个代币都由受监管托管机构持有的真实股票一比一支持。代币存放在你自己的钱包里，你可以随时转出。",
      },
      {
        q: "美股休市时会怎样？",
        a: "交易所休市时代币仍在交易，因此价格可能偏离真实股价。我们会比较两者，宁愿等待，也不会让你以恐慌价格买入。",
      },
      {
        q: "需要验证身份吗？",
        a: "大多数功能不需要。如果发行方或卡组织有要求，我们会在你开始之前就告知你。",
      },
      {
        q: "Mercury 怎么收费？",
        a: "只收取一笔交易点差，并在你确认前明确列出。没有账户费，没有闲置费，也不会从股息中扣除任何费用。",
      },
      {
        q: "我可以把股票转到别处吗？",
        a: "可以。它们是你钱包里的代币，而不是我们账本上的一条记录。可以发送到任何支持它们的地方，无需我们批准。",
      },
    ],
  },

  cta: {
    heading: ["Mercury 已开放。", "立即体验测试版。"],
    note: "几分钟即可开户，在一个钱包里开始持有、投资和消费。",
    label: "体验 Mercury 测试版",
  },
};
