import clsx, { type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function timeAgo(input: Date | string | number) {
  const date = new Date(input);
  const diff = Date.now() - date.getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return "刚刚";
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`;
  return formatDate(date);
}

export function formatDate(input: Date | string) {
  const d = new Date(input);
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}.${m}.${day}`;
}

export function formatDateTime(input: Date | string) {
  const d = new Date(input);
  const hh = `${d.getHours()}`.padStart(2, "0");
  const mm = `${d.getMinutes()}`.padStart(2, "0");
  return `${formatDate(d)} ${hh}:${mm}`;
}

/**
 * 私信气泡时间：微信式分级——同一天只显时分，跨日补月日，跨年再补年份。
 * 相对时间（timeAgo）在聊天记录里看不出「具体什么时候发的」，故会话流单独用这个口径。
 */
export function formatChatTime(input: Date | string) {
  const d = new Date(input);
  const now = new Date();
  const pad = (value: number) => `${value}`.padStart(2, "0");
  const hhmm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (d.toDateString() === now.toDateString()) return hhmm;
  const dateText =
    d.getFullYear() === now.getFullYear()
      ? `${d.getMonth() + 1}月${d.getDate()}日`
      : `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  return `${dateText} ${hhmm}`;
}

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

/** 供 <input type="datetime-local"> 回填使用 */
export function toDateTimeLocal(input: Date | string) {
  const d = new Date(input);
  const pad = (value: number) => `${value}`.padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatActivityTime(input: Date | string) {
  const d = new Date(input);
  const hh = `${d.getHours()}`.padStart(2, "0");
  const mm = `${d.getMinutes()}`.padStart(2, "0");
  return `${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAYS[d.getDay()]} ${hh}:${mm}`;
}

export function splitList(value?: string | null) {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/** 活动容量解析："0" 表示不限（存 0），否则取 1–500；空/非法时回退 fallback */
export function parseCapacity(raw: unknown, fallback: number): number {
  const text = String(raw ?? "").trim();
  if (text === "0") return 0;
  const n = Number(text);
  if (!Number.isFinite(n) || n <= 0) {
    return fallback === 0 ? 0 : Math.min(Math.max(Math.round(fallback), 1), 500);
  }
  return Math.min(Math.round(n), 500);
}

/** 报名数/容量展示文案：capacity=0 显「不限」 */
export function capacityLabel(signupCount: number, capacity: number) {
  return `${signupCount}/${capacity > 0 ? capacity : "不限"}`;
}

export function shortId(len = 6) {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < len; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

const AVATAR_COLORS = [
  "#FF5A1F",
  "#2F7D5D",
  "#1F6FEB",
  "#7C3AED",
  "#DB2777",
  "#0284C7",
  "#B45309",
];

export function colorFromString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 100000;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function initials(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "厂";
  return trimmed.slice(0, 1).toUpperCase();
}

export function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!domain) return email;
  const visible = name.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(name.length - 2, 2))}@${domain}`;
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

/** 提取 11 位中国大陆手机号，兼容 +86 / 空格 / 短横线写法 */
export function normalizePhone(value: string) {
  const digits = value.replace(/[^\d]/g, "");
  if (digits.length === 13 && digits.startsWith("86")) return digits.slice(2);
  return digits;
}

export function isPhone(value: string) {
  return /^1[3-9]\d{9}$/.test(normalizePhone(value));
}

/** 手机号脱敏展示：138****8000 */
export function maskPhone(phone: string) {
  const value = normalizePhone(phone);
  if (value.length !== 11) return phone;
  return `${value.slice(0, 3)}****${value.slice(-4)}`;
}

export function emailDomain(email: string) {
  const parts = normalizeEmail(email).split("@");
  return parts.length === 2 ? parts[1] : "";
}
