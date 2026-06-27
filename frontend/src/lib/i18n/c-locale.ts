/**
 * C 端统一文案
 *
 * 单文件不拆分理由：单一语言（中文）集中管理，便于后续整体翻译交接；
 * 文案间存在大量共享（品牌名、状态、空状态、错误提示、表单校验），
 * 拆分易导致重复定义或跨文件引用，反损可维护性。
 *
 * 命名规范：
 * - 按页面/功能分节（common / meta / home / about / ...）
 * - 键名使用 camelCase，语义化描述用途，避免无意义缩写
 * - 每个条目路径唯一，可直接定位使用方
 */

export const cLocale = {
  common: {
    brand: {
      name: "美房宝",
      company: "Profo",
      copyright: "© 2024 Profo Real Estate",
    },
    status: {
      onSale: "在售",
      inTransit: "在途",
      sold: "已售",
    },
    action: {
      backHome: "返回首页",
      retry: "重新加载",
      save: "保存",
      saving: "保存中...",
      submit: "确认修改",
      submitting: "提交中...",
      edit: "修改",
      editProfile: "编辑资料",
      logout: "退出登录",
    },
    user: {
      defaultName: "用户",
      phoneUnset: "未设置手机号",
      phoneUnbound: "未绑定",
    },
    error: {
      network: "网络错误",
      networkRetry: "网络错误，请稍后重试",
      loginRequired: "请先登录",
    },
  },

  meta: {
    home: {
      title: "美房宝 - 专业房产估价与装修增值服务 | Profo",
      description:
        "美房宝为您提供专业房产估价、装修增值、精准营销一站式卖房服务。400+业主信赖选择，让您的房子卖得更快、价格更高。",
    },
    about: {
      title: "服务介绍 - 美房宝 | Profo",
      description:
        "了解美房宝全案操盘服务：我们出资装修、约定兜底价、专业团队精准定价，让您的房子第一眼胜出。",
    },
    contact: {
      title: "成交案例 - 美房宝 | Profo",
      description:
        "查看美房宝真实成交案例与市场数据，用数据说话，了解同小区同户型的成交价格。",
    },
    login: {
      title: "登录 - 美房宝 | Profo",
      description: "登录美房宝账户，查看您的房产估价记录与专业顾问建议。",
    },
    my: {
      title: "我的 - 美房宝 | Profo",
      description: "管理您的美房宝账户，查看估价记录与个人资料。",
    },
    register: {
      title: "注册 - 美房宝 | Profo",
      description: "注册美房宝账户，免费获取专业房产估价服务。",
    },
    profile: {
      title: "编辑资料 - 美房宝 | Profo",
      description: "修改您的美房宝账户昵称与手机号。",
    },
    leads: {
      title: "估价详情 - 美房宝 | Profo",
      description: "查看您的房产估价详情与专业顾问跟进反馈。",
    },
    projects: {
      title: "房源详情 - 美房宝 | Profo",
      description:
        "查看房源详细信息、装修改造过程与专业顾问联系方式。",
    },
    valuation: {
      title: "免费卖房估价 - 美房宝 | Profo",
      description:
        "输入房源信息，免费获取专业估价师基于真实成交数据的房产评估报告。",
    },
  },

  home: {
    hero: {
      title: "发现属于您的理想居所",
      subtitle: "专业估价，品质装修，让每一套房产焕发应有价值",
    },
    filter: {
      expand: "展开筛选",
      collapse: "收起筛选",
    },
    empty: {
      title: "暂无房源",
      description: "当前筛选条件下没有找到房源，试试调整筛选条件",
    },
  },

  about: {
    painPoints: [
      {
        title: "品相老化，第一眼被比下去",
        description: "老房子不收拾，客户进门就摇头",
        label: "01 — 视觉资产贬值",
      },
      {
        title: "定价全凭感觉，进退两难",
        description: "挂高没人看，挂低怕吃亏",
        label: "02 — 价格锚点缺失",
      },
      {
        title: "挂牌后带看越来越稀",
        description: "头两周热闹，后面一个月没一组",
        label: "03 — 流动性陷阱",
      },
      {
        title: "商圈动辄几百套在挂",
        description: "你的房子凭什么被选中？",
        label: "04 — 竞争红海",
      },
      {
        title: "周期没谱，全看运气",
        description: "快则两三个月，慢则遥遥无期",
        label: "05 — 时间成本失控",
      },
    ],
    serviceFeatures: [
      "我们出资装修，让房子第一眼胜出",
      "约定兜底价，卖不到我们赔装修",
      "专业团队操盘，精准定价控节奏",
      "深谙中介激励，带看量始终在线",
      "400+套成交经验，周期可控",
      "卖超了归我们，卖不掉装修白送",
    ],
    processSteps: [
      {
        num: "01",
        title: "上门评估，约定兜底卖价",
        description: "专业评估团队上门，给出市场分析与兜底价承诺。",
      },
      {
        num: "02",
        title: "我们出资装修，旧房焕新",
        description:
          "快速翻新改造，让房子品相大幅提升，第一眼就打动买家。",
      },
      {
        num: "03",
        title: "精准营销 + 中介激励，加速成交",
        description:
          "多渠道推广 + 中介高佣金激励，带看量持续在线。卖不掉，装修白送。",
      },
    ],
    mobile: {
      heroLabel: "美房宝",
      heroTitle: "卖房这件事，远比你想象的复杂",
      experiencing: "你可能正在经历：",
      fullProcessTitle: "问题不在某一环，在于全流程",
      fullProcessDesc: "美房宝的做法不一样：我们把整件事接过来。",
      serviceTitle: "我们的服务",
      operationLabel: "美房宝",
      operationTitle: "你的房子，我们的全案操盘",
      ownersTitle: "400+ 业主已选择我们",
      statOnSale: "在售套数",
      statMonthSold: "本月已成交",
      valuationLabel: "美房宝",
      valuationTitle: "你的房子，现在能卖多少？",
      valuationDesc: "输入房源信息，立即获取专业估价",
      cta: "免费获取估价",
      privacyNote: "100% 隐私保密 · 专业精准评估",
    },
    pc: {
      heroImgAlt: "Modern Luxury Interior",
      heroTitleLine1: "专业赋能，",
      heroTitleLine2: "让每一套房产焕发应有价值",
      heroDesc:
        "美房宝致力于为业主提供全链路资产管理与交易优化服务，通过专业审美与数据驱动，解决房产流通中的一切痛点。",
      startCta: "开启专业操盘",
      learnMore: "了解更多服务",
      painPointsEyebrow: "Pain Points",
      painPointsTitle: "房东面临的真实挑战",
      methodologyEyebrow: "Our Methodology",
      methodologyTitle: "美房宝 全案操盘三部曲",
      methodologyDesc:
        "我们不仅仅是中介，更是您的房产产品经理。从诊断到成交，每一步都精益求精。",
      servicesEyebrow: "Our Services",
      servicesTitle: "我们的服务保障",
      trustTitle: "业主信任的专业保障",
      trustDesc:
        "每一份数据的背后，都是我们对房产价值的极致追求与对房东托付的尊重。",
      statOnSale: "在售套数",
      statMonthSold: "本月已成交",
      statExperienceValue: "400+",
      statExperience: "成交经验",
      statSatisfactionValue: "98.5%",
      statSatisfaction: "业主满意度",
      dashboardImgAlt: "Data Analytics Dashboard",
      reportBadge: "实时操盘报告",
      testimonial:
        "“美房宝的介入让我的房源在一周内就收到3个意向金，最终成交价格远超预期。” —— 上海张女士",
      ctaTitle: "准备好让您的资产再次升级了吗？",
      ctaDesc:
        "立即免费获取由 美房宝 AI 估价引擎与专业顾问共同生成的《房产资产优化建议书》。",
      ctaButton: "免费获取估价",
      privacyNote: "我们郑重承诺保护您的隐私，信息仅用于发送建议书。",
    },
  },

  contact: {
    realDataBadge: "真实数据",
    title: "看看房子\n值多少钱",
    subtitle:
      "真实成交案例，数据会说话。看看同小区、同户型的市场动态数据充分定价。",
    recentLabel: "近期成交",
    searchPlaceholder: "搜索小区名...",
    empty: {
      title: "暂无成交案例",
      description: "近期暂无成交记录",
    },
    platformBadge: "平台实力",
    platformTitle: "用数据说话",
    ownersValue: "400+",
    ownersLabel: "业主共同选择",
    statOnSale: "在售套数",
    statMonthSold: "本月已成交",
    actionBadge: "立即行动",
    actionTitle: "你家能卖多少？",
    actionDesc: "输入房源信息，获取同户型成交参考",
    learnMore: "了解服务详情",
    cta: "免费获取估价",
  },

  login: {
    brandDesc: "权威、精准、宁静。为您开启高端地产的卓越管理之旅。",
    badgeInstitutional: "Institutional Grade",
    badgeSecure: "Secure Access",
    welcomeTitle: "欢迎回来",
    welcomeSubtitle: "请输入您的凭据以访问您的账户",
    usernameLabel: "用户名 / 电子邮箱",
    usernamePlaceholder: "请输入用户名",
    passwordLabel: "密码",
    passwordPlaceholder: "请输入密码",
    showPassword: "显示密码",
    hidePassword: "隐藏密码",
    remember: "保持登录状态",
    submitting: "登录中...",
    submit: "登录",
    noAccount: "还没有账户？",
    registerLink: "立即注册",
    validation: {
      usernameRequired: "请输入用户名",
      passwordRequired: "请输入密码",
    },
  },

  my: {
    myValuation: "我的估价",
    empty: {
      title: "暂无估价记录",
      description: "提交房源估价后，这里会显示您的估价记录",
    },
  },

  register: {
    heroTitle: "开启您的专业地产之旅",
    heroDesc:
      "加入 Profo 平台，体验前所未有的精准房产估价与高效房源管理。我们为每一位专业人士和业主提供最权威的数据支持。",
    featureAuthoritativeTitle: "权威数据",
    featureAuthoritativeDesc: "覆盖全国核心城市房产数据",
    featureSmartValuationTitle: "智能估值",
    featureSmartValuationDesc: "基于AI的动态市场定价引擎",
    formTitle: "创建新账号",
    formSubtitle: "请填写以下信息完成注册",
    submitFailed: "注册失败",
    usernameLabel: "用户名",
    usernamePlaceholder: "请输入您的用户名",
    nicknameLabel: "昵称（选填）",
    nicknamePlaceholder: "请输入昵称",
    phoneLabel: "手机号码",
    phonePlaceholder: "请输入11位手机号（选填）",
    passwordLabel: "设置密码",
    passwordPlaceholder: "至少8位字符",
    confirmPasswordLabel: "确认密码",
    confirmPasswordPlaceholder: "请再次输入密码",
    passwordMismatch: "两次输入的密码不一致",
    termsPrefix: "注册即代表您已阅读并同意 Profo 的",
    termsText: "服务条款",
    termsJoin: "和",
    privacyText: "隐私政策",
    submitting: "注册中...",
    submit: "立即注册",
    hasAccount: "已有账号？",
    loginLink: "立即登录",
    aboutUs: "关于我们",
  },

  valuation: {
    badge: "免费估价",
    title: "免费获取专业估价",
    subtitle:
      "填写房源信息，专业估价师将基于真实成交数据为您评估房产价值",
  },

  valuationAction: {
    communityRequired: "小区名称不能为空",
    submitFailed: "提交失败",
  },

  profile: {
    nicknameLabel: "昵称",
    nicknamePlaceholder: "请输入昵称",
    phoneLabel: "手机号",
    phoneModify: "修改",
    dialogTitle: "修改手机号",
    dialogDesc: "请输入新手机号和当前密码以验证身份",
    newPhoneLabel: "新手机号",
    newPhonePlaceholder: "请输入新手机号",
    currentPasswordLabel: "当前密码",
    currentPasswordPlaceholder: "请输入当前密码",
    updateSuccess: "修改成功",
    phoneUpdateSuccess: "手机号修改成功",
  },

  profileAction: {
    nicknameRequired: "昵称不能为空",
    nicknameMaxLength: "昵称不能超过100个字符",
    phoneRequired: "手机号不能为空",
    phoneInvalid: "手机号格式不正确",
    passwordMinLength: "密码不能少于6个字符",
    updateFailed: "修改失败",
    updateSuccess: "修改成功",
    phoneUpdateSuccess: "手机号修改成功",
  },

  leads: {
    forbiddenTitle: "无权查看该线索",
    forbiddenDesc: "您没有权限查看此线索的详细信息",
    backToMine: "返回我的估价",
  },

  projects: {
    unknownCommunity: "未知小区",
    shareFallback: "房源",
    linkCopied: "链接已复制到剪贴板",
    shareFailed: "分享失败，请手动复制链接",
    backAria: "返回上一页",
    shareAria: "分享房源",
  },

  error: {
    title: "页面加载失败",
    description: "请稍后重试，或联系客服",
  },

  notFound: {
    title: "页面未找到",
    description: "您访问的页面不存在或已被移除",
  },
} as const;

export type CLocale = typeof cLocale;
