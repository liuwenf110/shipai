# -*- coding: utf-8 -*-
"""第 11 ~ 12 章：核心业务流程、常量与状态字典。"""


def build(doc):
    # ================================================================== 第 11 章
    doc.h1("11. 核心业务流程")
    doc.p(
        "本章按「用户从注册到产生内容」的真实路径串联各模块，重点说明状态流转、事务边界与通知对象。"
        "所有流程均可在第 8 章的 Server Actions 表中找到对应实现。"
    )

    doc.h2("11.1 注册（含邀请码与免责协议）")
    doc.numbered([
        "选择渠道（手机号 / 邮箱），填写账号、昵称、密码与确认密码；可选填邀请码；必须勾选免责协议。",
        "前端：免责协议使用 required + aria-required，未勾选时浏览器直接拦截提交，并在勾选框下方提示「未勾选无法完成注册」。",
        "zod 校验：昵称 2~16 字；密码 ≥8 位且同时含字母与数字；两次一致；手机号 11 位；邮箱格式合法。",
        "服务端二次校验 terms === \"true\"，否则返回 fieldErrors.terms，防止绕过前端。",
        "若填写邀请码：规范化（去空格转大写）→ 查询 → 必须 status=APPROVED、未被使用、未过期，且所属派为 ACTIVE。",
        "唯一性检查：手机号或邮箱已存在时直接返回「已注册，请直接登录」。",
        "事务内：创建 User（bcrypt 哈希、头像底色由昵称生成、bio 记录邀请来源）→ 条件核销邀请码（updateMany，count≠1 抛 INVITE_TAKEN）→ 建 FactionMember（ACTIVE/MEMBER）→ 派 memberCount+1。",
        "事务外：邀请注册时分别通知新用户与派主；随后 createSession 建立登录态。",
        "跳转：普通注册 → /verify?welcome=1；邀请注册 → /verify?welcome=1&invited=<slug>，引导完成认证。",
    ])
    doc.note(
        "邀请码核销必须使用条件 updateMany 并在事务内判断 count，不能「先查再更新」——"
        "同一邀请码被两人同时提交时，只有一人能成功，另一人收到「邀请码已被使用」。",
        "并发要点",
    )

    doc.h2("11.2 登录与会话建立")
    doc.table(
        ["场景", "处理"],
        [
            ["用户端登录", "按输入是手机号还是邮箱分别查询；bcrypt.compare；禁用账号返回 disabledReason；更新 lastLoginAt；createSession；跳 next 或 /"],
            ["管理端登录", "只查邮箱；比对密码；禁用与非 ADMIN 分别给出不同提示；成功后跳 /admin 下的 next"],
            ["next 参数安全", "用户端要求以单个 / 开头且不以 // 开头；管理端要求以 /admin 开头；不合法一律回落到默认页"],
            ["已登录访问登录页", "页面层可直接展示已登录状态或跳转，具体以页面实现为准；服务端守卫才是最终边界"],
        ],
        widths=[3.4, 12.8],
    )

    doc.h2("11.3 在职身份认证（邮箱验证码）")
    doc.numbered([
        "用户在 /verify 选择公司，输入企业邮箱；系统校验邮箱格式。",
        "取邮箱域名，与 Company.domains（逗号分隔、大小写不敏感）比对，不匹配则提示改用离职材料认证。",
        "若该公司在职记录已是 VERIFIED，直接提示已认证。",
        "频控：以 codeExpiresAt - 10 分钟推算上次发送时间，60 秒内重复请求被拒绝。",
        "生成 6 位验证码，upsert (userId, companyId, ACTIVE) 记录：status=PENDING、method=EMAIL、verifyCode、codeExpiresAt=now+10min、attempts=0。",
        "调用 sendMail 投递；未配置 SMTP 或 NEXT_PUBLIC_DEV_MODE=true 时只做站内留痕，开发模式把 devCode 回显到页面。",
        "用户提交验证码：依次校验记录存在、已认证、过期、错误次数 ≥5、验证码是否匹配；不匹配则 attempts+1。",
        "匹配成功：事务内把记录置 VERIFIED、verifiedAt、清空验证码，同时 Company.verifiedCount+1；写 VERIFY 通知；revalidate /verify、/、/me。",
    ])
    doc.table(
        ["参数", "值", "位置"],
        [
            ["验证码长度", "6 位", "generateCode(6)"],
            ["有效期", "10 分钟", "CODE_TTL"],
            ["最大错误次数", "5 次", "MAX_ATTEMPTS"],
            ["发送间隔", "60 秒", "sendWorkEmailCode"],
            ["认证后能力", "可加入该公司旗下兴趣派", "joinFactionAction 校验"],
        ],
        widths=[3.6, 6.0, 6.6],
    )

    doc.h2("11.4 离职身份认证（人工审核）")
    doc.numbered([
        "用户选择公司，填写部门/职位、入职年份、离职年份与说明（说明必填）。",
        "年份校验：离职年份不得早于入职年份。",
        "上传证明材料：≤6MB，类型限 JPG / PNG / WEBP / HEIC / PDF；文件落盘 public/uploads 并生成随机文件名。",
        "upsert (userId, companyId, ALUMNI) 记录：status=PENDING、method=MANUAL，写入 proofFiles 与 proofNote；已有 PENDING 时提示等待，已 VERIFIED 时提示已通过。",
        "notifyAdmins 通知全体运营，附申请人、公司与说明摘要，链接到 /admin/verifications。",
        "运营在后台审核：通过 → VERIFIED、写 reviewer、Company.verifiedCount+1、通知用户「离职身份审核通过」；驳回 → REJECTED + 审核意见并通知用户补充材料。",
        "两个动作都写 AuditLog（APPROVE_EMPLOYMENT / REJECT_EMPLOYMENT）并 revalidate 审核列表与发现页。",
    ])

    doc.h2("11.5 建派与派主认证")
    doc.code(
        [
            "用户提交建派表单（须在目标公司已认证）",
            "        │ createFactionAction",
            "        ▼",
            "Faction(status=REVIEWING, leaderId=null)  +  FactionMember(申请人, MEMBER, ACTIVE)",
            "        │ 同时创建 LeaderApplication(requestedRole=LEADER)",
            "        ▼",
            "notifyAdmins(type=LEADER, link=/admin/leaders)",
            "        │ 运营 reviewLeaderAction",
            "        ├─ 通过：申请 APPROVED → 成员角色 LEADER",
            "        │        Faction.leaderId=申请人、status=ACTIVE",
            "        │        同派其它待审派主申请自动 REJECTED（理由：该派已有认证派主）",
            "        └─ 驳回：若该派仍是「筹备中且无派主」，整派置 ARCHIVED",
            "                 否则申请人保留普通成员身份",
        ],
        "建派状态流转",
    )
    doc.bullets([
        "已有派的「副派主」申请路径：必须是 ACTIVE 成员且当前角色为 MEMBER；副派主仅在已有派主且无在职副派主时开放。",
        "申请材料：理由 ≥5 字、运营计划 ≥10 字，过往带队截图选填（上传失败会阻断并提示）。",
        "同一用户对同一派只能有一条 PENDING 申请。",
        "运营也可在后台直接指派/更换派主（adminAssignFactionLeaderAction），不要求存在申请记录。",
    ])

    doc.h2("11.6 加入派：自由 / 审批 / 跨公司")
    doc.table(
        ["判定顺序", "条件", "结果"],
        [
            ["1", "派不存在或 status≠ACTIVE", "报错「该派还在筹备审核中」"],
            ["2", "用户没有任何 VERIFIED 认证", "报错「请先完成任一公司的身份认证」"],
            ["3", "已有 ACTIVE 成员记录", "提示「你已经是本派成员」"],
            ["4", "已有 PENDING 记录", "提示申请已提交，等待派主或运营审批"],
            ["5", "跨公司且 allowCrossCompany=false", "报错「该派仅对 X 认证成员开放」"],
            ["6", "跨公司 或 joinMode=APPROVAL", "写 PENDING + appliedAt，通知派主；无派主则通知运营代批"],
            ["7", "同公司 且 joinMode=OPEN", "直接 ACTIVE，memberCount+1，通知派主「新成员加入」"],
        ],
        widths=[1.8, 6.8, 7.6],
        size=8.8,
    )
    doc.p(
        "通知分流：有派主时通知派主（跨公司申请会附上申请人已认证的公司清单与在职/离职标记）；"
        "无派主时通知全体运营并把链接指向 /admin/joins?factionId=...，同时先删除同一申请人+同一派的旧未读代批通知，避免刷屏。"
    )
    doc.note(
        "重新加入走 upsert：状态刷新为 ACTIVE 或 PENDING，appliedAt 重新计时，role 复位为 MEMBER（派主除外）。"
        "这样被移出的副派主无法通过自助申请恢复管理权。",
        "重入规则",
    )

    doc.h2("11.7 成员管理与派主交接")
    doc.table(
        ["操作", "执行人", "规则与副作用"],
        [
            ["通过 / 拒绝加入申请", "派主、副派主、运营", "仅 PENDING 可处理；通过置 ACTIVE 并计数 +1、通知申请人；拒绝置 REMOVED（不计数）"],
            ["移出成员", "派主、副派主", "不能移出自己与派主；置 REMOVED、memberCount-1、通知本人"],
            ["设为 / 取消副派主", "仅派主", "目标须为 ACTIVE 且非派主；role 在 ADMIN 与 MEMBER 间切换"],
            ["转让派主", "仅派主", "目标须为 ACTIVE 正式成员且不是自己；事务内把原派主降为 ADMIN、新派主升为 LEADER、更新 faction.leaderId"],
            ["退出派", "成员", "ACTIVE → LEFT 并计数 -1；PENDING → 撤回申请；派主不可直接退出，需先交接或联系运营"],
            ["关闭派", "仅派主", "status=ARCHIVED，派从发现页与列表中下线"],
        ],
        widths=[4.0, 3.0, 9.2],
    )

    doc.h2("11.8 内容生产与治理")
    doc.table(
        ["环节", "规则"],
        [
            ["发帖", "须为 ACTIVE 成员；派须 ACTIVE；正文非空；公告（ANNOUNCE）仅派主/副派主可发；成功后 postCount+1"],
            ["评论", "须为成员；帖子须 PUBLISHED；内容非空；commentCount+1；通知帖子作者（自己评论自己不通知）"],
            ["点赞", "须为成员；PostLike 唯一约束；存在即删除并 likeCount-1，不存在即创建并 +1"],
            ["作者删除", "只能删自己的帖 / 评论；帖子软删 DELETED 并 postCount-1，评论置 HIDDEN 并 commentCount-1；从详情页删除后回到派主页"],
            ["派内治理", "置顶仅派主；隐藏/恢复需派主或副派主；作者可删除自己的内容"],
            ["运营治理", "隐藏 / 恢复 / 删除三种操作，全部写 AuditLog；删除为软删除，保留追溯"],
        ],
        widths=[3.0, 13.2],
    )

    doc.h2("11.9 活动")
    doc.numbered([
        "创建：成员即可发起；校验名称 ≥2 字、地点非空、时间可解析；默认容量 20；创建后通知全派成员。",
        "报名：活动须 OPEN 且未开始；用户须为成员；已有 GOING 记录则切换为 CANCELLED（释放名额），否则在未满员时置 GOING 并 signupCount+1。",
        "满员：signupCount ≥ capacity 时拒绝报名。",
        "编辑：发起人或管理角色可改；容量不得小于已报名人数；同步更新通知内容。",
        "关闭 / 恢复：发起人或管理角色在 OPEN 与 CLOSED 间切换。",
        "删除：置 CANCELLED 并通知所有已报名成员，不物理删除。",
    ])

    doc.h2("11.10 邀请码")
    doc.code(
        [
            "派主/副派主 requestInviteCodeAction",
            "        ├─ 派须 ACTIVE；用途 2~120 字；同派只能有一条 PENDING",
            "        ▼",
            "InviteCode(status=PENDING) + notifyAdmins(link=/admin/invites)",
            "        ▼",
            "运营 reviewInviteCodeAction",
            "        ├─ 通过：生成 8 位码（重试 5 次防碰撞），expiresAt=+30 天",
            "        │        status=APPROVED，通知申请人，写 APPROVE_INVITE",
            "        └─ 驳回：status=REJECTED + 意见，通知申请人，写 REJECT_INVITE",
            "        ▼",
            "新人注册携带邀请码 → 校验可用 → 事务内核销 + 自动入派 + memberCount+1",
        ],
        "邀请码全链路",
    )
    doc.bullets([
        "字符集为 ABCDEFGHJKLMNPQRSTUVWXYZ23456789（去掉 I/O/0/1），长度 8 位，便于口头转述。",
        "可用条件：status=APPROVED、usedById 为空、expiresAt 未过期，且所属派为 ACTIVE。",
        "展示态由 inviteStateOf 折算为 PENDING / READY / USED / EXPIRED / REJECTED 五种。",
        "邀请码为一次性，核销后 usedById 与 usedAt 同时写入，不可复用。",
    ])

    doc.h2("11.11 举报与处置")
    doc.numbered([
        "用户在帖子、评论或用户页发起举报，选择原因（SPAM / ABUSE / PORN / FRAUD / OTHER）并可填写补充说明。",
        "服务端校验目标类型与原因白名单、目标是否存在、是否举报自己。",
        "写入原文快照（标题 + 正文 / 评论内容 / 昵称 + 简介，截断 160 字），便于运营在内容被修改后仍能判断。",
        "同一用户对同一对象只能举报一次（唯一约束 + 预查询），重复提交只做提示。",
        "notifyAdmins 通知运营；运营在 /admin/reports 处置：删除内容（帖子/评论）或禁用用户，或标记忽略。",
        "处置结果通知举报人与被处理人，并写 REPORT_REMOVE / REPORT_IGNORE 审计。",
    ])

    doc.h2("11.12 通知与消息中心")
    doc.table(
        ["通道", "入口", "可见范围", "实现要点"],
        [
            ["用户消息", "/notifications", "仅本人", "列表、详情、已读、全部已读、API 全部以 userId 过滤；跨用户访问详情返回 404"],
            ["消息详情", "/notifications/[id]", "仅本人", "进入即写 readAt，未读数随之减少"],
            ["运营消息中心", "/admin/notifications", "全站所有用户的通知", "按类型 tab、关键词（标题/正文/昵称/邮箱/手机号）与分页检索；展示收件人与已读状态"],
            ["邮件留痕", "/inbox", "平台级邮件日志", "记录每封系统邮件的投递结果，开发模式正文含验证码"],
        ],
        widths=[3.0, 3.6, 3.4, 6.2],
        size=8.8,
    )
    doc.p(
        "通知类型：VERIFY（身份认证）、LEADER（派主认证）、POST（派内互动）、COMMENT（帖子互动）、"
        "ACTIVITY（活动）、SYSTEM（系统与运营）。运营通知通过 notifyAdmins 批量写入全体 ADMIN 的收件箱。"
    )
    doc.note(
        "权限边界必须双向成立：用户侧任何通知查询都要带 userId（含 API 与 Server Action），"
        "后台则通过 requireAdmin 放行全量查询。新增通知相关页面时，先确认 where 条件是否含 userId 或 role 校验。",
        "隔离原则",
    )

    doc.h2("11.13 运营审计")
    doc.p(
        "所有运营侧的写操作都会调用 audit(actorId, action, targetType, targetId, note) 写入 AuditLog，"
        "在 /admin/logs 可按动作、对象类型筛选，并统计动作分布与操作人。常见动作如下："
    )
    doc.table(
        ["动作 Key", "含义", "对象类型"],
        [
            ["APPROVE_EMPLOYMENT / REJECT_EMPLOYMENT", "通过 / 驳回身份认证", "Employment"],
            ["APPROVE_LEADER / REJECT_LEADER", "通过 / 驳回派主认证", "LeaderApplication"],
            ["SET_FACTION_STATUS", "调整派状态", "Faction"],
            ["UPDATE_FACTION", "编辑派资料", "Faction"],
            ["ASSIGN_FACTION_LEADER", "指派 / 更换 / 清空派主", "Faction"],
            ["UPDATE_FACTION_COMPANY", "调整派所属公司", "Faction"],
            ["APPROVE_JOIN_REQUEST / REJECT_JOIN_REQUEST", "通过 / 拒绝加入申请", "FactionMember"],
            ["MODERATE_POST_HIDE / RESTORE / DELETE", "内容隐藏 / 恢复 / 删除", "Post"],
            ["MODERATE_COMMENT_HIDE / RESTORE / DELETE", "评论隐藏 / 恢复 / 删除", "Comment"],
            ["ACTIVITY_CLOSE / REOPEN / DELETE", "关闭报名 / 恢复 / 删除活动", "Activity"],
            ["CREATE_ACTIVITY / UPDATE_ACTIVITY", "运营代发 / 编辑活动", "Activity"],
            ["DISABLE_USER / ENABLE_USER", "禁用 / 恢复账号", "User"],
            ["PROMOTE_USER / DEMOTE_USER", "设为 / 取消运营", "User"],
            ["KICK_SESSIONS", "强制下线", "User"],
            ["RESET_PASSWORD", "重置登录密码", "User"],
            ["APPROVE_INVITE / REJECT_INVITE", "邀请码发放 / 驳回", "InviteCode"],
            ["REPORT_REMOVE / REPORT_IGNORE", "举报处置 / 忽略", "Post / Comment / User"],
        ],
        widths=[5.6, 6.6, 4.0],
        size=8.8,
    )

    # ================================================================== 第 12 章
    doc.h1("12. 常量、枚举与状态字典")

    doc.h2("12.1 派分类（25 个）")
    doc.table(
        ["Key", "名称", "Key", "名称", "Key", "名称"],
        [
            ["YOGA", "瑜伽派", "OUTDOOR", "户外派", "HIKING", "徒步派"],
            ["BOARDGAME", "桌游派", "RUNNING", "跑步派", "FOOD", "美食派"],
            ["MUSIC", "音乐派", "TECH", "技术派", "PET", "宠物派"],
            ["READING", "读书派", "WELLNESS", "养生派", "TRAVEL", "旅行派"],
            ["HIFI", "HIFI 派", "CYCLING", "骑行派", "ESPORTS", "电竞派"],
            ["FITNESS", "健身派", "DANCE", "舞蹈派", "SKATE", "滑板派"],
            ["SURF", "冲浪派", "PARENTING", "亲子派", "PSYCHOLOGY", "心理学派"],
            ["TCM", "中医派", "CERT", "考证派", "CHARITY", "公益派"],
            ["SECONDHAND", "二手派", "OTHER", "其他", "—", "—"],
        ],
        widths=[2.8, 2.5, 2.9, 2.5, 2.9, 2.5],
        size=8.6,
    )
    doc.p(
        "每个分类在 CATEGORIES 中带有 label、emoji、封面渐变（from/to）与一句 desc；"
        "categoryOf(key) 在遇到未知 key 时回落到 TECH，避免脏数据导致渲染异常。"
    )

    doc.h2("12.2 状态字典")
    doc.table(
        ["字典", "取值", "展示文案（tone）"],
        [
            ["EMPLOYMENT_STATUS", "PENDING / VERIFIED / REJECTED", "审核中（warn）/ 已认证（ok）/ 未通过（bad）"],
            ["EMPLOYMENT_KIND", "ACTIVE / ALUMNI", "在职 / 离职校友"],
            ["FACTION_STATUS", "REVIEWING / ACTIVE / ARCHIVED", "筹备审核中 / 运营中 / 已关闭"],
            ["MEMBER_ROLE", "LEADER / ADMIN / MEMBER", "派主 / 副派主 / 成员"],
            ["MEMBER_STATUS", "ACTIVE / PENDING / LEFT / REMOVED", "已加入 / 待审批 / 已退出 / 已移出"],
            ["POST_KIND", "POST / ANNOUNCE / ACTIVITY", "普通帖 / 公告 / 活动召集"],
            ["POST_STATUS", "PUBLISHED / HIDDEN / DELETED", "已发布 / 已隐藏 / 已删除"],
            ["COMMENT_STATUS", "PUBLISHED / HIDDEN", "已发布 / 已隐藏"],
            ["ACTIVITY_STATUS", "OPEN / CLOSED / CANCELLED", "报名中 / 已关闭 / 已取消"],
            ["SIGNUP_STATUS", "GOING / CANCELLED", "已报名 / 已取消"],
            ["APPLICATION_STATUS", "PENDING / APPROVED / REJECTED", "待审核 / 已通过 / 已驳回"],
            ["INVITE_STATE", "PENDING / READY / USED / EXPIRED / REJECTED", "审核中 / 可使用 / 已使用 / 已过期 / 已驳回"],
            ["REPORT_STATUS", "PENDING / RESOLVED / IGNORED", "待处理 / 已处置 / 已忽略"],
            ["USER_STATUS", "ACTIVE / DISABLED", "正常 / 已禁用"],
            ["USER_ROLE", "USER / ADMIN", "普通用户 / 运营"],
        ],
        widths=[4.2, 6.4, 5.6],
        size=8.8,
    )

    doc.h2("12.3 通知类型与配色")
    doc.table(
        ["类型", "含义", "典型触发"],
        [
            ["VERIFY", "身份认证", "邮箱认证通过、离职材料提交与审核结果"],
            ["LEADER", "派主认证", "派主/副派主申请提交与审核结果、筹备派审批"],
            ["POST", "派内互动", "加入申请、新成员加入、被邀请入派"],
            ["COMMENT", "帖子互动", "帖子被评论"],
            ["ACTIVITY", "活动", "活动发布、取消、报名变更"],
            ["SYSTEM", "系统与运营", "邀请码、举报、跨公司申请作废、运营代批提醒"],
        ],
        widths=[2.6, 5.0, 8.6],
    )

    doc.h2("12.4 平台常量")
    doc.table(
        ["常量", "值", "使用位置"],
        [
            ["PLATFORM_NAME", "厂派", "页面标题、邮件与文案"],
            ["PLATFORM_SLOGAN", "离职不离圈，兴趣不断线", "落地页、分享文案"],
            ["PLATFORM_DESC", "用企业邮箱或离职材料验证大厂身份……", "SEO 描述、落地页副标题"],
            ["INVITE_VALID_DAYS", "30", "邀请码有效期"],
            ["CODE_TTL", "10 分钟", "邮箱验证码有效期"],
            ["MAX_ATTEMPTS", "5", "验证码最大错误次数"],
            ["MAX_SIZE", "6MB", "证明材料上传上限"],
            ["CODE_LENGTH", "6", "验证码位数"],
            ["PAGE_SIZE", "20 / 30 / 12 / 10 / 8", "各列表默认分页大小（API 与后台页面）"],
        ],
        widths=[4.6, 5.6, 6.0],
        size=8.8,
    )
