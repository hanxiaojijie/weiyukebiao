const STORAGE_KEY = "weiyu_theme_key";
const DEFAULT_THEME_KEY = "strawberry";

const themes = [
  {
    key: "strawberry",
    name: "草莓熊",
    desc: "柔和粉调",
    navBg: "#FFF3F5",
    navFront: "#000000",
    tabBg: "#FFF9FA",
    tabColor: "#A7868E",
    tabSelectedColor: "#A64D67",
  },
  {
    key: "forest",
    name: "松林绿",
    desc: "清爽中性",
    navBg: "#EEF5EF",
    navFront: "#000000",
    tabBg: "#F7FBF7",
    tabColor: "#7E9183",
    tabSelectedColor: "#3F604A",
  },
  {
    key: "ocean",
    name: "海盐蓝",
    desc: "冷静干净",
    navBg: "#F0F6FB",
    navFront: "#000000",
    tabBg: "#F7FBFF",
    tabColor: "#8798A7",
    tabSelectedColor: "#3F6384",
  },
  {
    key: "caramel",
    name: "焦糖杏",
    desc: "暖米杏色",
    navBg: "#FBF3EA",
    navFront: "#000000",
    tabBg: "#FFFAF5",
    tabColor: "#A48C7D",
    tabSelectedColor: "#9A6445",
  },
  {
    key: "graphite",
    name: "石墨灰",
    desc: "低饱和灰",
    navBg: "#F2F2F5",
    navFront: "#000000",
    tabBg: "#F8F8FA",
    tabColor: "#9398A5",
    tabSelectedColor: "#545B6B",
  },
  {
    key: "midnight",
    name: "夜幕黑",
    desc: "深色模式",
    navBg: "#1D2027",
    navFront: "#ffffff",
    tabBg: "#232733",
    tabColor: "#8D94A5",
    tabSelectedColor: "#F1D17A",
  },
  {
    key: "lavender",
    name: "雾紫",
    desc: "安静紫调",
    navBg: "#F4F1FA",
    navFront: "#000000",
    tabBg: "#FAF8FD",
    tabColor: "#9A93AA",
    tabSelectedColor: "#7D6E9F",
  },
  {
    key: "mint",
    name: "薄荷青",
    desc: "轻盈明快",
    navBg: "#EEF8F5",
    navFront: "#000000",
    tabBg: "#F8FCFB",
    tabColor: "#8AA49B",
    tabSelectedColor: "#4C8A77",
  },
  {
    key: "ruby",
    name: "酒红",
    desc: "成熟稳重",
    navBg: "#FBF0F2",
    navFront: "#000000",
    tabBg: "#FFF8F9",
    tabColor: "#A0848C",
    tabSelectedColor: "#8F4A5C",
  },
  {
    key: "sand",
    name: "沙丘金",
    desc: "暖金米色",
    navBg: "#FBF6EE",
    navFront: "#000000",
    tabBg: "#FFFCF7",
    tabColor: "#A49679",
    tabSelectedColor: "#A57A2F",
  },
];

function isValidThemeKey(themeKey) {
  return themes.some((item) => item.key === themeKey);
}

function getStoredThemeKey() {
  try {
    const themeKey = wx.getStorageSync(STORAGE_KEY);
    return isValidThemeKey(themeKey) ? themeKey : DEFAULT_THEME_KEY;
  } catch (error) {
    return DEFAULT_THEME_KEY;
  }
}

function setStoredThemeKey(themeKey) {
  const nextThemeKey = isValidThemeKey(themeKey) ? themeKey : DEFAULT_THEME_KEY;
  wx.setStorageSync(STORAGE_KEY, nextThemeKey);
  return nextThemeKey;
}

function applyTheme(page) {
  const themeKey = getStoredThemeKey();
  const theme = themes.find((item) => item.key === themeKey) || themes[0];
  page.setData({
    themeKey,
  });

  if (typeof wx.setNavigationBarColor === "function") {
    wx.setNavigationBarColor({
      frontColor: theme.navFront,
      backgroundColor: theme.navBg,
      animation: {
        duration: 150,
        timingFunc: "easeIn",
      },
    });
  }

  if (typeof wx.setTabBarStyle === "function") {
    wx.setTabBarStyle({
      backgroundColor: theme.tabBg,
      color: theme.tabColor,
      selectedColor: theme.tabSelectedColor,
      borderStyle: "black",
    });
  }

  return themeKey;
}

module.exports = {
  DEFAULT_THEME_KEY,
  themes,
  getStoredThemeKey,
  setStoredThemeKey,
  applyTheme,
};
