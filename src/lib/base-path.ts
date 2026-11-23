/** 部署子路径（如 /shipai），由 NEXT_PUBLIC_BASE_PATH 在构建期内联；本地开发为空 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** 给站内绝对路径补上部署前缀：`next/link` 会自动加，fetch / history 需手动加 */
export function withBasePath(path: string) {
  return path.startsWith("/") ? `${BASE_PATH}${path}` : path;
}

/** 去掉部署前缀得到干净路径，避免 router.push / redirect 重复拼接 */
export function stripBasePath(pathname: string) {
  if (!BASE_PATH || !pathname.startsWith(BASE_PATH)) return pathname;
  return pathname.slice(BASE_PATH.length) || "/";
}
