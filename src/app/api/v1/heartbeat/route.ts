import { apiError, apiOk, requireApiUser } from "@/lib/api";

/**
 * POST /api/v1/heartbeat 前端在线心跳
 * 登录态校验（requireApiUser）本身就会对 Session 打点 lastSeenAt，这里只回执。
 */
export async function POST() {
  const { user, response } = await requireApiUser();
  if (!user) return response ?? apiError("请先登录", 401);

  return apiOk({ online: true });
}
