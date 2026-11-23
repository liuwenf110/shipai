// 微信授权中转页：由 H5 登录页经 wx.miniProgram.navigateTo 进入
// wx.login 拿 code → 重启 webview 直达 /api/wx-login 完成登录或首绑引导
Page({
  data: {
    tip: "微信登录中…",
  },
  onShow() {
    this.start();
  },
  start() {
    const that = this;
    wx.login({
      success(res) {
        if (!res.code) {
          that.fallback("获取微信登录凭证失败，请重试");
          return;
        }
        const target = `/api/wx-login?code=${encodeURIComponent(res.code)}&next=/`;
        wx.reLaunch({
          url: `/pages/webview/index?path=${encodeURIComponent(target)}`,
        });
      },
      fail() {
        that.fallback("当前微信版本不支持，请升级后重试");
      },
    });
  },
  fallback(tip) {
    this.setData({ tip });
    setTimeout(() => wx.reLaunch({ url: "/pages/webview/index" }), 1500);
  },
});
