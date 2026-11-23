// 原生分享中转页：web-view 内的 H5 无法主动调起微信分享面板（postMessage 只在页面销毁等时机回传，
// 且 onShareAppMessage 拿不到），所以由 H5 经 wx.miniProgram.navigateTo 跳到本页，
// 页内 <button open-type="share"> 直接调起转发，卡片标题/落地路径/封面图全部来自分享的具体活动或派。
Page({
  data: {
    title: "",
    // H5 站内干净路径（不含部署前缀），壳自己与 H5_BASE 拼接
    h5path: "",
    image: "",
    // 分享对象类型：activity 活动 | faction 兴趣派，只影响提示文案
    kind: "activity",
  },
  onLoad(query) {
    const pick = (key) => (query && query[key] ? decodeURIComponent(query[key]) : "");
    const image = pick("image");
    this.setData({
      // 兜底标题：链接被单独转发或参数缺失时也不至于出现空卡片
      title: pick("title") || "上十派 · 离职不离圈，兴趣不断线",
      h5path: pick("path"),
      // 分享卡片封面只接受 https 绝对地址，相对路径在小程序里取不到
      image: /^https:\/\//.test(image) ? image : "",
      kind: pick("kind") || "activity",
    });
  },
  onShareAppMessage() {
    const { title, h5path, image } = this.data;
    const card = {
      title: title || "上十派 · 离职不离圈，兴趣不断线",
      // 对方点开卡片直达这一场活动/这个派（壳会再补 from=wxapp）
      path: h5path
        ? `/pages/webview/index?path=${encodeURIComponent(h5path)}`
        : "/pages/webview/index",
    };
    if (image) card.imageUrl = image;
    return card;
  },
  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack();
    else wx.reLaunch({ url: "/pages/webview/index" });
  },
});
