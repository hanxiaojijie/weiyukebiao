const db = wx.cloud.database();

const DEFAULT_CREDIT_RULE = {
  title: "默认学分规则",
  completionCredits: 8,
  deepStudyThreshold: 90,
  deepStudyBonus: 5,
  missedPenalty: -4,
  restMonthlyLimit: 4,
  manualAdjustment: 0,
};

const DEFAULT_REWARD = {
  title: "给自己的一个奖励",
  targetCredits: 188,
  description: "给长期坚持一个明确的兑现点。",
  manualAdjustment: 0,
};

async function ensureSingleDoc(collectionName, defaults, openid) {
  if (!openid) {
    throw new Error(`missing openid for ${collectionName}`);
  }

  const collection = db.collection(collectionName);
  const { data } = await collection
    .where({
      openid,
    })
    .orderBy("updatedAt", "desc")
    .limit(1)
    .get();
  if (data.length) {
    return {
      _id: data[0]._id,
      ...defaults,
      ...data[0],
    };
  }

  const now = new Date();
  const payload = {
    ...defaults,
    openid,
    createdAt: now,
    updatedAt: now,
  };
  const result = await collection.add({
    data: payload,
  });

  return {
    _id: result._id,
    ...payload,
  };
}

function calcEarnedCredits(rule, actualMinutes) {
  const completionCredits = Number(rule.completionCredits || 0);
  const deepStudyThreshold = Number(rule.deepStudyThreshold || 0);
  const deepStudyBonus = Number(rule.deepStudyBonus || 0);
  const earnedCredits =
    completionCredits + (actualMinutes >= deepStudyThreshold ? deepStudyBonus : 0);

  return {
    earnedCredits,
    completionCredits,
    deepStudyThreshold,
    deepStudyBonus,
  };
}

function calcRewardProgress(totalCredits, reward) {
  const targetCredits = Math.max(Number(reward.targetCredits || 0), 1);
  const manualAdjustment = Number(reward.manualAdjustment || 0);
  const currentCredits = Math.max(Number(totalCredits || 0) + manualAdjustment, 0);
  const remainingCredits = Math.max(targetCredits - currentCredits, 0);
  const progressPercent = Math.min(Math.round((currentCredits / targetCredits) * 100), 100);

  return {
    currentCredits,
    targetCredits,
    remainingCredits,
    manualAdjustment,
    progressPercent,
  };
}

function calcStatusCredits(rule, status) {
  if (status === "missed") {
    return Number(rule.missedPenalty || 0);
  }

  if (status === "leave" || status === "rest") {
    return 0;
  }

  return 0;
}

function sumCreditLedger(checkins = [], creditRule = {}) {
  const ledgerCredits = checkins.reduce(
    (sum, item) => sum + Number(item.earnedCredits || 0),
    0
  );

  return ledgerCredits + Number(creditRule.manualAdjustment || 0);
}

module.exports = {
  DEFAULT_CREDIT_RULE,
  DEFAULT_REWARD,
  calcEarnedCredits,
  calcStatusCredits,
  calcRewardProgress,
  ensureSingleDoc,
  sumCreditLedger,
};
