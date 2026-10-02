require("dotenv").config();
var createError = require("http-errors");
var express = require("express");
var timeout = require("connect-timeout");
var compression = require("compression");
var zlib = require("node:zlib");
var crypto = require("crypto");
var path = require("path");
var cookieParser = require("cookie-parser");
var cors = require("cors");
var logger = require("morgan");
var session = require("express-session");
var MongoStore = require("connect-mongo").default;
var csrf = require("@dr.pogodin/csurf").default;
var helmet = require("helmet");
var mongoSanitize = require("express-mongo-sanitize");
var { errorHandler } = require("./middleware/errorHandler");
var { createBodyParsers } = require("./middleware/bodyParsers");
var { requestIdMiddleware } = require("./middleware/requestContext");
var { consumeFlash, setFlash } = require("./utils/flash");
var indexRouter = require("./routes/index");
var app = express();
var registeredComponents = require("./components/registry");
app.locals.components = registeredComponents.filter(
  (component) => !["LoginCard", "ForgotCard"].includes(component.name),
);
app.locals.loginComponents = registeredComponents.filter(
  (component) => component.name === "LoginCard",
);
app.locals.forgotComponents = registeredComponents.filter(
  (component) => component.name === "ForgotCard",
);

function normalizeEnvValue(value, defaultValue) {
  if (typeof value !== "string") return defaultValue;
  const trimmed = value.trim();
  return trimmed ? trimmed.replace(/\s+/g, "") : defaultValue;
}

function sanitizeMongoUri(rawUri) {
  if (typeof rawUri !== "string") return rawUri;
  try {
    const url = new URL(rawUri);
    if (url.searchParams.has("appName")) url.searchParams.delete("appName");
    return url.toString();
  } catch (err) {
    return rawUri;
  }
}

const mongoUri = sanitizeMongoUri(
  normalizeEnvValue(process.env.MONGODB_URI, ""),
);
const allowedCorsOrigins = new Set(
  String(process.env.CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);
const sessionSecret = normalizeEnvValue(process.env.SESSION_SECRET, "");
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

app.set("trust proxy", 1);

if (process.env.NODE_ENV === "production" && !sessionSecret) {
  throw new Error(
    "SESSION_SECRET is required in production. Render does not read your local .env file; add SESSION_SECRET in Render Dashboard > your service > Environment, then redeploy.",
  );
}

logger.token("id", (req) => req.id || "-");
app.use(requestIdMiddleware);
app.use(timeout("30s"));
app.use(function haltOnTimedout(req, res, next) {
  if (req.timedout) {
    return next(createError(504, "Gateway Timeout"));
  }
  next();
});
app.use(
  logger(":id :method :url :status :response-time ms - :res[content-length]"),
);
app.disable("x-powered-by");
app.use(function (req, res, next) {
  res.locals.cspNonce = crypto.randomBytes(16).toString("base64");
  next();
});
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'"],
        fontSrc: [
          "'self'",
          "https://fonts.gstatic.com",
          "https://cdnjs.cloudflare.com",
          "data:",
        ],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
        imgSrc: ["'self'", "data:", "blob:"],
        objectSrc: ["'none'"],
        scriptSrc: [
          "'self'",
          (req, res) => `'nonce-${res.locals.cspNonce}'`,
          "https://unpkg.com",
        ],
        scriptSrcAttr: ["'none'"],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com",
          "https://cdnjs.cloudflare.com",
        ],
      },
    },
    crossOriginEmbedderPolicy: false,
    frameguard: { action: "sameorigin" },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    noSniff: true,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  }),
);
app.use(function (req, res, next) {
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  next();
});
app.use(
  compression({
    threshold: 1024,
    brotli: {
      params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 },
    },
  }),
);
app.use(
  cors({
    origin(origin, callback) {
      callback(null, Boolean(origin && allowedCorsOrigins.has(origin)));
    },
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "X-CSRF-Token",
      "CSRF-Token",
      "X-Requested-With",
    ],
    maxAge: 600,
    optionsSuccessStatus: 204,
  }),
);
var requestBodyParsers = createBodyParsers(express, process.env);
app.locals.requestBodyLimits = requestBodyParsers.limits;
app.use(requestBodyParsers.json);
app.use(requestBodyParsers.urlencoded);
app.use(mongoSanitize());
app.use(cookieParser());
var vendorCacheAge = process.env.NODE_ENV === "production" ? "7d" : 0;
app.use(
  "/vendor/jquery",
  express.static(path.join(__dirname, "node_modules/jquery/dist"), {
    maxAge: vendorCacheAge,
    etag: true,
  }),
);
app.use(
  "/vendor/jquery-ui",
  express.static(path.join(__dirname, "node_modules/jquery-ui-dist"), {
    maxAge: vendorCacheAge,
    etag: true,
  }),
);
app.use(
  "/vendor/bootstrap",
  express.static(path.join(__dirname, "node_modules/bootstrap/dist"), {
    maxAge: vendorCacheAge,
    etag: true,
  }),
);
app.use(
  express.static(path.join(__dirname, "public"), {
    maxAge: process.env.NODE_ENV === "production" ? "7d" : 0,
    etag: true,
  }),
);
var serveComponentAssets = express.static(path.join(__dirname, "components"), {
  maxAge: process.env.NODE_ENV === "production" ? "7d" : 0,
  etag: true,
});
app.use("/components", function (req, res, next) {
  if (!/\.(css|js)$/.test(req.path)) return res.sendStatus(404);
  serveComponentAssets(req, res, next);
});

app.use(
  session({
    name: "session",
    secret: sessionSecret || "local-development-only-change-me",
    store: MongoStore.create({
      mongoUrl: mongoUri,
      ttl: SESSION_TTL_SECONDS,
      touchAfter: 24 * 60 * 60,
    }),
    cookie: {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: SESSION_TTL_SECONDS * 1000,
    },
    rolling: true,
    saveUninitialized: false,
    resave: false,
  }),
);
app.use(function attachFlash(req, res, next) {
  const session = req.session || {};
  res.locals.flashMessages = consumeFlash(session);
  req.flash = req.flash || function flash(type, message) {
    return setFlash(session, type, message);
  };
  next();
});
app.use(csrf());
function issueCsrfToken(req, res) {
  const csrfToken = req.csrfToken();
  res.locals.csrfToken = csrfToken;
  res.cookie("XSRF-TOKEN", csrfToken, {
    httpOnly: false,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_SECONDS * 1000,
  });
  return csrfToken;
}
app.locals.issueCsrfToken = issueCsrfToken;
app.use(function (req, res, next) {
  issueCsrfToken(req, res);
  next();
});
app.use("/", indexRouter);

// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "pug");

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

app.use(function timeoutErrorHandler(error, req, res, next) {
  if (req.timedout || (error && error.code === "ETIMEDOUT")) {
    return res.status(504).json({
      error: "Gateway Timeout",
      ...(req.id ? { requestId: req.id } : {}),
    });
  }
  return errorHandler(error, req, res, next);
});

module.exports = app;
