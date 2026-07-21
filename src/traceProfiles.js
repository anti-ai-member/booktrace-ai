export const TRACE_PROFILES = [
  {
    id: "history",
    match: /历史|纪实|传记|军事|近现代|history|biography|military/i,
    category: "历史纪实 / 传记",
    anchors: [
      anchor("people", "核心人物", "持续影响主线行动、决策或关系变化的自然人", "只收录影响读者理解主线的人物，背景提及的人不收录", 6, 10),
      anchor("organizations", "组织 / 阵营", "推动行动、冲突、协作或隶属关系的集体主体", "军队、政党、政府、机构进入组织，不进入人物", 6, 12),
      anchor("places", "关键地点", "主线行动、冲突、迁移、会合或决策发生的空间", "籍贯、出生地、顺带地名、出版地不收录", 6, 12),
      anchor("timeline", "时间线", "推动主线进展的时间节点和事件", "不要人物履历日期、出版信息、背景类比日期", 8, 16),
      anchor("events", "关键事件", "造成局势变化、关系变化或认知变化的事件", "普通描写和背景说明不收录", 8, 16),
      anchor("relationships", "关系变化", "人物、组织、事件之间可由原文证明的关系", "没有直接证据的关系不收录", 6, 12),
    ],
  },
  {
    id: "fiction",
    match: /小说|文学|情感|romance|fiction|literature/i,
    category: "小说 / 文学",
    anchors: [
      anchor("people", "主要人物", "推动情节或情感变化的角色", "路人、一次性背景人物不收录", 6, 12),
      anchor("relationships", "人物关系", "影响情节理解的人物关系和关系变化", "没有冲突、协作或情感变化的弱关系不收录", 6, 12),
      anchor("plot", "情节转折", "推动故事方向变化的行动、发现、决定或冲突", "普通场景描写不收录", 8, 16),
      anchor("scenes", "场景 / 地点", "承载关键情节或情绪的场景", "只作为背景出现的地点不收录", 5, 10),
      anchor("motifs", "伏笔 / 意象", "后续可能回收或反复出现的线索、物件、意象", "装饰性描写不收录", 5, 10),
    ],
  },
  {
    id: "mystery",
    match: /悬疑|推理|案件|mystery|detective|crime/i,
    category: "悬疑 / 推理",
    anchors: [
      anchor("people", "涉案人物", "嫌疑人、目击者、调查者或关键关系人", "纯背景人物不收录", 8, 16),
      anchor("clues", "线索", "能改变推理方向的信息、物件或异常", "无法指向案件的问题不收录", 10, 20),
      anchor("evidence", "证据", "原文中可核验的证据、证词、现场信息", "猜测不作为证据", 8, 16),
      anchor("timeline", "时间顺序", "案发、发现、行动和证词中的时间节点", "无事件承载的日期不收录", 8, 16),
      anchor("contradictions", "矛盾点", "证词、行为或事实之间的冲突", "没有原文支撑的不收录", 6, 12),
    ],
  },
  {
    id: "science",
    match: /科普|自然科学|科学|science|popular science/i,
    category: "科普 / 自然科学",
    anchors: [
      anchor("concepts", "核心概念", "理解本章知识骨架必须记住的概念", "只出现但没有解释或作用的术语不收录", 7, 14),
      anchor("definitions", "定义", "作者明确解释的定义或边界", "缺少解释的名词不收录", 6, 12),
      anchor("mechanisms", "因果机制", "解释为什么发生、如何运作的机制链", "单个事实不强行写成机制", 6, 12),
      anchor("experiments", "实验 / 观察", "支撑论点的实验、观察、证据", "装饰性例子不收录", 5, 10),
      anchor("conclusions", "结论", "本节形成的核心判断或知识结论", "不要泛泛总结", 5, 10),
      anchor("analogies", "类比", "帮助理解抽象概念的重要类比", "一次性修辞不收录", 4, 8),
    ],
  },
  {
    id: "business",
    match: /商业|管理|经济|金融|business|management|economics|finance/i,
    category: "商业 / 管理",
    anchors: [
      anchor("frameworks", "核心框架", "作者用于组织问题的模型、框架或方法论", "只收录可复用框架", 6, 12),
      anchor("cases", "案例", "支撑观点或展示决策后果的案例", "无解释作用的公司名不收录", 6, 12),
      anchor("decisions", "决策", "关键选择、取舍和策略变化", "普通动作不收录", 6, 12),
      anchor("metrics", "指标", "影响判断的数字、指标、变量", "孤立数字不收录", 5, 10),
      anchor("actions", "行动建议", "读者可应用的方法、步骤、原则", "口号式表达不收录", 5, 10),
    ],
  },
  {
    id: "philosophy",
    match: /哲学|宗教|思想|philosophy|religion|thought/i,
    category: "哲学 / 宗教",
    anchors: [
      anchor("propositions", "核心命题", "作者提出或讨论的关键判断", "只收录影响论证理解的命题", 7, 14),
      anchor("concepts", "概念", "论证中承担结构作用的概念", "术语堆砌不收录", 7, 14),
      anchor("arguments", "论证链", "从前提到结论的推理结构", "没有因果/推理关系的不收录", 6, 12),
      anchor("objections", "反驳对象", "作者回应、批判或区分的观点", "轻微提及不收录", 5, 10),
      anchor("sources", "出处", "关键原典、引用或思想来源", "无解释作用的出处不收录", 5, 10),
    ],
  },
  {
    id: "technology",
    match: /技术|编程|计算机|软件|technology|programming|computer|software/i,
    category: "技术 / 编程",
    anchors: [
      anchor("concepts", "核心概念", "理解技术主题所需的概念", "不影响后续实践的名词不收录", 7, 14),
      anchor("apis", "API / 模块", "读者后续会使用或回忆的接口、模块、命令", "一次性文件名不收录", 7, 14),
      anchor("flows", "流程", "配置、调用、执行、排错流程", "无顺序关系的不收录", 6, 12),
      anchor("examples", "代码示例", "能说明概念或模式的代码片段", "纯展示代码不收录", 5, 10),
      anchor("pitfalls", "常见问题", "错误、限制、坑点和排查线索", "过于局部的问题不收录", 5, 10),
    ],
  },
  {
    id: "learning",
    match: /教材|学习|教辅|课程|textbook|learning|course/i,
    category: "教材 / 学习资料",
    anchors: [
      anchor("knowledge", "知识点", "本节需要掌握的知识单元", "只收录影响后续理解的知识点", 8, 16),
      anchor("definitions", "定义", "明确给出的概念定义", "不完整解释不收录为定义", 7, 14),
      anchor("formulas", "公式", "需要记忆或使用的公式、定理、规则", "无使用场景的符号不收录", 6, 12),
      anchor("examples", "例题", "说明方法或易错点的例题", "普通练习不收录", 5, 10),
      anchor("prerequisites", "前置知识", "理解当前内容必须回忆的旧知识", "泛泛背景不收录", 5, 10),
    ],
  },
  {
    id: "general",
    match: /.*/,
    category: "通用阅读",
    anchors: [
      anchor("keypoints", "关键点", "影响理解和回忆的核心信息", "零碎背景不收录", 8, 16),
      anchor("concepts", "概念 / 术语", "需要反复回忆的名词和定义", "只出现一次不收录", 6, 12),
      anchor("events", "事件 / 变化", "推动内容发展的行动、变化或结论", "普通描述不收录", 6, 12),
      anchor("evidence", "原文证据", "支撑关键点的原文依据", "没有证据不收录", 8, 16),
    ],
  },
];

export function resolveTraceProfile(bookType = "", facets = []) {
  const text = `${bookType || ""} ${(facets || []).join(" ")}`;
  return TRACE_PROFILES.find((profile) => profile.match.test(text)) || TRACE_PROFILES.at(-1);
}

export function traceProfileForPrompt(profile) {
  const selected = profile || TRACE_PROFILES.at(-1);
  return {
    id: selected.id,
    category: selected.category,
    strategy: "只提取最能帮助读者回忆和理解后续内容的高影响 80% 记忆锚点；宁可少而准，不做百科式穷举。",
    anchors: selected.anchors,
  };
}

function anchor(id, label, purpose, discardRule, maxPrimary = 6, maxSecondary = 12) {
  return { id, label, purpose, discardRule, maxPrimary, maxSecondary };
}
