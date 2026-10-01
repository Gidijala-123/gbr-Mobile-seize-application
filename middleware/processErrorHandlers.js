function installProcessErrorHandlers({
  server,
  processObject = process,
  logger = console,
  exit = (code) => process.exit(code),
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  timeoutMs = 10000,
}) {
  let shuttingDown = false;

  function shutdown(error) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.error("Fatal process error; stopping HTTP server:", error);

    if (!server.listening) return exit(1);
    const timeout = setTimeoutFn(() => exit(1), timeoutMs);
    if (typeof timeout.unref === "function") timeout.unref();
    server.close(() => {
      clearTimeoutFn(timeout);
      exit(1);
    });
  }

  processObject.on("uncaughtException", shutdown);
  processObject.on("unhandledRejection", (reason) => {
    shutdown(reason instanceof Error ? reason : new Error(String(reason)));
  });

  return shutdown;
}

module.exports = { installProcessErrorHandlers };