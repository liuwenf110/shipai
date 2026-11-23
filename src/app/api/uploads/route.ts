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

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
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
