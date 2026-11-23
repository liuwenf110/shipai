// 上十派 web-view 壳运行时配置
// ⚠️ web-view 正式版只能加载「小程序后台已配置的业务域名」——已备案 HTTPS 域名。
//
// 【本地调试】开发者工具 → 详情 → 本地设置 → 勾选「不校验合法域名」，
//   即可用下面的 localhost 地址（需本地 npm run dev 运行在 3000，dev 无 basePath）。
// 【正式发布】拿到备案 HTTPS 域名并配置 nginx + 业务域名校验文件后，
//   将 H5_BASE 替换为 https://你的域名/shipai（必须带 basePath /shipai）。
module.exports = {
  // 【正式发布】已备案 HTTPS 业务域名（需在 MP 后台配好业务域名后真机才能打开）
  H5_BASE: "https://www.xiaomaizhipin.com/shipai",
  // 【本地调试】改回下行并勾选「不校验合法域名」，需本地 npm run dev 跑在 3000（dev 无 basePath）
  // H5_BASE: "http://localhost:3000",
};
