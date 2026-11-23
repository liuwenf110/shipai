# -*- coding: utf-8 -*-
"""第 1 ~ 5 章：项目概述、技术栈、目录结构、配置体系、数据模型。"""


def build(doc):
    # ================================================================== 第 1 章
    doc.h1("1. 项目概述")

    doc.h2("1.1 产品定位")
    doc.p(
        "厂派（ShipAI）是一个面向互联网大厂员工的垂直兴趣社区。用户通过企业邮箱验证码或离职材料完成"
        "「公司身份认证」，以真实厂牌身份加入同公司旗下的兴趣派（瑜伽、徒步、桌游、跑步等 25 个分类），"
        "在派内发帖、评论、点赞、组织线下活动，并由派主负责日常运营。平台的核心理念是"
        "「离职不离圈，兴趣不断线」——既服务在职员工，也服务离职校友，让同事关系沉淀为长期同好关系。"
    )
    doc.p(
        "与开放型社区不同，平台把「身份可信」作为第一道门槛：未认证用户只能浏览落地页与派的公开信息，"
        "认证用户才能加入派并产生内容；跨公司加入由派主按开关决定；所有内容治理、身份审核、派主认证"
        "均由运营后台统一处理并留痕。"
    )

    doc.h2("1.2 目标用户与核心角色")
    doc.table(
        ["角色", "获得方式", "核心能力"],
        [
            ["游客", "无需登录", "浏览落地页、公司墙、公开派列表；被引导注册"],
            ["普通用户", "手机号 / 邮箱注册", "完成身份认证；浏览与加入派；发帖、评论、点赞、报名活动；举报与个人资料管理"],
            ["派成员（MEMBER）", "自由加入或审批通过", "查看派内内容、参与互动、报名活动"],
            ["副派主（ADMIN）", "派主申请经运营审核通过", "审批加入申请、管理成员与内容、创建活动、申请邀请码"],
            ["派主（LEADER）", "派主认证通过，或被运营指派", "副派主全部权限 + 编辑派资料、交接派主、关闭派"],
            ["运营（ADMIN）", "数据库角色 role=ADMIN", "身份审核、派主认证、加入申请代批、内容/评论/活动/举报治理、成员管理、邀请码发放、消息中心、操作日志"],
        ],
        widths=[3.2, 4.6, 8.4],
    )

    doc.h2("1.3 功能全景")
    doc.table(
        ["模块", "主要能力", "关键页面"],
        [
            ["账号与认证", "手机号/邮箱注册、登录、退出、改资料、改密码、免责协议必填", "/register、/login、/me"],
            ["身份认证", "在职企业邮箱验证码；离职材料人工审核；一账号可认证多家公司", "/verify"],
            ["派发现", "分类筛选、公司筛选、关键词搜索、排序权重", "/discover、/search"],
            ["派的创建与治理", "用户发起筹备 → 运营审核派主 → 派上线；派资料编辑、关闭", "/factions/new、/factions/[slug]/manage"],
            ["成员关系", "自由加入 / 审批加入 / 跨公司加入；退出、移出、角色调整、派主交接", "/factions/[slug]"],
            ["内容", "帖子（普通/公告/活动召集）、置顶、图片、评论、点赞、作者删除、派主与运营治理", "/、/posts/[id]"],
            ["活动", "创建、报名、取消报名、关闭报名、编辑、删除", "/factions/[slug]/activities/[id]"],
            ["邀请码", "派主申请 → 运营审核 → 一次性 8 位邀请码（30 天）；注册即入派", "派管理台、/admin/invites"],
            ["通知", "业务通知与运营通知、未读计数、单条已读、全部已读、消息详情", "/notifications"],
            ["举报", "帖子 / 评论 / 用户举报，运营处置并回执", "/admin/reports"],
            ["运营后台", "数据概览、13 个管理模块、待办计数、审计日志", "/admin"],
            ["开放接口", "11 个只读/写入 API，供 H5 与外部调用", "/api/v1/*"],
        ],
        widths=[3.0, 9.4, 3.8],
    )

    doc.h2("1.4 业务术语表")
    doc.table(
        ["术语", "含义"],
        [
            ["厂牌 / 身份", "用户在某公司通过认证后获得的展示身份，含公司短名与在职/离职标记"],
            ["派", "平台内的兴趣社群单位，隶属某一家公司，有派主、成员、帖子与活动"],
            ["派主 / 副派主", "派的负责人与副负责人，可管理成员、内容与活动"],
            ["跨公司加入", "非本派所属公司的认证用户申请加入，受 allowCrossCompany 开关与派主审批约束"],
            ["筹备审核", "用户新建派后派处于 REVIEWING 状态，等待运营通过派主认证后才上线"],
            ["邀请码", "派主向运营申请的一次性注册码，新人注册后自动加入该派"],
            ["代批", "派对无认证派主时，加入申请由运营在后台代为审批"],
            ["在职认证", "通过企业邮箱域名 + 6 位验证码自动完成的认证方式"],
            ["离职认证", "上传离职证明 / 工牌 / 社保截图，由运营人工审核的认证方式"],
        ],
        widths=[3.4, 12.8],
    )

    # ================================================================== 第 2 章
    doc.h1("2. 技术栈与运行环境")

    doc.h2("2.1 技术选型")
    doc.table(
        ["层次", "技术 / 版本", "用途与说明"],
        [
            ["框架", "Next.js ^15.1（App Router）", "服务端组件 + Server Actions + Route Handlers，前后端同仓"],
            ["UI 运行时", "React ^19.0 / react-dom ^19.0", "useActionState、useFormStatus 等新特性"],
            ["语言", "TypeScript ^5.7（strict）", "全量类型约束，路径别名 @/* → src/*"],
            ["样式", "Tailwind CSS ^3.4 + PostCSS + Autoprefixer", "原子化样式 + 自定义设计令牌（见 tailwind.config.ts）"],
            ["数据访问", "Prisma ^6.1 + SQLite", "17 个模型；开发库 prisma/dev.db，生产库 prisma/prod.db"],
            ["校验", "zod ^3.24", "注册、建派等表单的服务端校验"],
            ["密码", "bcryptjs ^2.4", "cost=10 的单向哈希"],
            ["邮件", "nodemailer ^6.10", "QQ 邮箱 SMTP 发送验证码；未配置时走站内模拟"],
            ["工具", "clsx ^2.1、tsx ^4.19", "className 合并、执行 seed 脚本"],
        ],
        widths=[2.6, 5.0, 8.6],
    )

    doc.h2("2.2 运行环境要求")
    doc.bullets([
        "Node.js 18.18+（推荐 20 LTS 及以上），生产环境使用 /home/tuoniao/runtime/node/bin/node。",
        "npm 9+，依赖锁定文件为 package-lock.json。",
        "SQLite 3（由 Prisma 内置驱动访问，无需单独安装服务）。",
        "生产环境 Nginx 反向代理 + systemd 用户级服务；应用只监听 127.0.0.1:3010。",
    ])

    doc.h2("2.3 npm 脚本")
    doc.table(
        ["命令", "实际执行", "用途"],
        [
            ["npm run dev", "next dev -p 3000", "本地开发（默认无子路径）"],
            ["npm run build", "prisma generate && next build", "生成 Prisma Client 并构建生产产物"],
            ["npm run start", "next start -p 3000", "本地以生产模式启动"],
            ["npm run lint", "next lint", "ESLint 检查"],
            ["npm run db:push", "prisma db push", "把 schema 同步到数据库（本项目不使用 migration）"],
            ["npm run db:seed", "tsx prisma/seed.ts", "写入演示数据（公司、派、用户等）"],
            ["npm run db:reset", "prisma db push --force-reset && tsx prisma/seed.ts", "清库重建并灌入种子数据"],
            ["npm run setup", "prisma generate && prisma db push && tsx prisma/seed.ts", "新环境一键初始化"],
        ],
        widths=[3.4, 8.2, 4.6],
    )
    doc.note(
        "项目全程使用 prisma db push 同步结构，没有 migrations 目录。修改 schema 后必须同时执行 "
        "prisma generate（或 npm run build），否则运行期会因 Client 类型过期报错。",
        "注意",
    )

    # ================================================================== 第 3 章
    doc.h1("3. 目录结构")

    doc.h2("3.1 顶层目录")
    doc.table(
        ["路径", "说明"],
        [
            ["src/app", "App Router 路由树：页面、布局、Route Handlers"],
            ["src/components", "可复用 UI 组件与业务组件"],
            ["src/lib", "服务端能力库：鉴权、数据、动作、邮件、上传、常量"],
            ["prisma", "schema.prisma、seed.ts 与 SQLite 数据库文件"],
            ["public/uploads", "用户上传的证明材料与图片（运行时写入）"],
            [".deploy", "Nginx 片段、systemd 服务、首次部署与远程执行脚本"],
            [".runtime", "服务器上的 Node 运行时挂载说明（本地占位）"],
            ["next.config.mjs", "basePath、Server Action 体积上限、构建期校验开关"],
            ["tailwind.config.ts", "设计令牌：色板、字体、阴影、圆角、动画"],
            ["tsconfig.json", "严格模式与 @/* 路径别名"],
            [".env", "本地环境变量（数据库、会话、SMTP、开发模式）"],
        ],
        widths=[4.2, 12.0],
    )

    doc.h2("3.2 服务端能力库（src/lib）")
    doc.table(
        ["文件", "行数", "职责"],
        [
            ["db.ts", "13", "PrismaClient 单例，开发环境挂到 globalThis 避免热重载重复连接"],
            ["auth.ts", "127", "会话创建/销毁、getCurrentUser、getViewer、requireUser、requireAdmin、公司认证判定"],
            ["api.ts", "100", "API 统一响应、分页、鉴权与用户字段白名单"],
            ["types.ts", "15", "ActionState 契约与 INITIAL_ACTION_STATE"],
            ["constants.ts", "289", "25 个派分类及配色、状态字典、平台名称与口号"],
            ["utils.ts", "125", "cn、时间格式化、手机号/邮箱规范化与脱敏、颜色与首字母"],
            ["identity.ts", "42", "从多条认证记录中挑选展示身份（本派公司优先 → 在职 → 首条）"],
            ["membership.ts", "58", "跨公司开关关闭时，事务内作废仍处于 PENDING 的跨公司申请"],
            ["invite.ts", "51", "邀请码生成（8 位去混淆字符）、规范化、可用性与展示态判定"],
            ["notify.ts", "41", "notify（单人）与 notifyAdmins（全体运营）"],
            ["mail.ts", "93", "SMTP 发信、开发模式判定、验证码生成、MailMessage 留痕"],
            ["upload.ts", "44", "证明材料落盘 public/uploads，限制 6MB 与类型白名单"],
            ["revive.ts", "97", "把 JSON 日期字段还原为 Date，并附加作者身份与评论者身份"],
            ["client.ts", "75", "浏览器端 fetch 封装（自动加 basePath、统一错误类型）"],
            ["base-path.ts", "14", "部署子路径的拼接与剥离"],
            ["mock.ts", "1", "历史占位文件，当前无实际逻辑"],
        ],
        widths=[3.4, 1.4, 11.4],
    )

    doc.h2("3.3 动作层（src/lib/actions）")
    doc.table(
        ["文件", "行数", "职责"],
        [
            ["auth.ts", "276", "注册、普通登录、管理端登录、两端退出"],
            ["verify.ts", "247", "在职邮箱验证码发送与确认、离职材料提交"],
            ["faction.ts", "1053", "派内全部业务：加入/退出、发帖/评论/点赞、成员管理、派主交接、活动、建派与派主申请"],
            ["admin.ts", "924", "运营 17 个管理动作：审核、治理、指派、重置密码、举报处置等"],
            ["invite.ts", "160", "邀请码申请与运营审核发放"],
            ["content.ts", "161", "作者删除自己的帖子/评论、提交举报"],
            ["account.ts", "83", "修改资料、修改密码（并踢掉其它设备会话）"],
            ["notifications.ts", "40", "单条已读、全部已读"],
        ],
        widths=[3.0, 1.4, 11.8],
    )

    doc.h2("3.4 分层与依赖方向")
    doc.code(
        [
            "页面 / 组件 (src/app, src/components)",
            "        │  仅通过 Server Action 或 /api/v1 读写",
            "        ▼",
            "动作层 (src/lib/actions/*)  ──  \"use server\"，负责鉴权、校验、事务、通知、revalidate",
            "        │",
            "        ▼",
            "领域能力 (auth / membership / identity / invite / notify / upload / mail)",
            "        │",
            "        ▼",
            "数据访问 (src/lib/db.ts → Prisma → SQLite)",
        ],
        "分层示意",
    )
    doc.p(
        "约定：页面组件默认是服务端组件，直接调用 prisma 读数据；所有写操作必须走 Server Action，"
        "动作内部再调用 requireUser / requireAdmin / getCurrentUser 做一次独立鉴权，不依赖页面层的校验结果。"
    )

    # ================================================================== 第 4 章
    doc.h1("4. 配置体系")

    doc.h2("4.1 环境变量")
    doc.table(
        ["变量", "必填", "说明"],
        [
            ["DATABASE_URL", "是", "SQLite 连接串，如 file:./dev.db；相对路径以 prisma/schema.prisma 所在目录为基准，因此生产库实际文件是 prisma/prod.db"],
            ["SESSION_COOKIE", "否", "会话 Cookie 名，缺省 shipai_session"],
            ["SESSION_DAYS", "否", "会话有效期（天），缺省 30"],
            ["NEXT_PUBLIC_DEV_MODE", "否", "true 时验证码直接回显在页面、邮件只做站内留痕；生产必须为 false"],
            ["SMTP_HOST / SMTP_PORT", "否", "SMTP 服务器与端口（当前使用 QQ 邮箱 465/587）"],
            ["SMTP_USER / SMTP_PASS", "否", "发件账号与授权码（非登录密码），不得写入代码或文档"],
            ["SMTP_FROM", "否", "发件人显示地址，缺省回落到 SMTP_USER"],
            ["NEXT_PUBLIC_BASE_PATH", "部署时", "部署子路径（如 /shipai）。构建期内联，本地开发留空"],
        ],
        widths=[4.6, 1.6, 10.0],
    )
    doc.note(
        "NEXT_PUBLIC_* 变量在 next build 时被内联进产物。同一份 .next 产物不能改前缀复用；"
        "切换部署路径必须重新构建。",
        "关键约束",
    )

    doc.h2("4.2 next.config.mjs")
    doc.code(
        [
            "const nextConfig = {",
            "  // 发布在现有域名的子路径下（如 /shipai），本地开发留空",
            "  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,",
            "  outputFileTracingRoot: import.meta.dirname,",
            "  experimental: { serverActions: { bodySizeLimit: \"8mb\" } },",
            "  eslint: { ignoreDuringBuilds: true },",
            "};",
        ],
        "next.config.mjs",
    )
    doc.bullets([
        "basePath：统一给路由、静态资源、next/link 加前缀；原生 form action、fetch、history.pushState 不会自动加。",
        "serverActions.bodySizeLimit=8mb：离职证明材料上限 6MB，留出 multipart 编码余量。",
        "outputFileTracingRoot：避免 monorepo 误判项目根，减小 standalone 追踪范围。",
        "eslint.ignoreDuringBuilds：构建不因历史 lint 告警中断，lint 单独执行。",
    ])

    doc.h2("4.3 样式令牌（tailwind.config.ts）")
    doc.table(
        ["令牌组", "取值", "用途"],
        [
            ["ink", "#14110F / #4A433E / #8B8178 / #E7DFD6", "正文、次级文字、辅助文字、分割线"],
            ["cream", "#FBF7F2 / #FFFFFF / #F3ECE3", "页面底色、卡片、下沉区块"],
            ["brand", "#FF5A1F / #E0430C / #FFEDE4", "主色、按压态、浅底"],
            ["moss / ocean / plum", "#2F7D5D / #1F6FEB / #7C3AED", "成功、信息、副派主等语义色"],
            ["fontFamily.sans", "系统字体栈（PingFang SC / Microsoft YaHei 等）", "中文优先，免外部字体"],
            ["boxShadow", "card / float", "卡片与浮层阴影"],
            ["borderRadius", "xl2 = 20px", "大圆角容器"],
            ["animation", "rise / pulseSoft", "入场与呼吸动画"],
        ],
        widths=[3.2, 6.6, 6.4],
    )

    doc.h2("4.4 TypeScript 与路径别名")
    doc.code(
        [
            '{',
            '  "compilerOptions": {',
            '    "target": "ES2022", "strict": true, "noEmit": true,',
            '    "module": "esnext", "moduleResolution": "bundler",',
            '    "jsx": "preserve", "incremental": true,',
            '    "plugins": [{ "name": "next" }],',
            '    "paths": { "@/*": ["./src/*"] }',
            "  }",
            '}',
        ],
        "tsconfig.json（节选）",
    )
    doc.p("所有跨目录引用统一使用 @/ 前缀，禁止 ../../../ 相对路径；服务端专属模块在文件首行加 import \"server-only\"。")

    doc.h2("4.5 子路径部署机制（basePath）")
    doc.p(
        "生产环境应用挂在 https://域名/shipai/ 下，而本地开发不带前缀。这是本项目最容易踩坑的地方，"
        "核心工具在 src/lib/base-path.ts："
    )
    doc.code(
        [
            "export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? \"\";",
            "",
            "export function withBasePath(path: string) {",
            "  return path.startsWith(\"/\") ? `${BASE_PATH}${path}` : path;",
            "}",
            "",
            "export function stripBasePath(pathname: string) {",
            "  if (!BASE_PATH || !pathname.startsWith(BASE_PATH)) return pathname;",
            "  return pathname.slice(BASE_PATH.length) || \"/\";",
            "}",
        ],
        "src/lib/base-path.ts",
    )
    doc.table(
        ["场景", "是否自动带前缀", "正确写法"],
        [
            ["<Link href=\"/discover\">", "是", "直接写站内绝对路径"],
            ["router.push(\"/me\") / redirect(\"/me\")", "是", "直接写，切勿再拼 withBasePath，否则前缀重复"],
            ["<form action=\"/admin/users\">", "否", "action={withBasePath(\"/admin/users\")}"],
            ["fetch(\"/api/v1/me\")", "否", "经 client.ts 的 apiGet/apiPost，内部已加前缀"],
            ["window.location / history.pushState", "否", "手动 withBasePath"],
            ["路由比对（usePathname）", "否（返回值带前缀）", "先用 stripBasePath 再比对"],
        ],
        widths=[5.4, 3.4, 7.4],
    )
    doc.note(
        "后台筛选表单曾直接写 action=\"/admin/verifications\"，本地无前缀所以正常，"
        "上线后点击「筛选」跳到域名根目录 404。修复方式为统一使用 withBasePath。"
        "新增任何原生 form action 时必须走该函数。",
        "踩坑记录",
    )

    # ================================================================== 第 5 章
    doc.h1("5. 数据模型")
    doc.p(
        "数据层使用 Prisma + SQLite。SQLite 不支持 enum，所有状态字段均为 String，取值由 src/lib/constants.ts "
        "与各动作层共同约束。模型定义见 prisma/schema.prisma（共 17 个模型）。"
    )

    doc.h2("5.1 模型总览")
    doc.table(
        ["模型", "表意", "关键唯一约束 / 索引"],
        [
            ["User", "账号", "email、phone 各自唯一（均可空）"],
            ["Session", "登录会话", "主键即 token；userId 索引"],
            ["Company", "公司（厂）", "name 唯一"],
            ["Employment", "用户 × 公司 × 在职/离职 的认证记录", "userId + companyId + kind 唯一；status、companyId 索引"],
            ["Faction", "兴趣派", "slug 唯一；category、companyId、status 索引"],
            ["FactionMember", "派成员关系", "factionId + userId 唯一；userId 索引"],
            ["Post", "帖子", "factionId + createdAt、status 索引"],
            ["Comment", "评论", "postId + createdAt 索引"],
            ["PostLike", "点赞", "postId + userId 唯一"],
            ["Activity", "活动", "factionId + startAt 索引"],
            ["ActivitySignup", "活动报名", "activityId + userId 唯一"],
            ["LeaderApplication", "派主 / 副派主申请", "status、factionId 索引"],
            ["InviteCode", "邀请码申请与邀请码", "code 唯一；status、factionId、leaderId 索引"],
            ["Notification", "站内通知", "userId + createdAt 索引"],
            ["MailMessage", "邮件留痕（含开发模式验证码）", "to + createdAt 索引"],
            ["AuditLog", "运营操作审计", "createdAt 索引"],
            ["Report", "举报", "targetType + targetId + reporterId 唯一；status + createdAt 索引"],
        ],
        widths=[4.0, 6.2, 6.2],
    )

    doc.h2("5.2 User / Session")
    doc.table(
        ["字段", "类型", "说明"],
        [
            ["id", "String @id", "cuid 主键"],
            ["email", "String?", "邮箱注册时写入；手机号注册为空。唯一"],
            ["phone", "String?", "11 位手机号；邮箱注册为空。唯一"],
            ["passwordHash", "String", "bcrypt(cost=10)，任何接口与页面均不得返回"],
            ["nickname", "String", "2~16 字；改资料时做全局重名校验"],
            ["avatarColor", "String", "头像底色，注册时由昵称哈希生成"],
            ["bio", "String?", "简介，最多 60 字；邀请注册时写入来源说明"],
            ["role", "String", "USER | ADMIN"],
            ["status", "String", "ACTIVE | DISABLED"],
            ["disabledReason", "String?", "禁用原因，登录时回显"],
            ["lastLoginAt", "DateTime?", "登录成功即更新"],
            ["createdAt / updatedAt", "DateTime", "创建与更新时间"],
        ],
        widths=[4.2, 3.4, 8.6],
    )
    doc.table(
        ["字段", "类型", "说明"],
        [
            ["id", "String @id", "即会话 token（crypto.randomBytes(32).toString(\"hex\")）"],
            ["userId", "String", "外键，级联删除"],
            ["expiresAt", "DateTime", "默认 30 天后过期；读取时若过期则删除并视为未登录"],
            ["createdAt", "DateTime", "创建时间"],
        ],
        widths=[4.2, 3.4, 8.6],
    )

    doc.h2("5.3 Company / Employment")
    doc.table(
        ["字段", "类型", "说明"],
        [
            ["id", "String", "主键"],
            ["name", "String", "公司全名，唯一"],
            ["shortName", "String", "公司短名，用于徽章与文案"],
            ["domains", "String", "企业邮箱域名，逗号分隔，如 alibaba-inc.com,alibaba.com"],
            ["industry", "String", "行业，默认「互联网」"],
            ["color / logoText", "String", "品牌色与 logo 字符"],
            ["verifiedCount", "Int", "已认证人数，认证通过时 +1"],
        ],
        widths=[4.2, 3.4, 8.6],
    )
    doc.table(
        ["字段", "类型", "说明"],
        [
            ["id", "String", "主键"],
            ["userId / companyId", "String", "外键，级联删除"],
            ["kind", "String", "ACTIVE 在职 | ALUMNI 离职"],
            ["status", "String", "PENDING 待审 | VERIFIED 已认证 | REJECTED 驳回"],
            ["method", "String", "EMAIL 邮箱验证 | MANUAL 人工审核"],
            ["workEmail", "String?", "在职认证使用的企业邮箱（脱敏后展示）"],
            ["title", "String?", "部门 / 职位"],
            ["startedYear / leftYear", "Int?", "入离职年份，离职年份不得早于入职"],
            ["proofFiles", "String?", "证明材料相对路径，逗号分隔"],
            ["proofNote", "String?", "离职说明（必填）"],
            ["verifyCode / codeExpiresAt", "String? / DateTime?", "6 位验证码与有效期（10 分钟）"],
            ["attempts", "Int", "验证码错误次数，达到 5 次需重新获取"],
            ["reviewerId / reviewerNote / reviewedAt", "—", "审核人、审核意见与时间"],
            ["verifiedAt", "DateTime?", "认证通过时间"],
        ],
        widths=[4.2, 3.4, 8.6],
    )
    doc.note(
        "一个账号可认证多家公司：唯一键为 (userId, companyId, kind)，同一公司在职与离职可各有一条记录。"
        "展示身份时由 pickUserIdentity 依次按「本派所属公司 → 在职 → 首条」挑选。",
        "设计要点",
    )

    doc.h2("5.4 Faction / FactionMember")
    doc.table(
        ["字段", "类型", "说明"],
        [
            ["id", "String", "主键"],
            ["name", "String", "派名称"],
            ["slug", "String", "路由标识，唯一；生成规则 `${category.toLowerCase()}-${shortId(6)}`"],
            ["companyId", "String", "所属公司"],
            ["category", "String", "25 个分类之一，见第 12 章"],
            ["emoji / tagline / description", "String", "封面 emoji、一句话主张、详细介绍"],
            ["joinMode", "String", "OPEN 自由加入 | APPROVAL 需审批"],
            ["allowCrossCompany", "Boolean", "是否允许其它公司认证用户申请加入"],
            ["status", "String", "REVIEWING 筹备审核 | ACTIVE 运营中 | ARCHIVED 已关闭"],
            ["sortOrder", "Int", "展示权重，越大越靠前；0 表示按成员数排序"],
            ["leaderId", "String?", "派主；为空表示该派正在招募派主，由运营代管"],
            ["memberCount / postCount", "Int", "成员数与已发布帖子数（事务内维护）"],
        ],
        widths=[4.2, 3.4, 8.6],
    )
    doc.table(
        ["字段", "类型", "说明"],
        [
            ["factionId / userId", "String", "联合唯一，一人一派一条记录"],
            ["role", "String", "LEADER | ADMIN | MEMBER"],
            ["status", "String", "ACTIVE | PENDING | LEFT | REMOVED"],
            ["joinedAt", "DateTime", "首次加入时间"],
            ["appliedAt", "DateTime?", "最近一次提交申请的时间；直接加入时为 null"],
        ],
        widths=[4.2, 3.4, 8.6],
    )
    doc.note(
        "同一个 (factionId, userId) 只有一行：退出后重新加入走 upsert，会刷新 appliedAt 并把 role 复位为 MEMBER"
        "（派主除外），避免被移出的副派主通过自助申请恢复管理权。",
        "状态机要点",
    )

    doc.h2("5.5 Post / Comment / PostLike")
    doc.table(
        ["字段", "类型", "说明"],
        [
            ["factionId / authorId", "String", "所属派与作者"],
            ["kind", "String", "POST 普通帖 | ANNOUNCE 公告 | ACTIVITY 活动召集"],
            ["title", "String?", "公告类必填，普通帖可选"],
            ["content", "String", "正文"],
            ["images", "String?", "图片路径，逗号分隔"],
            ["pinned", "Boolean", "置顶，列表按 pinned + createdAt 排序"],
            ["status", "String", "PUBLISHED | HIDDEN | DELETED"],
            ["likeCount / commentCount", "Int", "计数，点赞与评论增删时同步维护"],
        ],
        widths=[4.2, 3.4, 8.6],
    )
    doc.p(
        "Comment 仅含 postId、authorId、content、status（PUBLISHED | HIDDEN）与 createdAt；"
        "PostLike 以 (postId, userId) 唯一约束防止重复点赞，点赞采用「存在即取消」的幂等切换。"
    )

    doc.h2("5.6 Activity / ActivitySignup")
    doc.table(
        ["字段", "类型", "说明"],
        [
            ["factionId / creatorId", "String", "所属派与发起人"],
            ["title / description / location", "String", "标题、说明、地点"],
            ["startAt", "DateTime", "开始时间"],
            ["capacity", "Int", "人数上限，默认 20"],
            ["signupCount", "Int", "已报名人数"],
            ["status", "String", "OPEN | CLOSED | CANCELLED"],
        ],
        widths=[4.2, 3.4, 8.6],
    )
    doc.p(
        "ActivitySignup 记录 (activityId, userId) 唯一，status 为 GOING | CANCELLED；"
        "取消报名保留记录，重新报名时复用同一行，便于统计真实参与意向。"
    )

    doc.h2("5.7 LeaderApplication / InviteCode")
    doc.table(
        ["字段", "类型", "说明"],
        [
            ["factionId / userId", "String", "目标派与申请人"],
            ["requestedRole", "String", "LEADER 派主 | ADMIN 副派主"],
            ["reason / plan", "String", "申请理由（≥5 字）、运营计划（≥10 字）"],
            ["experience", "String?", "过往带队经验"],
            ["proofImage", "String?", "带队截图相对路径"],
            ["status", "String", "PENDING | APPROVED | REJECTED"],
            ["reviewerId / reviewerNote / reviewedAt", "—", "审核信息"],
        ],
        widths=[4.2, 3.4, 8.6],
    )
    doc.table(
        ["字段", "类型", "说明"],
        [
            ["code", "String?", "通过后生成的 8 位邀请码，字符集去掉 I/O/0/1；唯一"],
            ["factionId / leaderId", "String", "目标派与申请人（派主或副派主）"],
            ["note", "String", "邀请用途说明（2~120 字）"],
            ["status", "String", "PENDING | APPROVED | REJECTED"],
            ["usedById / usedAt", "String? / DateTime?", "核销人与核销时间"],
            ["expiresAt", "DateTime?", "生成时写入，默认 30 天有效"],
            ["reviewerId / reviewerNote / reviewedAt", "—", "审核信息"],
        ],
        widths=[4.2, 3.4, 8.6],
    )

    doc.h2("5.8 Notification / MailMessage / AuditLog / Report")
    doc.table(
        ["模型", "关键字段", "说明"],
        [
            ["Notification", "userId、type、title、body、link、readAt", "type 为 VERIFY | LEADER | POST | COMMENT | ACTIVITY | SYSTEM；readAt 为空即未读"],
            ["MailMessage", "to、subject、body、code", "记录每封系统邮件的投递结果；开发模式正文直接含验证码"],
            ["AuditLog", "actorId、action、targetType、targetId、note", "运营操作审计，动作字典见第 11.13 节"],
            ["Report", "targetType、targetId、reporterId、reason、detail、status、handledBy*", "同一用户对同一对象只能举报一次；status 为 PENDING | RESOLVED | IGNORED"],
        ],
        widths=[3.2, 6.6, 6.4],
    )

    doc.h2("5.9 数据一致性约定")
    doc.bullets([
        "计数列（memberCount / postCount / likeCount / commentCount / signupCount / verifiedCount）只与状态迁移同事务更新，禁止先改状态后补计数。",
        "邀请码核销使用 updateMany + 条件（status=APPROVED AND usedById IS NULL），通过 count!==1 判定并发抢占，放在注册事务内。",
        "跨公司开关关闭时，由 revokeCrossCompanyPendingApplications 在同一事务里把仍为 PENDING 的跨公司申请置为 REMOVED 并批量写通知，避免与审批并发导致计数漂移。",
        "审批类动作统一用 updateMany({ where: { id, status: \"PENDING\" } }) 并校验 count，防止重复点击造成二次处理。",
        "帖子、评论、活动采用软删除（状态位），不物理删除，保留审计与举报追溯能力。",
    ])
