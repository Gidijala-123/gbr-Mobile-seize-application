function sanitizeMongoUri(rawUri) {
  if (typeof rawUri !== "string") return rawUri;
  try {
    const url = new URL(rawUri);
    if (url.searchParams.has("appName")) url.searchParams.delete("appName");
    return url.toString();
  } catch (error) {
    return rawUri;
  }
}

function createDbReadiness({ getReady, getError, areCollectionsReady }) {
  return async function ensureDbReady() {
    const initializationError = getError();
    if (initializationError) throw initializationError;

    const ready = getReady();
    if (!ready) throw new Error("MongoDB is not initialized yet.");
    await ready;

    if (!areCollectionsReady())
      throw new Error("MongoDB collections are not ready.");
  };
}

module.exports = { createDbReadiness, sanitizeMongoUri };
