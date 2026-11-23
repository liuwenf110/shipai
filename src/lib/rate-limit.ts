import "server-only";

import { headers } from "next/headers";

/**
 * 注册接口 per-IP 滑动窗口限流。
 * 目的：挡住脚本批量注册（每个新账号后续都会触发一封在职验证码，间接保护 QQ 发信账号不被刷爆）。
 * 实现：进程内 Map 记录每个 IP 的命中时间戳，超过窗口即淘汰。单实例（systemd 3010）足够，
 * 服务重启会清零，但窗口只有几十分钟量级，可接受。
 * 注意：平台用户多在阿里等企业出口 NAT 后共享公网 IP，故阈值刻意放宽，只拦异常洪泛不误伤正常办公注册。
 */

// 窗口（分钟）与每 IP 窗口内最大注册尝试数，均可用环境变量覆盖
const WINDOW_MS = Number(process.env.REGISTER_IP_WINDOW_MIN || 60) * 60_000;
const MAX_PER_WINDOW = Number(process.env.REGISTER_IP_MAX || 30);

const hits = new Map<string, number[]>();

/** 取真实客户端 IP：nginx 已透传 X-Forwarded-For，取首个；回退 X-Real-IP；再兜底 unknown */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  return first || h.get("x-real-ip") || "unknown";
}

/**
 * 记录并判定某 IP 是否仍可继续注册尝试。
 * 返回 allowed=false 时附带建议等待秒数。放在昂贵校验之前调用，让洪水请求也计入。
 */
export function checkRegisterIpLimit(ip: string, now = Date.now()) {
  const cutoff = now - WINDOW_MS;
  const recent = (hits.get(ip) ?? []).filter((t) => t > cutoff);

  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(ip, recent);
    const retryAfterSec = Math.max(1, Math.ceil((recent[0] + WINDOW_MS - now) / 1000));
    return { allowed: false, retryAfterSec };
  }

  recent.push(now);
  hits.set(ip, recent);

  // 轻量回收，防止 Map 随 IP 基数无界增长
  if (hits.size > 5000) {
    for (const [key, list] of hits) {
      const kept = list.filter((t) => t > cutoff);
      if (kept.length) hits.set(key, kept);
      else hits.delete(key);
    }
  }

  return { allowed: true, retryAfterSec: 0 };
}
