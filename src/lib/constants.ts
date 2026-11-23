export type CategoryKey =
  | "YOGA"
  | "OUTDOOR"
  | "HIKING"
  | "BOARDGAME"
  | "RUNNING"
  | "FOOD"
  | "MUSIC"
  | "TECH"
  | "AI"
  | "PET"
  | "READING"
  | "HANFU"
  | "TRAVEL"
  | "HIFI"
  | "CYCLING"
  | "ESPORTS"
  | "FITNESS"
  | "DANCE"
  | "SKI"
  | "SURF"
  | "PARENTING"
  | "PSYCHOLOGY"
  | "TCM"
  | "CERT"
  | "CHARITY"
  | "SECONDHAND"
  | "WELFARE"
  | "WOMEN"
  | "BADMINTON"
  | "OTHER";

export type CategoryMeta = {
  key: CategoryKey;
  label: string;
  emoji: string;
  /** 卡片封面渐变 */
  from: string;
  to: string;
  desc: string;
};

export const CATEGORIES: Record<CategoryKey, CategoryMeta> = {
  YOGA: {
    key: "YOGA",
    label: "瑜伽派",
    emoji: "🧘",
    from: "#FDE68A",
    to: "#F97316",
    desc: "垫子一铺，卷完就练",
  },
  OUTDOOR: {
    key: "OUTDOOR",
    label: "户外派",
    emoji: "⛺",
    from: "#A7F3D0",
    to: "#059669",
    desc: "周末不扎营，等于没周末",
  },
  HIKING: {
    key: "HIKING",
    label: "徒步派",
    emoji: "🥾",
    from: "#BBF7D0",
    to: "#15803D",
    desc: "把 KPI 走成海拔",
  },
  BOARDGAME: {
    key: "BOARDGAME",
    label: "桌游派",
    emoji: "🎲",
    from: "#C7D2FE",
    to: "#4F46E5",
    desc: "狼人杀到天亮",
  },
  RUNNING: {
    key: "RUNNING",
    label: "跑步派",
    emoji: "🏃",
    from: "#FECACA",
    to: "#DC2626",
    desc: "配速不谈，完赛就好",
  },
  FOOD: {
    key: "FOOD",
    label: "美食派",
    emoji: "🍜",
    from: "#FED7AA",
    to: "#EA580C",
    desc: "工位方圆三公里觅食",
  },
  MUSIC: {
    key: "MUSIC",
    label: "音乐派",
    emoji: "🎧",
    from: "#DDD6FE",
    to: "#7C3AED",
    desc: "排练室比会议室好待",
  },
  TECH: {
    key: "TECH",
    label: "技术派",
    emoji: "🧪",
    from: "#BAE6FD",
    to: "#0284C7",
    desc: "离职了也要聊架构",
  },
  AI: {
    key: "AI",
    label: "AI派",
    emoji: "🤖",
    from: "#A5B4FC",
    to: "#312E81",
    desc: "把 AI 用起来，别只收藏提示词",
  },
  PET: {
    key: "PET",
    label: "宠物派",
    emoji: "🐕",
    from: "#FBCFE8",
    to: "#DB2777",
    desc: "晒猫遛狗，互相帮忙寄养",
  },
  READING: {
    key: "READING",
    label: "读书派",
    emoji: "📚",
    from: "#E9D5FF",
    to: "#9333EA",
    desc: "一年 12 本，不卷页数",
  },
  HANFU: {
    key: "HANFU",
    label: "汉服派",
    emoji: "👘",
    from: "#F3C3CB",
    to: "#7B2D3B",
    desc: "同去雅集，把汉服穿出门",
  },
  TRAVEL: {
    key: "TRAVEL",
    label: "旅行派",
    emoji: "✈️",
    from: "#A5F3FC",
    to: "#0891B2",
    desc: "攒够假期就出发，攻略互换",
  },
  HIFI: {
    key: "HIFI",
    label: "HIFI派",
    emoji: "🔊",
    from: "#E7E5E4",
    to: "#57534E",
    desc: "耳机音箱线材，玄学也认真聊",
  },
  CYCLING: {
    key: "CYCLING",
    label: "骑行派",
    emoji: "🚴",
    from: "#D9F99D",
    to: "#4D7C0F",
    desc: "下班绕两圈，比开会有用",
  },
  ESPORTS: {
    key: "ESPORTS",
    label: "电竞派",
    emoji: "🎮",
    from: "#C4B5FD",
    to: "#5B21B6",
    desc: "开黑缺人，喊一声就上",
  },
  FITNESS: {
    key: "FITNESS",
    label: "健身派",
    emoji: "🏋️",
    from: "#FEF3C7",
    to: "#A16207",
    desc: "撸铁打卡，互相盯着别偷懒",
  },
  DANCE: {
    key: "DANCE",
    label: "舞蹈派",
    emoji: "💃",
    from: "#F9A8D4",
    to: "#BE123C",
    desc: "下班进练室，出汗再回家",
  },
  SKI: {
    key: "SKI",
    label: "滑雪派",
    emoji: "⛷️",
    from: "#DBEAFE",
    to: "#1E3A8A",
    desc: "雪季开板，一起上雪道",
  },
  SURF: {
    key: "SURF",
    label: "冲浪派",
    emoji: "🏄",
    from: "#7DD3FC",
    to: "#1D4ED8",
    desc: "等一个浪，晒黑也值",
  },
  PARENTING: {
    key: "PARENTING",
    label: "亲子派",
    emoji: "👨‍👩‍👧",
    from: "#FECDD3",
    to: "#E11D48",
    desc: "遛娃搭子，周末不孤单",
  },
  PSYCHOLOGY: {
    key: "PSYCHOLOGY",
    label: "心理学派",
    emoji: "🧠",
    from: "#F5D0FE",
    to: "#A21CAF",
    desc: "情绪也要做复盘",
  },
  TCM: {
    key: "TCM",
    label: "中医派",
    emoji: "🌿",
    from: "#DCFCE7",
    to: "#166534",
    desc: "望闻问切，也聊节气",
  },
  CERT: {
    key: "CERT",
    label: "考证派",
    emoji: "📝",
    from: "#E0E7FF",
    to: "#3730A3",
    desc: "一起备考，互相盯进度",
  },
  CHARITY: {
    key: "CHARITY",
    label: "公益派",
    emoji: "🤝",
    from: "#FEE2E2",
    to: "#B91C1C",
    desc: "周末做点有用的事",
  },
  SECONDHAND: {
    key: "SECONDHAND",
    label: "二手派",
    emoji: "♻️",
    from: "#FEF3C7",
    to: "#B45309",
    desc: "闲置流转，好物不闲置",
  },
  WELFARE: {
    key: "WELFARE",
    label: "福利派",
    emoji: "🎁",
    from: "#FED7AA",
    to: "#C2410C",
    desc: "公司羊毛，一起薅明白",
  },
  WOMEN: {
    key: "WOMEN",
    label: "女性派",
    emoji: "🌸",
    from: "#FBCFE8",
    to: "#DB2777",
    desc: "姐妹围炉，聊成长也聊生活",
  },
  BADMINTON: {
    key: "BADMINTON",
    label: "羽毛球派",
    emoji: "🏸",
    from: "#BAF2FE",
    to: "#0D9488",
    desc: "下班约球，双打缺你一个",
  },
  OTHER: {
    key: "OTHER",
    label: "其他",
    emoji: "✨",
    from: "#E2E8F0",
    to: "#64748B",
    desc: "不好归类的，都放这儿",
  },
};

export const CATEGORY_LIST = Object.values(CATEGORIES);

/** 派系分享宣传召唤语：「喊你回来…」的后半句，按派系类别生成 */
export const CATEGORY_SHARE_CALL: Partial<Record<CategoryKey, string>> = {
  YOGA: "一起压腿流汗",
  OUTDOOR: "一起扎营看星星",
  HIKING: "一起把 KPI 走成海拔",
  BOARDGAME: "一起杀两盘狼人",
  RUNNING: "一起刷个五公里",
  FOOD: "一起干饭",
  MUSIC: "一起开演唱会",
  TECH: "一起聊技术",
  AI: "一起把 AI 玩明白",
  PET: "一起晒毛孩子",
  READING: "一起读完那本囤积的书",
  HANFU: "一起穿汉服逛公园",
  TRAVEL: "一起攒假期出发",
  HIFI: "一起烧器材",
  CYCLING: "一起骑行刷街",
  ESPORTS: "一起开黑",
  FITNESS: "一起撸铁",
  DANCE: "一起跳舞",
  SKI: "一起上雪道",
  SURF: "一起追浪",
  PARENTING: "一起遛娃",
  PSYCHOLOGY: "一起聊聊心事",
  TCM: "一起调理身体",
  CERT: "一起考证上岸",
  CHARITY: "一起做点有意义的事",
  SECONDHAND: "一起淘好物",
  WELFARE: "一起薅公司福利",
  WOMEN: "一起聊聊成长与心事",
  BADMINTON: "一起约场球",
  OTHER: "一起玩",
};

/** 生成派系分享宣传口号，如：离职不离圈，「瑜伽派」喊你回来一起压腿流汗！ */
export function factionShareSlogan(name: string, category: string): string {
  const call = CATEGORY_SHARE_CALL[category as CategoryKey] ?? "一起玩";
  return `离职不离圈，「${name}」喊你回来${call}！`;
}

/** 活动分享口号：带上活动标题与时间地点，让收到链接的人不看页面也知道要去做什么 */
export function activityShareSlogan(
  title: string,
  factionName: string,
  category: string,
  timeText: string,
  location: string,
): string {
  const call = CATEGORY_SHARE_CALL[category as CategoryKey] ?? "一起玩";
  const detail = [timeText, location].filter(Boolean).join(" · ");
  return `「${factionName}」发起的活动「${title}」${detail ? `（${detail}）` : ""}，喊你回来${call}！`;
}

export function categoryOf(key: string): CategoryMeta {
  return CATEGORIES[key as CategoryKey] ?? CATEGORIES.TECH;
}

export const EMPLOYMENT_STATUS = {
  PENDING: { label: "审核中", tone: "warn" },
  VERIFIED: { label: "已认证", tone: "ok" },
  REJECTED: { label: "未通过", tone: "bad" },
} as const;

export const EMPLOYMENT_KIND = {
  ACTIVE: { label: "在职", short: "在职" },
  ALUMNI: { label: "离职校友", short: "离职" },
} as const;

export const FACTION_STATUS = {
  REVIEWING: { label: "筹备审核中", tone: "warn" },
  ACTIVE: { label: "运营中", tone: "ok" },
  ARCHIVED: { label: "已关闭", tone: "mute" },
} as const;

export const MEMBER_ROLE = {
  LEADER: { label: "派主", tone: "brand" },
  ADMIN: { label: "副派主", tone: "violet" },
  MEMBER: { label: "成员", tone: "mute" },
} as const;

export const MEMBER_STATUS = {
  ACTIVE: "已加入",
  PENDING: "待审批",
  LEFT: "已退出",
  REMOVED: "已移出",
} as const;

export const PLATFORM_NAME = "上十派";
export const PLATFORM_SLOGAN = "离职不离圈，兴趣不断线";
export const PLATFORM_DESC =
  "用企业邮箱或离职材料验证大厂身份，加入同厂同好者的兴趣派，把同事处成同好。";

/** 站内私信单条内容长度上限（字符） */
export const MESSAGE_MAX_LEN = 1000;

/**
 * 微信登录入口总开关（小程序 web-view 链路）。
 * 关闭时登录页不渲染微信按钮与注册/绑定面板，/api/wx-login 回跳也直接挡回落回登录页——
 * 只隐藏 UI 会留下可直达的免登录入口，两头都要吃这个开关。
 * 已有的 wechatOpenid 绑定数据不受影响，重新置 true 即可恢复整条链路。
 */
export const WX_LOGIN_ENABLED = false;
