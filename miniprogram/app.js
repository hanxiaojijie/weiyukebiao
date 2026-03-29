const { DEFAULT_THEME_KEY, getStoredThemeKey } = require("./utils/theme");

App({
  onLaunch() {
    const themeKey = getStoredThemeKey();

    this.globalData = {
      env: "cloud1-1g2x48ece3357f4f",
      appName: "未雨课表",
      themeKey: themeKey || DEFAULT_THEME_KEY,
      openid: "",
      userProfile: null,
    };

    if (!wx.cloud) {
      console.error("请使用 2.2.3 或以上的基础库以使用云能力");
    } else {
      wx.cloud.init({
        env: this.globalData.env,
        traceUser: true,
      });

      this.loginPromise = this.initSession();
    }
  },

  async initSession() {
    try {
      const loginRes = await wx.cloud.callFunction({
        name: "quickstartFunctions",
        data: {
          type: "getOpenId",
        },
      });
      const openid = loginRes?.result?.openid || "";
      if (!openid) {
        throw new Error("missing openid");
      }

      this.globalData.openid = openid;
      await this.ensureUserProfile(openid);
      await this.adoptAnonymousData(openid);
      return openid;
    } catch (error) {
      console.error("初始化微信登录失败", error);
      this.globalData.openid = "";
      return "";
    }
  },

  async ensureLogin() {
    if (this.globalData?.openid) {
      return this.globalData.openid;
    }

    if (!this.loginPromise) {
      this.loginPromise = this.initSession();
    }

    return this.loginPromise;
  },

  async ensureUserProfile(openid) {
    const database = wx.cloud.database();
    const { data } = await database
      .collection("users")
      .where({
        openid,
      })
      .limit(1)
      .get();

    if (data.length) {
      this.globalData.userProfile = data[0];
      return data[0];
    }

    const now = new Date();
    const payload = {
      openid,
      nickname: "学习者",
      createdAt: now,
      updatedAt: now,
    };
    const result = await database.collection("users").add({
      data: payload,
    });
    const profile = {
      _id: result._id,
      ...payload,
    };
    this.globalData.userProfile = profile;
    return profile;
  },

  async updateUserProfile(patch = {}) {
    const openid = await this.ensureLogin();
    if (!openid) {
      throw new Error("missing openid");
    }

    const database = wx.cloud.database();
    const currentProfile = this.globalData.userProfile || (await this.ensureUserProfile(openid));
    const nextProfile = {
      ...currentProfile,
      ...patch,
      openid,
      updatedAt: new Date(),
    };

    await database.collection("users").doc(currentProfile._id).update({
      data: {
        nickname: nextProfile.nickname || "学习者",
        avatarUrl: nextProfile.avatarUrl || "",
        intro: nextProfile.intro || "",
        updatedAt: nextProfile.updatedAt,
      },
    });

    this.globalData.userProfile = nextProfile;
    return nextProfile;
  },

  async adoptAnonymousData(openid) {
    const database = wx.cloud.database();
    const _ = database.command;
    const collections = ["user_course_plans", "checkins", "rewards", "credit_rules"];

    await Promise.all(
      collections.map(async (collectionName) => {
        const { data } = await database
          .collection(collectionName)
          .where({
            openid: _.exists(false),
          })
          .limit(200)
          .get();

        await Promise.all(
          data.map((item) =>
            database.collection(collectionName).doc(item._id).update({
              data: {
                openid,
                updatedAt: new Date(),
              },
            })
          )
        );
      })
    );
  },
});
