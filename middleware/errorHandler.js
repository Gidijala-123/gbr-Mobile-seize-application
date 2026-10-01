class AppError extends Error {
  constructor(message, statusCode = 500, options = {}) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.isOperational = options.isOperational !== false;
    Error.captureStackTrace?.(this, AppError);
  }
}

function duplicateField(error) {
  const source = error.keyValue || error.keyPattern || {};
  return Object.keys(source)[0] || null;
}

function normalizeError(error, environment = process.env.NODE_ENV) {
  if (error && error.code === "EBADCSRFTOKEN") {
    return {
      statusCode: 403,
      message: "Invalid or missing CSRF token.",
      field: null,
    };
  }

  if (error && error.code === 11000) {
    const field = duplicateField(error);
    return {
      statusCode: 409,
      message: field
        ? `A record with this ${field} already exists.`
        : "A record with these details already exists.",
      field,
    };
  }

  if (error && error.name === "ValidationError") {
    const field = error.errors && Object.keys(error.errors)[0];
    return {
      statusCode: 422,
      message: error.message || "The submitted data is invalid.",
      field: field || null,
    };
  }

  if (error && error.name === "CastError") {
    return {
      statusCode: 400,
      message: error.message || "The submitted value is invalid.",
      field: error.path || null,
    };
  }

  const candidateStatus = Number(error && (error.statusCode || error.status));
  const statusCode =
    Number.isInteger(candidateStatus) && candidateStatus >= 400 && candidateStatus <= 599
      ? candidateStatus
      : 500;
  const isDevelopment = environment === "development";
  const message =
    statusCode >= 500 && !isDevelopment
      ? "Internal Server Error"
      : error && error.message
        ? error.message
        : "Internal Server Error";

  return {
    statusCode,
    message,
    field: null,
    stack: isDevelopment && error ? error.stack : undefined,
  };
}

function wantsJson(req) {
  if (req.path === "/api" || req.path.startsWith("/api/")) return true;
  if (req.xhr) return true;
  if (typeof req.accepts !== "function") return false;
  return req.accepts(["html", "json"]) === "json";
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  const details = normalizeError(error, req.app && req.app.get("env"));
  if (details.statusCode >= 500)
    console.error(
      `Request ${req.id || "-"} failed:`,
      error && error.stack ? error.stack : error,
    );

  const requestPath = String(req.originalUrl || req.path || "").split("?")[0];
  if (requestPath === "/api/v1" || requestPath.startsWith("/api/v1/")) {
    return res.status(details.statusCode).json({
      success: false,
      error: details.message,
      ...(req.id ? { requestId: req.id } : {}),
      ...(details.field ? { field: details.field } : {}),
      ...(details.stack ? { stack: details.stack } : {}),
    });
  }

  if ((error && error.code === "EBADCSRFTOKEN") || wantsJson(req)) {
    return res.status(details.statusCode).json({
      error: details.message,
      ...(req.id ? { requestId: req.id } : {}),
      ...(details.field ? { field: details.field } : {}),
      ...(details.stack ? { stack: details.stack } : {}),
    });
  }

  return res.status(details.statusCode).render("error", {
    message: details.message,
    requestId: req.id || null,
    error: {
      status: details.statusCode,
      stack: details.stack,
    },
  });
}

module.exports = { AppError, errorHandler, normalizeError };