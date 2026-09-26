require("dotenv").config();
var createError = require("http-errors");
var express = require("express");
var path = require("path");
var cookieParser = require("cookie-parser");
var logger = require("morgan");
var session = require("express-session");
var MongoStore = require("connect-mongo").default;
var indexRouter = require("./routes/index");
var usersRouter = require("./routes/users");
var app = express();

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

const mongoUri = sanitizeMongoUri(normalizeEnvValue(process.env.MONGODB_URI, ""));
const sessionSecret = normalizeEnvValue(process.env.SESSION_SECRET, "");

app.set("trust proxy", 1);

if (process.env.NODE_ENV === "production" && !sessionSecret) {
  throw new Error("SESSION_SECRET must be configured in production");
}

app.use(logger("dev"));
app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false, limit: "100kb", parameterLimit: 100 }));
app.use(cookieParser());
app.use(
  express.static(path.join(__dirname, "public"), {
    maxAge: process.env.NODE_ENV === "production" ? "7d" : 0,
    etag: true,
  })
);

app.use(
  session({
    name: "session",
    secret: sessionSecret || "local-development-only-change-me",
    store: MongoStore.create({
      mongoUrl: mongoUri,
      ttl: 8 * 60 * 60,
      touchAfter: 24 * 60 * 60,
    }),
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 8 * 60 * 60 * 1000,
    },
    saveUninitialized: false,
    resave: false,
  })
);
app.use("/", indexRouter);
app.use("/users", usersRouter);

// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "pug");

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render("error");
});

module.exports = app;
