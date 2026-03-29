const { applyTheme, themes, setStoredThemeKey } = require("../../utils/theme");

Page({
  data: {
    themeKey: "strawberry",
    themes,
  },

  onShow() {
    applyTheme(this);
  },

  onSelectTheme(e) {
    const { key } = e.currentTarget.dataset;
    setStoredThemeKey(key);
    const themeKey = applyTheme(this);
    getApp().globalData.themeKey = themeKey;
    wx.showToast({
      title: "配色已切换",
      icon: "none",
    });
  },
});
