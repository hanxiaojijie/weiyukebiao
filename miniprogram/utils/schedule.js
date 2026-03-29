function pad(value) {
  return `${value}`.padStart(2, "0");
}

function getDateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDateKey(dateKey = "") {
  if (!dateKey) {
    return new Date();
  }

  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getWeekdayKey(date) {
  const day = date.getDay();
  return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][day];
}

function getPlanWeekdays(plan = {}) {
  if (Array.isArray(plan.weekdays) && plan.weekdays.length) {
    return plan.weekdays.filter(Boolean);
  }

  if (plan.weekday) {
    return [plan.weekday];
  }

  return [];
}

function minutesBetweenTimes(startTime, endTime) {
  if (!startTime || !endTime) {
    return 0;
  }

  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;
  return Math.max(end - start, 0);
}

function getPlanStartDateKey(plan = {}) {
  if (plan.startDate) {
    return plan.startDate;
  }

  if (plan.createdAt) {
    return getDateKey(new Date(plan.createdAt));
  }

  return "";
}

function isPlanInDateRange(plan = {}, dateOrKey) {
  const dateKey = typeof dateOrKey === "string" ? dateOrKey : getDateKey(dateOrKey);
  const startDateKey = getPlanStartDateKey(plan);
  const endDateKey = plan.endDate || "";

  if (startDateKey && startDateKey > dateKey) {
    return false;
  }

  if (endDateKey && endDateKey < dateKey) {
    return false;
  }

  return true;
}

function doesPlanOccurOnDate(plan = {}, dateOrKey) {
  const date = typeof dateOrKey === "string" ? parseDateKey(dateOrKey) : dateOrKey;
  const dateKey = typeof dateOrKey === "string" ? dateOrKey : getDateKey(date);
  return getPlanWeekdays(plan).includes(getWeekdayKey(date)) && isPlanInDateRange(plan, dateKey);
}

function countPlannedSessions(planList = [], startDate, endDate) {
  let total = 0;
  const cursor = new Date(startDate);

  while (cursor <= endDate) {
    total += planList.filter((item) => doesPlanOccurOnDate(item, cursor)).length;
    cursor.setDate(cursor.getDate() + 1);
  }

  return total;
}

function calculateEstimatedEndDate({
  startDate,
  weekdays = [],
  startTime,
  endTime,
  totalHours,
  restMonthlyLimit = 0,
}) {
  const normalizedStartDate = startDate || getDateKey(new Date());
  const sessionMinutes = minutesBetweenTimes(startTime, endTime);
  const totalMinutes = Math.round(Number(totalHours || 0) * 60);

  if (!weekdays.length || !sessionMinutes || !totalMinutes) {
    return "";
  }

  const requiredSessions = Math.max(Math.ceil(totalMinutes / sessionMinutes), 1);
  const restLimit = Math.max(Number(restMonthlyLimit || 0), 0);
  const monthlyRestUsage = {};
  let completedSessions = 0;
  let cursor = parseDateKey(normalizedStartDate);
  let lastStudyDateKey = normalizedStartDate;

  for (let guard = 0; guard < 5000; guard += 1) {
    const dateKey = getDateKey(cursor);
    const weekdayKey = getWeekdayKey(cursor);

    if (weekdays.includes(weekdayKey)) {
      const monthKey = dateKey.slice(0, 7);
      const usedRest = Number(monthlyRestUsage[monthKey] || 0);

      if (usedRest < restLimit) {
        monthlyRestUsage[monthKey] = usedRest + 1;
      } else {
        completedSessions += 1;
        lastStudyDateKey = dateKey;
        if (completedSessions >= requiredSessions) {
          return dateKey;
        }
      }
    }

    cursor = addDays(cursor, 1);
  }

  return lastStudyDateKey;
}

module.exports = {
  addDays,
  calculateEstimatedEndDate,
  countPlannedSessions,
  doesPlanOccurOnDate,
  getDateKey,
  getPlanStartDateKey,
  getPlanWeekdays,
  getWeekdayKey,
  isPlanInDateRange,
  minutesBetweenTimes,
  parseDateKey,
};
