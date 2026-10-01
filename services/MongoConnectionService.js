function createMongoConnectionService({
  connect,
  getConnection,
  wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  logger = console,
  attempts = 5,
  initialDelayMs = 250,
}) {
  async function connectWithRetry(uri, options = {}) {
    let delayMs = initialDelayMs;
    let lastError;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await connect(uri, options);
      } catch (error) {
        lastError = error;
        if (attempt === attempts) break;
        logger.warn(
          `MongoDB connection attempt ${attempt}/${attempts} failed; retrying in ${delayMs}ms.`,
          error.message,
        );
        await wait(delayMs);
        delayMs *= 2;
      }
    }

    throw lastError;
  }

  async function getHealth() {
    const connection = getConnection();
    if (!connection || connection.readyState !== 1 || !connection.db) {
      return { healthy: false, mongo: { state: "disconnected" } };
    }

    try {
      const ping = await connection.db.admin().ping();
      if (!ping || ping.ok !== 1)
        return { healthy: false, mongo: { state: "unhealthy" } };
      const stats = await connection.db.stats();
      return {
        healthy: true,
        mongo: { state: "connected", ...stats },
      };
    } catch (error) {
      return { healthy: false, mongo: { state: "unhealthy" } };
    }
  }

  return { connectWithRetry, getHealth };
}

module.exports = { createMongoConnectionService };