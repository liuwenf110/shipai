#!/usr/bin/env python3
"""线上只读隔离冒烟：大厂已认证 vs 未认证人群的派可见性（全程 mode=ro，不写库）

复用线上真实存活会话（只读 Session 表，不新建、不改任何数据）：
  - CORP 已认证用户：应看得到「只勾大厂」的派（线上 29 派现状）
  - 未认证用户：应与游客一致，看不到任何派（非大厂派尚未创建）
用法：ssh manban 'python3 /home/tuoniao/apps/shipai/scripts/prod-scope-smoke.py'
"""
import re
import sqlite3
import urllib.request

BASE = "http://127.0.0.1:3010/shipai"
DB = "file:/home/tuoniao/apps/shipai/prisma/prod.db?mode=ro"
conn = sqlite3.connect(DB, uri=True)

results = []


def check(label, ok, detail=""):
    results.append(ok)
    print(f"{'PASS' if ok else 'FAIL'}  {label}" + ("" if ok else f"  <- {str(detail)[:220]}"))


# 一枚只勾大厂的 ACTIVE 派，作为两侧判定的靶子
target = conn.execute(
    "SELECT slug FROM Faction WHERE status='ACTIVE' AND visibleToCorp=1 AND visibleToOutsider=0 LIMIT 1"
).fetchone()
corp_only_total = conn.execute(
    "SELECT COUNT(*) FROM Faction WHERE status='ACTIVE' AND visibleToCorp=1 AND visibleToOutsider=0"
).fetchone()[0]
outsider_total = conn.execute(
    "SELECT COUNT(*) FROM Faction WHERE status='ACTIVE' AND visibleToOutsider=1"
).fetchone()[0]
check("线上存在只勾大厂的派可作靶子", bool(target), target)
print(f"corp-only factions={corp_only_total} outsider-visible factions={outsider_total} target={target}")

# 大厂已认证用户的存活会话
corp_sess = conn.execute(
    """SELECT s.id, u.nickname FROM Session s
       JOIN Employment e ON e.userId = s.userId AND e.status='VERIFIED'
       JOIN Company c ON c.id = e.companyId AND c.scope='CORP'
       JOIN User u ON u.id = s.userId
       WHERE s.expiresAt > cast(strftime('%s','now') as integer)*1000 LIMIT 1"""
).fetchone()
# 未认证用户的存活会话
anon_sess = conn.execute(
    """SELECT s.id, u.nickname FROM Session s JOIN User u ON u.id = s.userId
       WHERE s.expiresAt > cast(strftime('%s','now') as integer)*1000
         AND (SELECT COUNT(*) FROM Employment e WHERE e.userId = s.userId AND e.status='VERIFIED') = 0
       LIMIT 1"""
).fetchone()
print(f"corp session={corp_sess} / unverified session={anon_sess}")

# 运营账号的存活会话，用来验后台派编辑页的两枚阵营勾选框在线上可用
admin_sess = conn.execute(
    """SELECT s.id, u.nickname FROM Session s JOIN User u ON u.id = s.userId
       WHERE u.role='ADMIN' AND s.expiresAt > cast(strftime('%s','now') as integer)*1000 LIMIT 1"""
).fetchone()


def fetch(path, cookie=None):
    req = urllib.request.Request(BASE + path)
    if cookie:
        req.add_header("Cookie", "shipai_session=" + cookie)
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return res.status, res.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def faction_links(html):
    # /factions/new 是「新建派」入口而不是派详情页，留着会让未认证侧误判成看得到派
    return {slug for slug in re.findall(r'href="/shipai/factions/([^/?"]+)"', html) if slug != "new"}


if corp_sess:
    code, html = fetch("/discover", corp_sess[0])
    links = faction_links(html)
    check(f"大厂用户 {corp_sess[1]} 发现页 200", code == 200, code)
    check("大厂用户能看到只勾大厂的派", bool(links), links)
    code, _ = fetch(f"/factions/{target[0]}", corp_sess[0])
    check(f"大厂用户打开该派详情 200（/{target[0]}）", code == 200, code)
    code, body = fetch("/api/v1/factions?pageSize=1", corp_sess[0])
    total = re.search(r'"total":(\d+)', body)
    check("大厂用户 API 派总数 > 0", bool(total) and int(total.group(1)) > 0, body[:160])

if anon_sess:
    code, html = fetch("/discover", anon_sess[0])
    links = faction_links(html)
    check(f"未认证用户 {anon_sess[1]} 发现页 200", code == 200, code)
    check("未认证用户看不到只勾大厂的派", not links, links)
    code, _ = fetch(f"/factions/{target[0]}", anon_sess[0])
    check(f"未认证用户打开该派详情 404（/{target[0]}）", code == 404, code)
    code, body = fetch("/api/v1/factions?pageSize=1", anon_sess[0])
    total = re.search(r'"total":(\d+)', body)
    check("未认证用户 API 派总数为 0", bool(total) and int(total.group(1)) == 0, body[:160])

# 游客口径（无 Cookie）+ 公司列表收口
code, html = fetch("/discover")
check("游客发现页 200", code == 200, code)
check("游客看不到只勾大厂的派", not faction_links(html), faction_links(html))
code, body = fetch("/api/v1/companies")
check("公开公司接口不含非大厂占位行", "cmp_outsider_default" not in body and '"scope":"CORP"' in body, body[:200])
code, _ = fetch(f"/factions/{target[0]}")
check("游客打开该派详情 404", code == 404, code)

code, html = fetch("/verify")
check("未登录访问 /verify 被重定向", code in (200, 307) and ("登录" in html or code == 307), code)

if admin_sess:
    code, html = fetch("/admin/factions", admin_sess[0])
    check(f"运营 {admin_sess[1]} 后台派列表 200", code == 200, code)
    fid = conn.execute("SELECT id FROM Faction WHERE status='ACTIVE' LIMIT 1").fetchone()[0]
    code, html = fetch(f"/admin/factions/{fid}", admin_sess[0])
    check(
        "后台派编辑页含大厂/非大厂两枚勾选框",
        code == 200 and 'name="visibleToCorp"' in html and 'name="visibleToOutsider"' in html,
        code,
    )
    check("后台派编辑页勾选项说明人群口径", "已开通公司认证" in html, html[:120])
else:
    print("SKIP  后台侧检查：线上当前没有运营账号的存活会话")

print(f"\n总计 {len(results)} 项，失败 {results.count(False)} 项")
raise SystemExit(1 if not all(results) else 0)
