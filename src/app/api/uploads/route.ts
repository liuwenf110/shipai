import { getCurrentUser } from "@/lib/auth";
import { saveProofFile } from "@/lib/upload";

/**
 * POST /api/uploads 富文本编辑器粘贴/选图即时上传。
 * 落盘与校验复用 saveProofFile（6MB、JPG/PNG/WEBP 白名单），返回站内相对路径 /uploads/xxx，
 * 库里与正文 HTML 都存相对形态，展示时再按部署前缀拼接。
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });

  // 解析失败（体过大被前置网关掉断等）只在 Next 内抛错，不能与“没带文件”共用一条提示，
  // 否则用户看到的“缺少图片文件”与真实原因完全无关
  let form: FormData | null;
  try {
    form = await request.formData();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    console.error("[uploads] 请求体解析失败:", message);
    const tooLarge = /exceed|limit|size|too large|413/i.test(message);
    return Response.json(
      { error: tooLarge ? "图片太大（单次上限 8MB），请先压缩后再传" : "上传请求解析失败，请重试" },
      { status: tooLarge ? 413 : 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "缺少图片文件" }, { status: 400 });
  }

  try {
    const url = await saveProofFile(file);
    return Response.json({ url });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "图片上传失败" },
      { status: 400 },
    );
  }
}
