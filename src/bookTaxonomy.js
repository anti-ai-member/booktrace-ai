export const BOOK_TYPES = [
  { id: "history", name: "历史纪实 / 传记", facets: ["人物", "组织", "地点", "时间线", "关键事件", "原文证据"] },
  { id: "fiction", name: "小说 / 文学", facets: ["人物", "人物关系", "场景", "情节线", "章节回顾", "主题意象"] },
  { id: "mystery", name: "悬疑 / 推理", facets: ["人物", "案件", "线索", "证据", "地点", "时间线"] },
  { id: "speculative", name: "科幻 / 奇幻", facets: ["人物", "阵营", "世界设定", "地点", "术语", "事件线"] },
  { id: "romance", name: "言情 / 情感小说", facets: ["人物", "关系变化", "情感节点", "场景", "冲突与转折"] },
  { id: "business", name: "商业 / 管理", facets: ["概念", "公司与人物", "案例", "框架", "决策", "数据指标"] },
  { id: "economics", name: "经济 / 金融", facets: ["概念", "指标", "机构", "政策", "案例", "因果关系"] },
  { id: "social", name: "社科 / 政治 / 法律", facets: ["概念", "理论", "人物", "组织", "案例", "论证", "出处"] },
  { id: "philosophy", name: "哲学 / 宗教", facets: ["概念", "命题", "思想家", "流派", "论证链", "原典出处"] },
  { id: "science", name: "科普 / 自然科学", facets: ["概念", "术语", "规律", "实验", "公式", "科学家", "证据"] },
  { id: "technology", name: "技术 / 编程", facets: ["概念", "术语", "架构", "流程", "依赖", "代码示例", "常见问题"] },
  { id: "textbook", name: "教材 / 学习资料", facets: ["知识点", "定义", "公式", "例题", "易错点", "练习", "前置知识"] },
  { id: "growth", name: "心理 / 成长", facets: ["概念", "方法", "练习", "情境案例", "行动清单", "关键提问"] },
  { id: "travel", name: "旅行 / 地理", facets: ["地点", "路线", "地理特征", "历史背景", "体验", "实用信息"] },
  { id: "arts", name: "艺术 / 设计 / 影视", facets: ["作品", "作者", "流派", "技法", "时期", "风格", "作品关联"] },
  { id: "classics", name: "诗歌 / 古典文学", facets: ["作者", "篇章", "意象", "典故", "注释", "版本", "主题"] },
];


export function findBookType(name) {
  return BOOK_TYPES.find((type) => type.name === name) || BOOK_TYPES[0];
}
