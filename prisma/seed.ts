import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { colorFromString } from "../src/lib/utils";

const prisma = new PrismaClient();

type SeedPost = {
  content: string;
  hours: number;
  title?: string;
  kind?: string;
  pinned?: boolean;
};

const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000);
const daysAgo = (d: number) => new Date(Date.now() - d * 24 * 60 * 60 * 1000);

const COMPANIES = [
  {
    key: "alibaba",
    name: "阿里巴巴",
    shortName: "阿里",
    domains: "alibaba-inc.com,alibaba.com,taobao.com",
    industry: "电商 / 云",
    color: "#FF6A00",
    logoText: "阿",
  },
  {
    key: "antgroup",
    name: "蚂蚁集团",
    shortName: "蚂蚁",
    domains: "antgroup.com,alipay.com",
    industry: "金融科技",
    color: "#1677FF",
    logoText: "蚂",
  },
  {
    key: "tencent",
    name: "腾讯",
    shortName: "腾讯",
    domains: "tencent.com,tencentmusic.com",
    industry: "社交 / 游戏",
    color: "#1F6FEB",
    logoText: "腾",
  },
  {
    key: "bytedance",
    name: "字节跳动",
    shortName: "字节",
    domains: "bytedance.com,douyin.com,toutiao.com",
    industry: "内容 / 短视频",
    color: "#14110F",
    logoText: "字",
  },
  {
    key: "meituan",
    name: "美团",
    shortName: "美团",
    domains: "meituan.com",
    industry: "本地生活",
    color: "#FFB400",
    logoText: "美",
  },
  {
    key: "xiaomi",
    name: "小米",
    shortName: "小米",
    domains: "xiaomi.com,mi.com",
    industry: "智能硬件",
    color: "#FF6900",
    logoText: "米",
  },
  {
    key: "kuaishou",
    name: "快手",
    shortName: "快手",
    domains: "kuaishou.com",
    industry: "短视频 / 直播",
    color: "#FF4C00",
    logoText: "快",
  },
  {
    key: "netease",
    name: "网易",
    shortName: "网易",
    domains: "netease.com,corp.netease.com",
    industry: "游戏 / 音乐",
    color: "#E60012",
    logoText: "网",
  },
  {
    key: "jd",
    name: "京东",
    shortName: "京东",
    domains: "jd.com,jdjr.com",
    industry: "电商 / 物流",
    color: "#E1251B",
    logoText: "京",
  },
  {
    key: "huawei",
    name: "华为",
    shortName: "华为",
    domains: "huawei.com,hisilicon.com",
    industry: "硬件 / 云",
    color: "#C7000B",
    logoText: "华",
  },
  {
    key: "pinduoduo",
    name: "拼多多",
    shortName: "拼多多",
    domains: "pinduoduo.com",
    industry: "电商",
    color: "#E22E1F",
    logoText: "拼",
  },
  {
    key: "didi",
    name: "滴滴",
    shortName: "滴滴",
    domains: "didiglobal.com,didi-gs.com",
    industry: "出行",
    color: "#FF7F41",
    logoText: "滴",
  },
];

const NAMES = [
  "沈舟",
  "白露",
  "程野",
  "许南",
  "安然",
  "贺川",
  "林深",
  "苏木",
  "顾言",
  "叶知",
  "江晚",
  "洛川",
  "夏颜",
  "柏舟",
  "祝星",
  "迟野",
  "荀欢",
  "柳絮",
  "温故",
  "宋屿",
];

const LEAD_USERS = [
  { email: "zhixia@alibaba-inc.com", nickname: "林知夏", company: "alibaba", kind: "ACTIVE", title: "淘天集团 · 用户运营", years: [2019, null], bio: "阿里瑜伽社老派主，周三晚固定开课" },
  { email: "shenzhou@alibaba-inc.com", nickname: "沈舟", company: "alibaba", kind: "ACTIVE", title: "本地生活 · 产品", years: [2021, null], bio: "杭州觅食地图作者" },
  { email: "bailu@alibaba-inc.com", nickname: "白露", company: "alibaba", kind: "ACTIVE", title: "阿里云 · 设计", years: [2020, null], bio: "工位植物养殖失败选手" },
  { email: "gunan@tencent.com", nickname: "顾南", company: "tencent", kind: "ALUMNI", title: "IEG · 游戏策划", years: [2018, 2024], bio: "离职后仍带鹏城徒步派，走完深圳十峰" },
  { email: "zhouyu@bytedance.com", nickname: "周屿", company: "bytedance", kind: "ACTIVE", title: "抖音 · 数据分析", years: [2022, null], bio: "桌游局永远的组织者" },
  { email: "chenxi@meituan.com", nickname: "陈曦", company: "meituan", kind: "ACTIVE", title: "到店事业群 · 运营", years: [2020, null], bio: "望京干饭派创始人，人均探过 60 家" },
  { email: "xujing@xiaomi.com", nickname: "许静", company: "xiaomi", kind: "ACTIVE", title: "手机部 · 硬件产品", years: [2019, null], bio: "全马 3 小时 42 分" },
  { email: "luoyi@kuaishou.com", nickname: "罗奕", company: "kuaishou", kind: "ACTIVE", title: "商业化 · 销售", years: [2021, null], bio: "露营装备党，周末不在家就在山里" },
  { email: "suqing@netease.com", nickname: "苏晴", company: "netease", kind: "ACTIVE", title: "网易云音乐 · 内容", years: [2020, null], bio: "乐队鼓手，排练室常驻" },
  { email: "wenya@huawei.com", nickname: "温雅", company: "huawei", kind: "ACTIVE", title: "2012 实验室 · 研发", years: [2018, null], bio: "爱聊分布式，也爱聊咖啡" },
  { email: "hanlei@jd.com", nickname: "韩磊", company: "jd", kind: "ALUMNI", title: "京东物流 · 算法", years: [2017, 2025], bio: "离职后开始认真徒步" },
  { email: "tangke@pinduoduo.com", nickname: "唐可", company: "pinduoduo", kind: "ALUMNI", title: "多多买菜 · 运营", years: [2021, 2025], bio: "两只猫的铲屎官" },
  { email: "liangyu@didi-gs.com", nickname: "梁宇", company: "didi", kind: "ACTIVE", title: "网约车 · 策略", years: [2021, null], bio: "夜骑回龙观到奥森" },
  { email: "mayi@163.com", nickname: "马毅", company: "bytedance", kind: "ALUMNI", title: "飞书 · 商业化", years: [2020, 2024], bio: "刚提交离职材料，等待审核" },
  { email: "yeqing@qq.com", nickname: "叶青", company: "alibaba", kind: "ALUMNI", title: "国际站 · 运营", years: [2019, 2024], bio: "材料补交中" },
];

/**
 * 26 个基础派：全部 leaderId=null（界面展示「招募派主」）、status ACTIVE、
 * joinMode OPEN、allowCrossCompany=true。
 * slug 用语义短 key，与 category 解耦；companyId 分散绑定 12 家公司（大厂各 2-3 个）。
 * leaderEmail 不是派主，而是「派主认证申请（LeaderApplication PENDING）」的申请人，
 * 必须同时是该派 ACTIVE 成员且在该派公司 VERIFIED（主循环会保证其成员归属）。
 * 帖子作者由主循环从该派 memberIds 轮转分配。
 */
const FACTION_SEEDS: {
  slug: string;
  company: string;
  category: string;
  emoji: string;
  name: string;
  tagline: string;
  description: string;
  members: number;
  leaderEmail?: string;
  /** 跨公司 PENDING 申请的来源公司（申请人从该公司 verified 池取，演示运营代批） */
  pendingFrom?: string;
  posts: SeedPost[];
}[] = [
  {
    slug: "yoga",
    company: "alibaba",
    category: "YOGA",
    emoji: "🧘",
    name: "瑜伽派",
    tagline: "垫子一铺，卷完就练",
    description:
      "下班后的瑜伽互助小组，每周固定两次基础流瑜伽，新人友好，不用会倒立。\n自带垫子和水就行，也欢迎离职的老同事回来蹭课，派主认证通过后恢复固定课程。",
    members: 8,
    leaderEmail: "zhixia@alibaba-inc.com",
    posts: [
      { title: "周三晚基础流瑜伽，自带垫子", content: "老规矩晚八点开练，新人友好，练完一起拉伸聊天。地点在评论区置顶。", kind: "ANNOUNCE", pinned: true, hours: 5 },
      { content: "肩颈序列真的救了我，久坐党强烈建议试试。", hours: 28 },
      { content: "这周谁能带一条备用垫子？我想下班直接过来。", hours: 50 },
      { content: "上次课后一起去吃了轻食，这周继续约吗？", hours: 76 },
    ],
  },
  {
    slug: "outdoor",
    company: "kuaishou",
    category: "OUTDOOR",
    emoji: "⛺",
    name: "户外派",
    tagline: "周末不扎营，等于没周末",
    description:
      "主打城市周边 2 小时车程内的露营与轻徒步。装备可以共享，第一次来不用买装备，拎包入住。\n每月一次过夜露营 + 一次一日轻露营，等一位认证派主把日程固定下来。",
    members: 7,
    leaderEmail: "luoyi@kuaishou.com",
    posts: [
      { title: "本月营地投票：延庆还是怀柔？", content: "A. 延庆玉渡山，风景好车程 2 小时；B. 怀柔雁栖湖，设施齐全适合新手。评论区投票，周五截止。", kind: "ANNOUNCE", pinned: true, hours: 18 },
      { content: "装备共享清单更新好了，帐篷还有两顶可以借。", hours: 44 },
      { content: "上次一日轻露营煮了三大锅关东煮，谁还没吃到？", hours: 90 },
    ],
  },
  {
    slug: "travel",
    company: "antgroup",
    category: "TRAVEL",
    emoji: "✈️",
    name: "旅行派",
    tagline: "攒够假期就出发，攻略互换",
    description:
      "攻略互换 + 结伴出行。年假怎么拼、周末去哪里，这里都有一手信息。\n国内小众路线和出境穷游都聊，欢迎带图带攻略来分享。",
    members: 5,
    posts: [
      { title: "国庆拼假攻略征集", content: "请两天假能凑出 11 天，评论区交换路线，我把去年的川西小环线整理出来。", kind: "ANNOUNCE", pinned: true, hours: 22 },
      { content: "有没有人五一想去泉州？蟳埔村拍照加古城徒步，找两个搭子。", hours: 60 },
    ],
  },
  {
    slug: "boardgame",
    company: "bytedance",
    category: "BOARDGAME",
    emoji: "🎲",
    name: "桌游派",
    tagline: "狼人杀到天亮",
    description:
      "每周五晚固定开局：狼人杀、阿瓦隆、璀璨宝石、卡坦岛都有，新人有教学局。\n欢迎自带游戏和零食，逻辑局与欢乐局五五开。",
    members: 8,
    leaderEmail: "zhouyu@bytedance.com",
    posts: [
      { title: "周五局：狼人杀 12 人标准局", content: "晚八点开局，已定 8 人还差 4，带嘴就行规则我讲。夜宵统一点披萨 AA。", kind: "ANNOUNCE", pinned: true, hours: 4 },
      { content: "推荐《行动代号》，6 人就能开，特别适合下班后一局定胜负。", hours: 30 },
      { content: "上局的新人预言家连查三狼，太强了。", hours: 55 },
      { content: "璀璨宝石缺人，周三晚有没有加一场的？", hours: 80 },
    ],
  },
  {
    slug: "hifi",
    company: "xiaomi",
    category: "HIFI",
    emoji: "🔊",
    name: "HIFI派",
    tagline: "耳机音箱线材，玄学也认真聊",
    description:
      "从入门耳塞到桌面音箱，理性讨论、拒绝盲狙。\n每月一次线下听音会，欢迎带自己的设备来 PK，玄学也要认真聊。",
    members: 4,
    posts: [
      { content: "入门头戴求推荐，预算 2000 以内，主要听流行人声。", hours: 20 },
      { content: "线材到底有没有用？我做了个盲听实验，结果在评论区。", hours: 66 },
    ],
  },
  {
    slug: "pet",
    company: "pinduoduo",
    category: "PET",
    emoji: "🐕",
    name: "宠物派",
    tagline: "晒猫遛狗，互相帮忙寄养",
    description:
      "宠物互助小组：晒猫、约遛狗、出差互相寄养。\n我们有宠物医院与寄养的靠谱清单，也组织过两次领养日。",
    members: 6,
    posts: [
      { content: "国庆要出差 5 天，有没有靠谱的上门喂养推荐？之前那家涨价了。", hours: 8 },
      { content: "整理了一份周边 24 小时宠物医院清单，需要的评论区扣 1。", hours: 45 },
      { content: "周末遛狗局，滨江步道走起，大型犬友好。", hours: 70 },
    ],
  },
  {
    slug: "cycling",
    company: "didi",
    category: "CYCLING",
    emoji: "🚴",
    name: "骑行派",
    tagline: "下班绕两圈，比开会有用",
    description:
      "城市夜骑与周末长线并行。工作日晚沿河骑 20-30 公里，周末偶尔刷山。\n有休闲组也有拉练组，按自己节奏来，头盔必须戴。",
    members: 6,
    posts: [
      { title: "本周三夜骑：奥森北园 30 公里", content: "晚七点半集合，均速 25 左右，收尾车已安排，头盔必戴。", kind: "ANNOUNCE", pinned: true, hours: 9 },
      { content: "新入了辆砾石车，周末有人一起去妙峰山试试吗？", hours: 40 },
      { content: "夜骑安全规范草案写在评论区，大家补充意见。", hours: 88 },
    ],
  },
  {
    slug: "esports",
    company: "tencent",
    category: "ESPORTS",
    emoji: "🎮",
    name: "电竞派",
    tagline: "开黑缺人，喊一声就上",
    description:
      "下班开黑固定车队，MOBA 与 FPS 双修，也组织内战赛。\n段位不重要，重要的是喊一声就有人上。",
    members: 7,
    posts: [
      { title: "周五内战：五排车队缺一", content: "晚上九点开打，语音必开，打完一起复盘（甩锅）。", kind: "ANNOUNCE", pinned: true, hours: 6 },
      { content: "新出的自走棋玩了吗？下班来两把正好。", hours: 35 },
      { content: "上周内战冠军队伍请求三连冠，不服来战。", hours: 92 },
    ],
  },
  {
    slug: "fitness",
    company: "huawei",
    category: "FITNESS",
    emoji: "🏋️",
    name: "健身派",
    tagline: "撸铁打卡，互相盯着别偷懒",
    description:
      "撸铁打卡互助小组，训练计划互相看，动作细节互相抠。\n每周三、六园区健身房团练，减脂与增肌都欢迎。",
    members: 5,
    posts: [
      { content: "打卡 Day 30：深蹲从空杆到 80 公斤，记录一下。", hours: 12 },
      { content: "有没有人一起报私教体验课？两人成团有折扣。", hours: 50 },
    ],
  },
  {
    slug: "dance",
    company: "bytedance",
    category: "DANCE",
    emoji: "💃",
    name: "舞蹈派",
    tagline: "下班进练室，出汗再回家",
    description:
      "爵士、K-pop、街舞都有人跳，每周两次包练室。\n零基础友好，先出汗再谈动作，年会节目也从这里出。",
    members: 4,
    posts: [
      { content: "周四练室已订好，学新编舞的来，零基础也收。", hours: 16 },
      { content: "上次翻跳的视频剪好了，链接在评论区，轻点喷。", hours: 58 },
    ],
  },
  {
    slug: "skate",
    company: "kuaishou",
    category: "SKI",
    emoji: "⛷️",
    name: "滑雪派",
    tagline: "摔了再爬，雪道见",
    description:
      "周边雪场拼团出发，新手从犁式刹车练起，老手刷夜场互相拍视频。\n护具别省，摔了再爬。",
    members: 4,
    posts: [
      { content: "周六早班雪场见，新手有老带新，护具别省。", hours: 26 },
      { content: "练了两周终于能犁式转弯不摔了，纪念一下。", hours: 72 },
    ],
  },
  {
    slug: "surf",
    company: "bytedance",
    category: "SURF",
    emoji: "🏄",
    name: "冲浪派",
    tagline: "等一个浪，晒黑也值",
    description:
      "深圳周边冲浪小队，大鹏与西涌为主据点。\n新手课 + 装备租赁攻略都有整理，等一个浪，晒黑也值。",
    members: 4,
    posts: [
      { content: "周末大鹏浪况预测 1.2 米，新手课正好，报名评论区接龙。", hours: 14 },
      { content: "防晒到底用物理还是化学？冲浪党来投票。", hours: 62 },
    ],
  },
  {
    slug: "reading",
    company: "tencent",
    category: "READING",
    emoji: "📚",
    name: "读书派",
    tagline: "一年 12 本，不卷页数",
    description:
      "每月一本共读，线上打卡 + 线下咖啡聊书。\n不卷页数不卷速度，读得开心最重要。",
    members: 6,
    leaderEmail: "gunan@tencent.com",
    posts: [
      { title: "本月共读：《置身事内》", content: "每天 20 页打卡，月底线下聊一次，读书笔记互相看。", kind: "ANNOUNCE", pinned: true, hours: 30 },
      { content: "上月的书单整理好了，需要电子版的评论区留邮箱。", hours: 52 },
      { content: "有没有人想组英文原版共读？难度中等那种。", hours: 96 },
    ],
  },
  {
    slug: "music",
    company: "netease",
    category: "MUSIC",
    emoji: "🎧",
    name: "音乐派",
    tagline: "排练室比会议室好待",
    description:
      "乐手互助小组：鼓、贝斯、吉他、键盘都在。\n每两周一次合排，风格以流行摇滚为主，想组队、想学乐器都可以来。",
    members: 6,
    leaderEmail: "suqing@netease.com",
    pendingFrom: "kuaishou",
    posts: [
      { title: "下周六合排：两首新歌", content: "鼓和贝斯已就位，还缺一个键盘。排练室 14:00-17:00，结束后一起吃晚饭。", kind: "ANNOUNCE", pinned: true, hours: 28 },
      { content: "新学了首city pop，求贝斯手一起扒谱。", hours: 64 },
      { content: "园区年底演出名额拿到了，想上台的报名。", hours: 100 },
    ],
  },
  {
    slug: "parenting",
    company: "bytedance",
    category: "PARENTING",
    emoji: "👨‍👩‍👧",
    name: "亲子派",
    tagline: "遛娃搭子，周末不孤单",
    description:
      "遛娃搭子联盟：周末公园局、亲子徒步、绘本互换。\n带娃出门不孤单，家长也能喘口气。",
    members: 5,
    posts: [
      { content: "周六上午奥森遛娃局，带飞盘的报名，娃 3-6 岁。", hours: 20 },
      { content: "闲置绘本互换开始，一人带五本来换。", hours: 68 },
    ],
  },
  {
    slug: "psychology",
    company: "huawei",
    category: "PSYCHOLOGY",
    emoji: "🧠",
    name: "心理学派",
    tagline: "情绪也要做复盘",
    description:
      "情绪复盘读书会：每月一个主题，从认知行为到积极心理学。\n不做心理咨询，只做认真的自助与互助。",
    members: 4,
    posts: [
      { content: "本月主题「情绪颗粒度」，材料包已发群邮箱。", hours: 32 },
      { content: "读完《被讨厌的勇气》，课题分离真的好用，聊聊？", hours: 74 },
    ],
  },
  {
    slug: "tcm",
    company: "huawei",
    category: "TCM",
    emoji: "🌿",
    name: "中医派",
    tagline: "望闻问切，也聊节气",
    description:
      "节气养生 + 中医基础共读，偶尔请中医师朋友做分享。\n不神化不玄学，把老话讲出道理。",
    members: 4,
    posts: [
      { content: "立冬节气分享：进补之前先看脾胃，笔记在评论区。", hours: 24 },
      { content: "八段锦晨练打卡第 40 天，肩颈确实舒服了。", hours: 82 },
    ],
  },
  {
    slug: "cert",
    company: "jd",
    category: "CERT",
    emoji: "📝",
    name: "考证派",
    tagline: "一起备考，互相盯进度",
    description:
      "备考自习室：CPA、法考、软考、PMP 都有人。\n进度互相盯，资料互相传，一个人走得快一群人走得远。",
    members: 5,
    leaderEmail: "hanlei@jd.com",
    pendingFrom: "didi",
    posts: [
      { title: "线上自习室排班表（晚间场）", content: "摄像头开不开都行，重要的是有人陪你熬。报名表在评论区。", kind: "ANNOUNCE", pinned: true, hours: 15 },
      { content: "CPA 会计第一轮刷完，错题本共享，需要的扣 1。", hours: 58 },
    ],
  },
  {
    slug: "food",
    company: "meituan",
    category: "FOOD",
    emoji: "🍜",
    name: "美食派",
    tagline: "工位方圆三公里觅食",
    description:
      "觅食地图共建小组：每周五晚组队探店，从工位吃到三公里外。\n隐藏小店欢迎推荐，好吃的都会整理进共享清单。",
    members: 7,
    leaderEmail: "chenxi@meituan.com",
    posts: [
      { title: "觅食清单 v3（含 18 家）", content: "更新 3 家新店：凌晨小馄饨、夜市烤冷面、潮汕牛肉。评论区继续补充，我来整理。", kind: "ANNOUNCE", pinned: true, hours: 20 },
      { content: "周五还去夜市吗？最近很想吃那家生煎，六点半楼下集合。", hours: 9 },
      { content: "发现一家新开的贵州酸汤火锅，人均 70，测评写在评论区。", hours: 46 },
    ],
  },
  {
    slug: "charity",
    company: "jd",
    category: "CHARITY",
    emoji: "🤝",
    name: "公益派",
    tagline: "周末做点有用的事",
    description:
      "周末公益行动：流浪动物基地帮工、旧物回收、山区图书角。\n做点有用的事，顺便认识一群好人。",
    members: 4,
    posts: [
      { content: "周六流浪动物基地帮工还差 3 人，管午饭，报名接龙。", hours: 10 },
      { content: "旧衣回收箱进园区了，位置在一楼大厅东侧。", hours: 56 },
    ],
  },
  {
    slug: "wellness",
    company: "alibaba",
    category: "HANFU",
    emoji: "👘",
    name: "汉服派",
    tagline: "同去雅集，把汉服穿出门",
    description:
      "汉服同好的衣冠雅集：形制入门、约拍走街、节令茶会。\n不审判形制、不催新人花钱，只负责把好看的自己穿出门。",
    members: 5,
    posts: [
      { content: "周末去西溪湿地约拍，有人一起吗？我有一整套宋制可以借。", hours: 13 },
      { content: "入坑第一套怎么选？想先买件日常也能穿的明制袄裙，求别踩雷。", hours: 49 },
    ],
  },
  {
    slug: "secondhand",
    company: "bytedance",
    category: "SECONDHAND",
    emoji: "♻️",
    name: "二手派",
    tagline: "闲置流转，好物找到下一位主人",
    description:
      "搬家清仓、换新升级、冲动消费的闲置，都可以在这里找到下一位主人。\n同城当面交易、支持验货；不接商业广告与职业卖家，只做同事之间的好物流转。",
    members: 0,
    posts: [],
  },
  {
    slug: "finance",
    company: "alibaba",
    category: "WELFARE",
    emoji: "🎁",
    name: "福利派",
    tagline: "公司羊毛，一起薅明白",
    description:
      "聊五险一金、补充医疗、年假体检，也聊节日礼盒、弹性补贴和股权期权。\n工资之外的保障和羊毛，都值得盘明白。在职的、离职的都欢迎，把每一份福利都用到位。",
    members: 8,
    posts: [
      { content: "今年的弹性福利额度你们怎么用的？我在纠结健身卡还是洗牙，一年就两千。", hours: 8 },
      { content: "把补充医疗的报销流程跑了遍，门诊都能报，今年陆陆续续报了两千多，比想象中好用。", hours: 30 },
      { content: "提醒一句：公积金基数能自己核，别懒得看。我去年调顶格后，房贷月供直接少了几百。", hours: 55 },
      { content: "新人求问：年假到底是工龄算还是入职算？HR 说的一套，同事说的另一套。", hours: 80 },
    ],
  },
  {
    slug: "women",
    company: "tencent",
    category: "WOMEN",
    emoji: "🌸",
    name: "女性派",
    tagline: "姐妹围炉，聊成长也聊生活",
    description:
      "属于职场女性的互助小圈子：聊晋升、聊被催婚、聊独居安全、聊产后复出。\n姐妹抱团，彼此托底，欢迎所有愿意认真倾听的人。",
    members: 8,
    posts: [
      { content: "被问「你怎么还没结婚」第100次，今天终于学会不解释了。姐妹们都是怎么应对家里催的？", hours: 10 },
      { content: "职场里被抢功真的会气哭，复盘完决定下次会议邮件确认留痕。分享几个我用的自我保护小招。", hours: 34 },
      { content: "一个人住第三年，从怕黑到装了指纹锁+监控+阻门器，安全感自己给自己。独居姐妹的安全清单我可以整理。", hours: 60 },
      { content: "30+才开始健身，别信什么「来不及」。这一年体测数据发出来，给还在犹豫的姐妹一点动力。", hours: 92 },
    ],
  },
  {
    slug: "badminton",
    company: "alibaba",
    category: "BADMINTON",
    emoji: "🏸",
    name: "羽毛球派",
    tagline: "下班约球，双打缺你一个",
    description:
      "常年在园区周边球馆约球的杂血战队：一周两次固定场，从入门到能扣杀都有搭子。\n双打为主、单打陪练也行，球和场地 AA，馆里也能租拍。新人不用自带装备，也欢迎离职的老同事回来打两局。",
    members: 6,
    posts: [
      { title: "周三晚固定场 19:30-21:30，场地已订", content: "老规矩西溪园区旁羽毛球馆 4 片场，双打为主，按水平分场。AA 人均 25，报名评论区接龙，人满关单。", kind: "ANNOUNCE", pinned: true, hours: 7 },
      { content: "求个固定双打搭子，我反手弱，尽量别让我接高球。", hours: 26 },
      { content: "馆里租拍 15 块一支，不如自己入支入门拍，百元够用，我有链接。", hours: 52 },
      { content: "上周打到九点半，出来一起吃了碗拌川，这个传统建议保留。", hours: 78 },
    ],
  },
  {
    slug: "ai",
    company: "bytedance",
    category: "AI",
    emoji: "🤖",
    name: "AI派",
    tagline: "提示词写一百遍，不如跑通一次",
    description:
      "把 AI 真用在工位上的互助小组：一周一次线上开黑，写提示词、接内部接口、把重复活儿做成小工具。\n从「会用聊天框」到「能搭一条工作流」都有人带，工具不限，也欢迎离职的老同事回来接着聊。",
    members: 6,
    posts: [
      { title: "周四晚线上开黑 20:00，主题：把手头重复活儿交给 AI", content: "自带一个真实工作场景来，现场拆成能跑的提示词或小脚本，结束后文档归档在派内。新人不用先学理论，空手来就行。", kind: "ANNOUNCE", pinned: true, hours: 6 },
      { content: "把周报里固定那几张表写成了一个脚本，现在周五下午能提前两小时走。", hours: 24 },
      { content: "提问的时候把上下文和限制一并描清楚，回复质量真的不一档。", hours: 49 },
      { content: "有人做过内部知识库接入吗，卡在权限和引用回跳这两块。", hours: 74 },
    ],
  },
];

/** 派主认证申请：申请人均为对应派 ACTIVE 成员且在该派公司 VERIFIED；绝不写 APPROVED */
const LEADER_APP_SEEDS: {
  faction: string;
  email: string;
  status: "PENDING" | "REJECTED";
  reason: string;
  plan: string;
  experience: string;
  reviewerNote?: string;
  reviewedDaysAgo?: number;
  createdHoursAgo: number;
}[] = [
  {
    faction: "yoga",
    email: "zhixia@alibaba-inc.com",
    status: "PENDING",
    reason: "阿里瑜伽社原社长，连续 3 年每周三组织课程，累计带过 200+ 人次。",
    plan: "每周三固定课程 + 每月一次户外瑜伽，建立助教轮值制度。",
    experience: "2019-2024 阿里瑜伽社社长",
    createdHoursAgo: 30,
  },
  {
    faction: "outdoor",
    email: "luoyi@kuaishou.com",
    status: "PENDING",
    reason: "露营装备党，组织过 6 次公司周边露营，装备共享清单是我维护的。",
    plan: "每月一次过夜露营 + 一次轻露营，建立装备共享与新手保护制度。",
    experience: "三年露营组织经验，持有急救证",
    createdHoursAgo: 26,
  },
  {
    faction: "boardgame",
    email: "zhouyu@bytedance.com",
    status: "PENDING",
    reason: "桌游局永远的组织者，每周五固定开局已经坚持了一年半。",
    plan: "维持每周五固定局，增加新人教学场，整理派内游戏库。",
    experience: "组织过 70+ 场桌游局，自带 7 人狼人杀教学局",
    createdHoursAgo: 22,
  },
  {
    faction: "music",
    email: "suqing@netease.com",
    status: "PENDING",
    reason: "乐队鼓手，排练室常驻，想把合排和演出机会固定下来。",
    plan: "每两周一次合排 + 每季度一次小型演出，建立乐器互助清单。",
    experience: "乐队鼓手 6 年，组织过厂牌之间的开放排练日",
    createdHoursAgo: 18,
  },
  {
    faction: "cert",
    email: "hanlei@jd.com",
    status: "PENDING",
    reason: "离职备考期间上岸两门，想把自习室和进度互盯机制建起来。",
    plan: "线上自习室排班 + 每月模考 + 资料共享库。",
    experience: "CPA 两门通过，带过 5 人备考小组",
    createdHoursAgo: 14,
  },
  {
    faction: "food",
    email: "chenxi@meituan.com",
    status: "PENDING",
    reason: "望京干饭派创始人，人均探过 60 家，觅食清单一直是我在维护。",
    plan: "每周五探店 + 共享清单月度更新，拒绝广子。",
    experience: "三年探店组织经验，清单被转发 500+ 次",
    createdHoursAgo: 10,
  },
  {
    faction: "reading",
    email: "gunan@tencent.com",
    status: "PENDING",
    reason: "离职后仍每月读 3 本，想把共读打卡坚持成传统。",
    plan: "每月一本共读 + 月底线下聊书 + 书单共建。",
    experience: "两年读书会组织者，读完 80+ 本",
    createdHoursAgo: 6,
  },
  {
    faction: "pet",
    email: "tangke@pinduoduo.com",
    status: "REJECTED",
    reason: "想当派主，养了两只猫。",
    plan: "多晒猫。",
    experience: "两只猫的铲屎官",
    reviewerNote: "运营计划过于简单，请补充活动频率、寄养互助规则后再申请。",
    reviewedDaysAgo: 6,
    createdHoursAgo: 8 * 24,
  },
];

async function main() {
  console.log("清理旧数据…");
  await prisma.session.deleteMany();
  await prisma.postLike.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.post.deleteMany();
  await prisma.activitySignup.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.factionMember.deleteMany();
  await prisma.leaderApplication.deleteMany();
  await prisma.employment.deleteMany();
  await prisma.faction.deleteMany();
  await prisma.company.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.mailMessage.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash("demo123456", 10);

  console.log("创建公司…");
  const companyMap = new Map<string, string>();
  for (const company of COMPANIES) {
    const created = await prisma.company.create({
      data: {
        name: company.name,
        shortName: company.shortName,
        domains: company.domains,
        industry: company.industry,
        color: company.color,
        logoText: company.logoText,
      },
    });
    companyMap.set(company.key, created.id);
  }

  console.log("创建账号…");
  const admin = await prisma.user.create({
    data: {
      email: "admin@changpai.app",
      nickname: "运营小派",
      passwordHash,
      avatarColor: "#7C3AED",
      role: "ADMIN",
      bio: "负责身份审核、派主认证与内容治理",
    },
  });

  const userMap = new Map<string, string>();
  // admin 也入 map，保证 userMap.get("admin@changpai.app") 兜底不断裂
  userMap.set("admin@changpai.app", admin.id);
  for (const lead of LEAD_USERS) {
    const user = await prisma.user.create({
      data: {
        email: lead.email,
        nickname: lead.nickname,
        passwordHash,
        avatarColor: colorFromString(lead.nickname),
        bio: lead.bio,
      },
    });
    userMap.set(lead.email, user.id);
  }

  // 每家公司生成一批合成成员，用于填充派内成员与动态
  const syntheticByCompany = new Map<string, string[]>();
  const leadNicknames = new Set(LEAD_USERS.map((item) => item.nickname));
  const syntheticNames = NAMES.filter((name) => !leadNicknames.has(name));
  let nameIndex = 0;
  for (const company of COMPANIES) {
    const domain = company.domains.split(",")[0];
    const ids: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      const nickname = syntheticNames[nameIndex % syntheticNames.length];
      nameIndex += 1;
      const email = `${company.key}${i + 1}@${domain}`;
      const user = await prisma.user.create({
        data: {
          email,
          nickname,
          passwordHash,
          avatarColor: colorFromString(`${nickname}${i}`),
          bio: `${company.shortName} · ${["运营", "产品", "研发", "设计", "市场"][i % 5]}`,
        },
      });
      ids.push(user.id);
      userMap.set(email, user.id);
    }
    syntheticByCompany.set(company.key, ids);
  }

  console.log("写入身份认证…");
  for (const lead of LEAD_USERS) {
    const companyId = companyMap.get(lead.company)!;
    const userId = userMap.get(lead.email)!;

    if (lead.email === "mayi@163.com") {
      await prisma.employment.create({
        data: {
          userId,
          companyId,
          kind: "ALUMNI",
          status: "PENDING",
          method: "MANUAL",
          title: lead.title,
          startedYear: lead.years[0],
          leftYear: lead.years[1],
          proofNote: "离职证明照片已上传，工号与在职时间可见，申请加入字节桌游派。",
          proofFiles: "/uploads/sample-proof.svg",
        },
      });
      continue;
    }

    if (lead.email === "yeqing@qq.com") {
      await prisma.employment.create({
        data: {
          userId,
          companyId,
          kind: "ALUMNI",
          status: "REJECTED",
          method: "MANUAL",
          title: lead.title,
          startedYear: lead.years[0],
          leftYear: lead.years[1],
          proofNote: "工牌照片",
          proofFiles: "/uploads/sample-proof.svg",
          reviewerId: admin.id,
          reviewerNote: "照片模糊，无法辨认工号与姓名，请补充清晰的离职证明。",
          reviewedAt: daysAgo(2),
        },
      });
      continue;
    }

    await prisma.employment.create({
      data: {
        userId,
        companyId,
        kind: lead.kind,
        status: "VERIFIED",
        method: lead.kind === "ALUMNI" ? "MANUAL" : "EMAIL",
        workEmail: lead.kind === "ACTIVE" ? lead.email : null,
        title: lead.title,
        startedYear: lead.years[0],
        leftYear: lead.years[1],
        proofFiles: lead.kind === "ALUMNI" ? "/uploads/sample-proof.svg" : null,
        proofNote: lead.kind === "ALUMNI" ? "离职证明 + 工牌，部门与在职时间一致。" : null,
        verifiedAt: daysAgo(30),
        reviewedAt: lead.kind === "ALUMNI" ? daysAgo(30) : null,
        reviewerId: lead.kind === "ALUMNI" ? admin.id : null,
        reviewerNote: lead.kind === "ALUMNI" ? "材料属实，审核通过。" : null,
      },
    });
  }

  // 同一批合成账号在各自公司做在职认证，用于加入派与跨公司申请
  const verifiedByCompany = new Map<string, string[]>();
  for (const company of COMPANIES) {
    const companyId = companyMap.get(company.key)!;
    const ids = syntheticByCompany.get(company.key)!;
    for (const userId of ids) {
      await prisma.employment.create({
        data: {
          userId,
          companyId,
          kind: "ACTIVE",
          status: "VERIFIED",
          method: "EMAIL",
          workEmail: `${userId.slice(0, 6)}@${company.domains.split(",")[0]}`,
          title: `${company.shortName} · 员工`,
          startedYear: 2021,
          verifiedAt: daysAgo(60),
        },
      });
    }
    verifiedByCompany.set(company.key, ids);
  }

  // 回填 Company.verifiedCount（按各公司实际 VERIFIED 的 Employment 条数）
  const verifiedCounts = await prisma.employment.groupBy({
    by: ["companyId"],
    where: { status: "VERIFIED" },
    _count: { id: true },
  });
  for (const row of verifiedCounts) {
    await prisma.company.update({
      where: { id: row.companyId },
      data: { verifiedCount: row._count.id },
    });
  }

  console.log("创建兴趣派（24 个，全部招募派主）…");
  const factionMap = new Map<string, string>();
  const pendingCursor = new Map<string, number>();
  for (const seed of FACTION_SEEDS) {
    const companyId = companyMap.get(seed.company)!;

    const faction = await prisma.faction.create({
      data: {
        name: seed.name,
        slug: seed.slug,
        companyId,
        category: seed.category,
        emoji: seed.emoji,
        tagline: seed.tagline,
        description: seed.description,
        joinMode: "OPEN",
        allowCrossCompany: true,
        status: "ACTIVE",
        leaderId: null,
        memberCount: 0,
      },
    });
    factionMap.set(seed.slug, faction.id);

    // 成员：全部取自该派绑定公司的 verified 池，role 全 MEMBER；
    // leaderEmail（派主认证申请人）优先入列，保证「申请人是该派 ACTIVE 成员且公司认证一致」
    const memberIds: string[] = [];
    if (seed.leaderEmail) {
      const leaderUserId = userMap.get(seed.leaderEmail)!;
      memberIds.push(leaderUserId);
    }
    for (const userId of verifiedByCompany.get(seed.company) ?? []) {
      if (memberIds.length >= seed.members) break;
      if (!memberIds.includes(userId)) memberIds.push(userId);
    }

    for (const userId of memberIds) {
      await prisma.factionMember.create({
        data: {
          factionId: faction.id,
          userId,
          role: "MEMBER",
          status: "ACTIVE",
          joinedAt: daysAgo(30 + Math.floor(Math.random() * 60)),
        },
      });
    }

    // 跨公司 PENDING 加入申请（申请人来自其他公司 verified 池，演示运营后台代批）
    if (seed.pendingFrom) {
      const cursor = pendingCursor.get(seed.pendingFrom) ?? 0;
      const fromPool = verifiedByCompany.get(seed.pendingFrom) ?? [];
      const pendingUserId = fromPool[cursor % fromPool.length];
      pendingCursor.set(seed.pendingFrom, cursor + 1);
      if (pendingUserId) {
        await prisma.factionMember.create({
          data: {
            factionId: faction.id,
            userId: pendingUserId,
            role: "MEMBER",
            status: "PENDING",
            joinedAt: hoursAgo(5),
            // 维持「PENDING 必有 appliedAt」不变式：审批卡片用 appliedAt 渲染申请时间
            appliedAt: hoursAgo(5),
          },
        });
      }
    }

    // memberCount 与 ACTIVE 数一致；各派 4-8 人有梯度，避免 memberCount 排序退化
    await prisma.faction.update({
      where: { id: faction.id },
      data: { memberCount: memberIds.length },
    });

    // 帖子：作者从该派 memberIds 轮转（无派主，不做 leaderId 兜底）
    let postCount = 0;
    for (const [index, post] of seed.posts.entries()) {
      const authorId = memberIds.length ? memberIds[index % memberIds.length] : null;
      if (!authorId) continue;
      const created = await prisma.post.create({
        data: {
          factionId: faction.id,
          authorId,
          kind: post.kind ?? "POST",
          title: post.title ?? null,
          content: post.content,
          pinned: post.pinned ?? false,
          likeCount: 0,
          commentCount: 0,
          createdAt: hoursAgo(post.hours),
          updatedAt: hoursAgo(post.hours),
        },
      });
      postCount += 1;

      // 点赞
      const likers = memberIds.filter((id) => id !== authorId).slice(0, 4);
      for (const likerId of likers) {
        await prisma.postLike.create({ data: { postId: created.id, userId: likerId } });
      }
      await prisma.post.update({
        where: { id: created.id },
        data: { likeCount: likers.length },
      });

      // 评论
      const commentPool = memberIds.filter((id) => id !== authorId);
      if (commentPool.length && post.hours > 10) {
        const commenterId = commentPool[Math.floor(Math.random() * commentPool.length)];
        const commentTexts = [
          "报名 +1，装备我自备。",
          "这个我来！上次没去成一直惦记着。",
          "有新人友好场吗？想带同事一起。",
          "照片呢，想看看现场。",
        ];
        await prisma.comment.create({
          data: {
            postId: created.id,
            authorId: commenterId,
            content: commentTexts[Math.floor(Math.random() * commentTexts.length)],
            createdAt: hoursAgo(Math.max(post.hours - 2, 1)),
          },
        });
        await prisma.post.update({
          where: { id: created.id },
          data: { commentCount: 1 },
        });
      }
    }

    await prisma.faction.update({
      where: { id: faction.id },
      data: { postCount },
    });
  }

  console.log("写入派主认证记录（7 PENDING + 1 REJECTED，绝不写 APPROVED）…");
  for (const app of LEADER_APP_SEEDS) {
    await prisma.leaderApplication.create({
      data: {
        factionId: factionMap.get(app.faction)!,
        userId: userMap.get(app.email)!,
        requestedRole: "LEADER",
        reason: app.reason,
        plan: app.plan,
        experience: app.experience,
        status: app.status,
        reviewerId: app.status === "REJECTED" ? admin.id : null,
        reviewerNote: app.reviewerNote ?? null,
        reviewedAt: app.reviewedDaysAgo ? daysAgo(app.reviewedDaysAgo) : null,
        createdAt: hoursAgo(app.createdHoursAgo),
      },
    });
  }

  console.log("写入通知与站内邮件…");
  await prisma.notification.createMany({
    data: [
      {
        userId: userMap.get("suqing@netease.com")!,
        type: "SYSTEM",
        title: "「音乐派」的跨公司加入申请等待处理",
        body: "该派暂无认证派主，跨公司申请由运营代批，进度可在后台查看",
        link: `/factions/${FACTION_SEEDS.find((s) => s.slug === "music")!.slug}`,
      },
      {
        userId: userMap.get("hanlei@jd.com")!,
        type: "SYSTEM",
        title: "「考证派」的跨公司加入申请等待处理",
        body: "该派暂无认证派主，跨公司申请由运营代批，进度可在后台查看",
        link: `/factions/${FACTION_SEEDS.find((s) => s.slug === "cert")!.slug}`,
      },
      {
        userId: userMap.get("zhixia@alibaba-inc.com")!,
        type: "LEADER",
        title: "「瑜伽派」派主认证申请已提交",
        body: "运营审核通过后即可管理派内成员、内容与活动",
        link: "/factions/yoga",
      },
      {
        userId: userMap.get("gunan@tencent.com")!,
        type: "POST",
        title: "「读书派」开始招募派主",
        body: "你是老派主？加入本派后提交认证申请，运营 1-3 个工作日内审核",
        link: "/factions/reading",
      },
      {
        userId: admin.id,
        type: "VERIFY",
        title: "新的离职身份待审核：马毅 · 字节跳动",
        body: "离职证明照片已上传，工号与在职时间可见",
        link: "/admin/verifications",
      },
      {
        userId: admin.id,
        type: "LEADER",
        title: "派主认证申请：音乐派 · 苏晴",
        body: "申请派主｜乐队鼓手，排练室常驻，7 条申请待审",
        link: "/admin/leaders",
      },
    ],
  });

  await prisma.mailMessage.create({
    data: {
      to: "zhixia@alibaba-inc.com",
      subject: "【上十派】阿里巴巴在职身份验证码：482913",
      body: "林知夏 你好：\n你正在验证 阿里巴巴 的在职身份，验证码 482913，10 分钟内有效。\n如非本人操作请忽略本邮件。",
      code: "482913",
      createdAt: hoursAgo(50),
    },
  });

  console.log("完成 ✅ 演示账号密码统一为 demo123456");
  console.log(" - 24 个派全部「招募派主」，派主认证申请（PENDING）：zhixia / luoyi / zhouyu / suqing / hanlei / chenxi / gunan");
  console.log(" - 运营：admin@changpai.app（7 条派主认证待审 + 1 条离职身份待审 + 2 条跨公司加入申请待代批）");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
