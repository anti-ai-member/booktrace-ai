export const UNIVERSAL_SKILLS = [
  { id: "source", name: "原文定位", detail: "所有结论回到原文", unlocked: true },
  { id: "note", name: "随读笔记", detail: "记录选中的想法", unlocked: true },
  { id: "bookmark", name: "书签", detail: "标记阅读位置", unlocked: true },
  { id: "recall", name: "上下文回忆", detail: "回顾已读内容", unlocked: true },
];

const DOMAIN_CONFIG = {
  military: {
    name: "军事 / 战争", accent: "military",
    badges: [["伍长", "完成首次有效阅读", 1], ["队正", "累计阅读 90 分钟", 90], ["校尉", "完成 12 条深度互动", 12], ["都统", "解锁两项专属能力", 2], ["将军", "累计阅读 16 小时", 960]],
    skills: [["指挥链", "查看人物与部队的指挥关系", 80], ["战场时间线", "按行动顺序回看关键战役", 180], ["行军路线", "汇总主线行动地点与迁移", 320], ["战役推演", "梳理关键决策与结果", 500]],
  },
  history: {
    name: "历史纪实 / 传记", accent: "history",
    badges: [["校书郎", "完成首次有效阅读", 1], ["秘书省正字", "完成 20 次原文查证", 20], ["著作佐郎", "写下 10 条笔记", 10], ["集贤校理", "解锁两项专属能力", 2], ["直秘阁", "累计阅读 16 小时", 960]],
    skills: [["人物关系", "查看有证据的人物与组织关系", 80], ["正史时间线", "按年代整理主线事件", 180], ["馆阁组织图", "阅读指挥与隶属层级", 320], ["史事因果链", "串联关键决策与结果", 500]],
  },
  science: {
    name: "科普 / 自然科学", accent: "science",
    badges: [["观察员", "完成首次有效阅读", 1], ["实验员", "完成 20 次原文查证", 20], ["研究员", "写下 10 条笔记", 10], ["学者", "解锁两项专属能力", 2], ["发现者", "累计阅读 16 小时", 960]],
    skills: [["概念卡", "提炼核心概念与定义", 80], ["前置知识图", "查看概念之间的依赖", 180], ["实验链", "复盘假设、方法与结论", 320], ["易错辨析", "标记常见误解与证据", 500]],
  },
  technology: {
    name: "技术 / 编程", accent: "technology",
    badges: [["见习工程师", "完成首次有效阅读", 1], ["工程师", "完成 20 次原文查证", 20], ["架构师", "写下 10 条笔记", 10], ["系统设计师", "解锁两项专属能力", 2], ["技术主理人", "累计阅读 16 小时", 960]],
    skills: [["术语卡", "定位关键术语与定义", 80], ["流程图", "梳理系统实现流程", 180], ["依赖图", "查看模块与依赖关系", 320], ["排障路径", "整理问题、原因与方案", 500]],
  },
  fiction: {
    name: "小说 / 文学", accent: "fiction",
    badges: [["听书人", "完成首次有效阅读", 1], ["行旅者", "完成 20 次原文查证", 20], ["叙事者", "写下 10 条笔记", 10], ["掌卷人", "解锁两项专属能力", 2], ["故事守望者", "累计阅读 16 小时", 960]],
    skills: [["人物卡", "记录主次角色与属性", 80], ["情节线", "整理已读叙事推进", 180], ["阵营关系", "查看人物关系与冲突", 320], ["主题意象", "回顾反复出现的母题", 500]],
  },
  business: {
    name: "商业 / 管理", accent: "business",
    badges: [["观察员", "完成首次有效阅读", 1], ["分析师", "完成 20 次原文查证", 20], ["策略师", "写下 10 条笔记", 10], ["经营者", "解锁两项专属能力", 2], ["决策者", "累计阅读 16 小时", 960]],
    skills: [["案例卡", "提炼案例的情境与结果", 80], ["决策链", "查看决策依据与影响", 180], ["指标矩阵", "关联指标、主体与结果", 320], ["经营复盘", "归纳可复用的框架", 500]],
  },
  thought: {
    name: "人文 / 社科", accent: "thought",
    badges: [["读经生", "完成首次有效阅读", 1], ["辨章者", "完成 20 次原文查证", 20], ["述理者", "写下 10 条笔记", 10], ["通儒", "解锁两项专属能力", 2], ["论衡者", "累计阅读 16 小时", 960]],
    skills: [["概念脉络", "提炼核心概念与定义", 80], ["论证链", "查看主张、依据与反驳", 180], ["思想谱系", "整理人物、流派与观点", 320], ["原典互证", "回到关键引用与出处", 500]],
  },
  learning: {
    name: "教材 / 学习资料", accent: "learning",
    badges: [["习读生", "完成首次有效阅读", 1], ["解题者", "完成 20 次原文查证", 20], ["课业簿", "写下 10 条笔记", 10], ["讲习者", "解锁两项专属能力", 2], ["学贯者", "累计阅读 16 小时", 960]],
    skills: [["知识点卡", "标记定义与核心知识", 80], ["前置知识", "查看知识依赖关系", 180], ["易错辨析", "整理容易混淆的概念", 320], ["练习回顾", "汇总已读阶段的练习线索", 500]],
  },
  travel: {
    name: "旅行 / 地理", accent: "travel",
    badges: [["行脚客", "完成首次有效阅读", 1], ["路书吏", "完成 20 次原文查证", 20], ["山川记", "写下 10 条笔记", 10], ["舆图使", "解锁两项专属能力", 2], ["万里行人", "累计阅读 16 小时", 960]],
    skills: [["地点卡", "整理主线地点与特征", 80], ["路线图", "查看行进顺序与路径", 180], ["地理脉络", "关联环境、历史与体验", 320], ["行程回顾", "汇总实用信息与提醒", 500]],
  },
  arts: {
    name: "艺术 / 古典文学", accent: "arts",
    badges: [["观艺者", "完成首次有效阅读", 1], ["赏鉴者", "完成 20 次原文查证", 20], ["题跋人", "写下 10 条笔记", 10], ["艺苑校理", "解锁两项专属能力", 2], ["藏珍者", "累计阅读 16 小时", 960]],
    skills: [["作品卡", "定位作品与作者", 80], ["意象索引", "回看反复出现的意象", 180], ["风格关联", "整理技法、时期与流派", 320], ["典故回环", "追溯出处与互文关系", 500]],
  },
  default: {
    name: "通识阅读", accent: "default",
    badges: [["读书人", "完成首次有效阅读", 1], ["校读者", "完成 20 次原文查证", 20], ["注释者", "写下 10 条笔记", 10], ["研习者", "解锁两项专属能力", 2], ["藏书家", "累计阅读 16 小时", 960]],
    skills: [["重点索引", "回看已读主线内容", 80], ["主题脉络", "整理核心主题与概念", 180], ["关联视图", "查看主线实体之间的联系", 320], ["阅读回顾", "汇总已读阶段收获", 500]],
  },
};

export function resolveSkillDomain(bookType, categories = []) {
  const value = `${bookType || ""} ${categories.join(" ")}`;
  if (/军事|战争|战役/.test(value)) return "military";
  if (/历史|传记/.test(value)) return "history";
  if (/科普|自然科学/.test(value)) return "science";
  if (/技术|编程/.test(value)) return "technology";
  if (/小说|文学|悬疑|科幻|言情/.test(value)) return "fiction";
  if (/商业|管理|经济|金融/.test(value)) return "business";
  if (/社科|政治|法律|哲学|宗教/.test(value)) return "thought";
  if (/教材|学习资料|心理|成长/.test(value)) return "learning";
  if (/旅行|地理/.test(value)) return "travel";
  if (/艺术|设计|影视|诗歌|古典/.test(value)) return "arts";
  return "default";
}

export function getDomainConfig(domain) {
  return DOMAIN_CONFIG[domain] || DOMAIN_CONFIG.default;
}

export function createReadingProgress() {
  return { totalSeconds: 0, totalPages: 0, globalXp: 0, domains: {}, evidenceJumps: 0, bookmarks: 0, notes: 0 };
}

export function domainProgress(progress, domain) {
  return progress.domains?.[domain] || { seconds: 0, pages: 0, xp: 0, evidenceJumps: 0, bookmarks: 0, notes: 0 };
}

export function unlockedSpecialSkills(progress, domain) {
  const value = domainProgress(progress, domain);
  return getDomainConfig(domain).skills.filter(([, , requirement]) => value.xp >= requirement);
}

export function earnedBadges(progress, domain) {
  const value = domainProgress(progress, domain);
  const unlocked = unlockedSpecialSkills(progress, domain).length;
  return getDomainConfig(domain).badges.filter(([, , requirement], index) => {
    if (index === 0) return value.seconds >= 60;
    if (index === 1) return value.evidenceJumps >= requirement;
    if (index === 2) return value.notes >= requirement;
    if (index === 3) return unlocked >= requirement;
    return value.seconds >= requirement * 60;
  });
}
