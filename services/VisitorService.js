function createVisitorService({ getVisitorRepository }) {
  function recordVisit(name, email) {
    return getVisitorRepository().insert({ name, email, time: new Date() });
  }

  return { recordVisit };
}

module.exports = { createVisitorService };