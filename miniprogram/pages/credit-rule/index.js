const { applyTheme } = require("../../utils/theme");
const { DEFAULT_CREDIT_RULE, ensureSingleDoc } = require("../../utils/learning");
const { ensureLogin } = require("../../utils/auth");
const db = wx.cloud.database();

Page({
  data: {
    themeKey: "strawberry",
    saving: false,
    ruleId: "",
    form: {
      completionCredits: `${DEFAULT_CREDIT_RULE.completionCredits}`,
      deepStudyThreshold: `${DEFAULT_CREDIT_RULE.deepStudyThreshold}`,
      deepStudyBonus: `${DEFAULT_CREDIT_RULE.deepStudyBonus}`,
      missedPenalty: `${DEFAULT_CREDIT_RULE.missedPenalty}`,
      restMonthlyLimit: `${DEFAULT_CREDIT_RULE.restMonthlyLimit}`,
      manualAdjustment: `${DEFAULT_CREDIT_RULE.manualAdjustment}`,
    },
  },

  onShow() {
    applyTheme(this);
    this.loadRule();
  },

  async loadRule() {
    try {
      const openid = await ensureLogin();
      if (!openid) {
        return;
      }
      const ruleDoc = await ensureSingleDoc("credit_rules", DEFAULT_CREDIT_RULE, openid);
      this.setData({
        ruleId: ruleDoc._id,
        form: {
          completionCredits: `${ruleDoc.completionCredits || 0}`,
          deepStudyThreshold: `${ruleDoc.deepStudyThreshold || 0}`,
          deepStudyBonus: `${ruleDoc.deepStudyBonus || 0}`,
          missedPenalty: `${ruleDoc.missedPenalty || 0}`,
          restMonthlyLimit: `${ruleDoc.restMonthlyLimit || DEFAULT_CREDIT_RULE.restMonthlyLimit}`,
          manualAdjustment: `${ruleDoc.manualAdjustment || 0}`,
        },
      });
    } catch (error) {
      console.error("读取学分规则失败", error);
    }
  },

  onInputChange(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({
      [`form.${field}`]: e.detail.value,
    });
  },

  async onSaveRule() {
    const openid = await ensureLogin();
    if (!openid) {
      wx.showToast({
        title: "登录初始化失败",
        icon: "none",
      });
      return;
    }

    const { ruleId, form } = this.data;
    this.setData({ saving: true });
    try {
      await db.collection("credit_rules").doc(ruleId).update({
        data: {
          openid,
          completionCredits: Number(form.completionCredits || 0),
          deepStudyThreshold: Number(form.deepStudyThreshold || 0),
          deepStudyBonus: Number(form.deepStudyBonus || 0),
          missedPenalty: Number(form.missedPenalty || 0),
          restMonthlyLimit: Number(form.restMonthlyLimit || DEFAULT_CREDIT_RULE.restMonthlyLimit),
          manualAdjustment: Number(form.manualAdjustment || 0),
          updatedAt: new Date(),
        },
      });
      wx.showToast({
        title: "规则已保存",
        icon: "success",
      });
      this.loadRule();
    } catch (error) {
      console.error("保存学分规则失败", error);
      wx.showToast({
        title: "保存失败",
        icon: "none",
      });
    } finally {
      this.setData({ saving: false });
    }
  },
});
