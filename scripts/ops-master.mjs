#!/usr/bin/env node
/**
 * 上十派「运营大师」：清理假账号 + 生成拟真账号并模拟真实用户运营。
 * 用法（在项目根目录，需可访问 DATABASE_URL）：
 *   node scripts/ops-master.mjs cleanup            # 永久删除数字邮箱假账号（预览模式加 --dry）
 *   node scripts/ops-master.mjs seed               # 铺底：生成约50个拟真账号+近一周活动
 *   node scripts/ops-master.mjs daily              # 每日续跑：一小轮当天的新活动
 *   node scripts/ops-master.mjs recount            # 仅重算反范式计数
 * 安全护栏：
 *   - 只删「前缀=字母+1~2位数字」的数字邮箱假账号，admin/16实名种子/真微信注册用户绝不触碰
 *   - 大师新建的账号 bio 带 [ops] 前缀作为唯一识别标记（页面不渲染 bio 空白处无副作用）
 *   - 所有写操作幂等：已有标记账号不重复创建；daily 每次跑都产生当天新内容属预期
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import fs from "node:fs";

// 自给自足的 .env 加载（不依赖 dotenv，服务器环境零风险）
if (!process.env.DATABASE_URL && fs.existsSync(".env")) {
  for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const prisma = new PrismaClient();
const DRY = process.argv.includes("--dry");
const NOW = new Date();
const DAY = 86400000;

// ---------- 工具 ----------
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);
const spread = (days) => new Date(NOW.getTime() - Math.random() * days * DAY);
const afterDate = (d, maxDays = 5) =>
  new Date(Math.min(NOW.getTime(), d.getTime() + (0.2 + Math.random() * (maxDays - 0.2)) * DAY));

// ---------- 白名单（绝不删除、绝不由大师代运营）----------
const KEEP_NICKNAMES = new Set([
  "运营小派", "林知夏", "沈舟", "白露", "顾南", "周屿", "陈曦", "许静", "罗奕", "苏晴",
  "温雅", "韩磊", "唐可", "梁宇", "马毅", "叶青", "小旋风", "踏雪",
]);
// 数字邮箱假账号：前缀为「字母+1~2位数字」，如 alibaba12@ / huawei7@；不匹配 zhixia@ / 181214403@qq.com
const FAKE_EMAIL = /^[a-zA-Z]{3,12}\d{1,2}@[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+$/;
const OPS_MARK = "[ops]";

// ---------- 拟真素材池 ----------
const SURNAMES = "王李张刘陈杨黄赵吴周徐孙马朱胡郭何高林罗郑梁谢宋唐许韩冯邓曹彭曾肖田董潘袁蔡蒋余于杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛闫段雷侯龙史陶黎贺顾毛郝龚邵万钱严武戴莫孔向汤".split("");
const GIVEN = ["伟","芳","娜","敏","静","丽","强","磊","洋","勇","艳","杰","娟","涛","明","超","秀兰","霞","平","刚","桂英","文","辉","力","成","龙","晨","雪","飞","红","梅","斌","博","宇","欣","怡","佳","子轩","雨欣","浩然","思远","梦洁","俊杰","文静","志强","建华","晓峰","雅婷","嘉琪","梓涵","一诺","亦辰","若曦","曼云","凝丹","听寒","寄风","醉薇","初露","寻梅","问柳","知秋","望舒","青梧","白榆","南絮","北鸢","西祠","东野","谷雨","立夏","白露","清明"];
const FUN_NICK_POOL = ["半糖加冰","阿柚","周末不加班","Momo","海边的卡夫卡","芝士就是力量","三只喵","荔枝不理智","山核桃","慢慢","小鹿乱撞","芋泥波波","泡椒公主","麦旋风","早睡冠军","保温杯侠","熬夜冠军","橘子汽水","奶盖有点咸","不打烊的夜","路过的鱼","拿铁不加糖","菠萝吹雪","西瓜太郎","蛋黄酥","咕咕","跳跳","风信子","木棉","木子李","弓长张","立早章","耳东陈","老周家的大橘","小刘同学","阿信不是信","安和桥北","理想三旬","追光者","沉默成本","蒲公英","卷心菜","菠菜面筋","西兰花花","土豆十三岁","胡萝卜头","冬瓜闪闪","南瓜马车"];
const EMAIL_DOMAINS = ["qq.com","163.com","126.com","gmail.com","outlook.com","sina.com","foxmail.com"];
const PHONE_PREFIX = ["138","139","150","151","152","155","157","158","159","166","170","171","173","175","176","177","178","180","181","182","183","185","186","187","188","189","190","191","192","195","196","197","198","199"];

// 发帖模板按类目；{n}派 会自动替换派名
const POST_POOL = {
  YOGA: [
    "楼下新开的那家瑜伽馆体验了一节哈他，老师会一个个纠正体式，比跟着视频练强太多。有人一起拼年卡吗？",
    "早上六点半的班真的有人坚持下来了，就是我。收腹平肩的感觉上瘾，共勉。",
    "求推荐不夹头发的发带，每次下犬式都滑到眼睛，崩溃",
    "公司健身房新来了位代课老师，拉伸课直接排满了。想问问大家还知道哪儿能约到工作日晚上的阴瑜伽？",
    "练了八个月，终于能手碰地了（哭）。之前一直以为是柔韧性问题，其实是腘绳肌太紧，分享下我的拉伸顺序。",
    "周末想约个公园户外瑜伽，有人吗？初步定了奥森，带垫子来就行，水平不限。",
  ],
  OUTDOOR: [
    "这周去爬了东灵山，山顶零下，冲锋衣+抓绒+羽绒三件套刚好。攻略和装备清单整理了，评论区问我发。",
    "有没有大佬知道京西那条野长城现在要门票了吗，上次去还是封着的",
    "新买的登山杖到了，两支合一起能当帐篷杆用是真的吗？想试试",
    "雨崩回来第三天，腿还是酸的，但看到照片那一刻又想订机票了。",
    "周末想组个轻度徒步，路线5km以内，适合带娃和新手，报名的扣1",
    "整理了一份华北周末徒步路线难度表，需要的话我发群里。",
  ],
  TRAVEL: [
    "请了三天年假连着周末，去了趟泉州。半城烟火半城仙真的不是文案，西街庙对面就是奶茶店，太喜欢这种松弛感了。",
    "有人去过芒市吗？十一后飞昆明再转车是不是智商税",
    "签证白本第一次办日签，材料清单和踩坑点整理好了，需要的自取。",
    "高铁上写一篇《后悔去过的5个网红景点》，评论区先吵起来为敬",
    "拼车去涠洲岛的还差2人，4人分摊岛上包车，人均省一半。",
  ],
  BOARDGAME: [
    "昨晚阿瓦隆六人局连赢三把，角色配置有玄学。本周六桌游局报名继续，地点老地方。",
    "求推荐2人也能玩得起来的重策，不想再撸璀璨宝石了（虽然确实香）",
    "公司茶水间新桌刚到货，中午适合来两把快速局，乌obo？",
    "新人友好局这周安排上了：骰子街+卡卡颂+花火，怕被虐的来这个。",
    "剧本杀《年轮》六人本发车，缺1，周末晚七点。",
  ],
  HIFI: [
    "把睡了一年的有源箱子重新接上了，换了根USB线居然像开了新世界。玄学吗？评论区来讨论",
    "入门黑胶请教：三千预算，二手技术 viable 吗，还是老老实实买新的",
    "听完一轮森海HD600、拜亚DT880、歌德SR325，最后留下了HD600。每个人耳朵不一样，别信玄学榜。",
    "周末去试听某国产大丹声的耳放，有人一起吗，店在三元桥",
    "客厅党求推荐不吵到邻居的低音炮摆位方法……",
  ],
  PET: [
    "楼下捡到只奶牛猫，已就医已驱虫，性格巨黏人。找领养，坐标望京，要求科学喂养。",
    "我家狗子确诊胰腺炎了，住院五天花了我小四千。提醒各位：别喂人类饭菜！！",
    "有没有好用的自动猫砂盆测评，预算两千内，不想再半夜铲屎了",
    "带猫打疫苗被医生夸胖得标准，其实我怀疑是绝育后激素的原因……同类来聊聊",
    "小区流浪猫Tallying，做绝育（TNR）的群还在招志愿者，周末两小时就行。",
  ],
  CYCLING: [
    "六环刷完回来了，均速24不算快但全程屁股疼。求推荐坐垫，想尝试硅胶套。",
    "新手第一辆车，1500预算，迪斯路野还是喜德盛rc500？在线等",
    "今早妙峰山下坡看到鹿了！！拍照糊了但心情美了。周末骑行队继续约。",
    "通勤党实测：后货架+驮包比双肩包省力一个数量级，后悔没早装",
    "补胎教程谁需要，我把我踩过的坑写了一帖（别问我怎么知道侧壁撕口的）",
  ],
  ESPORTS: [
    "周三晚八点半内战，王者/瓦洛兰特双项目，报名接龙，别鸽。",
    "公司电竞房新配了240Hz显示器，中午来一把的举手",
    "求组固定五排，段位星耀，我打辅助，脾气好不甩锅",
    "昨天那场逆风局能翻盘纯属对面C位掉线，不多说了。",
    "有人记得大学时通宵开黑现在白天犯困的我吗，键鼠已吃灰两年，求唤醒。",
  ],
  FITNESS: [
    "深蹲终于上100kg了，练了三年。分享下我的周期计划，有需要评论。",
    "求推荐公司附近的24小时健身房，不想再办年卡跑路了",
    "断食16+8第三周，体重没怎么掉但下午不饿了，意外收获。",
    "健身房碰到个老哥，卧推120跟玩一样，一问练了二十年。焦虑又燃。",
    "硬拉之后腰疼两天了，是动作问题还是坐垫问题还是椅子问题……",
  ],
  DANCE: [
    "零基础爵士体验课约了周六下午，来搭伴的扣1，两个人去老师讲价好使",
    "被samba洗脑了，一周不听浑身难受。有人知道哪儿有成人体验课吗",
    "公司年会节目组队，街舞部分还缺2人，不会可教，别慌。",
    "swingers舞会视频刷了一晚上，原来30+的人玩得比咱们野多了。",
  ],
  SKI: [
    "雪季第一趟下来终于能犁式控速了！护具一定要戴全，我尾椎现在还青着。",
    "求二手单板推荐，预算一千五，新手第一块",
    "周末夜场雪道见，新手友好，缺一个会摔不丢人的",
  ],
  SURF: [
    "后海冲浪教练求推荐，不想再被浪拍成滚筒洗衣机了",
    "万宁五一拼房还剩2床，AA，会飞的鱼民宿",
  ],
  READING: [
    "这个月读完《长安的荔枝》，马伯庸真会写小人物。读书会下期讨论这本书，来聊聊。",
    "求推荐类似《置身事内》的经济类入门，别太学术",
    "读完《可能性的艺术》做了20页笔记，谁想交换读书清单？",
    "电子书还是纸书？我的答案是地铁上电子书、睡前纸书，互不侵犯。",
  ],
  MUSIC: [
    "排练房周六下午有空位，乐队排练的来，AA房费。",
    "谁有《晴天》靠谱的吉他谱？网上的前奏都对不上",
    "黑胶之夜活动报名继续，这次放的是City Pop专场",
    "Livehouse拼票还有2张，85one，来现场才是活着",
    "重新学琴第30天，能弹完整一首《月亮代表我的心》了，给自己鼓掌",
  ],
  HIKING: [
    "武功山夜爬回来了，云海值回所有腿酸。下周还有队，报名从速",
    "新手求问第一天徒步背多少水合适，看攻略说3瓶又重又不解渴",
  ],
  RUNNING: [
    "奥森约跑固定成每周三六早六点半，配速530-600分段，来者不拒。",
    "半马完赛了！用时2小时31，感谢群里各位的监督。装备清单+训练计划我可以整理一份。",
    "入门跑鞋求助：400预算，内翻足，别给我推碳板",
    "夜跑党集合：公司周边10km路线谁有实测轨迹，发我参考下",
  ],
  FOOD: [
    "楼下新开的贵州酸汤牛肉，酸爽上头，人均70。饭团子们中午走起？",
    "求咖啡机推荐，办公室那台意式已经报废了，预算3k",
    "周末厨神局报名：每人一道拿手菜，坐标我租的大平层（其实是合租客厅）",
    "学会卤牛肉了！方子发评论区，失败率几乎为零",
    "深夜放毒：加班宵夜的麻辣烫，这楼里还有谁没睡",
  ],
  TECH: [
    "周末折腾homelab，把NAS+软路由+旁路由全重搭了一遍，稳定跑分教程整理ing",
    "求问机械键盘爱好者都去哪了，我的3k预算选择困难了",
    "用业余时间写了个小工具，自动整理报销截图里的发票信息，需要的评论我发你",
    "开源月捐清单：我订阅的5个有趣项目",
  ],
  PARENTING: [
    "幼儿园报名要提前半年？坐标海淀，过来人讲讲流程",
    "带娃第一次露营，娃玩疯了，大人累瘫了但值得。营地推荐评论区。",
    "求推荐不费妈的周末遛娃好去处，重复率太高了现在",
    "辅导作业第30天，血压平稳，悟了：亲生的。",
  ],
  PSYCHOLOGY: [
    "读完《被讨厌的勇气》第二遍，「课题分离」治好了我的加班内耗。",
    "有朋友推荐正念冥想app吗，试过潮汐，感觉一般",
    "公司EAP心理咨询可以匿名预约，知道的同事不多，别浪费这福利。",
  ],
  TCM: [
    "三伏天晒背真的有用吗，晒了三天，同事看我的眼神都不对了",
    "求附近靠谱的中医推拿，落枕一周了",
    "保温杯里泡枸杞的第500天，体检报告确实好看了（确信）",
  ],
  CERT: [
    "PMP首考175A过了，备考资料和踩坑经验可以分享，评论区来",
    "软考高项还有必要考吗，有懂行的说说落户政策",
    "CPA第三门拿下！在职备考的兄弟姐妹们，坚持真的有用",
  ],
  CHARITY: [
    "旧衣回收活动下周进社区，捐满5件可领环保袋，坐标物业大厅",
    "支教招募还有名额，需要能去一整个寒假的，有想法的先聊。",
    "助农苹果到货了，一箱20斤75块，直接发果园链接",
  ],
  FINANCE: [
    "A股又飘绿了，仓位控在七成，跌多了反而想加点。有没有同款定投沪深300的，聊聊你们止盈线怎么设？",
    "提前还了一部分房贷，剩下的做了个稳健组合，年化跑赢存款就行，不贪。请教下大额存单现在还有额度吗。",
    "新手求问：基金定投选沪深300还是中证500？手里闲钱不多，每月就一千。",
    "劝一句：别借钱炒股，别加杠杆。身边见过太多人栽在这上面，共勉。",
    "把工资分了四份：应急、保险、稳健、进攻。记账三年，最大感受是现金流比收益率重要。",
    "美联储这次议息看完，感觉降息悬。做宏观研究的同事来聊聊你们的判断？",
    "黄金这波上车晚了，追高被套。有人做黄金ETF的吗，讲讲你们的思路。",
  ],
  WOMEN: [
    "产后复出第一个月，平衡工作和家庭真的难，但姐妹们给的底气很足。有同款妈妈来抱团。",
    "被问「你怎么还没结婚」第100次，今天终于学会不解释了。姐妹们都是怎么应对家里催的？",
    "职场里被抢功真的会气哭，复盘完决定下次会议邮件确认留痕。分享几个我用的自我保护小招。",
    "一个人住第三年，从怕黑到装了指纹锁+监控+阻门器，安全感自己给自己。独居姐妹的安全清单我可以整理。",
    "30+才开始健身，别信什么「来不及」。这一年体测数据发出来，给还在犹豫的姐妹一点动力。",
    "被裁后gap了三个月，从自我怀疑到想清楚要什么，这段反而最珍贵。来聊聊你们职业上的转折点。",
    "女生读理工被说「不适合」，一路读到算法岗。想对当年高二的自己说一句：你行的。",
  ],
  OTHER: [
    "拼单群又建起来了，凑单满减真香定律永不过时",
    "有人公司附近有好吃的早餐摊推荐吗，每天纠结吃什么",
  ],
};

const COMMENT_POOL = [
  "蹲一个详细版","同款经历，太真实了","+1，我也在找这个","这也太香了吧","已收藏，周末就去",
  "笑死，我第一次比你还惨","大佬带带我","坐标在哪，发个定位","求链接求链接","哈哈哈过于真实了",
  "刚想发同样的帖子被你抢先了","这个价位能拿下吗","已私，回看下消息","蹲后续","楼主加油",
  "我上周试了，确实可以，补充一点：记得提前预约","劝退，我踩过这个坑","先码后看","搭伴+1","认真脸，这个有具体的时间地点吗",
  "刚下班看到这条，还来得及吗","可以，这很合理","建议置顶","朋友，注意身体","照片求原图！",
  "我来补充下：周二人少，体验更好","这个活动有费用吗","新手能去吗，会不会被嫌菜","羡慕了，我还在加班","组局缺人喊我",
  "我有一模一样的经历，后来换了个方法好很多","懂了，这就去报名","楼主是懂生活的","这不比短视频有意思？","已加入我的周末清单",
];

const ACT_TPL = {
  YOGA: ["周末晨间公园瑜伽局", "奥南门外草地流瑜伽", "下班后解压阴瑜伽体验"],
  OUTDOOR: ["周末东灵山轻装穿越", "夜爬看日出小分队", " family友好10km徒步"],
  TRAVEL: ["泉州周末人文漫游", "五一芒市拼团踩线", "周边自驾赏秋一日游"],
  BOARDGAME: ["周六下午桌游马拉松", "新人友好教学局", "阿瓦隆狼人杀之夜"],
  HIFI: ["黑胶之夜：City Pop专场", "耳机线下试听局", "桌面音箱摆位互助会"],
  PET: ["遛狗面基大会", "流浪猫TNR志愿者活动", "养猫新手答疑下午茶"],
  CYCLING: ["妙峰山爬坡挑战", "周末滨河50km休闲骑", "新手修车小课堂"],
  ESPORTS: ["周三内战之夜", "瓦洛兰特公司赛组队", "王者五排发车夜"],
  FITNESS: ["下班后力量房互助局", "户外引体向上挑战", "体态评估开放日"],
  DANCE: ["零基础爵士体验局", "swings舞会观摩之夜"],
  READING: ["月读书会：长安的荔枝", "换书大会", "通勤阅读打卡营"],
  MUSIC: ["排练房开放下午", "不插电弹唱夜", "Livehouse拼票"],
  RUNNING: ["奥森约跑周三场", "半马备赛训练营开营", "荧光夜跑局"],
  FOOD: ["厨神争霸赛·春季场", "探店：贵州酸汤牛肉", "咖啡拉花体验课"],
  TECH: ["homelab交流日", "树莓派折腾工作坊", "开源项目闪电分享"],
  PARENTING: ["周末遛娃野餐局", "幼小衔接经验茶话会"],
  CERT: ["PMP备考互助打卡", "在职考证经验分享夜"],
  CHARITY: ["旧衣回收社区日", "助农订单团购日"],
  SURF: ["后海冲浪新手日"], SKI: ["周末雪场拼团日"],
  TCM: ["晒背养生互助局"], OTHER: ["深夜食堂拼桌局"],
  FINANCE: ["周末投资复盘茶话会", "基金定投答疑下午茶", "宏观行情线下交流局"],
  WOMEN: ["姐妹夜话：职场与成长", "独居安全经验分享会", "女性健身互助局"],
};
const LOC_POOL = ["公司楼下咖啡角", "奥体中心南门", "奥森南园大草坪", "望京SOHO附近桌游店", "三里屯livehouse", "线上集合", "海淀某公园", "朝阳绿道入口", "公司B1健身区", "胡同里的小馆子"];

// ---------- 计数重算 ----------
async function recount() {
  const posts = await prisma.post.findMany({ select: { id: true, factionId: true, likeCount: true, commentCount: true } });
  for (const p of posts) {
    const [lc, cc] = await Promise.all([
      prisma.postLike.count({ where: { post: { id: p.id } } }),
      prisma.comment.count({ where: { postId: p.id, status: "PUBLISHED" } }),
    ]);
    if (lc !== p.likeCount || cc !== p.commentCount) {
      await prisma.post.update({ where: { id: p.id }, data: { likeCount: lc, commentCount: cc } });
    }
  }
  const factions = await prisma.faction.findMany({ select: { id: true, memberCount: true, postCount: true } });
  for (const f of factions) {
    const [mc, pc] = await Promise.all([
      prisma.factionMember.count({ where: { factionId: f.id, status: "ACTIVE" } }),
      prisma.post.count({ where: { factionId: f.id, status: "PUBLISHED" } }),
    ]);
    if (mc !== f.memberCount || pc !== f.postCount) {
      await prisma.faction.update({ where: { id: f.id }, data: { memberCount: mc, postCount: pc } });
    }
  }
  const acts = await prisma.activity.findMany({ select: { id: true, signupCount: true } });
  for (const a of acts) {
    const sc = await prisma.activitySignup.count({ where: { activityId: a.id, status: "GOING" } });
    if (sc !== a.signupCount) await prisma.activity.update({ where: { id: a.id }, data: { signupCount: sc } });
  }
  console.log("recount done");
}

// ---------- cleanup ----------
async function cleanup() {
  const all = await prisma.user.findMany({ select: { id: true, nickname: true, email: true, wechatOpenid: true } });
  const doomed = all.filter((u) => {
    if (KEEP_NICKNAMES.has(u.nickname)) return false;
    if (u.wechatOpenid) return false; // 真微信注册用户绝不删
    if (!u.email) return false;
    return FAKE_EMAIL.test(u.email) && !u.email.startsWith("admin@");
  });
  const keptAdmin = all.filter((u) => u.email && u.email.startsWith("admin@"));
  console.log(`总账号 ${all.length}，拟删除 ${doomed.length}，其中admin保护 ${keptAdmin.length}`);
  console.log("删除样例:", doomed.slice(0, 5).map((u) => `${u.nickname}/${u.email}`).join(", "));
  if (DRY) return console.log("[dry-run] 未执行删除");
  // 逐条删，级联清掉 posts/comments/likes/memberships/sessions/employment
  let n = 0;
  for (const u of doomed) { await prisma.user.delete({ where: { id: u.id } }); n++; }
  console.log(`已永久删除 ${n} 个假账号及其全部内容（派主字段自动置空）`);
  await recount();
}

// ---------- 账号工厂 ----------
async function usedStrings() {
  const users = await prisma.user.findMany({ select: { nickname: true, email: true, phone: true } });
  return {
    nick: new Set(users.map((u) => u.nickname)),
    email: new Set(users.map((u) => u.email).filter(Boolean)),
    phone: new Set(users.map((u) => u.phone).filter(Boolean)),
  };
}
function randomName(used) {
  // 65% 真实姓名风，35% 微信昵称风
  for (let i = 0; i < 200; i++) {
    const nick = Math.random() < 0.65 ? pick(SURNAMES) + pick(GIVEN) : pick(FUN_NICK_POOL);
    if (!used.nick.has(nick)) { used.nick.add(nick); return nick; }
  }
  const fallback = `阿${pick("冬春夏秋日月山水火木".split(""))}${randInt(10, 99)}`;
  used.nick.add(fallback);
  return fallback;
}
function randomEmail(used) {
  const stems = ["li","wang","zhang","chen","yang","zhao","huang","zhou","xu","sun","ma","zhu","hu","guo","he","lin","luo","zheng","liang","xie","song","tang","han","feng","deng","cao","peng","xiao","tian","dong","yuan","cai","jiang","yu","du","ye","cheng","wei","lv","ding","ren","yao","lu","cui","zhong","tan","wang2","fan","shi","qiu","yin","xue","wan"];
  for (let i = 0; i < 200; i++) {
    const e = `${pick(stems)}${pick(stems)}${randInt(1, 9999)}@${pick(EMAIL_DOMAINS)}`;
    if (!used.email.has(e)) { used.email.add(e); return e; }
  }
  const f = `user${Date.now()}${randInt(10,99)}@qq.com`; used.email.add(f); return f;
}
async function randomPhone(used) {
  for (let i = 0; i < 200; i++) {
    let p = pick(PHONE_PREFIX) + String(randInt(10000000, 99999999));
    if (!used.phone.has(p)) { used.phone.add(p); return p; }
  }
  return null;
}
async function makeAccounts(count) {
  const used = await usedStrings();
  const blankHash = await bcrypt.hash(crypto.randomBytes(24).toString("hex"), 10);
  const colors = ["#FF5A1F","#4F7CFF","#1FA97A","#B45AFF","#FF4D8D","#F5A623","#3AB5B5","#7A5AF8"];
  const created = [];
  for (let i = 0; i < count; i++) {
    const nickname = randomName(used);
    const email = randomEmail(used);
    const phone = Math.random() < 0.75 ? await randomPhone(used) : null;
    const u = await prisma.user.create({
      data: { nickname, email, phone, passwordHash: blankHash, avatarColor: pick(colors), bio: `${OPS_MARK} 运营铺底账号` },
    });
    created.push(u);
  }
  return created;
}

// ---------- 认证/入派 ----------
async function employUsers(users) {
  const companies = await prisma.company.findMany({ select: { id: true } });
  if (!companies.length) return console.log("no companies, skip employ");
  for (const u of users) {
    if (Math.random() < 0.9) {
      const kind = Math.random() < 0.72 ? "ACTIVE" : "ALUMNI";
      const company = pick(companies);
      const created = spread(28);
      const data = {
        userId: u.id, companyId: company.id, kind, status: "VERIFIED", method: "EMAIL",
        workEmail: u.email, createdAt: created, verifiedAt: created,
      };
      if (kind === "ALUMNI") { data.leftYear = randInt(2021, 2025); }
      data.startedYear = randInt(2015, 2023);
      await prisma.employment.create({ data }).catch(() => {});
    }
  }
}
async function joinFactions(users, days) {
  const factions = await prisma.faction.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true, slug: true, category: true } });
  for (const u of users) {
    const n = randInt(1, Math.min(5, factions.length));
    for (const f of shuffle(factions).slice(0, n)) {
      await prisma.factionMember.create({
        data: { factionId: f.id, userId: u.id, role: "MEMBER", status: "ACTIVE", joinedAt: spread(days) },
      }).catch(() => {});
    }
  }
  return factions;
}

// ---------- 内容生成 ----------
async function genPosts(users, factions, days, mode) {
  let n = 0;
  for (const f of factions) {
    // 作者限定为本派 ACTIVE 成员中的运营账号，符合真实发帖身份
    const members = await prisma.factionMember.findMany({
      where: { factionId: f.id, status: "ACTIVE", userId: { in: users.map((u) => u.id) } },
      select: { userId: true },
    });
    if (!members.length) continue;
    const authorCount = mode === "daily" ? randInt(0, 2) : randInt(1, 4);
    for (const m of shuffle(members).slice(0, authorCount)) {
      const tpl = pick(POST_POOL[f.category] || POST_POOL.OTHER);
      const created = mode === "daily" ? new Date(NOW.getTime() - Math.random() * DAY) : spread(days);
      await prisma.post.create({
        data: { factionId: f.id, authorId: m.userId, kind: "POST", content: tpl.replace("{n}", f.name), createdAt: created },
      }).then(() => n++).catch(() => {});
    }
  }
  console.log(`新帖 ${n}`);
}
async function genCommentsAndLikes(users, mode, days) {
  const where = mode === "seed" ? { createdAt: { gte: new Date(NOW.getTime() - days * DAY) }, status: "PUBLISHED" } : { status: "PUBLISHED" };
  const posts = await prisma.post.findMany({ where, select: { id: true, authorId: true, createdAt: true }, take: mode === "seed" ? 400 : 120 });
  const userIds = users.map((u) => u.id);
  let cn = 0, ln = 0;
  for (const p of posts) {
    const cBase = mode === "seed" ? randInt(0, 6) : randInt(0, 2);
    for (let i = 0; i < cBase; i++) {
      const author = pick(userIds);
      const when = afterDate(p.createdAt, days);
      await prisma.comment.create({
        data: { postId: p.id, authorId: author, content: pick(COMMENT_POOL), createdAt: when },
      }).then(() => cn++).catch(() => {});
      // 30% 概率给帖子作者发一条互动通知（自己的评论不发）
      if (author !== p.authorId && Math.random() < 0.3) {
        await prisma.notification.create({
          data: { userId: p.authorId, type: "POST", title: "有人评论了你的帖子", link: `/posts/${p.id}`, createdAt: when },
        }).catch(() => {});
      }
    }
    const lBase = randInt(0, 14);
    for (const uid of shuffle(userIds).slice(0, lBase)) {
      await prisma.postLike.create({ data: { postId: p.id, userId: uid } }).then(() => ln++).catch(() => {});
    }
  }
  console.log(`新评论 ${cn}，新点赞 ${ln}`);
}
async function genActivities(users, factions, days) {
  let an = 0, sn = 0;
  for (const f of factions) {
    if (Math.random() > (days <= 1 ? 0.12 : 0.22)) continue;
    const members = await prisma.factionMember.findMany({ where: { factionId: f.id, status: "ACTIVE" }, select: { userId: true } });
    if (!members.length) continue;
    const creator = pick(members).userId;
    const act = await prisma.activity.create({
      data: {
        factionId: f.id, creatorId: creator,
        title: pick(ACT_TPL[f.category] || ACT_TPL.OTHER),
        description: "名额有限，来了群里接龙报名就行，装备自备，新手也OK。",
        location: pick(LOC_POOL),
        startAt: new Date(NOW.getTime() + randInt(3, 14) * DAY),
        capacity: pick([10, 15, 20, 25]),
        createdAt: spread(days),
      },
    });
    an++;
    for (const m of shuffle(members)) {
      if (Math.random() < 0.55) {
        await prisma.activitySignup.create({
          data: { activityId: act.id, userId: m.userId, status: "GOING", createdAt: afterDate(act.createdAt, days) },
        }).then(() => sn++).catch(() => {});
      }
    }
  }
  console.log(`新活动 ${an}，报名 ${sn}`);
}

// ---------- seed / daily ----------
async function seed() {
  console.log("== 铺底模式：近一周 ==");
  const users = await makeAccounts(50);
  console.log(`新建账号 ${users.length}`);
  await employUsers(users);
  const factions = await joinFactions(users, 7);
  await genPosts(users, factions, 7, "seed");
  await genCommentsAndLikes(users, "seed", 7);
  await genActivities(users, factions, 7);
  await recount();
  console.log("seed done");
}
async function daily() {
  console.log("== 每日模式：当天 ==");
  // 只取大师建的账号（bio 带标记），绝不碰真实用户
  const users = await prisma.user.findMany({ where: { bio: { startsWith: OPS_MARK }, status: "ACTIVE" } });
  if (users.length < 5) return console.log("运营账号池不足5个，请先跑 seed");
  const factions = await prisma.faction.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true, category: true } });
  await genPosts(users, factions, 1, "daily");
  await genCommentsAndLikes(users, "daily", 1);
  await genActivities(users, factions, 1);
  await recount();
  console.log("daily done");
}

// ---------- 新增派系专项铺底（金融派 / 女性派）----------
const NEW_FACTION_DEFS = [
  {
    slug: "finance", name: "金融派", category: "FINANCE", emoji: "📈",
    tagline: "K线之外，也聊人生",
    description:
      "关心 A股、基金、理财、宏观和行业研究，也聊买房、还贷和现金流。不荐股、不带单，只做理性交流的氛围。在职的、离职的都欢迎，把工资和人生都盘明白。",
  },
  {
    slug: "women", name: "女性派", category: "WOMEN", emoji: "🌸",
    tagline: "姐妹围炉，聊成长也聊生活",
    description:
      "属于职场女性的互助小圈子：聊晋升、聊被催婚、聊独居安全、聊产后复出、聊那些不好跟男同事说的心事。姐妹抱团，彼此托底，欢迎所有愿意认真倾听的人。",
  },
];

// 把账号认证到指定公司（新建派成员需与本派公司一致，更真实）
async function employAt(users, companyId) {
  for (const u of users) {
    const kind = Math.random() < 0.7 ? "ACTIVE" : "ALUMNI";
    const created = spread(28);
    const data = {
      userId: u.id, companyId, kind, status: "VERIFIED", method: "EMAIL",
      workEmail: u.email, createdAt: created, verifiedAt: created, startedYear: randInt(2015, 2023),
    };
    if (kind === "ALUMNI") data.leftYear = randInt(2021, 2025);
    await prisma.employment.create({ data }).catch(() => {});
  }
}

async function newFactions() {
  console.log("== 新增派系铺底：金融派 / 女性派 ==");
  const company = await prisma.company.findFirst({ orderBy: { verifiedCount: "desc" } });
  if (!company) return console.log("无公司，跳过");
  const poolUsers = await prisma.user.findMany({ where: { bio: { startsWith: OPS_MARK }, status: "ACTIVE" }, select: { id: true } });

  for (const def of NEW_FACTION_DEFS) {
    let faction = await prisma.faction.findUnique({ where: { slug: def.slug } });
    if (!faction) {
      faction = await prisma.faction.create({
        data: {
          name: def.name, slug: def.slug, companyId: company.id, category: def.category, emoji: def.emoji,
          tagline: def.tagline, description: def.description, joinMode: "OPEN", allowCrossCompany: true, status: "ACTIVE",
        },
      });
      console.log(`建派 ${def.name}`);
    } else {
      console.log(`派已存在 ${def.name}，继续补充运营内容`);
    }

    // 新建专属账号，认证到本派公司并入派
    const fresh = await makeAccounts(8);
    await employAt(fresh, company.id);
    for (const u of fresh) {
      await prisma.factionMember.create({ data: { factionId: faction.id, userId: u.id, role: "MEMBER", status: "ACTIVE", joinedAt: spread(20) } }).catch(() => {});
    }
    // 从既有运营池随机拉几名做跨公司成员，成员数更真实
    for (const m of shuffle(poolUsers).slice(0, randInt(3, 5))) {
      await prisma.factionMember.create({ data: { factionId: faction.id, userId: m.id, role: "MEMBER", status: "ACTIVE", joinedAt: spread(30) } }).catch(() => {});
    }

    // 任命一名派主（新建账号首个），设 LEADER 角色 + leaderId
    const leader = fresh[0];
    const members = await prisma.factionMember.findMany({ where: { factionId: faction.id, status: "ACTIVE" }, select: { userId: true } });
    const authorIds = members.map((m) => m.userId);
    if (leader && authorIds.includes(leader.id)) {
      await prisma.factionMember.update({ where: { factionId_userId: { factionId: faction.id, userId: leader.id } }, data: { role: "LEADER" } }).catch(() => {});
      await prisma.faction.update({ where: { id: faction.id }, data: { leaderId: leader.id } });
    }

    // 每条模板发一帖，作者在本派成员间轮转，时间铺在近三周
    let pn = 0;
    for (const tpl of shuffle(POST_POOL[def.category])) {
      await prisma.post.create({
        data: { factionId: faction.id, authorId: pick(authorIds), kind: "POST", content: tpl.replace("{n}", def.name), createdAt: spread(21) },
      }).then(() => pn++).catch(() => {});
    }

    // 评论 + 点赞（评论者取全站运营账号池，跨派互动更真实）
    const allOps = await prisma.user.findMany({ where: { bio: { startsWith: OPS_MARK }, status: "ACTIVE" }, select: { id: true } });
    const commenterIds = allOps.map((u) => u.id);
    const fposts = await prisma.post.findMany({ where: { factionId: faction.id, status: "PUBLISHED" }, select: { id: true, authorId: true, createdAt: true } });
    let cn = 0, ln = 0;
    for (const p of fposts) {
      for (let i = 0; i < randInt(2, 6); i++) {
        const author = pick(commenterIds);
        const when = afterDate(p.createdAt, 21);
        await prisma.comment.create({ data: { postId: p.id, authorId: author, content: pick(COMMENT_POOL), createdAt: when } }).then(() => cn++).catch(() => {});
        if (author !== p.authorId && Math.random() < 0.3) {
          await prisma.notification.create({ data: { userId: p.authorId, type: "POST", title: "有人评论了你的帖子", link: `/posts/${p.id}`, createdAt: when } }).catch(() => {});
        }
      }
      for (const uid of shuffle(commenterIds).slice(0, randInt(3, 12))) {
        await prisma.postLike.create({ data: { postId: p.id, userId: uid } }).then(() => ln++).catch(() => {});
      }
    }

    // 1 个活动 + 报名
    const act = await prisma.activity.create({
      data: {
        factionId: faction.id, creatorId: leader?.id ?? pick(authorIds), title: pick(ACT_TPL[def.category]),
        description: "名额有限，来了群里接龙报名就行，新手也OK。", location: pick(LOC_POOL),
        startAt: new Date(NOW.getTime() + randInt(5, 14) * DAY), capacity: pick([15, 20, 25]), createdAt: spread(10),
      },
    });
    let sn = 0;
    for (const m of shuffle(members)) {
      if (Math.random() < 0.5) await prisma.activitySignup.create({ data: { activityId: act.id, userId: m.userId, status: "GOING", createdAt: afterDate(act.createdAt, 10) } }).then(() => sn++).catch(() => {});
    }
    console.log(`${def.name}：新帖 ${pn}，评论 ${cn}，点赞 ${ln}，活动报名 ${sn}`);
  }
  await recount();
  console.log("factions done");
}

// ---------- 主入口 ----------
(async () => {
  const cmd = process.argv[2];
  try {
    if (cmd === "cleanup") await cleanup();
    else if (cmd === "seed") await seed();
    else if (cmd === "daily") await daily();
    else if (cmd === "factions") await newFactions();
    else if (cmd === "recount") await recount();
    else console.log("用法: node scripts/ops-master.mjs <cleanup|seed|daily|factions|recount> [--dry]");
  } catch (e) {
    console.error("FAILED:", e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
