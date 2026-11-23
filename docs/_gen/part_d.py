# -*- coding: utf-8 -*-
"""第 13 ~ 17 章与附录：开发规范、本地开发、构建部署、排障、附录。"""


def build(doc):
    # ================================================================== 第 13 章
    doc.h1("13. 开发规范与最佳实践")

    doc.h2("13.1 新增一个页面的标准步骤")
    doc.numbered([
        "在 src/app 下对应 Route Group 内创建 page.tsx；需要独立导航壳时新增 layout.tsx。",
        "页面默认写成 async 服务端组件，用 requireUser / requireAdmin 做第一道守卫，再直接调用 prisma 取数。",
        "列表查询必须分页（take/skip），关联用户字段使用 PUBLIC_USER / IDENTIFIED_USER / ADMIN_USER 白名单。",
        "需要交互的部分拆成客户端组件，通过 props 传入已序列化的数据；日期在客户端用 revive.ts 还原。",
        "所有写操作调用 src/lib/actions 中已有动作；没有合适动作时新增，并在动作内部重新鉴权。",
        "原生 <form action> 使用 withBasePath；<Link> 与 redirect 保持裸路径。",
        "页面顶部导出 metadata = { title: \"...\" }，文案与既有页面保持同一语气。",
    ])

    doc.h2("13.2 新增一个 Server Action 的检查表")
    doc.table(
        ["检查项", "要求"],
        [
            ["文件首行", "\"use server\""],
            ["鉴权", "getCurrentUser / requireUser / requireAdmin，禁止信任页面传入的身份"],
            ["入参", "String(formData.get(...) ?? \"\") 收敛类型；数字用 Number(...) || null"],
            ["校验", "表单类用 zod；业务规则用显式 if + 明确中文提示"],
            ["权限", "成员类操作必须查 FactionMember 并校验 status=ACTIVE 与 role"],
            ["事务", "多表写入（状态 + 计数 + 通知）放进 prisma.$transaction"],
            ["并发", "审批与核销用 updateMany + count 校验，避免重复处理"],
            ["副作用", "notify / notifyAdmins、revalidatePath，运营动作追加 audit"],
            ["返回", "重定向型用 back()，状态型返回 ActionState；错误信息面向用户可读"],
        ],
        widths=[3.0, 13.2],
    )

    doc.h2("13.3 basePath 规范")
    doc.bullets([
        "判断标准：这段代码在浏览器里直接产生请求地址吗？是 → 需要前缀；只是路由跳转 → 不需要。",
        "需要：<form action>、fetch、axios、window.location、history.pushState、复制到剪贴板的链接、邮件正文里的链接。",
        "不需要：next/link、router.push、redirect、revalidatePath（这些由框架处理）。",
        "处理 incoming pathname（如判断当前 tab）时先 stripBasePath。",
        "本地开发未设置 NEXT_PUBLIC_BASE_PATH，问题不会暴露；涉及表单与 fetch 的改动必须在带前缀的构建下验证一次。",
    ])

    doc.h2("13.4 表单与反馈规范")
    doc.code(
        [
            "// 必填标记：CSS 依据 data-required 追加红色星号",
            "<p className=\"label\" data-required>免责协议</p>",
            "<input type=\"checkbox\" name=\"terms\" value=\"true\" required aria-required=\"true\" />",
            "",
            "// 不可逆操作：确认框 + pending 态",
            "<ConfirmSubmit confirmText=\"确定要退出登录吗？\">退出登录</ConfirmSubmit>",
            "",
            "// 普通提交",
            "<SubmitButton>保存</SubmitButton>",
        ],
        "统一写法",
    )
    doc.bullets([
        "确认文案必须包含对象名称（如「确定要退出『瑜伽派』吗？」），避免用户误操作。",
        "服务端返回的 fieldErrors 要逐字段渲染到输入框下方，不能只给一个顶部提示。",
        "成功与失败都通过 redirect 带回 ?ok= / ?error=，由页面顶部 Notice 统一展示。",
    ])

    doc.h2("13.5 数据安全规范")
    doc.table(
        ["风险点", "现有措施", "开发时要求"],
        [
            ["密码泄露", "bcrypt(cost=10)；白名单剔除 passwordHash", "任何查询用户的地方都不 select 全字段；getViewer 已剔除"],
            ["越权访问", "动作内二次鉴权 + 资源归属校验", "新增资源查询必须同时校验 owner/faction 关系"],
            ["消息越权", "所有通知查询带 userId；跨用户详情 notFound", "后台查询必须 requireAdmin"],
            ["上传攻击", "类型白名单 + 6MB 上限 + 随机文件名", "不得把用户文件名直接拼进路径"],
            ["注入", "Prisma 参数化查询", "禁止拼接 SQL 字符串"],
            ["会话劫持", "HttpOnly + SameSite=lax + 生产 Secure", "不得把 token 写入 localStorage"],
            ["CSRF", "Server Actions 内建来源校验 + SameSite", "新增 Route Handler 写接口需确认来源与鉴权"],
            ["敏感信息外泄", "API 白名单；dev flight 载荷收敛", "新增字段先判断是否应出现在客户端"],
        ],
        widths=[2.6, 6.6, 7.0],
        size=8.8,
    )

    doc.h2("13.6 事务与并发规范")
    doc.bullets([
        "状态迁移与计数更新必须同一事务：成员增减 / 帖子数 / 点赞数 / 评论数 / 报名数 / 认证人数。",
        "审批类操作使用 updateMany({ where: { id, status: \"PENDING\" } }) 并判断 count，避免双击重复处理。",
        "批量作废（跨公司申请）在事务内完成「查快照 → updateMany → createMany 通知」，依赖 SQLite 写事务串行化保证一致性。",
        "邀请码核销与注册同事务，避免出现「用户已建、码未核销」或反向的中间态。",
        "跨表通知失败不应回滚主流程，通知放在事务外（现有实现即如此）。",
    ])

    doc.h2("13.7 命名与注释")
    doc.table(
        ["对象", "约定", "示例"],
        [
            ["动作", "动词 + 名词 + Action", "createPostAction、adminReviewMemberAction"],
            ["组件", "大驼峰，文件名同组件名", "PostCard.tsx、ConfirmSubmit.tsx"],
            ["服务端能力", "小驼峰，文件为名词", "notify、pickUserIdentity、revokeCrossCompanyPendingApplications"],
            ["数据库字段", "小驼峰，状态用全大写字符串", "allowCrossCompany、status=\"ACTIVE\""],
            ["注释", "解释「为什么」而不是「做了什么」；复杂并发与门禁必写", "见 membership.ts 与 joinFactionAction 顶部说明"],
        ],
        widths=[3.0, 6.0, 7.2],
    )

    # ================================================================== 第 14 章
    doc.h1("14. 本地开发指南")

    doc.h2("14.1 首次启动")
    doc.code(
        [
            "# 1. 安装依赖",
            "npm install",
            "",
            "# 2. 配置环境变量（项目未提供 .env.example，按附录 B 手工创建 .env）",
            "$EDITOR .env",
            "",
            "# 3. 初始化数据库并灌入演示数据",
            "npm run setup",
            "",
            "# 4. 启动开发服务器",
            "npm run dev            # http://localhost:3000",
        ],
        "初始化",
    )
    doc.note(
        "本地开发不要设置 NEXT_PUBLIC_BASE_PATH，保持为空，否则需要访问 http://localhost:3000/shipai。",
        "注意",
    )

    doc.h2("14.2 本地数据与测试账号")
    doc.table(
        ["账号", "密码", "说明"],
        [
            ["admin@changpai.app", "demo123456", "运营账号（role=ADMIN），登录 /admin/login"],
            ["zhixia@alibaba-inc.com", "demo123456", "阿里瑜伽派派主（演示成员账号之一）"],
            ["gunan@tencent.com", "demo123456", "腾讯离职校友，鹏城徒步派派主"],
            ["其他 LEAD_USERS", "demo123456", "seed.ts 中 LEAD_USERS 列表内的邮箱均可直接登录"],
        ],
        widths=[5.0, 3.0, 8.2],
    )
    doc.bullets([
        "prisma/seed.ts 会写入 COMPANIES 中定义的公司、FACTIONS 中定义的派，以及演示成员、帖子、活动与通知。",
        "重置数据：npm run db:reset（force-reset 后重新 seed；仅用于本地演示库）。",
        "开发模式：NEXT_PUBLIC_DEV_MODE=true 时验证码直接回显，不需要真实 SMTP。",
        "邮件留痕：任何环境下发送的邮件都会写入 MailMessage，可在 /inbox 查看投递结果。",
    ])

    doc.h2("14.3 常用调试手段")
    doc.table(
        ["现象", "调试方式"],
        [
            ["页面取数异常", "在 page.tsx 内临时 console.log，或访问对应 /api/v1 端点对照 JSON"],
            ["动作未生效", "确认 form 的 action 绑定、name 属性与动作读取的字段名一致"],
            ["样式异常", "检查 class 是否被 Tailwind 扫描（路径在 content 中）、是否使用了未定义令牌"],
            ["子路径问题", "用 NEXT_PUBLIC_BASE_PATH=/shipai npm run build && npm start 复现"],
            ["数据库结构", "npx prisma studio 可视化查看；或 sqlite3 prisma/dev.db \"select ...\""],
        ],
        widths=[3.6, 12.6],
    )

    # ================================================================== 第 15 章
    doc.h1("15. 构建与部署")

    doc.h2("15.1 生产架构")
    doc.code(
        [
            "浏览器",
            "  │  https://<域名>/shipai/...",
            "  ▼",
            "Nginx（manban.conf 引入 shipai.locations.conf）",
            "  │  location = /shipai 与 location /shipai/ → proxy_pass http://127.0.0.1:3010",
            "  ▼",
            "Next.js（systemd 用户服务 shipai.service，next start -H 127.0.0.1 -p 3010）",
            "  ▼",
            "SQLite：/home/tuoniao/apps/shipai/prisma/prod.db",
            "静态上传：/home/tuoniao/apps/shipai/public/uploads/",
        ],
        "请求链路",
    )
    doc.table(
        ["组件", "文件", "关键配置"],
        [
            ["Nginx 片段", ".deploy/shipai.locations.conf", "两个 location、保留完整前缀、client_max_body_size 12m、read_timeout 120s"],
            ["systemd 服务", ".deploy/shipai.service", "WorkingDirectory=/home/tuoniao/apps/shipai；NODE_ENV=production；PORT=3010；Restart=always；日志 append 到 app.log"],
            ["首次安装脚本", ".deploy/deploy-nginx.sh", "安装 location 文件、include 到 manban.conf、nginx -t、reload、enable-linger"],
        ],
        widths=[3.4, 4.6, 8.2],
        size=8.8,
    )

    doc.h2("15.2 发布流程")
    doc.p("本项目采用「本地构建 + 产物上传」的方式发布，服务器不执行 next build。标准步骤如下：")
    doc.code(
        [
            "# 1. 本地构建（务必带子路径，否则资源与路由前缀错误）",
            "NEXT_PUBLIC_BASE_PATH=/shipai npm run build",
            "",
            "# 2. 打包产物（排除依赖、缓存、数据库与本地配置）",
            "tar czf shipai-upload.tar.gz \\",
            "  --exclude=./node_modules --exclude=./.next/cache --exclude=./.git \\",
            "  --exclude=./.env --exclude=./prisma/dev.db --exclude=./prisma/prod.db \\",
            "  --exclude=./dev.log --exclude=./.runtime --exclude=./tsconfig.tsbuildinfo \\",
            "  --exclude='./.deploy/*.png' .",
            "",
            "# 3. 上传",
            "scp shipai-upload.tar.gz manban:/home/tuoniao/apps/shipai-upload.tar.gz",
            "",
            "# 4. 远端切换（保留上一版用于回滚）",
            "ssh manban 'cd /home/tuoniao/apps/shipai && \\",
            "  mv .next .next.prev-$(date +%Y%m%d%H%M) && \\",
            "  tar xzf ../shipai-upload.tar.gz && \\",
            "  rm -f ../shipai-upload.tar.gz'",
            "",
            "# 5. 若本次包含 schema 变更（仅首次或结构变化时执行）",
            "ssh manban 'cd /home/tuoniao/apps/shipai && \\",
            "  npx prisma generate && npx prisma db push --skip-generate'",
            "",
            "# 6. 重启服务",
            "ssh manban 'export XDG_RUNTIME_DIR=/run/user/$(id -u); \\",
            "  systemctl --user restart shipai && systemctl --user status shipai --no-pager'",
        ],
        "发布命令",
    )
    doc.note(
        "打包必须排除 .next/cache：缓存目录可达数百 MB，含缓存的最小产物约 1.7MB，否则上传与解压都会明显变慢。"
        "也绝不能把 .env、数据库文件、dev.log 带到服务器。",
        "打包体积",
    )

    doc.h2("15.3 发布后验证")
    doc.numbered([
        "curl -I https://<域名>/shipai/ 应返回 200（或 307 到 /shipai）。",
        "确认 .next/BUILD_ID 与本地构建一致，排除产物未替换的情况。",
        "打开首页、/discover、/login、/admin/login，确认静态资源与样式正常。",
        "抽查一个带原生 form 的页面（如后台筛选、用户端搜索），点击后地址应保留 /shipai 前缀。",
        "登录后检查关键写操作：发帖、评论、加入申请、审核动作是否成功并有正确提示。",
        "查看 app.log 是否有 Prisma 或运行时异常。",
    ])

    doc.h2("15.4 回滚")
    doc.code(
        [
            "ssh manban 'cd /home/tuoniao/apps/shipai && \\",
            "  mv .next .next.bad-$(date +%Y%m%d%H%M) && \\",
            "  mv .next.prev-202611061628 .next && \\",
            "  export XDG_RUNTIME_DIR=/run/user/$(id -u); systemctl --user restart shipai'",
        ],
        "回滚到上一版",
    )
    doc.bullets([
        "只回滚代码不回滚数据库：若新版本执行过破坏性 schema 变更，回滚前需评估字段兼容性。",
        "保留策略：至少保留一份 .next.prev-<时间戳>；确认新版本稳定后可清理更早的副本。",
        "回滚后同样执行 15.3 的验证清单。",
    ])

    doc.h2("15.5 数据库变更流程")
    doc.numbered([
        "修改 prisma/schema.prisma。",
        "本地执行 npx prisma db push 并 npm run db:seed（如需要）验证。",
        "确认改动为向后兼容（新增可空字段或带默认值），避免旧版本代码读取报错。",
        "发布时在服务器执行 npx prisma generate 与 npx prisma db push --skip-generate。",
        "db push 前先备份生产库：cp prisma/prod.db prisma/prod.db.bak-<时间戳>。",
        "重启服务并验证相关页面。",
    ])
    doc.note(
        "本项目没有 migrations 目录，db push 会直接改结构，删除字段或改类型可能丢数据。"
        "生产环境执行前必须备份，且避免在高峰期操作。",
        "高风险操作",
    )

    # ================================================================== 第 16 章
    doc.h1("16. 运维与排障")

    doc.h2("16.1 常见问题速查")
    doc.table(
        ["现象", "根因", "处理"],
        [
            ["后台点击「筛选」跳到域名根目录 404", "原生 form action 写死绝对路径，缺少 basePath", "改为 action={withBasePath(\"/admin/...\")}；排查 grep 'action=\"/'"],
            ["静态资源 /_next 404", "构建时未设置 NEXT_PUBLIC_BASE_PATH", "带前缀重新构建并发布，不要复用旧产物"],
            ["上传材料报 413", "Nginx 或 Server Action 体积超限", "确认 client_max_body_size 12m 与 bodySizeLimit 8mb；文件 ≤6MB"],
            ["验证码收不到", "SMTP 未配置或授权码失效", "查看 /inbox 的投递结果与 app.log；必要时开启 DEV_MODE 应急"],
            ["邀请码提示无效", "未通过审核 / 已使用 / 已过期 / 派未上线", "后台 /admin/invites 核对状态与有效期"],
            ["登录后立即掉线", "账号被禁用、Cookie 名变更、生产用 http 访问（Secure）", "检查 user.status、SESSION_COOKIE、访问协议"],
            ["改了密码其它设备仍在线", "会话未清理", "changePasswordAction 已删除其它 Session；确认走的是该动作"],
            ["数据表不存在 / 页面空白", "DATABASE_URL 相对路径解析到 prisma/ 目录、未执行 db push", "确认库文件为 prisma/prod.db，执行 prisma db push"],
            ["Prisma Client 类型报错", "schema 改了但未 generate", "npm run build（含 generate）或 npx prisma generate"],
            ["构建后样式全丢", "Tailwind content 未覆盖新目录或未引入 globals.css", "检查 tailwind.config.ts 与根 layout"],
            ["后台角标数量不对", "统计条件与页面筛选条件不一致", "对照 layout.tsx 的 Promise.all 统计口径"],
            ["日志页出现英文 Key", "ACTION_LABEL 未覆盖新动作", "在 logs/page.tsx 的字典中补充标签与色调"],
        ],
        widths=[4.4, 5.4, 6.4],
        size=8.6,
    )

    doc.h2("16.2 日志与监控")
    doc.bullets([
        "应用日志：/home/tuoniao/apps/shipai/app.log（systemd 以 append 方式写入，含 Next 与 Prisma 错误）。",
        "服务状态：export XDG_RUNTIME_DIR=/run/user/$(id -u); systemctl --user status shipai。",
        "Nginx 日志：/var/log/nginx/access.log 与 error.log，用于排查 4xx/5xx 与代理超时。",
        "业务排查：/admin/logs 查看运营动作，/inbox 查看邮件投递，数据库可用 sqlite3 只读查询。",
        "会话表会随登录累积，建议定期执行 DELETE FROM Session WHERE expiresAt < datetime('now')。",
    ])

    doc.h2("16.3 安全运维建议")
    doc.bullets([
        "生产环境必须设置 NEXT_PUBLIC_DEV_MODE=false，避免验证码回显到页面。",
        "SMTP 授权码只放在服务器 .env，禁止提交到仓库或写入文档。",
        "数据库文件与 public/uploads 纳入备份范围，备份文件不要放在可公开访问目录。",
        "运营账号遵循最小数量原则：系统始终保留至少一名 ADMIN（动作层已做校验）。",
        "定期轮换数据库备份与 SMTP 授权码；离任运营及时降权并强制下线。",
    ])

    # ================================================================== 第 17 章
    doc.h1("17. 附录")

    doc.h2("17.1 命令速查")
    doc.table(
        ["场景", "命令"],
        [
            ["安装依赖", "npm install"],
            ["初始化数据库", "npm run setup"],
            ["本地开发", "npm run dev"],
            ["代码检查", "npm run lint"],
            ["同步 schema", "npm run db:push"],
            ["灌入种子数据", "npm run db:seed"],
            ["重置数据库", "npm run db:reset"],
            ["生产构建", "NEXT_PUBLIC_BASE_PATH=/shipai npm run build"],
            ["可视化数据库", "npx prisma studio"],
            ["打包产物", "tar czf shipai-upload.tar.gz --exclude=./node_modules --exclude=./.next/cache ."],
            ["重启服务", "ssh manban 'export XDG_RUNTIME_DIR=/run/user/$(id -u); systemctl --user restart shipai'"],
            ["查看日志", "ssh manban 'tail -n 200 /home/tuoniao/apps/shipai/app.log'"],
        ],
        widths=[4.2, 12.0],
    )

    doc.h2("17.2 环境变量模板")
    doc.code(
        [
            "# 数据库（相对 prisma/ 目录解析）",
            "DATABASE_URL=\"file:./dev.db\"",
            "",
            "# 会话",
            "SESSION_COOKIE=\"shipai_session\"",
            "SESSION_DAYS=\"30\"",
            "",
            "# 开发模式：true 时验证码回显、邮件只留痕；生产必须 false",
            "NEXT_PUBLIC_DEV_MODE=\"true\"",
            "",
            "# 邮件服务（生产填写真实授权码，切勿提交仓库）",
            "SMTP_HOST=\"\"",
            "SMTP_PORT=\"465\"",
            "SMTP_USER=\"\"",
            "SMTP_PASS=\"\"",
            "SMTP_FROM=\"\"",
            "",
            "# 部署子路径（仅构建时使用，本地留空）",
            "# NEXT_PUBLIC_BASE_PATH=\"/shipai\"",
        ],
        "环境变量模板",
    )

    doc.h2("17.3 上线检查清单")
    doc.table(
        ["类别", "检查项", "完成"],
        [
            ["构建", "带 NEXT_PUBLIC_BASE_PATH 构建；BUILD_ID 与本地一致", "□"],
            ["配置", "服务器 .env 完整；NEXT_PUBLIC_DEV_MODE=false；SMTP 可用", "□"],
            ["数据库", "已备份；prisma generate 与 db push 已执行", "□"],
            ["服务", "systemctl --user restart 成功；app.log 无异常", "□"],
            ["功能", "首页 / 发现 / 登录 / 后台登录可访问；表单前缀正确", "□"],
            ["写操作", "注册、认证、加入派、发帖、评论、审核各抽查一次", "□"],
            ["权限", "普通账号无法进入 /admin；跨用户消息返回 404", "□"],
            ["回滚", "保留上一版 .next.prev-<时间戳>；回滚命令已验证", "□"],
            ["清理", "临时会话、临时账号、上传包、误建文件已删除", "□"],
        ],
        widths=[2.4, 11.2, 2.0],
        size=8.8,
    )

    doc.h2("17.4 已知限制与改进建议")
    doc.table(
        ["问题", "现状", "建议"],
        [
            ["邮件发件记录可见范围过大", "/inbox 展示平台全部 MailMessage（含收件地址与开发模式验证码）", "改为仅运营可见，或按当前用户邮箱过滤；生产关闭 DEV_MODE 后移除验证码展示"],
            ["审计动作字典不完整", "APPROVE_INVITE、RESET_PASSWORD、CREATE_ACTIVITY 等未配中文标签", "补齐 logs/page.tsx 的 ACTION_LABEL，避免日志页出现英文 Key"],
            ["缺少自动化测试", "无单元 / E2E 测试脚本", "优先为邀请码核销、跨公司门禁、审批幂等补集成测试"],
            ["SQLite 单机", "并发写入串行化，扩展性有限", "访问量上来后迁移 PostgreSQL，并改用 migrations"],
            ["登录无限流", "仅验证码发送有 60 秒频控", "为登录失败增加按 IP / 账号的节流与告警"],
            ["通知无分组聚合", "每条业务事件单独写入", "对高频事件（点赞、评论）做聚合，减少收件箱噪声"],
            ["派分类硬编码", "分类与渐变写在 constants.ts", "如需运营动态增删分类，迁移到数据库并保留回退值"],
            ["图片存储本地磁盘", "public/uploads 随发布目录迁移", "多实例部署前改为对象存储并保留访问前缀兼容"],
        ],
        widths=[3.6, 6.4, 6.2],
        size=8.6,
    )

    doc.h2("17.5 文档维护说明")
    doc.p(
        "本文档基于当前代码库（src、prisma、.deploy）整理，覆盖 17 个数据模型、32 个页面路由、"
        "14 个 API 端点与 8 个动作文件。代码变更时请同步更新对应章节："
        "新增模型 → 第 5 章；新增动作 → 第 8 章；新增路由 → 第 7 章；"
        "新增枚举或状态 → 第 12 章；新增部署步骤 → 第 15 章；修复典型缺陷 → 第 16 章。"
    )
