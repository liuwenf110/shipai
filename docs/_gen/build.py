# -*- coding: utf-8 -*-
"""组装并输出 Word 文档。"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from docx_kit import Doc  # noqa: E402
import part_a  # noqa: E402
import part_b  # noqa: E402
import part_c  # noqa: E402
import part_d  # noqa: E402

OUT = "/Users/lw2f/Documents/shipai/厂派平台开发详细文档.docx"


def front_matter(doc):
    doc.p("文档信息", size=16, bold=True, color="14110F", space_after=8)
    doc.table(
        ["项目", "内容"],
        [
            ["项目名称", "厂派（ShipAI）—— 大厂员工兴趣派社区"],
            ["代码基线", "/Users/lw2f/Documents/shipai（Next.js App Router 全栈单体应用）"],
            ["文档版本", "V1.0"],
            ["编制日期", "2026-11-06"],
            ["文档性质", "开发详细文档：架构、数据模型、接口、业务流程、规范与部署"],
            ["适用读者", "前端 / 全栈开发、后端开发、测试、运维与产品运营"],
            ["覆盖范围", "17 个 Prisma 模型、32 个页面路由、14 个 API 端点、8 个动作文件、32 个组件、部署脚本"],
        ],
        widths=[3.4, 12.8],
    )

    doc.p("阅读指南", size=12, bold=True, color="14110F", space_after=6)
    doc.table(
        ["目的", "建议章节"],
        [
            ["快速了解产品与角色", "第 1 章"],
            ["搭建本地环境并跑起来", "第 2、4、14 章"],
            ["理解数据与权限设计", "第 5、6 章"],
            ["定位某个页面 / 接口的实现", "第 7、8、9、10 章"],
            ["交接业务流程与规则", "第 11、12 章"],
            ["按规范开发新功能", "第 13 章"],
            ["发布、回滚与故障处理", "第 15、16 章"],
        ],
        widths=[6.0, 10.2],
    )

    doc.p("修订记录", size=12, bold=True, color="14110F", space_after=6)
    doc.table(
        ["版本", "日期", "修订内容", "编制"],
        [
            ["V1.0", "2026-11-06", "首次成文：基于当前代码库完整梳理架构、模型、路由、动作、流程与部署", "厂派开发组"],
        ],
        widths=[2.0, 2.6, 9.4, 2.2],
    )

    doc.p("说明", size=10.5, bold=True, color="C2410C", space_after=4)
    doc.p(
        "本文档中的命令与代码片段均取自当前代码库。涉及密钥、授权码、生产账号口令的内容已做脱敏，"
        "实际值只保存在服务器与本地 .env 中，不随文档流转。目录为 Word 域字段，打开后按 F9 更新即可显示页码。",
        size=9.5,
    )


def main():
    doc = Doc()
    doc.cover(
        "厂派平台开发详细文档",
        "Next.js 15 + Prisma 全栈应用 · 架构 / 数据 / 接口 / 流程 / 部署",
        [
            ("文档版本", "V1.0"),
            ("编制日期", "2026-11-06"),
            ("代码基线", "shipai（Next.js App Router + Prisma + SQLite）"),
            ("技术栈", "Next.js 15 · React 19 · TypeScript · Tailwind CSS · Prisma 6"),
            ("部署形态", "Nginx 子路径 /shipai 反向代理 · systemd 用户服务 · 127.0.0.1:3010"),
            ("适用读者", "开发 · 测试 · 运维 · 产品运营"),
        ],
    )

    doc.page_break()
    front_matter(doc)
    doc.page_break()
    doc.toc()

    part_a.build(doc)
    part_b.build(doc)
    part_c.build(doc)
    part_d.build(doc)

    path = doc.save(OUT)
    print("saved:", path)
    print("size:", os.path.getsize(path), "bytes")


if __name__ == "__main__":
    main()
