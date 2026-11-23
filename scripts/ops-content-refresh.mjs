#!/usr/bin/env node
/**
 * 官方内容刷新：以「运营小派」(admin) 身份给各 ACTIVE 派补一批真实、自然的内容。
 * - 只署官方号，绝不造假人、不刷点赞/评论/报名等互动指标。
 * - 结构对齐生产库真实用法：ANNOUNCE=具体标题+简短正文+pinned+images 留空；POST=无标题、一两句口语。
 * - 幂等：相同 content 已存在则跳过，重复运行不产生副本。
 * 目标库：默认沿用 schema 的 DATABASE_URL；本地预览用 OPS_DB="file:./ops-preview.db" 覆盖。
 * 用法：
 *   OPS_DB="file:./ops-preview.db" node scripts/ops-content-refresh.mjs --dry   # 预览不写
 *   OPS_DB="file:./ops-preview.db" node scripts/ops-content-refresh.mjs         # 写预览库
 *   node scripts/ops-content-refresh.mjs                                        # 服务器写 prod
 */
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";

if (!process.env.DATABASE_URL && fs.existsSync(".env")) {
  for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
if (process.env.OPS_DB) process.env.DATABASE_URL = process.env.OPS_DB;

const prisma = new PrismaClient();
const DRY = process.argv.includes("--dry");
const NOW = Date.now();
const DAY = 86400000;
const ADMIN_EMAIL = "admin@changpai.app";
// 近两周内随机铺开，越靠后越新
const when = (i, n) => new Date(NOW - Math.floor((12 - (12 * (i / Math.max(n, 1)))) * DAY + Math.random() * DAY));

// 每派：1 条置顶公告(ANNOUNCE：具体标题+正文) + 2 条普通话题帖(POST：无标题、口语短句)
const CONTENT = {
  finance: {
    a: ["晒晒你今年的理财成绩单", "定投、黄金、货基，还是干脆躺平？只聊思路不荐股，来评论区复盘一下今年这笔钱管得怎么样。"],
    p: [
      "应急金、稳健、进攻这三块怎么搭是最近问得最多的。放个常见思路：留够三个月开销再谈收益，比例因人而异别照抄。",
      "议息之后不少人迷茫。建议先看原始数据和研报原文，少刷情绪化解读，做判断心里更有底。",
    ],
  },
  women: {
    a: ["那些不好当面说的职场瞬间", "被抢功、被催育、被叫小姐姐——来说一个你后来是怎么处理的，给姐妹们攒点经验。"],
    p: [
      "独居的姐妹把安全清单补一补：入户反锁加个阻门器、快递用代收点、再给常联系的人留个暗号，踏实很多。",
      "聊产后复出的不少。几条被验证有用的：提前跟主管对齐产出预期、找个同岗位的搭子、体检时间先写进日历。",
    ],
  },
  yoga: {
    a: ["你先开的是哪儿", "髋、肩还是腘绳肌？附上现在还在死磕的体式，评论区互相打个卡当搭子。"],
    p: [
      "第一次上课别硬跟老师节奏，一条防滑垫一套不卡裆的裤子就够了，体式做不标准没关系，呼吸先跟上。",
      "下犬式总滑到眼睛、发带夹头发的姐妹，评论区报一下你们用过不夹的款，帮忙避避坑。",
    ],
  },
  boardgame: {
    a: ["入坑与劝退，各说一款", "顺便投个票，呼声最高的下次新人局当教学本。"],
    p: [
      "新人友好组合推荐卡卡颂、花火、骰子街，规则半小时讲完不太虐，怕被硬核局劝退的先从这几个起步。",
      "组局接龙记得写清时间地点人数、带不带新，鸽了提前说一声，靠谱率立马不一样。",
    ],
  },
  cert: {
    a: ["今年考的证，值这个投入吗", "通过与否都能说，重点聊聊备考时间怎么挤、资料怎么别买重复。"],
    p: [
      "在职备考真不用大块时间，工作日一小时加周末半天，比考前突击管用。资料先对着官方大纲再决定报不报班。",
      "软考和PMP老被放一起比。方向不同别混着考：落户评职称先查当地认可目录，想补项目方法论再看PMP。",
    ],
  },
  food: {
    a: ["公司周边那家不用排队还好吃的店", "报个菜名和位置，救一救每天中午的选择困难。"],
    p: [
      "上次那个卤牛肉方子整理好了：冷水焯、香料比例、小火一小时浸泡，失败率很低，欢迎交作业。",
      "办公室咖啡机又罢工了，有在用耐用款的说说预算和带不带研磨，顺手帮行政避个坑。",
    ],
  },
  "music-iv4qt5": {
    a: ["第一首完整弹下来的曲子", "是哪首？录一段发出来也行，互相听听这阵子的进步。"],
    p: [
      "新手先别急着买琴，租或借一台手感过关的练两个月，确认真喜欢再入手，入门重点在指法和节拍器不在器材。",
      "练习曲可以从《沧海一声笑》《渔舟唱晚》《茉莉花》起步，按技巧点排了个顺序，要谱的评论说一声。",
    ],
  },
  outdoor: {
    a: ["晒一条你愿意二刷的路线", "山、长城、海边都行，标一句难度和最佳季节，一起攒份派内路线清单。"],
    p: [
      "进山前把行程告诉一个不同行的人、查好天气、头灯备用衣物别省，信号盲区多，离线地图提前下好。",
      "山顶零下时冲锋衣加抓绒加羽绒确实顶用。新手不用一次买齐，鞋和背包先到位，其余按需补。",
    ],
  },
  dance: {
    a: ["零基础第一支舞学的啥", "爵士、hiphop 还是国标？说一个让你没放弃的瞬间。"],
    p: [
      "成人体验课挑明确写零基础班的门店，问清师生比，两个人一起去老师更好讲价。",
      "年会想排街舞节目的举个手，不会可教，把动作拆成八拍最省时间，先定曲目再谈走位。",
    ],
  },
  surf: {
    a: ["你第一次站起来的那道浪", "用的几号板、哪个教练带的？给还在被浪拍的新手指条明路。"],
    p: [
      "别在长板短板之间反复纠结，先用店里软板上体验课找感觉，确认真喜欢再按身高体重选板，能省一大笔。",
      "想去后海万宁拼房的把时间贴出来，凑够人再订，AA划算，还能顺手约个教练。",
    ],
  },
  music: {
    a: ["最近在单曲循环的一首", "带一句为什么。顺便统计下 Livehouse 拼票要凑几个人。"],
    p: [
      "成年人重新学琴，进步最快的往往是一首完整曲死磕，而不是把基本功练到腻，能弹下一首就先给自己鼓掌。",
      "周六下午排练房有空位，AA房费，需要的设备提前说一声，免得到场抢。",
    ],
  },
  charity: {
    a: ["你参加过真正不走过场的公益", "分享下组织方和靠谱度，给想出力的人指个路。"],
    p: [
      "旧衣回收进社区，捐满五件能领环保袋，在一楼大厅东侧，记得提前清洗晾干再捐。",
      "支教陪伴类想清楚的再报名，中途退出对孩子反而是伤害，想先体验的可以看社区助老方向。",
    ],
  },
  hifi: {
    a: ["你的退烧装备是哪件", "一副耳机、一对箱子还是一台放？说说你是怎么从玄学回到听感的。"],
    p: [
      "别太迷信参数和榜，同价位先线下试听耳朵收货，线材那点差异远没有摆位和房间声学来得大。",
      "三千预算入门黑胶，收二手还是买新的？先说清你最常放的曲风和怕不怕折腾，再下结论。",
    ],
  },
  fitness: {
    a: ["练得最稳的一个动作和重量", "报个数字，互相做个不鸽的搭子，也顺便求推荐不逼你办跑路年卡的健身房。"],
    p: [
      "新手先练动作质量再上重量，深蹲硬拉卧推把空杆姿势拍下来对比，比跟着视频瞎练安全得多。",
      "腰疼别硬扛，先分清是动作代偿还是久坐劳损，急性期先休息、必要时就医，别急着去搜正骨。",
    ],
  },
  wellness: {
    a: ["坚持下来体感变好的小习惯", "泡脚、晒背还是早睡？只聊自己试过的，不传偏方。"],
    p: [
      "养生先养规律，睡够、三餐稳，收益其实大于任何保健品；晒背艾灸这些要看体质，别照搬同事。",
      "久坐党互相提醒：每小时起来两分钟、屏幕抬到视线高度、一把靠垫救腰，需要跟练视频的扣个1。",
    ],
  },
  secondhand: {
    a: ["二手捡过最大的漏和踩最深的坑", "说一个就行，帮新人建立什么能买什么别碰的手感。"],
    p: [
      "面交尽量选白天人多的地铁站，验货再付款；同城走平台担保别私下转账，有纠纷先留好聊天记录。",
      "低于市场价一大截的先默认有套路，电子看电池循环和拆修记录，家具看看有没有霉和虫。",
    ],
  },
  travel: {
    a: ["去了不后悔的小众目的地", "标上花费和最佳月份。也欢迎拔草型分享，帮大伙避雷网红景点。"],
    p: [
      "白本首次办日签的材料清单和常见拒签点整理了下，需要的评论说一声，尽量别找不透明的代办。",
      "拼车拼房先确认AA规则和取消政策再出发，和陌生人结伴，把行程同步给一位不同行的朋友。",
    ],
  },
  pet: {
    a: ["晒晒你家主子的招牌动作", "顺便问个实在的：换粮驱虫体检你们多久一次、大概花多少。"],
    p: [
      "楼下捡到只奶牛猫，已就医已驱虫、性格黏人，找领养坐标望京，要求科学喂养能封窗，有意私信。",
      "人食真别喂，高油高盐会诱发胰腺炎，有派友的狗子就为这事住了院，钱和罪一起受了。",
    ],
  },
  esports: {
    a: ["你现在的固定项目和段位", "组个内战接龙，鸽太多次进黑名单，把靠谱率提上来。"],
    p: [
      "固定五排招几个脾气好不甩锅的队友，段位要求写清楚，先打匹配磨合再谈上分。",
      "公司电竞房新配的240Hz到了，中午来把快速局的接龙走起，别占着机不玩。",
    ],
  },
  skate: {
    a: ["这个雪季第一个能控住速度的坡道", "你滑的是哪个场？顺便求护具推荐，尤其中看不心疼但保命的款。"],
    p: [
      "新手先学会摔：侧坐、卸力再起身，比急着做招重要，护具戴全再上中级道，尾椎的伤是最贵的学费。",
      "周末夜场新手友好，有老带新拼车拼票，缺一个会摔也不丢人的搭子，想来的扣个1。",
    ],
  },
  reading: {
    a: ["本月在读的一本，三句话种草或拔草", "下期读书会按讨论热度选书。"],
    p: [
      "老读不进去试试合上书先写作者最想说服你的一句话，再写你同不同意，比抄金句管用。",
      "电子书还是纸书这事，派里基本达成共识：通勤读电子书、睡前读纸书，别为难自己非得选阵营。",
    ],
  },
  psychology: {
    a: ["哪个概念真帮你想通了一件事", "课题分离、依恋还是认知失调？用你自己的经历说说。"],
    p: [
      "聊心理学不等于做咨询，公司EAP能匿名预约知道的人不多别浪费福利，困扰很重时请找专业人士。",
      "入门别一上来啃大部头，先从读得进去的科普和自助开始，兴趣不断档才读得长久。",
    ],
  },
  cycling: {
    a: ["晒一张你的骑行轨迹", "均速距离随你。顺便组队周末滨河休闲骑，新手也跟得上的配速。"],
    p: [
      "第一辆车别追碳板顶配，一千五预算够买能通勤能长骑的可靠平把，坐垫灯和锁比升级套件更重要。",
      "头盔前后灯反光背心是底线，夜骑一定打灯，补胎教程放评论区，别等到路上才现学。",
    ],
  },
  parenting: {
    a: ["不费妈孩子还爱去的周末去处", "标上适合年龄和要不要预约，救救选择困难的老母亲老父亲。"],
    p: [
      "幼升小报名各地差异很大，别直接抄邻居，先看你所在区教委的当年文件和划片，需要经验约同区派友聊。",
      "带娃第一次露营选带卫生间淡水、车程一小时内的营地，装备能租就别急着买齐，大人累但值。",
    ],
  },
  tcm: {
    a: ["你身上确实有效的一个养生法", "泡脚、推拿还是某种食疗？只分享自己验过的，也欢迎说踩坑。"],
    p: [
      "推拿针灸去有资质的医疗机构，落枕一周没缓建议先看骨科或康复，别在路边随便按。",
      "三伏晒背更像作息加日照的调节，适合的人有限，别神化也别硬跟风，自己体感最重要。",
    ],
  },
};

// 官方活动召集（仅给活跃度较高的派，真实用户后续报名；结构对齐 Activity 表）
const ACTIVITIES = {
  yoga: { title: "周末晨间公园瑜伽局", description: "户外晨练第一场，铺子自备，水平不限新手跟得上。具体集合点更新在评论。", location: "奥森南园大草坪", days: 8, capacity: 20 },
  boardgame: { title: "新人友好教学局（周六下午）", description: "卡卡颂花火骰子街三选二，规则现场讲，怕被虐的优先来这场，老玩家欢迎来当教学志愿者。", location: "望京SOHO附近桌游店", days: 6, capacity: 16 },
  outdoor: { title: "轻度徒步5公里（新手友好）", description: "路线平缓往返五公里左右，适合第一次参加户外的派友，装备和天气提醒群内同步。", location: "海淀某公园集合", days: 10, capacity: 25 },
  finance: { title: "周末投资复盘茶话会", description: "不荐股不带单，只聊各自的仓位思路和今年得失，会前发个匿名小问卷现场按议题讨论。", location: "公司楼下咖啡角", days: 9, capacity: 15 },
  reading: { title: "月度读书会：从一本开始", description: "本月共读一本轻松向的，也欢迎带自己的书来交换，流程是先各自讲三句再聊最想聊的那段。", location: "线上+线下同步", days: 12, capacity: 30 },
  cycling: { title: "周末滨河30公里休闲骑", description: "均速18到20，中途两次补给休息新手跟得上，头盔必戴前后灯备好，集合时间群内通知。", location: "朝阳绿道入口", days: 7, capacity: 20 },
  women: { title: "姐妹夜话：职场与成长", description: "匿名话题卡开场，聊晋升聊那些不好跟男同事说的心事，仅限女性派成员报名内容不外传。", location: "胡同里的小馆子", days: 11, capacity: 14 },
};

async function recount() {
  const posts = await prisma.post.findMany({ select: { id: true, likeCount: true, commentCount: true } });
  for (const p of posts) {
    const [lc, cc] = await Promise.all([
      prisma.postLike.count({ where: { postId: p.id } }),
      prisma.comment.count({ where: { postId: p.id, status: "PUBLISHED" } }),
    ]);
    if (lc !== p.likeCount || cc !== p.commentCount) await prisma.post.update({ where: { id: p.id }, data: { likeCount: lc, commentCount: cc } });
  }
  const factions = await prisma.faction.findMany({ select: { id: true, memberCount: true, postCount: true } });
  for (const f of factions) {
    const [mc, pc] = await Promise.all([
      prisma.factionMember.count({ where: { factionId: f.id, status: "ACTIVE" } }),
      prisma.post.count({ where: { factionId: f.id, status: "PUBLISHED" } }),
    ]);
    if (mc !== f.memberCount || pc !== f.postCount) await prisma.faction.update({ where: { id: f.id }, data: { memberCount: mc, postCount: pc } });
  }
  const acts = await prisma.activity.findMany({ select: { id: true, signupCount: true } });
  for (const a of acts) {
    const sc = await prisma.activitySignup.count({ where: { activityId: a.id, status: "GOING" } });
    if (sc !== a.signupCount) await prisma.activity.update({ where: { id: a.id }, data: { signupCount: sc } });
  }
}

async function addPost(faction, adminId, kind, title, content, createdAt, pinned) {
  const exists = await prisma.post.findFirst({ where: { factionId: faction.id, content } });
  if (exists) return 0;
  if (DRY) return 1;
  await prisma.post.create({ data: { factionId: faction.id, authorId: adminId, kind, title: title ?? null, content, pinned: !!pinned, createdAt } });
  return 1;
}

async function main() {
  // 用 raw SQL 取官方号：避开 User.official 等新列，兼容尚未上线 /ops 的生产 schema
  const rows = await prisma.$queryRawUnsafe(`SELECT id, email, nickname FROM "User" WHERE role = 'ADMIN' AND email = ? LIMIT 1`, ADMIN_EMAIL);
  const admin = rows[0];
  if (!admin) throw new Error(`未找到官方号 ${ADMIN_EMAIL}`);
  const factions = await prisma.faction.findMany({ where: { status: "ACTIVE" } });
  let posts = 0, anns = 0, acts = 0, skipped = 0;

  for (const f of factions) {
    const c = CONTENT[f.slug];
    if (!c) { skipped++; console.log(`  跳过（无文案）：${f.name} [${f.slug}]`); continue; }
    const n = c.p.length + 1;
    anns += await addPost(f, admin.id, "ANNOUNCE", c.a[0], c.a[1], when(0, n), true);
    for (let i = 0; i < c.p.length; i++) posts += await addPost(f, admin.id, "POST", null, c.p[i], when(i + 1, n), false);
    const A = ACTIVITIES[f.slug];
    if (A) {
      const dup = await prisma.activity.findFirst({ where: { factionId: f.id, title: A.title } });
      if (!dup) {
        if (!DRY) await prisma.activity.create({ data: { factionId: f.id, creatorId: admin.id, title: A.title, description: A.description, location: A.location, capacity: A.capacity, startAt: new Date(NOW + A.days * DAY), createdAt: when(1, n) } });
        acts += DRY ? 0 : 1;
      }
    }
  }

  if (!DRY) await recount();
  console.log(`\n[${DRY ? "DRY-RUN 预览" : "已写入"}] 官方号=运营小派(${admin.id})  ACTIVE派=${factions.length}  无文案跳过=${skipped}`);
  console.log(`公告 ${anns} 条，话题帖 ${posts} 条，官方活动 ${acts} 个${DRY ? "（dry 未落库）" : ""}`);
}

main()
  .catch((e) => { console.error("FAILED:", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
