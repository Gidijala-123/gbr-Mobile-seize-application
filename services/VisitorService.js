function createVisitorService({ getVisitorRepository }) {
  function recordVisit(name, email) {
    return getVisitorRepository().insert({ name, email, time: new Date() });
  }

  async function getVisitorSummary(referenceDate = new Date()) {
    const repo = getVisitorRepository();
    if (!repo || typeof repo.countDocuments !== "function") {
      return { today: 0, thisMonth: 0, allTime: 0 };
    }

    const now = new Date(referenceDate);
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const [today, thisMonth, allTime] = await Promise.all([
      repo.countDocuments({
        time: { $gte: startOfToday },
      }),
      repo.countDocuments({
        time: { $gte: startOfMonth, $lt: startOfNextMonth },
      }),
      repo.countDocuments({}),
    ]);

    return { today, thisMonth, allTime };
  }

  return { recordVisit, getVisitorSummary };
}

module.exports = { createVisitorService };
