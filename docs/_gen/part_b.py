# -*- coding: utf-8 -*-
"""第 6 ~ 10 章：认证与会话、路由地图、Server Actions、API 层、组件库。"""


def build(doc):
    # ================================================================== 第 6 章
    doc.h1("6. 认证、会话与权限")

    doc.h2("6.1 双入口设计")
    doc.p(
        "用户端与管理端使用两条完全独立的登录链路：用户端 /login 登录后回到站内页面；管理端 /admin/login 只接受 "
        "role=ADMIN 的账号，登录成功停留在 /admin 下，普通账号会被明确拒绝（提示「该账号不是运营账号」），"
        "而不是被静默重定向到用户端。两端退出动作也不同：logoutAction → /login，adminLogoutAction → /admin/login。"
    )
    doc.table(
        ["能力", "用户端", "管理端"],
        [
            ["入口路径", "/login、/register", "/admin/login"],
            ["身份要求", "任意未被禁用账号", "role = ADMIN 且未被禁用"],
            ["登录后跳转", "next 参数（必须是以单个 / 开头的站内路径）", "next 参数（必须以 /admin 开头）"],
            ["会话隔离", "共用同一 Cookie 与 Session 表", "共用同一 Cookie；角色校验在 requireAdmin"],
            ["退出", "logoutAction（4 处退出按钮均带确认框）", "adminLogoutAction"],
        ],
        widths=[3.6, 6.4, 6.4],
    )

    doc.h2("6.2 会话机制")
    doc.p(
        "会话采用「数据库 Session + HttpOnly Cookie」方案，不引入 JWT，便于运营强制下线与即时禁用。"
        "实现见 src/lib/auth.ts。"
    )
    doc.code(
        [
            "const COOKIE_NAME = process.env.SESSION_COOKIE || \"shipai_session\";",
            "const SESSION_DAYS = Number(process.env.SESSION_DAYS || 30);",
            "",
            "export async function createSession(userId: string) {",
            "  const token = crypto.randomBytes(32).toString(\"hex\");",
            "  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);",
            "  await prisma.session.create({ data: { id: token, userId, expiresAt } });",
            "  const jar = await cookies();",
            "  jar.set(COOKIE_NAME, token, {",
            "    httpOnly: true, sameSite: \"lax\", path: \"/\",",
            "    secure: process.env.NODE_ENV === \"production\", expires: expiresAt,",
            "  });",
            "}",
        ],
        "会话创建",
    )
    doc.table(
        ["属性", "取值", "安全意义"],
        [
            ["名称", "SESSION_COOKIE，缺省 shipai_session", "可通过环境变量改名"],
            ["值", "32 字节随机数（64 位十六进制）", "不可预测，非用户信息编码"],
            ["HttpOnly", "true", "前端脚本无法读取，降低 XSS 窃取风险"],
            ["SameSite", "lax", "阻断绝大多数跨站表单提交携带会话"],
            ["Secure", "生产 true / 开发 false", "生产只走 HTTPS"],
            ["有效期", "SESSION_DAYS（默认 30 天）", "数据库与 Cookie 同步过期"],
            ["path", "/", "子路径部署下全站可用"],
        ],
        widths=[2.6, 6.4, 7.4],
    )
    doc.bullets([
        "过期清理：读取会话时若 expiresAt 已过，立即 deleteMany 并返回 null，避免脏数据堆积。",
        "禁用即时生效：getCurrentUser 发现 user.status=DISABLED，会删除该用户全部 Session 并视为未登录。",
        "修改密码：保留当前设备会话，删除该用户其余全部 Session。",
        "运营强制下线 / 重置密码：直接 deleteMany 该用户全部 Session。",
        "退出：destroySession 先删库再删 Cookie，两端各自实现。",
    ])

    doc.h2("6.3 当前用户与 Viewer")
    doc.p(
        "getCurrentUser 与 getViewer 都用 React 的 cache() 包裹，同一次请求内只查一次库，"
        "因此页面多个组件（TopBar、BottomNav、页面主体）重复调用不会产生额外查询。"
    )
    doc.table(
        ["函数", "返回", "说明"],
        [
            ["getCurrentUser()", "User | null", "包含 passwordHash，仅供服务端校验使用，不得传入客户端组件"],
            ["getViewer()", "Viewer | null", "剔除 passwordHash；附带 employments、verifiedEmployments、pendingEmployments、memberships、unreadCount、isVerified"],
            ["requireUser(next)", "User", "未登录 → /login?next=...；返回可含敏感字段的 User"],
            ["requireAdmin(next)", "User", "未登录 → /admin/login；role≠ADMIN → /admin/login?error=forbidden"],
            ["verifiedEmploymentAt(userId, companyId)", "Employment | null", "判断是否在该公司完成认证（在职或离职均可）"],
        ],
        widths=[5.2, 4.0, 7.2],
    )
    doc.note(
        "Viewer 会被传给 TopBar 等客户端组件，dev 模式的 Flight 调试载荷会携带全部字段，"
        "因此在 getViewer 边界处显式剔除 passwordHash（email 等展示字段保留）。"
        "页面查询用户时同样应使用 api.ts 中的 PUBLIC_USER / IDENTIFIED_USER / ADMIN_USER 白名单。",
        "字段泄露防护",
    )

    doc.h2("6.4 API 鉴权")
    doc.p(
        "Route Handler 不复用页面守卫（redirect 不适用于接口），而是走 src/lib/api.ts："
        "getApiUser 解析 Cookie、校验过期与禁用；requireApiUser 返回统一的 401 响应体。"
    )
    doc.code(
        [
            "export async function requireApiUser() {",
            "  const user = await getApiUser();",
            "  if (!user) return { user: null, response: apiError(\"请先登录\", 401) } as const;",
            "  return { user, response: null } as const;",
            "}",
            "",
            "// 调用侧",
            "const { user, response } = await requireApiUser();",
            "if (!user) return response;",
        ],
        "接口鉴权用法",
    )

    doc.h2("6.5 权限矩阵")
    doc.table(
        ["能力", "游客", "认证用户", "派成员", "副派主", "派主", "运营"],
        [
            ["浏览落地页 / 派列表", "√", "√", "√", "√", "√", "√"],
            ["查看派内帖子与成员", "×", "仅本派成员", "√", "√", "√", "√"],
            ["加入派", "×", "√", "—", "—", "—", "—"],
            ["发帖 / 评论 / 点赞", "×", "需已入派", "√", "√", "√", "√"],
            ["报名活动", "×", "需已入派", "√", "√", "√", "√"],
            ["审批加入申请", "×", "×", "×", "√", "√", "√（代批）"],
            ["移出成员 / 设副派主", "×", "×", "×", "×", "√", "√"],
            ["编辑派资料", "×", "×", "×", "√", "√", "√"],
            ["关闭派 / 转让派主", "×", "×", "×", "×", "√", "√（指派）"],
            ["申请邀请码", "×", "×", "×", "√", "√", "×"],
            ["身份审核 / 派主认证", "×", "×", "×", "×", "×", "√"],
            ["内容 / 评论 / 活动 / 举报治理", "×", "×", "×", "×", "√（仅本派内容）", "√"],
            ["用户管理 / 操作日志", "×", "×", "×", "×", "×", "√"],
        ],
        widths=[4.6, 1.5, 2.4, 1.8, 1.8, 1.8, 1.9],
        size=8.5,
    )

    # ================================================================== 第 7 章
    doc.h1("7. 路由地图")
    doc.p(
        "路由采用三个 Route Group：src/app/(app) 为登录后的用户端（共享 TopBar 与 BottomNav），"
        "src/app/(auth) 为登录注册（无导航壳），src/app/admin 为运营后台（独立布局，嵌套 (console) 分组承载侧边导航）。"
        "Route Group 只影响布局组织，不出现在 URL 中。"
    )

    doc.h2("7.1 用户端页面")
    doc.table(
        ["路径", "鉴权", "数据来源与功能"],
        [
            ["/", "公开", "未登录展示 Landing（统计、精选派、公司墙）；已登录展示我的派动态流 HomeFeed"],
            ["/discover", "公开", "派浏览器：分类、公司、关键词筛选，分页；未认证用户会被引导认证"],
            ["/search", "登录", "全站搜索派与帖子（form action 需 withBasePath）"],
            ["/factions/[slug]", "公开（内容需成员）", "派主页：资料、成员、帖子流、加入/退出、派主申请入口"],
            ["/factions/[slug]/apply", "登录", "申请派主 / 副派主（LeaderApplyForm）"],
            ["/factions/[slug]/manage", "派主/副派主", "管理台：成员审批、角色、内容、活动、邀请码、资料、交接"],
            ["/factions/[slug]/activities/[id]", "成员", "活动详情、报名/取消、发起人管理与运营治理入口"],
            ["/factions/new", "登录 + 已认证", "创建新派并同时提交派主认证"],
            ["/posts/[id]", "登录", "帖子详情、评论分页、点赞、举报、作者删除"],
            ["/notifications", "登录", "我的消息列表（分页、未读标记、全部已读）"],
            ["/notifications/[id]", "登录", "消息详情；跨用户访问返回 404，阅读后写 readAt"],
            ["/me", "登录", "个人资料、认证身份、我的派、申请状态、改资料、改密码、退出登录"],
            ["/verify", "登录", "身份认证中心：在职邮箱验证、离职材料提交、认证记录与结果"],
            ["/inbox", "登录", "平台邮件发件记录（投递状态、验证码留痕），用于排查送达问题"],
        ],
        widths=[4.6, 2.8, 9.0],
    )

    doc.h2("7.2 认证与后台页面")
    doc.table(
        ["路径", "鉴权", "说明"],
        [
            ["/login", "公开", "手机号 / 邮箱登录；支持 next 回跳"],
            ["/register", "公开", "注册：渠道切换、邀请码、免责协议（必勾选）"],
            ["/admin/login", "公开", "运营登录，仅接受 ADMIN"],
            ["/admin", "运营", "数据概览：待办统计、近 7 日新增、最近审核与审计"],
            ["/admin/verifications", "运营", "身份审核队列（在职验证码 / 离职材料），通过或驳回"],
            ["/admin/leaders", "运营", "派主认证与筹备派审核"],
            ["/admin/joins", "运营", "全站加入申请，代批入口（支持 ?factionId= 定位）"],
            ["/admin/invites", "运营", "邀请码申请审核、发放与状态跟踪"],
            ["/admin/factions", "运营", "派列表：状态、分类、公司、成员数；可新建与筛选"],
            ["/admin/factions/[id]", "运营", "派详情：编辑资料、调整公司、指派派主、状态管理"],
            ["/admin/posts", "运营", "内容治理：隐藏 / 恢复 / 删除"],
            ["/admin/comments", "运营", "评论治理：隐藏 / 恢复 / 删除"],
            ["/admin/activities", "运营", "活动治理：关闭报名 / 恢复 / 删除，可代发活动"],
            ["/admin/reports", "运营", "举报队列：查看原文快照、处置内容或忽略"],
            ["/admin/users", "运营", "成员管理：搜索、筛选、查看认证与派关系"],
            ["/admin/users/[id]", "运营", "成员详情：禁用/启用、设为或取消运营、强制下线、重置密码"],
            ["/admin/notifications", "运营", "消息中心：全站通知列表，按类型分页检索，查看收件人"],
            ["/admin/logs", "运营", "操作日志：按动作与对象类型筛选，展示动作字典与操作人"],
        ],
        widths=[4.8, 2.2, 9.4],
    )

    doc.h2("7.3 API 端点")
    doc.table(
        ["方法与路径", "鉴权", "说明"],
        [
            ["GET /api/v1/companies", "公开", "公司列表，附派数量与已认证人数，按认证人数排序"],
            ["GET /api/v1/factions", "公开", "派列表；支持 category、company、q、status、page、pageSize，默认 12/页"],
            ["GET /api/v1/factions/[slug]", "公开", "派详情 + 当前用户成员关系 + 待审申请"],
            ["GET /api/v1/factions/[slug]/posts", "公开", "派内帖子分页（默认 10）"],
            ["POST /api/v1/factions/[slug]/posts", "登录 + 成员", "派内发纯文本帖（图片请走 Server Action）"],
            ["GET /api/v1/feed", "登录", "我的派动态流，置顶优先，默认 8/页"],
            ["GET /api/v1/me", "登录", "当前用户档案：身份、厂牌、派、未读数、发帖数、待审派主申请"],
            ["GET /api/v1/notifications", "登录", "我的通知分页（默认 20）与未读数"],
            ["POST /api/v1/notifications", "登录", "全部标记已读"],
            ["GET /api/v1/posts/[id]", "登录", "帖子详情 + 评论分页"],
            ["GET /api/v1/posts/[id]/comments", "登录", "评论分页"],
            ["POST /api/v1/posts/[id]/comments", "登录 + 成员", "发表评论"],
            ["POST /api/v1/posts/[id]/like", "登录 + 成员", "点赞 / 取消点赞（幂等切换）"],
            ["POST /api/v1/activities/[id]/signup", "登录 + 成员", "报名 / 取消报名（切换）"],
        ],
        widths=[6.4, 3.0, 7.0],
    )

    # ================================================================== 第 8 章
    doc.h1("8. Server Actions 参考")
    doc.p(
        "所有写操作统一放在 src/lib/actions/*.ts，文件首行 \"use server\"。参数有两种形态："
        "表单动作接收 FormData；需要行内错误提示的动作接收 (prevState, formData) 并返回 ActionState。"
    )

    doc.h2("8.1 两种返回契约")
    doc.table(
        ["形态", "签名", "成功表现", "适用场景"],
        [
            ["重定向型", "(formData) => never", "back(path, \"ok\", msg) → redirect 到 path?ok=msg", "列表 / 详情页上的操作"],
            ["状态型", "(prev, formData) => ActionState", "返回 { ok, message } 或 { error, fieldErrors }", "表单需要就地显示字段错误"],
        ],
        widths=[2.4, 4.6, 5.4, 4.0],
    )
    doc.code(
        [
            "// 重定向型：不返回，直接抛 redirect",
            "function back(path: string, key: \"ok\" | \"error\", message: string): never {",
            "  const sep = path.includes(\"?\") ? \"&\" : \"?\";",
            "  redirect(`${path}${sep}${key}=${encodeURIComponent(message)}`);",
            "}",
            "",
            "// 状态型：字段错误收敛成扁平字典",
            "export type ActionState = {",
            "  error?: string; ok?: boolean; message?: string;",
            "  devCode?: string; masked?: string;",
            "  fieldErrors?: Record<string, string>;",
            "};",
        ],
        "统一约定",
    )

    doc.h2("8.2 auth.ts")
    doc.table(
        ["动作", "鉴权", "关键行为 / 反馈"],
        [
            ["registerAction(prev, fd)", "匿名", "zod 校验渠道、账号、昵称、密码强度与一致性；强制勾选免责协议；邀请码可用性校验；事务内建号 + 核销邀请码 + 入派 + 计数；通知双方；建会话后跳 /verify?welcome=1"],
            ["loginAction(prev, fd)", "匿名", "手机号/邮箱二选一识别；bcrypt 比对；禁用账号返回原因；写 lastLoginAt；安全 next 回跳"],
            ["adminLoginAction(prev, fd)", "匿名", "仅邮箱 + 密码；非 ADMIN 明确拒绝；成功后停在 /admin"],
            ["adminLogoutAction()", "运营", "销毁会话 → /admin/login"],
            ["logoutAction()", "登录", "销毁会话 → /login"],
        ],
        widths=[4.6, 1.8, 10.0],
    )

    doc.h2("8.3 verify.ts")
    doc.table(
        ["动作", "鉴权", "关键行为 / 反馈"],
        [
            ["sendWorkEmailCode(prev, fd)", "登录", "校验企业邮箱域名属于该公司；同邮箱 60 秒频控；生成 6 位码，10 分钟有效；upsert ACTIVE/PENDING 记录；发送邮件；开发模式回显 devCode"],
            ["confirmWorkEmailCode(prev, fd)", "登录", "过期、次数（≥5）、错误逐项判断；错误则 attempts+1；正确则事务内改 VERIFIED、清码、公司 verifiedCount+1；通知本人并刷新 /verify、/、/me"],
            ["submitAlumniProof(prev, fd)", "登录", "离职说明必填、年份校验；证明材料必填（≤6MB，JPG/PNG/WEBP/HEIC/PDF）；upsert ALUMNI/PENDING；通知全体运营"],
        ],
        widths=[4.6, 1.6, 10.2],
    )

    doc.h2("8.4 faction.ts")
    doc.table(
        ["动作", "权限", "规则摘要"],
        [
            ["joinFactionAction", "登录", "派须 ACTIVE；至少一条已认证身份；已 ACTIVE/PENDING 短路；跨公司需 allowCrossCompany；是否需要审批 = 跨公司或 APPROVAL；事务内 upsert 成员并维护计数；通知派主，无派主则通知运营代批（先清旧未读）"],
            ["leaveFactionAction", "成员", "派主不可直接退出；ACTIVE → LEFT 并计数 -1，PENDING → 撤回"],
            ["createPostAction", "成员", "内容非空、派须 ACTIVE；公告类需管理角色；写 postCount；@ 与通知"],
            ["createCommentAction", "成员", "帖子须 PUBLISHED；评论非空；commentCount+1；通知作者"],
            ["toggleLikeAction", "成员", "存在即取消，不存在即新增；likeCount 同步"],
            ["reviewMemberAction", "派主/副派主", "只能审批 PENDING；通过时事务内改 ACTIVE + 计数/通知；拒绝置 REMOVED"],
            ["removeMemberAction", "派主/副派主", "不能移出自己与派主；置 REMOVED，计数 -1，通知本人"],
            ["setMemberRoleAction", "仅派主", "仅可设 ADMIN/MEMBER；成员须 ACTIVE；派主角色不可调整"],
            ["transferLeaderAction", "仅派主", "只能转给正式成员；事务内交换角色并更新 faction.leaderId"],
            ["archiveFactionAction", "仅派主", "置 ARCHIVED；把状态同步到成员可见文案"],
            ["moderatePostAction", "管理/作者", "置顶仅派主；隐藏/恢复需管理角色；作者可删自己的帖"],
            ["updateFactionAction", "派主/副派主", "派名 ≥2 字；分类合法；跨公司开关关闭时调用 revokeCrossCompanyPendingApplications"],
            ["createActivityAction", "成员", "名称、地点、时间校验；创建后通知全派"],
            ["signupActivityAction", "成员", "活动须 OPEN 且未开始；取消报名不占名额；满员拦截；切换式报名"],
            ["updateActivityAction", "发起人/管理", "名额不得小于已报名人数"],
            ["deleteActivityAction", "发起人/管理", "置 CANCELLED 并通知已报名成员"],
            ["closeActivityAction", "发起人/管理", "OPEN ↔ CLOSED 切换"],
            ["createFactionAction(prev, fd)", "登录 + 认证", "须在该公司已认证；生成 slug；建派（REVIEWING，无派主）+ 成员行 + 派主申请；通知运营"],
            ["applyLeaderAction(prev, fd)", "成员", "理由 ≥5 字、计划 ≥10 字；须已认证且 ACTIVE；派主仅空缺时开放，副派主需已有派主且无副派主；禁止重复 PENDING"],
        ],
        widths=[4.4, 2.6, 9.4],
        size=8.6,
    )

    doc.h2("8.5 admin.ts")
    doc.table(
        ["动作", "关键行为", "审计动作"],
        [
            ["reviewEmploymentAction", "通过：置 VERIFIED、公司计数 +1、通知；驳回：置 REJECTED 并附意见", "APPROVE / REJECT_EMPLOYMENT"],
            ["reviewLeaderAction", "岗位空缺校验；事务内改申请、upsert 成员角色；派主通过时派转 ACTIVE 并关闭其它派主申请；筹备派被驳回则整派 ARCHIVED", "APPROVE / REJECT_LEADER"],
            ["setFactionStatusAction", "直接调整派状态（REVIEWING/ACTIVE/ARCHIVED）", "SET_FACTION_STATUS"],
            ["adminModeratePostAction", "隐藏 / 恢复 / 删除帖子", "MODERATE_POST_*"],
            ["adminModerateCommentAction", "隐藏 / 恢复 / 删除评论并维护计数", "MODERATE_COMMENT_*"],
            ["adminUpdateActivityAction", "关闭报名 / 恢复 / 删除活动", "ACTIVITY_*"],
            ["adminUpdateUserAction", "禁用（清空会话）/ 启用 / 设为运营 / 取消运营 / 强制下线；不能操作自己，至少保留一名运营", "DISABLE / ENABLE / PROMOTE / DEMOTE / KICK_SESSIONS"],
            ["adminUpdateFactionAction", "编辑派名、分类、加入方式、跨公司开关、排序权重", "UPDATE_FACTION"],
            ["adminAssignFactionLeaderAction", "指派/更换/清空派主：同步 leaderId 与原派主角色；目标须为本派正式成员且未禁用", "ASSIGN_FACTION_LEADER"],
            ["adminUpdateFactionCompanyAction", "调整派所属公司并作废不合规的待审跨公司申请", "UPDATE_FACTION_COMPANY"],
            ["adminCreateActivityAction / adminEditActivityAction", "运营代发活动、编辑活动（名额不得低于报名数）", "CREATE / UPDATE_ACTIVITY"],
            ["adminResetPasswordAction", "运营设定新密码（≥8 位且含字母数字），清空该用户全部会话", "RESET_PASSWORD"],
            ["adminHandleReportAction", "处置：按对象隐藏帖子/评论或禁用用户，通知举报人与被处理人；忽略：标记 IGNORED", "REPORT_REMOVE / REPORT_IGNORE"],
            ["adminReviewMemberAction", "代批加入申请；通过时事务内改 ACTIVE + 计数 + 通知派主与申请人", "APPROVE / REJECT_JOIN_REQUEST"],
        ],
        widths=[4.6, 8.4, 3.4],
        size=8.6,
    )

    doc.h2("8.6 invite.ts / content.ts / account.ts / notifications.ts")
    doc.table(
        ["动作", "权限", "规则摘要"],
        [
            ["requestInviteCodeAction", "派主/副派主", "派须 ACTIVE；用途 2~120 字；同派只能有一条 PENDING；通知运营"],
            ["reviewInviteCodeAction", "运营", "通过：生成 8 位码（最多重试 5 次防碰撞）、30 天有效、通知申请人、写审计；驳回：记录意见并通知"],
            ["deleteOwnPostAction", "作者", "软删除；已发布则 postCount -1；从详情页删除时回到派主页"],
            ["deleteOwnCommentAction", "作者", "置 HIDDEN 并 commentCount -1"],
            ["submitReportAction", "登录", "对象与原因白名单；写入原文快照；不能举报自己；同一对象重复举报只提示；通知运营"],
            ["updateProfileAction", "登录", "昵称 2~16 字且全局唯一；简介 ≤60 字；成功回 /me?ok="],
            ["changePasswordAction", "登录", "校验当前密码、强度、两次一致、不能与旧密码相同；更新后踢掉其它设备"],
            ["markReadAction / markAllReadAction", "登录", "仅作用于本人通知（where 带 userId）"],
        ],
        widths=[4.6, 2.4, 9.4],
    )

    # ================================================================== 第 9 章
    doc.h1("9. API 层")

    doc.h2("9.1 统一响应与分页")
    doc.code(
        [
            "// 成功",
            "{",
            "  \"ok\": true, \"data\": <T>,",
            "  \"meta\": { \"page\": 1, \"pageSize\": 20, \"total\": 42, \"hasMore\": true }",
            "}",
            "// 失败",
            "{ \"ok\": false, \"error\": \"请先登录\" }",
        ],
        "响应结构",
    )
    doc.table(
        ["工具", "位置", "说明"],
        [
            ["apiOk(data, meta?)", "lib/api.ts", "包装成功响应，meta 缺省为 null"],
            ["apiError(message, status=400)", "lib/api.ts", "包装失败响应"],
            ["paging(url, defaultSize=10)", "lib/api.ts", "page 最小 1；pageSize 限制 1~50；返回 skip"],
            ["metaOf(page, pageSize, total)", "lib/api.ts", "计算 hasMore = page*pageSize < total"],
            ["readJson(request)", "lib/api.ts", "解析失败返回 null，避免抛 500"],
            ["apiGet / apiPost / apiPatch", "lib/client.ts", "浏览器端封装，自动 withBasePath、credentials=same-origin、no-store"],
            ["ApiClientError", "lib/client.ts", "携带 status，便于 UI 区分 401 与业务错误"],
        ],
        widths=[4.8, 3.2, 8.4],
    )

    doc.h2("9.2 客户端调用示例")
    doc.code(
        [
            "import { apiGet, apiPost, buildQuery, ApiClientError } from \"@/lib/client\";",
            "",
            "const query = buildQuery({ category, company, q, page });",
            "try {",
            "  const res = await apiGet<FactionJson[]>(`/api/v1/factions${query}`);",
            "  setItems(res.data);",
            "} catch (error) {",
            "  const message = error instanceof ApiClientError ? error.message : \"网络异常\";",
            "}",
        ],
        "在客户端组件中调用",
    )
    doc.note(
        "接口返回的 JSON 日期是字符串，统一用 lib/revive.ts 的 reviveFaction / revivePost / reviveComment / "
        "reviveActivity / reviveNotification 还原为 Date，并用 withPostIdentity / withCommentIdentity 附加作者身份。",
        "日期与身份",
    )

    doc.h2("9.3 接口实现要点")
    doc.bullets([
        "所有接口都通过 apiOk / apiError 返回，HTTP 状态与业务 ok 字段保持一致（401 未登录、400 参数错误、404 资源不存在）。",
        "涉及成员身份的写接口（发帖、评论、点赞、报名）在动作内二次校验 FactionMember.status=ACTIVE，不信任前端传入的 slug/factionId 组合。",
        "列表接口统一分页，禁止无上限 findMany；页面侧直读 prisma 的列表也需 take 限制。",
        "用户字段一律走 PUBLIC_USER / IDENTIFIED_USER 白名单，接口不得返回 email、phone、passwordHash（/api/v1/me 例外，仅返回本人）。",
    ])

    # ================================================================== 第 10 章
    doc.h1("10. 组件库")
    doc.p(
        "组件全部位于 src/components，采用「服务端组件取数 + 客户端组件交互」的划分。"
        "只有需要状态、事件或 useFormStatus 的组件才标注 \"use client\"。"
    )

    doc.h2("10.1 基础组件")
    doc.table(
        ["组件", "职责", "关键 Props / 说明"],
        [
            ["Avatar", "头像", "昵称首字母 + 背景色，尺寸可调"],
            ["Badge", "状态徽章", "tone: ok / warn / bad / brand / violet / ocean / mute"],
            ["CompanyBadge", "厂牌", "公司短名 + 品牌色 + 在职/离职标记"],
            ["Icon", "图标集", "name 驱动，内置 home/shield/flag/users/sparkle/compass/message/edit/calendar/bell/mail 等"],
            ["Logo", "品牌标识", "厂派字标"],
            ["Notice", "提示条", "承接 ?ok= / ?error= 查询参数并展示"],
            ["Pager", "分页器", "basePath + query，生成保留筛选条件的分页链接"],
            ["Section", "区块容器", "同时导出 EmptyState 空状态"],
            ["SubmitButton", "提交按钮", "useFormStatus 驱动 pending 态与禁用"],
            ["TopBar", "顶部栏", "viewer 徽章、搜索入口、未读、登录/注册"],
            ["BottomNav", "移动端底栏", "首页/发现/消息/我的，未读角标"],
            ["FactionCard", "派卡片", "分类渐变封面、成员数、加入方式"],
            ["PostCard", "帖子卡片", "作者身份、正文摘要、图片、互动计数"],
            ["NotificationIcon", "通知类型图标", "按 type 映射图标与配色"],
        ],
        widths=[3.2, 5.2, 8.0],
    )

    doc.h2("10.2 业务组件")
    doc.table(
        ["目录", "组件", "职责"],
        [
            ["auth", "LoginForm / AdminLoginForm", "useActionState 驱动登录表单，行内展示字段错误"],
            ["auth", "RegisterForm / DisclaimerConsent", "注册表单；免责协议必填项（label + required + 服务端强校验）"],
            ["content", "ConfirmSubmit", "带 window.confirm 的提交按钮，用于退出、撤回、删除等不可逆操作"],
            ["content", "ReportButton", "举报弹层，提交 targetType/targetId/reason/detail"],
            ["discover", "DiscoverBrowser", "发现页筛选与列表（客户端），请求 /api/v1/factions"],
            ["faction", "NewFactionForm / LeaderApplyForm", "建派与派主申请（useActionState + 字段错误）"],
            ["faction", "PostComposer", "发帖表单，支持类型、标题、正文、图片"],
            ["faction", "CopyInviteLink", "复制邀请链接（含 basePath）"],
            ["home", "HomeFeed / FeedStream", "登录首页：我的派、动态流、加载更多"],
            ["post", "CommentSection / LikeButton", "评论分页与提交；点赞乐观刷新"],
            ["verify", "VerifyFlow", "认证向导：选择公司 → 在职邮箱或离职材料 → 结果回显"],
            ["marketing", "Landing", "未登录落地页：统计、精选派、公司墙"],
            ["admin", "AdminNav", "后台导航，支持待办角标与激活态"],
        ],
        widths=[2.4, 4.6, 9.4],
    )

    doc.h2("10.3 表单与交互约定")
    doc.bullets([
        "必填项统一使用 <p className=\"label\" data-required>，由 CSS 追加红色星号；同时给输入控件加 required 与 aria-required。",
        "提交按钮优先使用 SubmitButton（pending 文案 + 禁用），不可逆操作使用 ConfirmSubmit 并给出具体确认文案（含对象名称）。",
        "错误展示分两级：ActionState.error 用于顶部整体提示，fieldErrors[key] 用于字段下方红字。",
        "所有原生 <form action> 必须写成 withBasePath(...)，否则子路径部署会 404。",
        "列表空状态统一使用 EmptyState，避免各页面文案与样式分叉。",
    ])
