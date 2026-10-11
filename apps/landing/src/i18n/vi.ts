import type { Dict } from "./en";

export const vi: Dict = {
  meta: {
    tagline: "Tài khoản tài chính dành cho thế giới onchain.",
    description:
      "Giữ stablecoin, mua cổ phiếu Mỹ đã token hóa, chi tiêu bằng thẻ và vay dựa trên tài sản bạn sở hữu, tất cả từ một ví do bạn kiểm soát.",
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
    eyebrow: "Đầu tư. Vay. Chi tiêu.",
    heading: ["Tài khoản tài chính", "dành cho thế giới onchain."],
    lead: "Giữ tiền, đầu tư vào cổ phiếu và ETF, xây dựng danh mục đa dạng, chi tiêu bằng thẻ và sử dụng tài sản của bạn, tất cả từ một ví duy nhất.",
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
      body: "Dùng ví bạn đang có, hoặc tạo ví mới bằng địa chỉ email. Mercury là giao diện, không phải bên lưu ký. Mercury không thể di chuyển hay đóng băng tài sản của bạn.",
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
      body: "590 cổ phiếu và quỹ Mỹ, hoặc mua cả một rổ chỉ trong một thao tác và nắm giữ như một vị thế duy nhất.",
      points: [
        "Chỉ từ $5, mua theo phần lẻ cổ phiếu",
        "Mỗi rổ là một token bạn có thể giữ và gửi đi",
        "Đặt số tiền đầu tư định kỳ hằng tuần hoặc hằng tháng",
      ],
      alt: "Mua Nvidia: báo giá từ hai nhà phát hành, kèm chi tiết chi phí.",
    },
  },

  addCash: {
    title: "Nạp tiền",
    lede: "Gửi USDC đến địa chỉ này. Tiền bắt đầu sinh lời ngay khi đến nơi.",
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
      title: "Tiền sinh lời cả khi chờ đợi.",
      body: "Tiền mặt nằm chờ giữa các quyết định vẫn sinh lời, và cổ phiếu bạn sở hữu lặng lẽ tăng thêm số lượng.",
      alt: "Số dư tiền mặt, sinh lời trong lúc chờ.",
      label: "Sẵn sàng để đầu tư",
      pill: "Lãi {rate}",
      note: "trả thẳng vào số dư này",
    },
    spend: {
      stamp: "Chi tiêu",
      title: "Chi tiêu mà không cần bán.",
      body: "Thẻ Mercury Visa thanh toán từ hạn mức đảm bảo bằng danh mục của bạn, nên mua bữa trưa không bao giờ buộc bạn phải đóng vị thế.",
      alt: "Thẻ Visa dùng chung một số dư.",
      label: "Mercury Visa · Platinum",
      note: "Chi từ tiền mặt, không bao giờ từ cổ phiếu",
    },
    borrow: {
      stamp: "Vay",
      title: "Vay dựa trên cổ phiếu của bạn.",
      body: "Vay dựa trên tài sản bạn đang sở hữu. Vị thế vẫn là của bạn, và mọi khoản lợi nhuận nó tạo ra trong thời gian vay cũng vậy.",
      alt: "Hạn mức vay dựa trên số cổ phiếu đang nắm giữ.",
      label: "Hạn mức vay",
      note: "Dựa trên {amount} đang nắm giữ",
    },
  },

  oneNumber: {
    heading: ["Một con số cho", "mọi tài sản bạn nắm giữ."],
    lead: "Cùng một công ty có thể được nắm giữ qua cả hai nhà phát hành, và mỗi token tương ứng với một phần cổ phiếu khác nhau. Mercury đếm số cổ phiếu phía sau, không phải số token.",
    alt: "Tổng giá trị danh mục, và một công ty được tính gộp qua cả hai nhà phát hành",
    totalLabel: "Giá trị danh mục",
    totalNote: "{amount} từ trước đến nay",
    stocks: "Cổ phiếu",
    baskets: "Rổ đầu tư",
    cash: "Tiền mặt · {rate}",
    issuerTitle: "Nvidia, qua các nhà phát hành",
    tokens: "{n} token",
    truePosition: "Vị thế thực",
    shares: "{n} cổ phiếu",
    issuerNote: "Nếu đếm token, con số sẽ là 58. Mỗi token có hệ số nhân riêng.",
  },

  custody: {
    heading: ["Lưu ký bởi tổ chức uy tín.", "Kiểm soát bởi chính bạn."],
    lead: "Mỗi token bạn nắm giữ được bảo chứng một đổi một bằng cổ phiếu thật tại một tổ chức lưu ký được quản lý. Chúng tôi không bao giờ giữ khóa của bạn, và không phần nào của sản phẩm có thể di chuyển tiền mà không có bạn.",
    alt: "Cổ phiếu tại tổ chức lưu ký, phản chiếu thành token trên Solana, nằm trong ví của bạn",
    pins: ["Ví của bạn", "Token trên Solana", "Cổ phiếu tại tổ chức lưu ký"],
    columns: [
      {
        title: "Bảo chứng một đổi một",
        body: "Mỗi token tương ứng với một cổ phiếu được giữ tại một tổ chức lưu ký có tên rõ ràng. Backed và Ondo phát hành chúng; chúng tôi cho bạn biết bạn nhận token của bên nào trước khi mua.",
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
        q: "Điều gì xảy ra khi thị trường Mỹ đóng cửa?",
        a: "Token vẫn giao dịch khi sàn chứng khoán nghỉ, nên giá có thể lệch khỏi cổ phiếu thật. Chúng tôi so sánh hai mức giá và chờ đợi, thay vì mua cho bạn ở mức giá hoảng loạn.",
      },
      {
        q: "Tôi có cần xác minh danh tính không?",
        a: "Với hầu hết những gì bạn làm ở đây thì không. Khi nhà phát hành hoặc mạng lưới thẻ yêu cầu, chúng tôi sẽ báo trước khi bạn bắt đầu, không phải sau đó.",
      },
      {
        q: "Mercury thu phí gì?",
        a: "Một khoản chênh lệch giá (spread) trên mỗi giao dịch, được nêu rõ trước khi bạn xác nhận. Không phí tài khoản, không phí không hoạt động, và không khấu trừ gì từ cổ tức.",
      },
      {
        q: "Tôi có thể chuyển cổ phiếu sang nơi khác không?",
        a: "Có. Chúng là token trong ví của bạn, không phải một dòng trong sổ cái của chúng tôi. Gửi chúng đến bất kỳ nơi nào chấp nhận, và không ai ở đây cần phê duyệt.",
      },
    ],
  },

  cta: {
    heading: ["Mercury đã mở cửa.", "Dùng thử bản beta ngay hôm nay."],
    note: "Mở tài khoản trong vài phút và bắt đầu nắm giữ, đầu tư, chi tiêu từ một ví duy nhất.",
    label: "Dùng thử Mercury beta",
  },
};
