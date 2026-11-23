import "server-only";

import { cookies } from "next/headers";

/**
 * 微信小程序 web-view 登录支撑：
 * code → openid 交换（jscode2session）+ 首次登录待绑定 openid 的短时效 cookie。
 * 凭据仅存于服务端环境变量（WX_APPID / WX_SECRET），生产环境不启用 mock。
 */

const PENDING_COOKIE = "shipai_wx_pending";
const PENDING_TTL_SECONDS = 10 * 60;

/** 用小程序 wx.login 下发的 code 换取 openid；失败返回 null */
export async function exchangeWxCode(code: string): Promise<string | null> {
  if (!code) return null;

  // 本地/测试联调：WX_MOCK=1 时 "mock:<openid>" 直接映射为 openid，不请求微信
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.WX_MOCK === "1" &&
    code.startsWith("mock:")
  ) {
    return code.slice(5) || null;
  }

  const appid = process.env.WX_APPID;
  const secret = process.env.WX_SECRET;
  if (!appid || !secret) return null;

  try {
    const url =
      `https://api.weixin.qq.com/sns/jscode2session` +
      `?appid=${appid}&secret=${secret}&js_code=${encodeURIComponent(code)}` +
      `&grant_type=authorization_code`;
    const res = await fetch(url);
    const data = (await res.json()) as { openid?: string; errcode?: number; errmsg?: string };
    if (data.errcode || !data.openid) return null;
    return data.openid;
  } catch {
    return null;
  }
}

/** 暂存待注册/待绑定的 openid（10 分钟有效），供登录页引导块消费 */
export async function setPendingOpenid(openid: string) {
  const jar = await cookies();
  jar.set(PENDING_COOKIE, openid, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: PENDING_TTL_SECONDS,
  });
}

export async function getPendingOpenid(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(PENDING_COOKIE)?.value ?? null;
}

export async function clearPendingOpenid() {
  const jar = await cookies();
  jar.delete(PENDING_COOKIE);
}

/**
 * 「待设置昵称」标记：微信一键注册只能给「微信用户XXXX」这种占位昵称（微信早已不再下发真实昵称），
 * 建号后打上该标记并引导到 /welcome 让用户改名；用户在引导页保存/跳过、或在 /me 自行改名后即清除。
 * 只存于服务端 cookie（HttpOnly），不入 User 表，避免为一次性引导动 schema。
 */
const NICKNAME_FLAG_COOKIE = "shipai_wx_need_nickname";
const NICKNAME_FLAG_TTL_SECONDS = 30 * 60;

export async function setWxNeedNicknameFlag() {
  const jar = await cookies();
  jar.set(NICKNAME_FLAG_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: NICKNAME_FLAG_TTL_SECONDS,
  });
}

export async function hasWxNeedNicknameFlag(): Promise<boolean> {
  const jar = await cookies();
  return jar.get(NICKNAME_FLAG_COOKIE)?.value === "1";
}

export async function clearWxNeedNicknameFlag() {
  const jar = await cookies();
  jar.delete(NICKNAME_FLAG_COOKIE);
}
