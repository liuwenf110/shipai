const { H5_BASE } = require("../../config");

const DEFAULT_TITLE = "上十派 · 离职不离圈，兴趣不断线";

Page({
  data: {
    url: `${H5_BASE}?from=wxapp`,
  },
  onLoad(query) {
    // 支持通过小程序路径参数直达 H5 子页面，如分享链接：
    // pages/webview/index?path=/factions/music-iv4qt5%3Fref%3Dshare
    // 无论有无 path，始终附加 from=wxapp，保证 H5 登录页微信按钮不依赖 UA 判定
    let tail = "";
    if (query && query.path) {
      tail = decodeURIComponent(query.path);
    } else if (query && query.scene) {
      // 小程序码（getwxacodeunlimit）场景值：扫码进入时微信注入 query.scene，
      // 宣传海报码把落地路径直接烤进 scene（如 /factions/esports），此处还原为子页路径。
      // scene 可能被 URL 编码，decodeURIComponent 对未编码值也安全。
      tail = decodeURIComponent(query.scene);
    }
    const sep = tail.indexOf("?") >= 0 ? "&" : "?";
    // 附加一次性时间戳，规避 web-view 对 H5 的激进缓存，保证冷启动拉到最新数据
    this.setData({ url: `${H5_BASE}${tail}${sep}from=wxapp&_t=${Date.now()}` });
  },
  // 兜底链路：H5 展开分享面板时会经 wx.miniProgram.postMessage 发来 {type:'share',title,path,image}，
  // 但 postMessage 只在组件销毁／右上角转发等时机回传，不保证赶得上分享回调，
  // 所以主路径是 H5 直接 navigateTo 原生中转页 pages/share，这里只缓存最近一条供右上角转发使用。
  onH5Message(e) {
    const list = (e && e.detail && e.detail.data) || [];
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (m && m.type === "share" && m.path) this.lastShare = m;
    }
  },
  // 右上角「···→ 推荐给朋友」：优先用 H5 最近一次分享意图，生成直达该活动/该派的卡片
  // （对方点开卡片经 path 透传 + from=wxapp 落地到具体页面，而不是整个小程序首页）
  onShareAppMessage() {
    const share = this.lastShare;
    if (share) {
      const card = {
        title: share.title || DEFAULT_TITLE,
        path: `/pages/webview/index?path=${encodeURIComponent(share.path)}`,
      };
      if (/^https:\/\//.test(share.image || "")) card.imageUrl = share.image;
      return card;
    }
    return {
      title: DEFAULT_TITLE,
      path: "/pages/webview/index",
    };
  },
});
