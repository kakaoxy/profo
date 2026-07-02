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
 *
 * 术语约定（依据《c端文案修改方案-审批意见.md》）：
 * - 品牌：logo 用 "Profo"，正文统一 "美房宝"，SEO title 保留 "美房宝"
 * - "约定价格" = 写进合同的、业主到手的目标售价（替代"兜底价"）
 * - 状态显示："在售 / 装修中 / 已售"（"在途"为后端枚举值，前端只改显示文案）
 * - "全流程托管" 替代 "操盘"（首次出现加括号说明）
 * - 未核验数字一律删除（400+、98.5%、张女士引语）
 * - 联系方式未到位：占位 "咨询热线：即将开通，暂请通过页面表单留言"
 */

export const cLocale = {
  common: {
    brand: {
      name: "美房宝",
      company: "Profo",
      copyright: "© 2026 美房宝",
    },
    status: {
      onSale: "在售",
      inTransit: "装修中",
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
    contact: {
      hotlinePlaceholder: "咨询热线：即将开通，暂请通过页面表单留言",
    },
  },

  meta: {
    home: {
      title: "美房宝 - 翻新精装房源 | 真实成交价可查 | Profo",
      description:
        "浏览美房宝真实房源：在售精装房、装修中改造过程、已售真实成交价。每一套均由公司垫资翻新，真实可查。",
    },
    about: {
      title: "服务介绍 - 美房宝 | Profo",
      description:
        "美房宝全流程托管服务：我们出资装修、约定目标售价、全权卖房。卖到约定价业主拿钱，卖不到装修免费送。",
    },
    contact: {
      title: "真实成交 - 美房宝 | Profo",
      description:
        "查看美房宝真实成交案例，每一套都是公司垫资装修、全权卖房的真实案例，成交价真实可查。",
    },
    login: {
      title: "登录 - 美房宝 | Profo",
      description: "登录美房宝账户，查看您的估价记录与目标售价跟进。",
    },
    my: {
      title: "我的 - 美房宝 | Profo",
      description: "管理您的美房宝账户，查看估价记录与个人资料。",
    },
    register: {
      title: "注册 - 美房宝 | Profo",
      description: "注册美房宝账户，免费评估房产、商定目标售价，不签约不收费。",
    },
    profile: {
      title: "编辑资料 - 美房宝 | Profo",
      description: "修改您的美房宝账户昵称与手机号。",
    },
    leads: {
      title: "估价详情 - 美房宝 | Profo",
      description: "查看您的房产估价详情与目标售价商定进度。",
    },
    projects: {
      title: "房源详情 - 美房宝 | Profo",
      description: "查看房源详细信息、装修改造过程与顾问联系方式。",
    },
    valuation: {
      title: "免费预审 - 美房宝 | Profo",
      description:
        "在线提交房源信息做初步预审，合适则上门看房后商定写进合同的约定价格。不签约不收费。",
    },
  },

  home: {
    hero: {
      title: "所见即所得，每套皆标杆",
      subtitle:
        "在售、装修、已售房源全程实景展示，拒绝“照骗”。美房宝全程翻新，真金白银为品质背书。成交数据公开可查，让每一分钱都花得明明白白。",
      tags: ["精装实景交付", "改造全程溯源", "成交价真实可验"],
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
    // 品牌记忆锚点（首页/估价页复用变体）
    oneLiner:
      "你看中的那笔卖房钱，我们试着帮你卖到。装修的钱、卖房的事，全部我们来。卖到了，你拿约定的价格。卖不到，装修送你。",
    painPoints: [
      {
        title: "我装修旧了，不想再投钱",
        description: "房子老了不收拾，客户进门就摇头",
        label: "01",
      },
      {
        title: "我怕自己装修，卖不掉血亏",
        description: "投了十几万装修，挂半年卖不掉",
        label: "02",
      },
      {
        title: "中介只挂牌，不管产品力",
        description: "挂上去就不管了，带看越来越少",
        label: "03",
      },
      {
        title: "挂牌一阵，带看少出价更低",
        description: "头两周热闹，后面一个月没一组",
        label: "04",
      },
      {
        title: "周期没谱，全看运气",
        description: "快则两三个月，慢则遥遥无期",
        label: "05",
      },
      {
        title: "卖房太折腾，精力跟不上",
        description: "装修要盯、带看要陪、谈判要扛，工作生活两头烧",
        label: "06",
      },
    ],
    serviceFeatures: [
      "零现金投入：装修公司全额垫资，业主一分不掏",
      "利益绑定：卖超归公司，我们不偷工减料",
      "全流程省心：从装修到卖出，业主不用参与",
      "风险上限清晰：最差=免费得一套装修，0现金损失",
      "数据透明：基于周边真实成交，不压价",
      "装修方案需业主确认：我们不改你不想改的",
    ],
    processSteps: [
      {
        num: "01",
        title: "上门评估，商定目标售价",
        description:
          "专业评估团队上门，结合周边真实成交数据，跟你商量一个写进合同的目标售价。",
      },
      {
        num: "02",
        title: "公司全额垫资装修，65天",
        description:
          "快速翻新改造，让房子品相大幅提升。业主一分不掏，装修方案需业主确认。",
      },
      {
        num: "03",
        title: "公司全权卖房",
        description:
          "卖到约定价，业主拿钱；卖不到约定价，装修免费送业主。两种结果，业主都不亏。",
      },
    ],
    // 新增：算账模块
    calculation: {
      title: "算一笔实在账",
      subtitle:
        "假设约定价 380 万、装修成本 15 万，看看三种市场情况下的结果",
      cases: [
        {
          scenario: "市场给力",
          soldPrice: "430万",
          ownerGets: "380万",
          company: "+35万",
          note: "业主拿约定价，超出归公司",
        },
        {
          scenario: "市场一般",
          soldPrice: "395万",
          ownerGets: "380万",
          company: "刚回本",
          note: "业主拿约定价，公司不亏不赚",
        },
        {
          scenario: "市场不好",
          soldPrice: "未售出",
          ownerGets: "免费得一套装修",
          company: "-15万",
          note: "装修免费送业主，业主0现金损失",
        },
      ],
      bottomLine: "业主最差的结果 = 免费得一套装修，0现金损失",
    },
    // 新增：三方对比
    comparison: {
      title: "我们和装修公司、中介有什么不同",
      headers: ["", "装修公司", "中介", "美房宝"],
      rows: [
        {
          aspect: "赚什么钱",
          decorator: "材料/施工差价",
          agent: "成交佣金",
          profo: "卖出价超出约定价的部分",
        },
        {
          aspect: "在乎什么",
          decorator: "装修利润",
          agent: "快速成交拿佣金",
          profo: "卖得越贵赚越多",
        },
        {
          aspect: "风险谁担",
          decorator: "业主",
          agent: "业主",
          profo: "公司担（卖不掉赔装修）",
        },
      ],
    },
    // 新增：FAQ 8 条（业务文档 6 条 + 疑惑文档补充"资金怎么保障""公司靠谱吗"）
    faq: [
      {
        q: "约定价格会不会被压低？",
        a: "约定价格是双方商定的，写进合同，业主有一票否决权。我们基于周边真实成交数据给建议，不压价——因为卖得越贵我们赚越多，利益是绑定的。",
      },
      {
        q: "真的免费送装修，有隐藏条件吗？",
        a: "没有。合同写明：未售出则装修免费赠送，无附加条件。装修方案需业主确认，我们不改动业主不同意的地方。",
      },
      {
        q: "65天不能看房，值不值？",
        a: "65天是装修期。装修期间房子确实不便看，但装修后品相大幅提升，带看量和成交价都会上一个台阶。周期总账算下来比挂着等更快。",
      },
      {
        q: "装修质量怎么保证？",
        a: "装修方案需业主确认，材料清单透明。我们是利益绑定方——卖不到约定价装修白送，所以不会偷工减料砸自己招牌。",
      },
      {
        q: "你们怎么赚钱？",
        a: "我们赚的是卖出价超出约定价的部分。所以我们会努力卖得越贵越好，这与业主“拿个好价格”的目标完全一致。",
      },
      {
        q: "和中介、装修公司有什么不同？",
        a: "中介只挂牌等成交，装修公司只管装修赚钱，两者都不承担卖不掉的风险。我们出资装修+全权卖房，卖不掉装修白送，风险我们担。",
      },
      {
        q: "资金怎么保障？",
        a: "装修由公司全额垫资，业主不出资。合同明确约定价格与未售出后果，资金流向写进合同，可核查。",
      },
      {
        q: "公司靠谱吗？会不会跑路？",
        a: "我们赚的是“卖出超价”的钱，跑路对我们没好处。合同保障业主权益：约定价格写进合同，未售出装修归业主。可上门面谈，查验公司资质。",
      },
    ],
    // 新增：适合房子
    suitable: {
      title: "什么样的房子适合找我们",
      criteria: [
        "装修老旧，自己不想再投钱翻新",
        "挂牌一阵了，带看少、出价低于预期",
        "想拿个好价格，但不想自己冒险投装修",
        "不介意免费拿一套装修（卖不掉的情况）",
      ],
      boundary:
        "如果你的房子挂牌两三天就有人抢——那恭喜你，你可能不需要我们。但如果你在犹豫，不妨也约一次评估，听听我们的建议，不收费。",
    },
    // 风险告知微文案（合规需要）
    riskNote:
      "* 美房宝不承诺保底收购。合同约定的是“未售出则装修免费赠送”，而非“公司按约定价格收购你的房产”。",
    // 新增：真实成交案例精选区块
    casesTitle: "真实成交案例",
    casesSubtitle: "每一套都是公司垫资装修、全权卖房的真实案例",
    casesMore: "查看全部成交案例",
    mobile: {
      heroLabel: "美房宝",
      heroTitle: "卖房不想再投钱，还想拿一个好价格？",
      heroSubtitle: "一种零成本、零风险的卖房方案",
      experiencing: "你可能正在经历：",
      fullProcessTitle: "问题不在某一环，在于全流程",
      fullProcessDesc:
        "美房宝的做法不一样：我们把整件事接过来（全流程托管，即从装修到卖出，全部由我们负责）。",
      serviceTitle: "我们的服务",
      operationLabel: "美房宝",
      operationTitle: "你的房子，我们全流程托管",
      ownersTitle: "业主信任的专业保障",
      statOnSale: "在售套数",
      statMonthSold: "本月已成交",
      valuationLabel: "美房宝",
      valuationTitle: "你的房子，现在能卖多少？",
      valuationDesc: "在线预审，合适则上门看房后商定约定价格",
      cta: "免费在线预审",
      privacyNote: "不满意不签约，不收费 · 信息仅用于评估与目标售价商定",
    },
    pc: {
      heroImgAlt: "Modern Luxury Interior",
      heroTitleLine1: "卖房不想再投钱，",
      heroTitleLine2: "还想拿一个好价格？",
      heroDesc:
        "美房宝出钱装修、全权帮您卖。卖到约定价您拿钱，卖不到装修免费送。一种零成本、零风险的卖房方案。",
      startCta: "免费在线预审",
      learnMore: "了解服务流程",
      painPointsEyebrow: "Pain Points",
      painPointsTitle: "房东面临的真实困境",
      methodologyEyebrow: "Our Methodology",
      methodologyTitle: "美房宝全流程托管三部曲",
      methodologyDesc:
        "全流程托管（即从装修到卖出，全部由我们负责）。从评估到成交，每一步都精益求精。",
      servicesEyebrow: "Our Services",
      servicesTitle: "我们的服务保障",
      trustTitle: "业主信任的专业保障",
      trustDesc: "在售套数与本月成交均来自真实成交数据，可核查。",
      statOnSale: "在售套数",
      statMonthSold: "本月已成交",
      dashboardImgAlt: "Data Analytics Dashboard",
      reportBadge: "全流程托管报告",
      ctaTitle: "准备好让您的房子卖个好价格了吗？",
      ctaDesc:
        "提交房源信息做免费预审，合适的我们上门看房，再商定写进合同的约定价格。不签约不收费。",
      ctaButton: "免费在线预审",
      privacyNote: "不满意不签约，不收费 · 信息仅用于评估与目标售价商定",
    },
  },

  contact: {
    realDataBadge: "真实成交",
    title: "同小区同户型\n看看他们卖了多少",
    subtitle:
      "每一套都是公司垫资装修、全权卖房的真实案例。成交价、周期，真实可查。",
    recentLabel: "近期成交",
    searchPlaceholder: "搜索小区名...",
    empty: {
      title: "暂无成交案例",
      description: "近期暂无成交记录",
    },
    platformBadge: "平台实力",
    platformTitle: "用数据说话",
    statOnSale: "在售套数",
    statMonthSold: "本月已成交",
    actionBadge: "立即行动",
    actionTitle: "你家能卖多少？",
    actionDesc: "在线预审，合适则上门看房后商定约定价格",
    learnMore: "免费评估",
    cta: "免费在线预审",
  },

  login: {
    brandDesc:
      "美房宝为业主提供零成本、零风险的卖房服务。登录查看你的估价记录与目标售价跟进。",
    badgeInstitutional: "信息严格保密",
    badgeSecure: "不签约不收费",
    welcomeTitle: "欢迎回来",
    welcomeSubtitle: "登录后可查看估价记录、目标售价与顾问跟进",
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
      description:
        "提交房源信息后，这里会显示你的估价记录、目标售价与顾问跟进",
    },
    goToValuation: "去免费预审",
  },

  register: {
    heroTitle: "注册后可免费评估房产、商定目标售价",
    heroDesc: "提交房源信息即可获取专业评估与目标售价建议，不签约不收费。",
    featureAuthoritativeTitle: "零成本卖房",
    featureAuthoritativeDesc: "装修我们全额垫资",
    featureSmartValuationTitle: "卖不到约定价",
    featureSmartValuationDesc: "装修免费送业主",
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
    termsPrefix: "注册即代表您已阅读并同意美房宝的",
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
    badge: "免费预审",
    title: "在线预审，先看你的房子有没有溢价空间",
    subtitle:
      "线上提交房源信息，我们先做初步预审。合适的会联系你安排上门看房，结合周边真实成交数据，再商定写进合同的约定价格。不签约不收费。",
    sidebarTitle: "为什么选择美房宝",
    bullets: [
      "装修公司全额垫资，业主零现金投入",
      "卖不到约定价，装修免费送业主",
      "约定价格写进合同，业主一票否决",
      "线上预审无负担，约定价格在上门看房后才商定",
    ],
    recentSoldTitle: "近期成交参考",
    recentSoldEmpty: "暂无成交参考",
    recentSoldMore: "查看更多案例",
    phoneCompleteButton: "完善手机号",
    phoneCompleteSuffix: "，加速评估速度",
    phoneInputPlaceholder: "请输入手机号",
    phoneInputAriaLabel: "手机号输入框",
    phoneSubmit: "保存",
    phoneSubmitting: "保存中...",
    phoneCancel: "取消",
    phoneSuccess: "手机号保存成功",
    submit: "提交预审",
    submitting: "提交中...",
    privacyNote: "信息仅用于预审与上门看房安排，不外泄、不电话骚扰",
    floorPlanLabel: "户型图",
    floorPlanHint: "上传户型图帮助准确估价，最多 {max} 张",
    floorPlanUploadFailed: "户型图上传失败",
    floorPlanFull: "已满",
    floorPlanAddPic: "ADD PIC",
    floorPlanUploading: "上传中...",
    floorPlanMaxImages: (n: number) => `最多只能上传 ${n} 张图片`,
    quickFaqsTitle: "你可能的疑问",
    quickFaqs: [
      { q: "合同期限多久？", a: "65天装修期 + 卖房期，写进合同。" },
      { q: "资金怎么监管？", a: "装修公司全额垫资，业主不出资，资金流向写进合同。" },
      { q: "装修质量怎么约定？", a: "装修方案需业主确认，材料清单透明。" },
      { q: "线上预审和最终约定价什么关系？", a: "线上预审只给初步判断。上门看房结合实际状况后，再商定写进合同的约定价格，你有一票否决权。" },
    ],
    quickFaqsMore: "查看更多疑问",
    riskNote:
      "* 美房宝不承诺保底收购。合同约定的是“未售出则装修免费赠送”，而非“公司按约定价格收购你的房产”。",
  },

  valuationAction: {
    communityRequired: "小区名称不能为空",
    submitFailed: "提交失败",
    phoneRequired: "手机号不能为空",
    phoneInvalid: "手机号格式不正确",
    phoneSubmitFailed: "保存失败",
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
    floorPlanTitle: "户型图",
    systemEstimate: {
      title: "初步估值",
      priceLabel: "初步估值：",
      pending: "预审中，请耐心等待...",
      unit: "万",
    },
  },

  projects: {
    unknownCommunity: "未知小区",
    valueProposition:
      "美房宝，每一套房子都值得被认真对待，坚持做品牌二手房。精选好房，匠心设计，严选好材，专业服务。",
    shareFallback: "房源",
    linkCopied: "链接已复制到剪贴板",
    shareFailed: "分享失败，请手动复制链接",
    backAria: "返回上一页",
    shareAria: "分享房源",
    renovationProcess: "改造过程",
    viewFullTimeline: "查看完整时间轴",
    collapseTimeline: "收起时间轴",
    photoCount: (n: number) => `${n}张照片`,
    noPhotos: "暂无图片",
    completedOn: (date: string) => `完成于 ${date}`,
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
