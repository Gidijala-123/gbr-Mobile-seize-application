function createErrorReporter({ getErrorRepository, logger = console }) {
  async function record(type, email, error, requestId = null) {
    const repository = getErrorRepository();
    if (!repository) return;

    try {
      await repository.insert({
        type,
        email,
        message: error && error.message ? error.message : String(error),
        requestId,
        time: new Date(),
      });
    } catch (loggingError) {
      logger.error(
        "Unable to record application error:",
        loggingError && loggingError.message
          ? loggingError.message
          : loggingError,
      );
    }
  }

  return { record };
}

module.exports = { createErrorReporter };
