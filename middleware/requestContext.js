const crypto = require("node:crypto");
const { AsyncLocalStorage } = require("node:async_hooks");

const requestStorage = new AsyncLocalStorage();
const requestIdPattern = /^[A-Za-z0-9._-]{1,64}$/;

function requestIdMiddleware(req, res, next) {
  const incomingId =
    (typeof req.get === "function" && req.get("X-Request-Id")) ||
    (req.headers && req.headers["x-request-id"]);
  const requestId =
    typeof incomingId === "string" && requestIdPattern.test(incomingId)
      ? incomingId
      : crypto.randomBytes(8).toString("hex");

  req.id = requestId;
  res.setHeader("X-Request-Id", requestId);
  return requestStorage.run({ requestId }, next);
}

function getRequestId() {
  const context = requestStorage.getStore();
  return context ? context.requestId : null;
}

module.exports = { getRequestId, requestIdMiddleware };