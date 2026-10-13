import type { Dict } from "./en";

export const vi: Dict = {
  meta: {
    tagline: "Tài khoản tài chính dành cho thế giới onchain.",
    description:
      "Sở hữu cổ phiếu toàn cầu thật chỉ từ $5, đầu tư vào cả một chủ đề với rổ đầu tư, và vay dựa trên cổ phiếu thay vì bán chúng, tất cả từ một ví thuộc về bạn.",
    ogAlt: "Mercury, tài khoản tài chính dành cho thế giới onchain.",
  },

  ui: {
    skip: "Chuyển đến nội dung",
    home: "Trang chủ Mercury",
    mainNav: "Chính",
    menuNav: "Menu",
    openMenu: "Mở menu",
    closeMenu: "Đóng menu",
    language: "Ngôn ngữ",
    cta: "Dùng thử bản beta",
  },

  nav: {
    howItWorks: "Cách hoạt động",
    baskets: "Rổ đầu tư",
    card: "Thẻ",
    faqs: "Câu hỏi thường gặp",
  },

  footer: {
    explore: "Khám phá",
    company: "Công ty",
    follow: "Theo dõi",
    legal: "Pháp lý",
    about: "Giới thiệu",
    contact: "Liên hệ",
    terms: "Điều khoản",
    privacy: "Quyền riêng tư",
    rights: "Toàn cầu · Bảo lưu mọi quyền.",
  },

  hero: {
    heading: ["Tài khoản tài chính", "dành cho thế giới onchain."],
    lead: "Sở hữu cổ phiếu toàn cầu thật chỉ từ $5, đầu tư vào cả một chủ đề với rổ đầu tư, và vay dựa trên cổ phiếu thay vì bán chúng. Tất cả từ một ví thuộc về bạn, mở chỉ bằng một email.",
    imageLabel: "Hình ảnh chính",
  },

  trust: {
    caption: "Cổ phiếu được lưu ký và token hóa bởi",
  },

  everything: {
    heading: ["Mọi việc đồng tiền của bạn làm,", "trong một tài khoản."],
    lead: "Không cần tài khoản môi giới, không xác minh danh tính, không qua kênh tiền pháp định. Nếu bạn giữ được stablecoin, bạn giữ được Nvidia.",
    hold: {
      stamp: "GIỮ",
      title: "Tiền của bạn luôn nằm trong ví của bạn.",
      body: "Đăng nhập bằng email và Mercury tạo một ví chỉ thuộc về riêng bạn. Không cần cụm từ khôi phục, không cần tiện ích mở rộng.",
      points: [
        "USDC trên Solana, nạp và rút, không cần ngân hàng trung gian.",
        "Gửi và nhận bất cứ lúc nào, kể cả cuối tuần",
        "Rời đi chỉ cần một giao dịch, không cần ai cho phép",
      ],
      alt: "Nạp tiền: địa chỉ nạp Solana kèm mã QR.",
    },
    invest: {
      stamp: "ĐẦU TƯ",
      title: "Biến stablecoin thành cổ phiếu thật.",
      body: "Hơn 450 cổ phiếu toàn cầu và ETF. Với mỗi lệnh, chúng tôi so sánh giá giữa nhiều nhà cung cấp và chọn mức tốt nhất cho bạn.",
      points: [
        "Chỉ từ $5, mua theo phần lẻ cổ phiếu",
        "Giá tốt nhất giữa các nhà cung cấp, mọi lúc",
        "Lệnh lệch xa giá cổ phiếu thật sẽ chờ hoặc bị từ chối",
      ],
      alt: "Mua Nvidia: báo giá từ hai nhà phát hành, kèm chi tiết chi phí.",
    },
  },

  addCash: {
    title: "Nạp tiền",
    lede: "Gửi USDC đến địa chỉ này. Tiền về dưới dạng tiền mặt, sẵn sàng để đầu tư.",
    addressLabel: "Địa chỉ Solana của bạn",
    qrAlt: "Địa chỉ nạp Solana {address} dưới dạng mã QR",
    copy: "Sao chép địa chỉ",
    copied: "Đã sao chép địa chỉ",
  },

  buyQuote: {
    youPay: "Bạn trả",
    pricePerShare: "Giá mỗi cổ phiếu",
    shares: "Số cổ phiếu",
    route: "Lộ trình",
  },

  pillars: {
    grow: {
      stamp: "Tăng trưởng",
      title: "Cổ tức thành cổ phiếu.",
      body: "Cổ tức về dưới dạng thêm cổ phiếu. Mercury đếm số cổ phiếu thật phía sau mỗi token, nên con số của bạn luôn chính xác.",
      alt: "Số cổ phiếu tăng lên sau khi nhận cổ tức.",
      label: "Nvidia, vị thế thực",
      value: "{n} cổ phiếu",
      pill: "+{n}",
      note: "có thêm nhờ cổ tức",
    },
    borrow: {
      stamp: "Vay",
      title: "Có tiền mặt mà không cần bán.",
      body: "Cần đô la? Vay dựa trên cổ phiếu thay vì bán chúng. Tiền mặt về số dư của bạn, và cổ phiếu vẫn là của bạn.",
      alt: "Hạn mức vay dựa trên số cổ phiếu đang nắm giữ.",
      label: "Hạn mức vay",
      note: "Dựa trên {amount} đang nắm giữ",
    },
    spend: {
      stamp: "Chi tiêu · Sắp tới",
      title: "Một chiếc thẻ cho số dư của bạn.",
      body: "Thẻ Mercury sắp ra mắt: chi tiêu số dư tiền mặt tại bất kỳ cửa hàng nào trên thế giới, để khoản đầu tư của bạn vẫn tiếp tục sinh lời.",
      alt: "Thẻ Mercury, sắp ra mắt.",
      label: "Thẻ Mercury",
      note: "Sắp ra mắt",
    },
  },

  baskets: {
    heading: ["Cả một chủ đề,", "trong một rổ."],
    lead: "Chọn một chủ đề như Magnificent Seven, AI hay năng lượng hạt nhân và đầu tư chỉ với một lần thanh toán. Rổ nằm trong tài khoản của chính bạn, được tái cân bằng hằng ngày, và trở về với bạn bất cứ khi nào bạn rời đi.",
    alt: "Rổ Magnificent Seven, và cách một rổ hoạt động",
    kind: "Rổ · Công nghệ",
    name: "Magnificent Seven",
    holdings: "{n} khoản nắm giữ",
    note: "Tái cân bằng hằng ngày",
    weights: "Tỷ trọng mục tiêu",
    howTitle: "Cách một rổ hoạt động",
    how: [
      { label: "Nằm ở đâu", value: "Tài khoản của chính bạn" },
      { label: "Gộp chung với người khác", value: "Không bao giờ" },
    ],
    leave: { label: "Khi rời đi", value: "Nhận cổ phiếu hoặc tiền mặt" },
    howNote: "{n} rổ đang hoạt động, từ AI đến vàng, cùng các chiến lược lấy cảm hứng từ những nhà đầu tư nổi tiếng.",
  },

  custody: {
    heading: ["Lưu ký bởi tổ chức uy tín.", "Kiểm soát bởi chính bạn."],
    lead: "Mỗi token bạn nắm giữ được bảo chứng một đổi một bằng cổ phiếu thật tại một tổ chức lưu ký được quản lý. Chúng tôi không bao giờ giữ khóa của bạn, và không phần nào của sản phẩm có thể di chuyển tiền mà không có bạn.",
    alt: "Cổ phiếu tại tổ chức lưu ký, phản chiếu thành token trên Solana, nằm trong ví của bạn",
    pins: ["Ví của bạn", "Token trên Solana", "Cổ phiếu tại tổ chức lưu ký"],
    columns: [
      {
        title: "Bảo chứng một đổi một",
        body: "Mỗi token tương ứng với một cổ phiếu thật được giữ tại một tổ chức lưu ký có tên rõ ràng, và chúng tôi cho bạn biết nhà cung cấp trước khi mua.",
      },
      {
        title: "Mọi con số đều có nguồn",
        body: "Giá luôn ghi rõ được lấy từ đâu và khi nào. Con số không rõ nguồn gốc là con số chúng tôi sẽ không hiển thị.",
      },
      {
        title: "Từ chối, thay vì khớp lệnh tệ",
        body: "Khi token đắt hơn giá trị thật của cổ phiếu, lệnh sẽ chờ hoặc bị từ chối. Khớp lệnh tệ còn tệ hơn không khớp.",
      },
    ],
  },

  faqs: {
    title: "Câu hỏi thường gặp",
    items: [
      {
        q: "Tôi có thật sự sở hữu cổ phiếu không?",
        a: "Mỗi token được bảo chứng một đổi một bằng cổ phiếu thật do một tổ chức lưu ký được quản lý nắm giữ. Bạn giữ token trong ví của chính mình và có thể chuyển đi bất cứ khi nào bạn muốn.",
      },
      {
        q: "Điều gì xảy ra khi thị trường chứng khoán đóng cửa?",
        a: "Token vẫn giao dịch khi sàn chứng khoán nghỉ, nên giá có thể lệch khỏi cổ phiếu thật. Chúng tôi so sánh hai mức giá và chờ đợi, thay vì mua cho bạn ở mức giá hoảng loạn.",
      },
      {
        q: "Tôi có cần xác minh danh tính không?",
        a: "Không. Bạn đăng nhập bằng email và một ví được tạo sẵn cho bạn. Không giấy tờ, không biểu mẫu.",
      },
      {
        q: "Mercury thu phí gì?",
        a: "Không phí tài khoản và không phí Mercury trên giao dịch. Bạn trả giá thị trường của token, và mọi khoản chênh giá hay phí mạng đều được hiển thị trước khi bạn xác nhận.",
      },
      {
        q: "Rổ đầu tư là gì?",
        a: "Một danh mục dựng sẵn quanh một chủ đề, như Magnificent Seven. Một lần thanh toán mua mọi khoản nắm giữ theo tỷ trọng mục tiêu, trong một tài khoản chỉ bạn sở hữu, và rổ được tái cân bằng hằng ngày.",
      },
      {
        q: "Tôi có thể chuyển cổ phiếu sang nơi khác không?",
        a: "Có. Chúng là token trong ví của bạn, không phải một dòng trong sổ cái của chúng tôi. Gửi chúng đến bất kỳ nơi nào chấp nhận, và không ai ở đây cần phê duyệt.",
      },
    ],
  },

  cta: {
    heading: ["Mercury đã mở cửa.", "Dùng thử bản beta ngay hôm nay."],
    note: "Đăng nhập bằng email và sở hữu cổ phiếu đầu tiên chỉ trong vài phút.",
    label: "Dùng thử Mercury beta",
  },
};
