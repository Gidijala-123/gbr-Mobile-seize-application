const express = require("express");
const { wrapAsyncHandlers } = require("../middleware/asyncHandler");
const router = express.Router();
wrapAsyncHandlers(router);
const rateLimit = require("express-rate-limit");
const nodemailer = require("nodemailer");
const mongoose = require("mongoose");
const {
  createMongoConnectionService,
} = require("../services/MongoConnectionService");
const mongoConnectionService = createMongoConnectionService({
  connect: (uri, options) => mongoose.connect(uri, options),
  getConnection: () => mongoose.connection,
});
const {
  User,
  DeviceRecord,
  Visitor,
  ErrorReport,
  LoginAuditLog,
  RecordAuditLog,
} = require("../models");
const crypto = require("crypto");
const geoip = require("geoip-lite");
const sanitizeHtml = require("sanitize-html");
const validator = require("validator");
const QRCode = require("qrcode");
const { generateSecret, generateURI, verify: verifyTotp } = require("otplib");
const isCommonPassword = require("wildleek");
const { createAuthService } = require("../services/AuthService");
const { createEmailService } = require("../services/EmailService");
const { createErrorReporter } = require("../services/ErrorReporter");
const { createDeviceService } = require("../services/DeviceService");
const { createLoginAuditService } = require("../services/LoginAuditService");
const { createVisitorService } = require("../services/VisitorService");
const { createApiV1Router } = require("./apiV1");
const { validateRequest } = require("../middleware/validateRequest");
const { createDbReadiness, sanitizeMongoUri } = require("../utils/db");
const { applyMongoUpdate } = require("../utils/mongoUpdate");
const { getRequestId } = require("../middleware/requestContext");
const {
  VALID_DEVICE_STATUSES,
  changePasswordSchema,
  createDeviceSchema,
  deleteSchema,
  emailSchema,
  loginSchema,
  normalizeDeviceStatus,
  recordIdSchema,
  resetSchema,
  returnDeviceSchema,
  signupSchema,
  updateDeviceSchema,
} = require("../validation/schemas");
const PASSWORD_HASH_ITERATIONS = Number(
  process.env.PASSWORD_HASH_ITERATIONS ||
    (process.env.NODE_ENV === "test" ? 1000 : 60000),
);
const EMAIL_VERIFICATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PASSWORD_RESET_OTP_TTL_MS = 10 * 60 * 1000;
const PASSWORD_RESET_REQUEST_WINDOW_MS = 60 * 60 * 1000;
const PASSWORD_RESET_VERIFY_WINDOW_MS = 15 * 60 * 1000;
const PASSWORD_RESET_REQUEST_LIMIT = 3;
const PASSWORD_RESET_VERIFY_LIMIT = 5;
const RECYCLE_BIN_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const RECYCLE_BIN_PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const passwordResetRateLimits = new Map();
const LOGIN_RATE_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCKOUT_MS = 60 * 60 * 1000;
const USER_LOGIN_FAILURE_LIMIT = 5;
const USER_LOGIN_LOCKOUT_MS = 60 * 60 * 1000;
const SIGNUP_RATE_WINDOW_MS = 60 * 60 * 1000;
const FORGOT_RATE_WINDOW_MS = 60 * 60 * 1000;
const TOTP_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const loginLockouts = new Map();
const MONGO_QUERY_TIMEOUT_MS = Number(process.env.MONGO_MAX_TIME_MS || 10000);
const MONGO_WRITE_CONCERN_W = process.env.MONGO_WRITE_CONCERN_W || "majority";
const MONGO_READ_PREFERENCE = process.env.MONGO_READ_PREFERENCE || "primary";

function getMongoRuntimeOptions() {
  return {
    writeConcern: {
      w: Number.isInteger(Number(MONGO_WRITE_CONCERN_W))
        ? Number(MONGO_WRITE_CONCERN_W)
        : MONGO_WRITE_CONCERN_W,
    },
    readPreference: MONGO_READ_PREFERENCE,
  };
}

function applyMongoMaxTime(query) {
  if (!query || typeof query.maxTimeMS !== "function") return query;
  return query.maxTimeMS(MONGO_QUERY_TIMEOUT_MS);
}

const editRecordFields = [
  "Date",
  "Time",
  "sname",
  "spno",
  "rno",
  "clg",
  "brch",
  "year",
  "sec",
  "pname",
  "ppno",
  "ename",
  "epno",
  "eid",
  "rsn",
  "devicePhotos",
  "returnNotes",
  "onHoldNotes",
  "mmodel",
  "imei",
  "mclr",
  "status",
  "receiptNo",
  "statusChangedBy",
  "statusChangedAt",
  "__v",
];

function publicEditRecord(record) {
  const dto = { _id: String(record._id) };
  for (const field of editRecordFields) {
    if (record[field] !== undefined) dto[field] = record[field];
  }
  if (dto.__v === undefined) dto.__v = 0;
  return dto;
}

function sendRateLimitResponse(
  req,
  res,
  message,
  fallbackWindowMs,
  retryAfterOverride,
) {
  const resetTime = req.rateLimit && req.rateLimit.resetTime;
  const retryAfter = Math.max(
    0,
    Number.isFinite(retryAfterOverride)
      ? retryAfterOverride
      : resetTime instanceof Date
        ? resetTime.getTime() - Date.now()
        : fallbackWindowMs,
  );
  res.set("Retry-After", String(Math.max(1, Math.ceil(retryAfter / 1000))));
  return res.status(429).json({ error: message, retryAfter });
}

const signupRateLimit = rateLimit({
  windowMs: SIGNUP_RATE_WINDOW_MS,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler(req, res) {
    return sendRateLimitResponse(
      req,
      res,
      "Too many signup attempts. Please try again later.",
      SIGNUP_RATE_WINDOW_MS,
    );
  },
});

const forgotRateLimit = rateLimit({
  windowMs: FORGOT_RATE_WINDOW_MS,
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
  handler(req, res) {
    return sendRateLimitResponse(
      req,
      res,
      "Too many password reset requests. Please try again later.",
      FORGOT_RATE_WINDOW_MS,
    );
  },
});

const totpChallengeRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler(req, res) {
    return sendRateLimitResponse(
      req,
      res,
      "Too many verification attempts. Please sign in again later.",
      15 * 60 * 1000,
    );
  },
});

function loginLockoutGuard(req, res, next) {
  const clientIp = req.ip || "unknown";
  const lockedUntil = loginLockouts.get(clientIp);
  if (!lockedUntil) return next();
  if (lockedUntil <= Date.now()) {
    loginLockouts.delete(clientIp);
    return next();
  }

  return sendRateLimitResponse(
    req,
    res,
    "Too many login attempts. This IP is locked out for one hour.",
    lockedUntil - Date.now(),
  );
}

const loginRateLimit = rateLimit({
  windowMs: LOGIN_RATE_WINDOW_MS,
  limit: 5,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  handler(req, res) {
    const clientIp = req.ip || "unknown";
    loginLockouts.set(clientIp, Date.now() + LOGIN_LOCKOUT_MS);
    return sendRateLimitResponse(
      req,
      res,
      "Too many login attempts. This IP is locked out for one hour.",
      LOGIN_LOCKOUT_MS,
      LOGIN_LOCKOUT_MS,
    );
  },
});

function consumePasswordResetRateLimit(email, action, limit, now = Date.now()) {
  const windowMs =
    action === "request"
      ? PASSWORD_RESET_REQUEST_WINDOW_MS
      : PASSWORD_RESET_VERIFY_WINDOW_MS;
  const key = `${action}:${email}`;
  const attempts = (passwordResetRateLimits.get(key) || []).filter(
    (timestamp) => now - timestamp < windowMs,
  );
  if (attempts.length >= limit) {
    passwordResetRateLimits.set(key, attempts);
    return windowMs - (now - attempts[0]);
  }

  attempts.push(now);
  passwordResetRateLimits.set(key, attempts);
  if (passwordResetRateLimits.size > 5000) {
    for (const [trackedKey, timestamps] of passwordResetRateLimits) {
      const trackedWindowMs = trackedKey.startsWith("request:")
        ? PASSWORD_RESET_REQUEST_WINDOW_MS
        : PASSWORD_RESET_VERIFY_WINDOW_MS;
      const recent = timestamps.filter(
        (timestamp) => now - timestamp < trackedWindowMs,
      );
      if (recent.length) passwordResetRateLimits.set(trackedKey, recent);
      else passwordResetRateLimits.delete(trackedKey);
    }
  }
  return 0;
}

function clearPasswordResetRateLimit(email, action) {
  passwordResetRateLimits.delete(`${action}:${email}`);
}

function resetRuntimeState() {
  loginLockouts.clear();
  passwordResetRateLimits.clear();

  const limiters = [
    signupRateLimit,
    forgotRateLimit,
    totpChallengeRateLimit,
    loginRateLimit,
  ];

  for (const limiter of limiters) {
    if (limiter && typeof limiter.resetAll === "function") {
      limiter.resetAll();
    }
  }

  signlogColl = createInMemoryCollection("registration_coll");
  visitorsOfPage = createInMemoryCollection("visitors_of_page");
  loginAuditLogs = createInMemoryCollection("login_audit_logs");
  recordAuditLogs = createInMemoryCollection("record_audit_logs");
  errorReports = createInMemoryCollection("error_reports");
  studentData = createInMemoryCollection("student_data");
  receiptCounter = createInMemoryCollection("receipt_counter");
  inMemoryObjectIdCounter = 1;
}

function getRuntimeState() {
  return {
    signlogColl,
    visitorsOfPage,
    loginAuditLogs,
    recordAuditLogs,
    errorReports,
    studentData,
    receiptCounter,
    mongoReady,
    mongoInitError,
  };
}

function createModelRepository(model) {
  return {
    async insert(doc) {
      return model.create(doc);
    },
    async findOne(filter) {
      return applyMongoMaxTime(model.findOne(filter)).exec();
    },
    async find(filter = {}) {
      return applyMongoMaxTime(model.find(filter)).exec();
    },
    async countDocuments(filter = {}, hint) {
      const query = model.countDocuments(filter);
      if (hint) query.hint(hint);
      return applyMongoMaxTime(query).exec();
    },
    async findPage(filter, sort, skip, limit) {
      return applyMongoMaxTime(
        model.find(filter).sort(sort).skip(skip).limit(limit),
      ).exec();
    },
    async update(filter, updateDoc) {
      return applyMongoMaxTime(model.updateOne(filter, updateDoc)).exec();
    },
    async findOneAndUpdate(filter, updateDoc, options = {}) {
      return applyMongoMaxTime(
        model.findOneAndUpdate(filter, updateDoc, {
          new: true,
          upsert: true,
          ...options,
        }),
      ).exec();
    },
    async createIndex(spec, options = {}) {
      return model.collection.createIndex(spec, options);
    },
    async remove(filter) {
      return model.deleteMany(filter).exec();
    },
  };
}

let inMemoryObjectIdCounter = 1;

function createInMemoryCollection(name) {
  const items = [];
  const indexMap = new Map();

  const matchesFilter = (item, filter = {}) =>
    Object.entries(filter).every(([key, expected]) => {
      if (key === "$or")
        return expected.some((condition) => matchesFilter(item, condition));
      if (expected && typeof expected === "object" && "$regex" in expected) {
        const regex = new RegExp(expected.$regex, expected.$options || "");
        return regex.test(String(item[key] == null ? "" : item[key]));
      }
      if (expected && typeof expected === "object" && "$gte" in expected)
        return (
          item[key] != null && new Date(item[key]) >= new Date(expected.$gte)
        );
      if (expected && typeof expected === "object" && "$lt" in expected)
        return (
          item[key] != null && new Date(item[key]) < new Date(expected.$lt)
        );
      return item[key] === expected;
    });

  const findIndex = (filter) => {
    if (!filter || Object.keys(filter).length === 0) return 0;
    return items.findIndex((item) =>
      Object.keys(filter).every((key) => item[key] === filter[key]),
    );
  };

  return {
    items,
    async findOneAndUpdate(filter = {}, updateDoc = {}, options = {}) {
      const shouldUpsert = Boolean(options.upsert);
      const matching = items.find((item) => matchesFilter(item, filter));
      let next;
      if (!matching) {
        if (!shouldUpsert) return null;
        const base = Object.fromEntries(
          Object.entries(filter).filter(([key]) => !key.startsWith("$")),
        );
        next = { ...base, ...updateDoc.$set };
        if (updateDoc.$inc) {
          for (const [key, value] of Object.entries(updateDoc.$inc)) {
            const current = Number(next[key] || 0);
            next[key] = current + Number(value);
          }
        }
        items.push(next);
        return next;
      }
      next = applyMongoUpdate(matching, updateDoc);
      const idx = items.indexOf(matching);
      items[idx] = next;
      return next;
    },
    async insert(doc) {
      if (
        name === "registration_coll" &&
        typeof doc.email === "string" &&
        indexMap.has(doc.email)
      ) {
        const error = new Error(
          "E11000 duplicate key error: email already exists",
        );
        error.code = 11000;
        throw error;
      }
      const record = {
        ...(name === "student_data"
          ? { deletedAt: null, deletedBy: null, __v: 0 }
          : {}),
        ...doc,
        __v: name === "student_data" ? Number(doc.__v ?? 0) : undefined,
        _id: doc._id || inMemoryObjectIdCounter.toString(16).padStart(24, "0"),
      };
      if (name === "student_data") {
        delete record.__v;
        record.__v = 0;
      }
      inMemoryObjectIdCounter += 1;
      items.push(record);
      if (typeof doc.email === "string") {
        indexMap.set(doc.email, record);
      }
      return record;
    },
    async findOne(filter) {
      if (filter && filter.email) return indexMap.get(filter.email) || null;
      if (filter && Object.keys(filter).length > 0) {
        return (
          items.find((item) =>
            Object.keys(filter).every((key) => item[key] === filter[key]),
          ) || null
        );
      }
      return items[0] || null;
    },
    async find(filter = {}) {
      if (!filter || Object.keys(filter).length === 0) return [...items];
      return items.filter((item) => matchesFilter(item, filter));
    },
    async countDocuments(filter = {}) {
      return items.filter((item) => matchesFilter(item, filter)).length;
    },
    async findPage(filter = {}, sort = {}, skip = 0, limit = 10) {
      const [sortField, direction] = Object.entries(sort)[0] || ["_id", 1];
      const matches = items.filter((item) => matchesFilter(item, filter));
      matches.sort((left, right) => {
        const leftValue = left[sortField] == null ? "" : left[sortField];
        const rightValue = right[sortField] == null ? "" : right[sortField];
        const comparison = String(leftValue).localeCompare(
          String(rightValue),
          undefined,
          {
            numeric: true,
            sensitivity: "base",
          },
        );
        return comparison * direction;
      });
      return matches.slice(skip, skip + limit);
    },
    async update(filter, updateDoc) {
      const match = items.find((item) => matchesFilter(item, filter));
      if (!match) return { ok: 0, matchedCount: 0, modifiedCount: 0 };
      const next = applyMongoUpdate(match, updateDoc);
      const idx = items.indexOf(match);
      items[idx] = next;
      if (typeof next.email === "string") indexMap.set(next.email, next);
      return { ok: 1, matchedCount: 1, modifiedCount: 1 };
    },
    async createIndex() {
      return null;
    },
    async remove(filter = {}) {
      if (!filter || Object.keys(filter).length === 0) {
        const count = items.length;
        items.length = 0;
        indexMap.clear();
        return { deletedCount: count };
      }
      const before = items.length;
      const filtered = items.filter((item) => !matchesFilter(item, filter));
      const removed = before - filtered.length;
      items.length = 0;
      filtered.forEach((item) => items.push(item));
      indexMap.clear();
      items.forEach((item) => {
        if (typeof item.email === "string") indexMap.set(item.email, item);
      });
      return { deletedCount: removed };
    },
  };
}

let signlogColl;
let visitorsOfPage;
let loginAuditLogs;
let recordAuditLogs;
let errorReports;
let studentData;
let receiptCounter;
let mongoReady = null;
let mongoInitError = null;
const ensureDbReady = createDbReadiness({
  getReady: () => mongoReady,
  getError: () => mongoInitError,
  areCollectionsReady: () =>
    Boolean(
      signlogColl &&
      studentData &&
      receiptCounter &&
      errorReports &&
      visitorsOfPage &&
      loginAuditLogs &&
      recordAuditLogs,
    ),
});
const authService = createAuthService({
  getUserRepository: () => signlogColl,
  validator,
  isCommonPassword,
  passwordHashIterations: PASSWORD_HASH_ITERATIONS,
});
const emailService = createEmailService({ nodemailer });
const errorReporter = createErrorReporter({
  getErrorRepository: () => errorReports,
});
const recordError = (type, email, error) =>
  errorReporter.record(type, email, error, getRequestId());
const deviceService = createDeviceService({
  getRecordRepository: () => studentData,
  getAuditRepository: () => recordAuditLogs,
  getCounterRepository: () => receiptCounter,
});
const loginAuditService = createLoginAuditService({
  getUserRepository: () => signlogColl,
  getAuditRepository: () => loginAuditLogs,
  getAuditContext: getLoginAuditContext,
  emailService,
  recordError,
});
const visitorService = createVisitorService({
  getVisitorRepository: () => visitorsOfPage,
});

async function initializeMongo() {
  const mongoUri = sanitizeMongoUri(process.env.MONGODB_URI);
  if (!mongoUri) {
    throw new Error(
      "MONGODB_URI must be configured before starting the application",
    );
  }

  const isTestDatabase =
    process.env.NODE_ENV === "test" ||
    /localhost:27017\/testdb/i.test(mongoUri);
  if (isTestDatabase) {
    signlogColl = createInMemoryCollection("registration_coll");
    visitorsOfPage = createInMemoryCollection("visitors_of_page");
    loginAuditLogs = createInMemoryCollection("login_audit_logs");
    recordAuditLogs = createInMemoryCollection("record_audit_logs");
    errorReports = createInMemoryCollection("error_reports");
    studentData = createInMemoryCollection("student_data");
    receiptCounter = createInMemoryCollection("receipt_counter");
    console.log("MongoDB Atlas is connected..!");
    return;
  }

  const mongoRuntimeOptions = getMongoRuntimeOptions();
  await mongoConnectionService.connectWithRetry(mongoUri, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
    readPreference: mongoRuntimeOptions.readPreference,
    writeConcern: mongoRuntimeOptions.writeConcern,
  });
  console.log("MongoDB Atlas is connected..!");

  signlogColl = createModelRepository(User);
  visitorsOfPage = createModelRepository(Visitor);
  loginAuditLogs = createModelRepository(LoginAuditLog);
  recordAuditLogs = createModelRepository(RecordAuditLog);
  errorReports = createModelRepository(ErrorReport);
  studentData = createModelRepository(DeviceRecord);
  const ReceiptCounter =
    mongoose.models.ReceiptCounter ||
    mongoose.model(
      "ReceiptCounter",
      new mongoose.Schema(
        { _id: String, seq: { type: Number, default: 0 } },
        { collection: "receipt_counter", strict: true, versionKey: false },
      ),
    );
  receiptCounter = createModelRepository(ReceiptCounter);

  await Promise.all([
    signlogColl.createIndex({ email: 1 }, { unique: true }),
    signlogColl.createIndex(
      { emailCanonical: 1 },
      { unique: true, sparse: true },
    ),
    signlogColl.createIndex(
      { emailVerificationTokenHash: 1 },
      { unique: true, sparse: true },
    ),
    signlogColl.createIndex({ emailVerified: 1, createdAt: -1 }),
    studentData.createIndex({ rno: 1 }),
    studentData.createIndex(
      { rno: 1, clg: 1, brch: 1, year: 1, sec: 1 },
      { unique: true, name: "student_class_roll_unique" },
    ),
    studentData.createIndex({ status: 1 }),
    studentData.createIndex({ status: 1, clg: 1 }),
    studentData.createIndex({ brch: 1, year: 1 }),
    studentData.createIndex({ createdAt: -1 }),
    studentData.createIndex({ deletedAt: 1, status: 1 }),
    visitorsOfPage.createIndex({ email: 1, time: -1 }),
    visitorsOfPage.createIndex({ time: -1 }),
    visitorsOfPage.createIndex({ name: 1 }),
    errorReports.createIndex({ time: 1 }),
    errorReports.createIndex({ type: 1 }),
    errorReports.createIndex({ email: 1, time: -1 }),
    errorReports.createIndex({ requestId: 1 }),
    loginAuditLogs.createIndex({ email: 1, timestamp: -1 }),
    loginAuditLogs.createIndex({ timestamp: -1 }),
    loginAuditLogs.createIndex({ ip: 1, timestamp: -1 }),
    recordAuditLogs.createIndex({ recordId: 1, changedAt: -1 }),
    recordAuditLogs.createIndex({ changedAt: -1 }),
    recordAuditLogs.createIndex({ actionType: 1, changedAt: -1 }),
  ]);
}

mongoReady = initializeMongo().catch((err) => {
  mongoInitError = err;
  console.error(
    "MongoDB Atlas connection failed! Please check your internet connection.",
    err,
  );
  console.error("MongoDB index setup failed:", err.message);
  return false;
});

async function purgeExpiredRecycleBinRecords() {
  try {
    await ensureDbReady();
    const result = await deviceService.purgeDeletedBefore(
      new Date(Date.now() - RECYCLE_BIN_RETENTION_MS),
    );
    if (result.deletedCount > 0)
      console.log(
        `Purged ${result.deletedCount} expired recycle-bin record(s).`,
      );
  } catch (err) {
    await recordError("recycle-bin-purge", null, err);
  }
}

const recycleBinPurgeTimer = setInterval(
  purgeExpiredRecycleBinRecords,
  RECYCLE_BIN_PURGE_INTERVAL_MS,
);
recycleBinPurgeTimer.unref();
void purgeExpiredRecycleBinRecords();

const normalizeEnvValue = (value, fallback = "") => {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed.replace(/\s+/g, "") : fallback;
};

const { normalizeEmail, isEmail, findUserByEmail } = authService;
function getPublicAppUrl() {
  const configuredUrl = process.env.PUBLIC_APP_URL;
  if (typeof configuredUrl !== "string" || !configuredUrl.trim())
    throw new Error("PUBLIC_APP_URL must be configured to send signup email");
  const url = new URL(configuredUrl.trim());
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (process.env.NODE_ENV === "production" && url.protocol !== "https:")
  ) {
    throw new Error("PUBLIC_APP_URL must be a valid public HTTP(S) URL");
  }
  return url.toString().replace(/\/+$/, "");
}
const getPasswordValidationError = authService.getPasswordValidationError;
const hasSessionUser = (req) => Boolean(req && req.session && req.session.user);
const studentFieldLimits = {
  Date: 32,
  Time: 16,
  sname: 120,
  spno: 16,
  rno: 32,
  clg: 120,
  brch: 80,
  year: 12,
  sec: 16,
  pname: 120,
  ppno: 16,
  ename: 120,
  epno: 16,
  eid: 64,
  rsn: 1000,
  devicePhotos: 4096,
  returnedBy: 120,
  returnRelation: 60,
  returnNotes: 1000,
  onHoldNotes: 1000,
  returnSignature: 1048576,
  mmodel: 120,
  imei: 15,
  mclr: 60,
};
const reasonPresetLabels = [
  "Used during class",
  "Ringing in exam",
  "Playing games",
  "Social media",
  "Other (specify)",
];
const nameFields = new Set(["sname", "pname", "ename"]);
const phoneFields = new Set(["spno", "ppno", "epno"]);
const plainTextOptions = { allowedTags: [], allowedAttributes: {} };

class InputValidationError extends Error {
  constructor(field, message) {
    super(message);
    this.field = field;
  }
}
class InvalidCredentialsError extends Error {}

function stripInjectedTextFragments(value) {
  if (typeof value !== "string") return value;
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/(?:javascript:|vbscript:|data:)[^\s]*/gi, " ")
    .replace(/\b(?:alert|confirm|prompt)\s*\([^)]*\)/gi, " ")
    .replace(/\bon\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizePlainText(value) {
  if (typeof value !== "string") return "";
  return stripInjectedTextFragments(
    sanitizeHtml(value, plainTextOptions),
  ).replace(/\s+/g, " ").trim();
}

function normalizeTextCase(value) {
  if (typeof value !== "string") return value;
  return value
    .replace(/\s+/g, " ")
    .trim()
    .replace(
      /(^|[\s'-])([a-z])/g,
      (match, prefix, letter) => prefix + letter.toUpperCase(),
    );
}

function normalizeIndianPhoneNumber(value) {
  if (typeof value !== "string") return value;
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";

  const normalized = digits.startsWith("0") ? digits.slice(1) : digits;
  if (normalized.length === 10) return `+91${normalized}`;
  if (normalized.length === 12 && normalized.startsWith("91")) {
    return `+${normalized}`;
  }
  if (normalized.length === 11 && normalized.startsWith("1")) {
    return `+${normalized}`;
  }
  return `+${normalized}`;
}

function isValidRollNumber(value) {
  return typeof value === "string" && validator.isAlphanumeric(value);
}

function resolveReasonText(body) {
  const presetValue =
    typeof body.reasonPreset === "string" ? body.reasonPreset.trim() : "";
  const customValue =
    typeof body.reasonCustom === "string"
      ? body.reasonCustom.trim()
      : typeof body.rsn === "string"
        ? body.rsn.trim()
        : "";

  if (!presetValue && !customValue) return "";
  if (!presetValue || presetValue === "custom") return customValue;
  if (presetValue === "Other (specify)") {
    return customValue;
  }
  return customValue ? `${presetValue} — ${customValue}` : presetValue;
}

function sanitizeStudentField(field, value) {
  if (value === undefined || value === null) return value;

  if (field === "devicePhotos") {
    const rawValues = Array.isArray(value)
      ? value
      : typeof value === "string"
        ? (() => {
            try {
              const parsed = JSON.parse(value);
              return Array.isArray(parsed) ? parsed : [value];
            } catch (error) {
              return [value];
            }
          })()
        : [];

    const cleanedValues = rawValues
      .slice(0, 3)
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .map((item) => sanitizePlainText(item))
      .filter(Boolean)
      .filter((item) =>
        /^(data:image\/[a-zA-Z0-9.+-]+;base64,|https?:\/\/|\/uploads\/|\/images\/|\/components\/)/i.test(item),
      );

    if (cleanedValues.length > 3)
      throw new InputValidationError(field, `${field} can contain up to 3 images.`);
    return cleanedValues;
  }

  if (typeof value !== "string")
    throw new InputValidationError(field, `${field} must be text.`);

  let cleanValue = sanitizePlainText(value);

  if (field === "rno" || field === "sec") {
    cleanValue = cleanValue.toUpperCase();
  } else if (
    [
      "sname",
      "pname",
      "ename",
      "clg",
      "brch",
      "mmodel",
      "mclr",
    ].includes(field)
  ) {
    cleanValue = normalizeTextCase(cleanValue);
  } else if (field === "rsn" && cleanValue) {
    const matchingPreset = reasonPresetLabels.find(
      (label) => label.toLowerCase() === cleanValue.toLowerCase(),
    );
    cleanValue = matchingPreset || normalizeTextCase(cleanValue);
  }

  if (
    nameFields.has(field) &&
    cleanValue &&
    !/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(cleanValue)
  ) {
    throw new InputValidationError(
      field,
      `${field} contains invalid characters.`,
    );
  }
  if (field === "rno" && !isValidRollNumber(cleanValue))
    throw new InputValidationError(field, "Roll number must be alphanumeric.");
  if (phoneFields.has(field)) {
    cleanValue = normalizeIndianPhoneNumber(cleanValue);
    if (cleanValue && !/^\+91[6-9]\d{9}$/.test(cleanValue)) {
      throw new InputValidationError(
        field,
        `${field} must be a valid Indian mobile number.`,
      );
    }
  }
  if (field === "imei" && !/^\d{15}$/.test(cleanValue))
    throw new InputValidationError(
      field,
      "IMEI must contain exactly 15 digits.",
    );

  return cleanValue;
}

function normalizeStudentRecord(body, status = null) {
  const resolvedReason = resolveReasonText(body);
  const record = {
    Date: body.Date,
    Time: body.Time,
    sname: body.sname,
    spno: body.spno,
    rno: body.rno,
    clg: body.clg,
    brch: body.brch,
    year: body.year,
    sec: body.sec,
    pname: body.pname,
    ppno: body.ppno,
    ename: body.ename,
    epno: body.epno,
    eid: body.eid,
    rsn: resolvedReason || body.rsn,
    devicePhotos: body.devicePhotos,
    returnedBy: body.returnedBy,
    returnRelation: body.returnRelation,
    returnedAt: body.returnedAt,
    returnSignature: body.returnSignature || body.returnSignatureText,
    returnNotes: body.returnNotes,
    onHoldNotes: body.onHoldNotes || body.holdNotes || body.onholdNotes,
    mmodel: body.mmodel,
    imei: body.imei,
    mclr: body.mclr,
    ...(status ? { status: normalizeDeviceStatus(status) } : {}),
  };
  for (const field of Object.keys(studentFieldLimits)) {
    record[field] = sanitizeStudentField(field, record[field]);
  }
  if (record.status && !VALID_DEVICE_STATUSES.includes(record.status)) {
    throw new InputValidationError("status", "status is not supported.");
  }
  return record;
}

const { hashPassword, verifyPassword } = authService;

function getTotpEncryptionKey() {
  const configuredKey = normalizeEnvValue(process.env.TOTP_ENCRYPTION_KEY);
  if (configuredKey.length < 32)
    throw new Error("TOTP_ENCRYPTION_KEY must contain at least 32 characters");
  return crypto.createHash("sha256").update(configuredKey).digest();
}

function encryptTotpSecret(secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    getTotpEncryptionKey(),
    iv,
  );
  const ciphertext = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), ciphertext]
    .map((part) => part.toString("base64url"))
    .join(".");
}

function decryptTotpSecret(encryptedSecret) {
  const [ivEncoded, tagEncoded, ciphertextEncoded] =
    String(encryptedSecret).split(".");
  if (!ivEncoded || !tagEncoded || !ciphertextEncoded)
    throw new Error("Stored TOTP secret is invalid");

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getTotpEncryptionKey(),
    Buffer.from(ivEncoded, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextEncoded, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

async function verifyTotpToken(secret, token) {
  if (typeof token !== "string" || !/^\d{6}$/.test(token)) return false;
  try {
    return (await verifyTotp({ secret, token })).valid;
  } catch (err) {
    return false;
  }
}

const consumeTotpRecoveryCode = authService.consumeTotpRecoveryCode;

function requireLogin(req, res, next) {
  if (!hasSessionUser(req)) {
    if (req.method === "GET" && req.path === "/home") return res.redirect("/");
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
}

function regenerateSession(req) {
  return new Promise((resolve, reject) =>
    req.session.regenerate((err) => (err ? reject(err) : resolve())),
  );
}

function buildSessionUser(user, visitorName) {
  const email = user.emailDisplay || user.email;
  const fullName =
    sanitizePlainText(user.fullName || visitorName)
      .trim()
      .slice(0, 120) || email.split("@")[0];
  const designation = sanitizePlainText(user.designation || "")
    .trim()
    .slice(0, 80);
  const phoneNumber =
    typeof user.phoneNumber === "string"
      ? normalizeIndianPhoneNumber(sanitizePlainText(user.phoneNumber)).slice(
          0,
          20,
        )
      : "";
  const avatarUrl =
    typeof user.avatarUrl === "string"
      ? sanitizePlainText(user.avatarUrl).trim().slice(0, 512)
      : "";
  const role =
    typeof user.role === "string"
      ? sanitizePlainText(user.role).trim().slice(0, 32) || "staff"
      : "staff";
  const storedPreferences =
    user.preferences &&
    typeof user.preferences === "object" &&
    !Array.isArray(user.preferences)
      ? user.preferences
      : {};
  const language =
    typeof storedPreferences.lang === "string"
      ? sanitizePlainText(storedPreferences.lang).trim().slice(0, 16) || "en"
      : "en";

  return {
    id: user._id,
    email,
    role,
    fullName,
    designation,
    phoneNumber,
    avatarUrl,
    preferences: {
      darkMode: storedPreferences.darkMode === true,
      lang: language,
    },
    previousLogin: user.lastLoginAt
      ? {
          at: user.lastLoginAt,
          ip: user.lastLoginIp,
          userAgent: user.lastLoginUserAgent,
        }
      : null,
  };
}

function createClientFingerprint(req) {
  const userAgent =
    (req && typeof req.get === "function" && req.get("user-agent")) ||
    (req && req.headers && req.headers["user-agent"]) ||
    "unknown";
  const key = normalizeEnvValue(
    process.env.SESSION_SECRET,
    "local-session-key",
  );
  return crypto
    .createHmac("sha256", key)
    .update(String(userAgent).slice(0, 512))
    .digest("hex");
}

function createClientIpFingerprint(req) {
  const rawIp =
    (req && req.headers && req.headers["x-forwarded-for"]) ||
    (req && req.ip) ||
    (req && req.socket && req.socket.remoteAddress) ||
    "unknown";
  const firstIp = String(rawIp)
    .split(",")[0]
    .trim()
    .replace(/^::ffff:/i, "");
  if (
    !firstIp ||
    firstIp === "unknown" ||
    firstIp === "127.0.0.1" ||
    firstIp === "::1" ||
    firstIp === "localhost"
  ) {
    return null;
  }
  const key = normalizeEnvValue(
    process.env.SESSION_SECRET,
    "local-session-key",
  );
  return crypto
    .createHmac("sha256", key)
    .update(firstIp.slice(0, 64))
    .digest("hex");
}

function fingerprintsMatch(expected, actual) {
  if (typeof expected !== "string" || typeof actual !== "string") return false;
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(actual, "hex");
  return (
    expectedBuffer.length === actualBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

function refreshCsrfToken(req, res) {
  const issueToken = req.app && req.app.locals.issueCsrfToken;
  return issueToken ? issueToken(req, res) : undefined;
}

async function establishUserSession(req, user, visitorName) {
  await regenerateSession(req);
  req.session.clientFingerprint = createClientFingerprint(req);
  req.session.clientIpFingerprint = createClientIpFingerprint(req);
  const sessionUser = buildSessionUser(user, visitorName);
  req.session.user = sessionUser;
  await visitorService.recordVisit(sessionUser.fullName, sessionUser.email);
}

function getLoginAuditContext(req) {
  const rawIp =
    (req && req.ip) ||
    (req && req.headers && req.headers["x-forwarded-for"]?.split(",")[0]) ||
    "unknown";
  const ip = String(rawIp)
    .trim()
    .replace(/^::ffff:/i, "")
    .slice(0, 64);
  const rawUserAgent =
    req && typeof req.get === "function"
      ? req.get("user-agent")
      : req && req.headers && req.headers["user-agent"];
  const userAgent = String(rawUserAgent || "unknown")
    .replace(/[\r\n]/g, " ")
    .slice(0, 512);
  const geoRecord = geoip.lookup(ip);
  const geo = geoRecord
    ? {
        city: geoRecord.city || null,
        region: geoRecord.region || null,
        country: geoRecord.country || null,
        timezone: geoRecord.timezone || null,
      }
    : null;

  return { ip, userAgent, geo };
}

function recordLoginAudit(user, req, success, reason, emailOverride) {
  return loginAuditService.recordLoginAudit(
    user,
    req,
    success,
    reason,
    emailOverride,
  );
}

function renderDatabaseErrorHome(req, res, message) {
  const emptyData = [];
  return res.status(500).render("home", {
    data: emptyData,
    data1: emptyData,
    data2: emptyData,
    data3: emptyData,
    deletedData: emptyData,
    count: 0,
    count1: 0,
    count2: 0,
    deletedCount: 0,
    visitorSummary: { today: 0, thisMonth: 0, allTime: 0 },
    darkMode: Boolean(
      req.session.user.preferences && req.session.user.preferences.darkMode,
    ),
    previousLogin: req.session.user.previousLogin || null,
    databaseError: message,
  });
}

router.use((req, res, next) => {
  if (!hasSessionUser(req)) return next();
  const currentFingerprint = createClientFingerprint(req);
  const currentIpFingerprint = createClientIpFingerprint(req);
  const storedFingerprint = req.session.clientFingerprint;
  const storedIpFingerprint = req.session.clientIpFingerprint;
  const userAgentMatches = fingerprintsMatch(
    storedFingerprint,
    currentFingerprint,
  );
  const ipMatches =
    !storedIpFingerprint ||
    !currentIpFingerprint ||
    fingerprintsMatch(storedIpFingerprint, currentIpFingerprint);

  if (userAgentMatches && ipMatches) return next();

  req.session.destroy(() => {
    res.clearCookie("session", {
      path: "/",
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
    });
    if (req.method === "GET" && req.path === "/home") return res.redirect("/");
    res
      .status(401)
      .json({ error: "Session expired because the client changed." });
  });
});

const legacyApiSuccessors = new Map([
  ["POST /postsignup", "/api/v1/auth/signup"],
  ["POST /postlogin", "/api/v1/auth/login"],
  ["POST /postlogin/totp", "/api/v1/auth/login/totp"],
  ["GET /verify-email", "/api/v1/auth/verify-email"],
  ["POST /postforgot", "/api/v1/auth/password-reset/requests"],
  ["POST /postreset", "/api/v1/auth/password-reset/confirm"],
  ["POST /postchangepassword", "/api/v1/auth/password"],
  ["GET /totp/status", "/api/v1/auth/totp"],
  ["POST /totp/setup", "/api/v1/auth/totp/setup"],
  ["POST /totp/confirm", "/api/v1/auth/totp/confirm"],
  ["POST /totp/disable", "/api/v1/auth/totp/disable"],
  ["GET /api/records", "/api/v1/records"],
  ["GET /api/recyclebin", "/api/v1/records/deleted"],
  ["POST /hh", "/api/v1/records"],
  ["POST /change", "/api/v1/records/{_id}/return"],
  ["POST /edit", "/api/v1/records/{_id}"],
  ["POST /update", "/api/v1/records/{_id}"],
  ["POST /delete", "/api/v1/records/{_id}"],
  ["GET /logout", "/api/v1/auth/logout"],
]);

router.use((req, res, next) => {
  const successor = legacyApiSuccessors.get(`${req.method} ${req.path}`);
  if (successor) {
    res.set("Deprecation", "@1790812800");
    res.set("Link", `<${successor}>; rel="successor-version"`);
  }
  const recordRoute = req.path.match(/^\/api\/records\/([^/]+)\/audit$/);
  if (req.method === "GET" && recordRoute) {
    res.set("Deprecation", "@1790812800");
    res.set(
      "Link",
      `</api/v1/records/${recordRoute[1]}/audit>; rel="successor-version"`,
    );
  }
  const restoreRoute = req.path.match(/^\/restore\/([^/]+)$/);
  if (req.method === "POST" && restoreRoute) {
    res.set("Deprecation", "@1790812800");
    res.set(
      "Link",
      `</api/v1/records/${restoreRoute[1]}/restore>; rel="successor-version"`,
    );
  }
  next();
});

// Routes
router.get("/health", async (req, res) => {
  let databaseReady = false;
  try {
    await ensureDbReady();
    databaseReady = true;
  } catch (error) {
    databaseReady = false;
  }

  const health = await mongoConnectionService.getHealth();
  const healthy = databaseReady && !mongoInitError && health.healthy;
  return res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    mongo: health.mongo,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    env: process.env.NODE_ENV || "development",
  });
});

router.get("/", (req, res) => {
  if (hasSessionUser(req)) return res.redirect("/home");
  res.render("signLog_net");
});

router.get("/forgot", (req, res) => {
  if (hasSessionUser(req)) return res.redirect("/home");
  res.render("forgot");
});

router.get("/profile", requireLogin, async (req, res) => {
  try {
    await ensureDbReady();
    const user = await findUserByEmail(req.session.user.email);
    if (!user) return res.redirect("/");
    const sessionTtlMs =
      Number(req.session.cookie && req.session.cookie.maxAge) ||
      8 * 60 * 60 * 1000;
    const csrfToken = refreshCsrfToken(req, res);
    res.render("profile", {
      sessionUser: req.session.user,
      user: {
        email: user.emailDisplay || user.email || req.session.user.email,
        fullName: user.fullName || req.session.user.fullName,
        designation: user.designation || req.session.user.designation || "",
        phoneNumber: user.phoneNumber || req.session.user.phoneNumber || "",
        avatarUrl: user.avatarUrl || req.session.user.avatarUrl || "",
        createdAt: user.createdAt || null,
      },
      csrfToken,
      sessionExpiresAt: Date.now() + sessionTtlMs,
      sessionTtlMs,
      darkMode: Boolean(
        req.session.user.preferences && req.session.user.preferences.darkMode,
      ),
      previousLogin: req.session.user.previousLogin || null,
    });
  } catch (err) {
    await recordError("profile-page", req.session.user.email, err);
    res.status(500).render("error", {
      message: "Unable to load your profile right now.",
      error: { status: 500 },
    });
  }
});

router.post(
  "/postsignup",
  signupRateLimit,
  validateRequest(signupSchema),
  async (req, res) => {
    const emailDisplay =
      typeof req.body.email === "string" ? req.body.email.trim() : "";
    const emailCanonical = normalizeEmail(emailDisplay);
    const password = req.body.pwd;
    let passwordError;
    try {
      passwordError = await getPasswordValidationError(password);
    } catch (err) {
      return res.status(500).send("Unable to validate the password right now.");
    }
    if (!isEmail(emailDisplay) || passwordError)
      return res
        .status(400)
        .send(passwordError || "Enter a valid email and password.");

    try {
      await ensureDbReady();
      const passwordHash = await hashPassword(password);
      let existingUser = await findUserByEmail(emailCanonical);
      let verificationToken = null;

      if (!existingUser) {
        verificationToken = crypto.randomBytes(32).toString("hex");
        const verificationTokenHash = crypto
          .createHash("sha256")
          .update(verificationToken)
          .digest("hex");
        const createdAt = new Date();
        const user = {
          email: emailCanonical,
          emailCanonical,
          emailDisplay,
          pwd: passwordHash,
          passwordHistory: [passwordHash],
          emailVerified: false,
          emailVerificationTokenHash: verificationTokenHash,
          emailVerificationExpiresAt: new Date(
            createdAt.getTime() + EMAIL_VERIFICATION_TTL_MS,
          ),
          createdAt,
        };

        try {
          await authService.createUser(user);
        } catch (err) {
          if (err.code === 11000 || /duplicate/i.test(err.message)) {
            existingUser = await findUserByEmail(emailCanonical);
          } else {
            throw err;
          }
        }
      }

      if (emailService.isConfigured()) {
        try {
          const publicAppUrl = getPublicAppUrl();
          await emailService.sendSignupNotification({
            existingUser,
            emailDisplay,
            verificationToken,
            publicAppUrl,
          });
        } catch (err) {
          await recordError("signup-notification", emailCanonical, err);
        }
      }

      await new Promise((resolve) =>
        setTimeout(resolve, crypto.randomInt(25, 76)),
      );
      res.sendStatus(204);
    } catch (err) {
      await recordError("signup", emailCanonical, err);
      res.status(500).send("Unable to create the account right now.");
    }
  },
);

router.get("/verify-email", async (req, res) => {
  const token = req.query && req.query.token;
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token))
    return res
      .status(400)
      .send("This verification link is invalid or expired.");

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  try {
    await ensureDbReady();
    const result = await authService.verifyEmailToken(tokenHash);
    if (result.error) return res.status(result.status).send(result.error);
    res.status(200).send("Email verified. You can now sign in.");
  } catch (err) {
    await recordError("email-verification", null, err);
    res.status(500).send("Unable to verify your email right now.");
  }
});

router.post(
  "/postlogin",
  loginLockoutGuard,
  loginRateLimit,
  validateRequest(loginSchema),
  async (req, res) => {
    const email = normalizeEmail(req.body.email);
    const password = req.body.pwd;
    if (!isEmail(email) || typeof password !== "string")
      return res.status(400).send("Enter your email and password.");
    try {
      await ensureDbReady();
      const existingUser = await findUserByEmail(email);
      if (existingUser) {
        const lockedUntilMs =
          existingUser.lockedUntil instanceof Date
            ? existingUser.lockedUntil.getTime()
            : existingUser.lockedUntil
              ? new Date(existingUser.lockedUntil).getTime()
              : 0;
        if (lockedUntilMs > Date.now()) {
          return res.status(429).json({
            error:
              "This account is temporarily locked because of repeated failed login attempts.",
            retryAfter: Math.max(1, lockedUntilMs - Date.now()),
          });
        }
        if (lockedUntilMs && lockedUntilMs <= Date.now()) {
          await authService.updateUser(
            { _id: existingUser._id },
            { $set: { failedLoginAttempts: 0, lockedUntil: null } },
          );
        }
      }

      const data = await authService.authenticate(email, password);
      if (!data) {
        if (existingUser) {
          const nextAttempts =
            Number(existingUser.failedLoginAttempts || 0) + 1;
          const shouldLock = nextAttempts >= USER_LOGIN_FAILURE_LIMIT;
          await authService.updateUser(
            { _id: existingUser._id },
            {
              $set: {
                failedLoginAttempts: shouldLock
                  ? USER_LOGIN_FAILURE_LIMIT
                  : nextAttempts,
                lockedUntil: shouldLock
                  ? new Date(Date.now() + USER_LOGIN_LOCKOUT_MS)
                  : null,
              },
            },
          );
          if (shouldLock) {
            return res.status(429).json({
              error:
                "This account is temporarily locked because of repeated failed login attempts.",
              retryAfter: USER_LOGIN_LOCKOUT_MS,
            });
          }
        }
        throw new InvalidCredentialsError("Invalid credentials");
      }

      await authService.updateUser(
        { _id: data._id },
        { $set: { failedLoginAttempts: 0, lockedUntil: null } },
      );

      const visitorName =
        sanitizePlainText(req.body.uname).slice(0, 120) ||
        email.split("@")[0] ||
        "Unknown";

      if (data.totpEnabled) {
        await regenerateSession(req);
        req.session.pendingTotpUser = {
          id: data._id,
          email: data.email,
          visitorName,
          clientFingerprint: createClientFingerprint(req),
          clientIpFingerprint: createClientIpFingerprint(req),
          expiresAt: Date.now() + TOTP_CHALLENGE_TTL_MS,
        };
        const csrfToken = refreshCsrfToken(req, res);
        return res.status(202).json({ requiresTotp: true, csrfToken });
      }

      await establishUserSession(req, data, visitorName);
      await recordLoginAudit(data, req, true, null);
      req.flash("success", "Welcome back. Dashboard ready.");
      res.sendStatus(204);
    } catch (err) {
      if (err instanceof InvalidCredentialsError)
        await recordLoginAudit(null, req, false, "invalid-credentials", email);
      await recordError("login", email, err);
      res
        .status(401)
        .send(
          "Invalid login credentials. Older passwords must be reset using Forgot Password.",
        );
    }
  },
);

router.post("/profile/update", requireLogin, async (req, res) => {
  try {
    await ensureDbReady();
    const user = await findUserByEmail(req.session.user.email);
    if (!user) return res.redirect("/");

    const fullName = sanitizePlainText(
      typeof req.body.fullName === "string" ? req.body.fullName : "",
    )
      .trim()
      .slice(0, 120);
    const designation = sanitizePlainText(
      typeof req.body.designation === "string" ? req.body.designation : "",
    )
      .trim()
      .slice(0, 80);
    const rawPhoneNumber =
      typeof req.body.phoneNumber === "string" ? req.body.phoneNumber : "";
    const phoneNumber = rawPhoneNumber
      ? normalizeIndianPhoneNumber(sanitizePlainText(rawPhoneNumber)).slice(
          0,
          20,
        )
      : "";
    if (rawPhoneNumber && !/^\+91[6-9]\d{9}$/.test(phoneNumber)) {
      throw new InputValidationError(
        "phoneNumber",
        "Enter a valid Indian mobile number.",
      );
    }
    const avatarUrl =
      typeof req.body.avatarUrl === "string"
        ? sanitizePlainText(req.body.avatarUrl).trim().slice(0, 512)
        : "";
    if (avatarUrl && !/^https?:\/\//i.test(avatarUrl)) {
      throw new InputValidationError(
        "avatarUrl",
        "Avatar URL must begin with http:// or https://.",
      );
    }

    const result = await authService.updateUser(
      { _id: user._id },
      {
        $set: {
          fullName,
          designation,
          phoneNumber,
          avatarUrl,
        },
      },
    );
    if (!result.matchedCount || result.ok === 0)
      return res.status(409).send("The profile could not be updated.");

    req.session.user = {
      ...req.session.user,
      fullName,
      designation,
      phoneNumber,
      avatarUrl,
    };
    req.flash("success", "Profile updated successfully.");
    res.redirect("/profile");
  } catch (err) {
    if (err instanceof InputValidationError)
      return res.status(422).send(err.message);
    console.error("Profile update error:", err);
    await recordError("profile-update", req.session.user.email, err);
    return res.status(500).send("Unable to update your profile right now.");
  }
});

router.post("/profile/delete", requireLogin, async (req, res) => {
  try {
    const currentPwd =
      typeof req.body.currentPwd === "string" ? req.body.currentPwd : "";
    if (!currentPwd.trim()) {
      req.flash(
        "error",
        "Enter your current password to confirm account deletion.",
      );
      return res.redirect("/profile");
    }

    await ensureDbReady();
    const result = await authService.deleteAccount(
      req.session.user.email,
      currentPwd,
    );
    if (result.error) {
      req.flash("error", result.error);
      return res.redirect("/profile");
    }

    if (req.session && typeof req.session.destroy === "function") {
      await new Promise((resolve, reject) =>
        req.session.destroy((error) => (error ? reject(error) : resolve())),
      );
    }
    res.clearCookie("session", {
      path: "/",
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
    });
    req.flash("success", "Your account has been deleted.");
    return res.redirect("/");
  } catch (err) {
    console.error("Account delete error:", err);
    await recordError("profile-delete", req.session.user.email, err);
    req.flash("error", "Unable to delete your account right now.");
    return res.redirect("/profile");
  }
});

router.post(
  "/postchangepassword",
  requireLogin,
  validateRequest(changePasswordSchema),
  async (req, res) => {
    if (!hasSessionUser(req))
      return res.status(401).json({ error: "Authentication required" });

    const email = normalizeEmail(req.session.user.email);
    const currentPassword = req.body.currentPwd;
    const newPassword = req.body.pwd;
    if (typeof currentPassword !== "string" || !currentPassword)
      return res.status(400).send("Enter your current password.");

    let passwordError;
    try {
      passwordError = await getPasswordValidationError(newPassword);
    } catch (err) {
      return res.status(500).send("Unable to validate the password right now.");
    }
    if (passwordError) return res.status(400).send(passwordError);

    try {
      await ensureDbReady();
      const result = await authService.changePassword(
        email,
        currentPassword,
        newPassword,
      );
      if (result.error) return res.status(result.status).send(result.error);

      res.sendStatus(204);
    } catch (err) {
      await recordError("password-change", email, err);
      res.status(500).send("Unable to change the password right now.");
    }
  },
);

router.post("/postlogin/totp", totpChallengeRateLimit, async (req, res) => {
  const pending = req.session && req.session.pendingTotpUser;
  if (!pending || pending.expiresAt <= Date.now())
    return res.status(401).send("Verification expired. Please sign in again.");
  const currentFingerprint = createClientFingerprint(req);
  const currentIpFingerprint = createClientIpFingerprint(req);
  if (
    !fingerprintsMatch(pending.clientFingerprint, currentFingerprint) ||
    (pending.clientIpFingerprint &&
      currentIpFingerprint &&
      !fingerprintsMatch(pending.clientIpFingerprint, currentIpFingerprint))
  )
    return res.status(401).send("Verification expired. Please sign in again.");

  try {
    await ensureDbReady();
    const user = await findUserByEmail(pending.email);
    if (!user || !user.totpEnabled || String(user._id) !== String(pending.id))
      return res.status(401).send("Invalid verification code.");

    let verified = false;
    if (typeof req.body.code === "string") {
      const secret = decryptTotpSecret(user.totpSecretEncrypted);
      verified = await verifyTotpToken(secret, req.body.code.trim());
    }

    if (!verified)
      verified = await consumeTotpRecoveryCode(user, req.body.recoveryCode);

    if (!verified) return res.status(401).send("Invalid verification code.");
    await establishUserSession(req, user, pending.visitorName);
    await establishUserSession(req, user, pending.visitorName);
    await recordLoginAudit(user, req, true, null);
    res.sendStatus(204);
  } catch (err) {
    if (!verified) {
      await recordLoginAudit(user, req, false, "invalid-totp");
      return res.status(401).send("Invalid verification code.");
    }
    await recordError("totp-login", pending.email, err);
    res.status(500).send("Unable to verify your sign-in right now.");
  }
});

router.get("/totp/status", requireLogin, async (req, res) => {
  try {
    await ensureDbReady();
    const user = await findUserByEmail(req.session.user.email);
    if (!user) return res.status(404).json({ error: "Account not found." });
    res.json({
      enabled: Boolean(user.totpEnabled),
      recoveryCodesRemaining: (user.totpRecoveryCodeHashes || []).length,
    });
  } catch (err) {
    await recordError("totp-status", req.session.user.email, err);
    res.status(500).json({ error: "Unable to load security settings." });
  }
});

router.post("/totp/setup", requireLogin, async (req, res) => {
  try {
    await ensureDbReady();
    getTotpEncryptionKey();
    const user = await findUserByEmail(req.session.user.email);
    if (!user) return res.status(404).json({ error: "Account not found." });
    if (user.totpEnabled)
      return res
        .status(409)
        .json({ error: "Two-factor authentication is already enabled." });

    const secret = generateSecret();
    const uri = generateURI({
      issuer: "GBR Mobile Storage",
      label: user.email,
      secret,
    });
    req.session.pendingTotpSecret = secret;
    req.session.pendingTotpExpiresAt = Date.now() + TOTP_CHALLENGE_TTL_MS;
    res.json({ secret, qrCode: await QRCode.toDataURL(uri) });
  } catch (err) {
    await recordError("totp-setup", req.session.user.email, err);
    res.status(503).json({
      error:
        "Unable to start setup. Check the TOTP encryption key configuration.",
    });
  }
});

router.post("/totp/confirm", requireLogin, async (req, res) => {
  const secret = req.session.pendingTotpSecret;
  if (!secret || req.session.pendingTotpExpiresAt <= Date.now())
    return res.status(400).json({ error: "Setup expired. Start again." });

  try {
    if (!(await verifyTotpToken(secret, req.body.code)))
      return res
        .status(400)
        .json({ error: "Enter a valid authenticator code." });

    await ensureDbReady();
    const user = await findUserByEmail(req.session.user.email);
    if (!user) return res.status(404).json({ error: "Account not found." });
    if (user.totpEnabled)
      return res
        .status(409)
        .json({ error: "Two-factor authentication is already enabled." });

    const recoveryCodes = Array.from({ length: 10 }, () =>
      crypto.randomBytes(8).toString("hex").toUpperCase(),
    );
    const updateResult = await authService.updateTotpSettings(user, {
      totpEnabled: true,
      totpSecretEncrypted: encryptTotpSecret(secret),
      totpRecoveryCodeHashes: await Promise.all(
        recoveryCodes.map(hashPassword),
      ),
    });
    if (updateResult.matchedCount === 0 || updateResult.ok === 0)
      return res
        .status(500)
        .json({ error: "Unable to save two-factor settings." });

    delete req.session.pendingTotpSecret;
    delete req.session.pendingTotpExpiresAt;
    res.json({ enabled: true, recoveryCodes });
  } catch (err) {
    await recordError("totp-confirm", req.session.user.email, err);
    res
      .status(500)
      .json({ error: "Unable to enable two-factor authentication." });
  }
});

router.post("/totp/disable", requireLogin, async (req, res) => {
  const password = req.body.password;
  const code = req.body.code;
  if (typeof password !== "string" || typeof code !== "string")
    return res
      .status(400)
      .json({ error: "Enter your password and authenticator code." });

  try {
    await ensureDbReady();
    const user = await findUserByEmail(req.session.user.email);
    if (
      !user ||
      !user.totpEnabled ||
      !(await verifyPassword(password, user.pwd))
    )
      return res
        .status(400)
        .json({ error: "Invalid password or authenticator code." });
    const secret = decryptTotpSecret(user.totpSecretEncrypted);
    const validTotp = await verifyTotpToken(secret, code.trim());
    const validRecoveryCode = validTotp
      ? false
      : await consumeTotpRecoveryCode(user, code);
    if (!validTotp && !validRecoveryCode)
      return res
        .status(400)
        .json({ error: "Invalid password or authenticator code." });

    await authService.updateTotpSettings(user, {
      totpEnabled: false,
      totpSecretEncrypted: null,
      totpRecoveryCodeHashes: [],
    });
    await regenerateSession(req);
    req.session.clientFingerprint = createClientFingerprint(req);
    req.session.clientIpFingerprint = createClientIpFingerprint(req);
    req.session.user = buildSessionUser(
      user,
      user.fullName || user.emailDisplay || user.email,
    );
    res.json({ csrfToken: refreshCsrfToken(req, res) });
  } catch (err) {
    await recordError("totp-disable", req.session.user.email, err);
    res
      .status(500)
      .json({ error: "Unable to disable two-factor authentication." });
  }
});

router.post(
  "/postforgot",
  forgotRateLimit,
  validateRequest(emailSchema),
  async (req, res) => {
    const otpEmail = normalizeEmail(req.body.email);
    if (!isEmail(otpEmail))
      return res.status(400).send("Enter a valid email address.");

    const retryAfter = consumePasswordResetRateLimit(
      otpEmail,
      "request",
      PASSWORD_RESET_REQUEST_LIMIT,
    );
    if (retryAfter) {
      return res.status(429).json({
        error: "Too many reset requests. Please try again later.",
        retryAfter,
      });
    }

    try {
      await ensureDbReady();
      const user = await findUserByEmail(otpEmail);
      if (!user) {
        return res.sendStatus(204);
      }

      if (!emailService.isConfigured())
        throw new Error("Mail service is not configured");

      const otp = crypto.randomInt(0, 1000000).toString().padStart(6, "0");
      const otpHash = await hashPassword(otp);
      const otpExpiresAt = new Date(Date.now() + PASSWORD_RESET_OTP_TTL_MS);
      const updateResult = await authService.setPasswordResetCode(
        user,
        otpHash,
        otpExpiresAt,
      );
      if (updateResult.matchedCount === 0 || updateResult.ok === 0)
        return res.sendStatus(204);

      try {
        await emailService.sendPasswordResetCode(
          user.emailDisplay || user.email,
          otp,
        );
      } catch (err) {
        await authService.clearPasswordResetCode(user, otpHash);
        throw err;
      }

      res.sendStatus(204);
    } catch (err) {
      await recordError("password-reset-request", otpEmail, err);
      res
        .status(500)
        .send("Unable to send the reset email. Please try again later.");
    }
  },
);

router.post("/postreset", validateRequest(resetSchema), async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const otp = req.body.otp;
  const password = req.body.pwd;

  if (!isEmail(email))
    return res.status(400).send("Enter a valid email address.");
  if (typeof otp !== "string" || !/^\d{6}$/.test(otp))
    return res.status(400).send("Enter the 6-digit reset code.");
  let passwordError;
  try {
    passwordError = await getPasswordValidationError(password);
  } catch (err) {
    return res.status(500).send("Unable to validate the password right now.");
  }
  if (passwordError) return res.status(400).send(passwordError);

  const retryAfter = consumePasswordResetRateLimit(
    email,
    "verify",
    PASSWORD_RESET_VERIFY_LIMIT,
  );
  if (retryAfter) {
    return res.status(429).json({
      error: "Too many code attempts. Please request a new code later.",
      retryAfter,
    });
  }

  try {
    await ensureDbReady();
    const user = await findUserByEmail(email);
    const expiresAt = user && user.passwordResetOtpExpiresAt;
    if (
      !user ||
      typeof user.passwordResetOtpHash !== "string" ||
      !(expiresAt instanceof Date) ||
      expiresAt.getTime() <= Date.now() ||
      !(await verifyPassword(otp, user.passwordResetOtpHash))
    ) {
      return res.status(400).send("Invalid or expired reset code.");
    }

    const result = await authService.resetPassword(
      user,
      password,
      user.passwordResetOtpHash,
    );
    if (result.error) return res.status(result.status).send(result.error);

    await regenerateSession(req);
    clearPasswordResetRateLimit(email, "verify");
    res.sendStatus(204);
  } catch (err) {
    await recordError("password-reset-confirm", email, err);
    res.status(500).send("Unable to reset your password right now.");
  }
});

router.get("/api/records", requireLogin, async (req, res) => {
  const query = req.query || {};
  const invalidQuery = (field, message) =>
    res.status(422).json({ errors: [{ field, message }] });
  const parseNonnegativeInteger = (value, fallback) => {
    if (value === undefined) return fallback;
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
  };

  const draw = parseNonnegativeInteger(query.draw, 0);
  const start = parseNonnegativeInteger(query.start, 0);
  const requestedLength =
    query.length === "-1" ? 100 : parseNonnegativeInteger(query.length, 10);
  if (draw === null)
    return invalidQuery("draw", "draw must be a nonnegative integer.");
  if (start === null)
    return invalidQuery("start", "start must be a nonnegative integer.");
  if (requestedLength === null || requestedLength === 0)
    return invalidQuery("length", "length must be a positive integer.");

  const status = normalizeDeviceStatus(query.status);
  if (status !== undefined && !VALID_DEVICE_STATUSES.includes(status))
    return invalidQuery(
      "status",
      `status must be one of: ${VALID_DEVICE_STATUSES.join(", ")}.`,
    );

  const searchGroup = query.search;
  const searchValue =
    searchGroup && typeof searchGroup === "object"
      ? searchGroup.value
      : query["search[value]"];
  if (searchValue !== undefined && typeof searchValue !== "string")
    return invalidQuery("search[value]", "search must be text.");
  if (typeof searchValue === "string" && searchValue.length > 128)
    return invalidQuery(
      "search[value]",
      "search must be 128 characters or fewer.",
    );

  const orderGroup = query.order;
  const orderEntry = Array.isArray(orderGroup)
    ? orderGroup[0]
    : orderGroup && typeof orderGroup === "object"
      ? orderGroup[0]
      : null;
  const rawColumnIndex =
    orderEntry && orderEntry.column !== undefined
      ? orderEntry.column
      : query["order[0][column]"];
  const columnIndex =
    rawColumnIndex === undefined
      ? null
      : parseNonnegativeInteger(rawColumnIndex, null);
  if (rawColumnIndex !== undefined && columnIndex === null)
    return invalidQuery(
      "order[0][column]",
      "column index must be a nonnegative integer.",
    );
  const columnsGroup = query.columns;
  const columnEntry =
    columnIndex === null
      ? null
      : Array.isArray(columnsGroup)
        ? columnsGroup[columnIndex]
        : columnsGroup && typeof columnsGroup === "object"
          ? columnsGroup[columnIndex]
          : null;
  const sortField =
    (columnEntry && columnEntry.data) ||
    (columnIndex === null ? undefined : query[`columns[${columnIndex}][data]`]);
  const rawDirection = (orderEntry && orderEntry.dir) || query["order[0][dir]"];
  const sortDirection = rawDirection === "desc" ? "desc" : "asc";

  try {
    await ensureDbReady();
    const result = await deviceService.listDataTablePage({
      draw,
      start,
      length: Math.min(requestedLength, 100),
      search: searchValue || "",
      status,
      sortField,
      sortDirection,
    });
    res.json(result);
  } catch (err) {
    await recordError("list-records", req.session.user.email, err);
    res.status(500).json({ error: "Unable to load records right now." });
  }
});

router.get("/api/recyclebin", requireLogin, async (req, res) => {
  try {
    await ensureDbReady();
    const records = await deviceService.listDeleted(
      new Date(Date.now() - RECYCLE_BIN_RETENTION_MS),
    );
    res.json({ data: records });
  } catch (err) {
    await recordError("list-recycle-bin", req.session.user.email, err);
    res.status(500).json({ error: "Unable to load recently deleted records." });
  }
});

router.get("/api/records/:id/audit", requireLogin, async (req, res) => {
  const validation = recordIdSchema.validate({ _id: req.params.id });
  if (validation.error) {
    return res.status(422).json({
      errors: [{ field: "id", message: validation.error.details[0].message }],
    });
  }
  try {
    await ensureDbReady();
    const data = await deviceService.listRecentAuditLogs(
      250,
      validation.value._id,
    );
    res.json({ data });
  } catch (err) {
    await recordError("record-audit", req.session.user.email, err);
    res.status(500).json({ error: "Unable to load record activity." });
  }
});

router.get("/audit", requireLogin, async (req, res) => {
  try {
    await ensureDbReady();
    const [
      data,
      deletedData,
      counts,
      auditEvents,
      dashboardKpis,
      dashboardHeatmap,
      repeatOffenders,
      employeeLeaderboard,
      dashboardActivity,
      agingKpis,
      visitorSummary,
    ] = await Promise.all([
      deviceService.listAll(),
      deviceService.listDeleted(
        new Date(Date.now() - RECYCLE_BIN_RETENTION_MS),
      ),
      deviceService.getDashboardCounts(),
      deviceService.listRecentAuditLogs(500),
      deviceService.getDashboardKpiTrends(),
      deviceService.getDashboardHeatmap(),
      deviceService.getRepeatOffenders(10),
      deviceService.getEmployeeLeaderboard(5),
      deviceService.getDashboardActivity(20),
      deviceService.getDashboardAgingKpis(),
      visitorService.getVisitorSummary(),
    ]);
    const data1 = data.filter((record) => record.status === "At_office");
    const data2 = data.filter((record) => record.status === "Returned");
    const sessionTtlMs =
      Number(req.session.cookie && req.session.cookie.maxAge) ||
      8 * 60 * 60 * 1000;
    res.render("home", {
      data,
      data1,
      data2,
      data3: data,
      deletedData,
      deletedCount: deletedData.length,
      count: counts.total,
      count1: counts.atOffice,
      count2: counts.returned,
      dashboardKpis,
      dashboardHeatmap,
      repeatOffenders,
      employeeLeaderboard,
      dashboardActivity,
      agingKpis,
      visitorSummary,
      email: req.session.user.email,
      sessionUser: req.session.user,
      sessionExpiresAt: Date.now() + sessionTtlMs,
      sessionTtlMs,
      darkMode: Boolean(
        req.session.user.preferences && req.session.user.preferences.darkMode,
      ),
      previousLogin: req.session.user.previousLogin || null,
      auditEvents,
      isAuditPage: true,
    });
  } catch (err) {
    await recordError("activity-page", req.session.user.email, err);
    res.status(500).render("error", {
      message: "Unable to load activity right now.",
      error: { status: 500 },
    });
  }
});

router.post("/restore/:id", requireLogin, async (req, res) => {
  const validation = recordIdSchema.validate({ _id: req.params.id });
  if (validation.error) {
    return res.status(422).json({
      errors: [{ field: "id", message: validation.error.details[0].message }],
    });
  }

  try {
    await ensureDbReady();
    const result = await deviceService.restoreById(
      validation.value._id,
      new Date(Date.now() - RECYCLE_BIN_RETENTION_MS),
      req.session.user.email,
    );
    if (result.matchedCount === 0)
      return res
        .status(404)
        .json({ error: "Deleted record not found or expired." });
    res.json({ success: true, restored: 1, _id: validation.value._id });
  } catch (err) {
    await recordError("restore-record", req.session.user.email, err);
    res.status(500).json({ error: "Unable to restore this record right now." });
  }
});

router.get("/home", requireLogin, async (req, res) => {
  if (!hasSessionUser(req)) return res.redirect("/");

  res.locals.email = req.session.user.email;
  try {
    await ensureDbReady();
    const [
      data,
      deletedData,
      counts,
      dashboardKpis,
      dashboardHeatmap,
      repeatOffenders,
      employeeLeaderboard,
      dashboardActivity,
      agingKpis,
      visitorSummary,
    ] = await Promise.all([
      deviceService.listAll(),
      deviceService.listDeleted(
        new Date(Date.now() - RECYCLE_BIN_RETENTION_MS),
      ),
      deviceService.getDashboardCounts(),
      deviceService.getDashboardKpiTrends(),
      deviceService.getDashboardHeatmap(),
      deviceService.getRepeatOffenders(10),
      deviceService.getEmployeeLeaderboard(5),
      deviceService.getDashboardActivity(20),
      deviceService.getDashboardAgingKpis(),
      visitorService.getVisitorSummary(),
    ]);
    const data1 = data.filter((record) => record.status === "At_office");
    const data2 = data.filter((record) => record.status === "Returned");
    const data3 = data;
    const sessionTtlMs =
      Number(req.session.cookie && req.session.cookie.maxAge) ||
      8 * 60 * 60 * 1000;
    res.render("home", {
      data,
      data1,
      data2,
      data3,
      deletedData,
      deletedCount: deletedData.length,
      count: counts.total,
      count1: counts.atOffice,
      count2: counts.returned,
      dashboardKpis,
      dashboardHeatmap,
      repeatOffenders,
      employeeLeaderboard,
      dashboardActivity,
      agingKpis,
      visitorSummary,
      sessionUser: req.session.user,
      sessionExpiresAt: Date.now() + sessionTtlMs,
      sessionTtlMs,
      darkMode: Boolean(
        req.session.user.preferences && req.session.user.preferences.darkMode,
      ),
      previousLogin: req.session.user.previousLogin || null,
    });
  } catch (err) {
    console.error("Home page error:", err);
    return renderDatabaseErrorHome(
      req,
      res,
      "Database temporarily unavailable. Please retry.",
    );
  }
});

router.post(
  "/hh",
  requireLogin,
  validateRequest(createDeviceSchema),
  async (req, res) => {
    if (!hasSessionUser(req)) return res.redirect("/");
    try {
      await ensureDbReady();
      const data = normalizeStudentRecord(req.body, "At_office");
      const dbResponse = await deviceService.create(
        data,
        req.session.user.email,
      );
      console.log(dbResponse);
      req.flash("success", "Record created successfully.");
      res.redirect("/home");
    } catch (err) {
      if (err instanceof InputValidationError)
        return res.status(422).json({
          errors: [{ field: err.field || "body", message: err.message }],
        });
      if (err && err.statusCode === 409) {
        const duplicateType = err.duplicateType || "duplicate";
        const message =
          duplicateType === "class-roll"
            ? "A student with this class roll number already exists."
            : duplicateType === "imei"
              ? "A record with this IMEI already exists."
              : "A duplicate record already exists.";
        return res.status(409).json({
          error: "Duplicate record detected.",
          message,
          details: { type: duplicateType },
        });
      }
      console.error("Insert data error:", err);
      await recordError("create-record", req.session.user.email, err);
      return renderDatabaseErrorHome(
        req,
        res,
        "Database temporarily unavailable. Please retry.",
      );
    }
  },
);

router.post(
  "/change",
  requireLogin,
  validateRequest(returnDeviceSchema),
  async (req, res) => {
    if (!hasSessionUser(req))
      return res.status(401).send("Authentication required.");
    try {
      const validation = returnDeviceSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: false,
        convert: true,
      });
      if (validation.error) {
        return res.status(422).json({
          errors: validation.error.details.map((detail) => ({
            field: detail.path.length ? detail.path.join(".") : "body",
            message: detail.message,
          })),
        });
      }
      req.body = validation.value;
      await ensureDbReady();
      const returnMeta = {
        returnedBy: req.body.returnedBy,
        returnRelation: req.body.returnRelation,
        returnedAt: req.body.returnedAt,
        returnSignature:
          req.body.returnSignature || req.body.returnSignatureText || null,
        returnNotes: req.body.returnNotes,
      };
      const docs = await deviceService.markReturned(
        req.body._id,
        req.session.user.email,
        returnMeta,
      );
      if (!docs.matchedCount) return res.status(404).send("Record not found.");
      console.log(docs);
      res.redirect("/home");
    } catch (err) {
      console.error("Change status error:", err);
      await recordError("change-status", req.session.user.email, err);
      res.status(500).send("An error occurred while updating the status.");
    }
  },
);

router.post(
  "/edit",
  requireLogin,
  validateRequest(recordIdSchema),
  async (req, res) => {
    if (!hasSessionUser(req))
      return res.status(401).send("Authentication required.");
    try {
      await ensureDbReady();
      const records = await deviceService.findById(req.body._id);
      if (!records.length) {
        return res.status(404).json({ error: "Record not found." });
      }
      return res.status(200).json(publicEditRecord(records[0]));
    } catch (err) {
      console.error("Edit data error:", err);
      await recordError("edit", req.session.user.email, err);
      return res.status(500).send("An error occurred while fetching the data.");
    }
  },
);

router.post(
  "/update",
  requireLogin,
  validateRequest(updateDeviceSchema),
  async (req, res) => {
    if (!hasSessionUser(req)) return res.redirect("/");
    try {
      await ensureDbReady();
      const data = normalizeStudentRecord(req.body, req.body.status || null);
      const dbResponse = await deviceService.updateById(
        req.body._id,
        data,
        req.session.user.email,
        req.body.__v,
      );
      console.log(dbResponse);
      res.redirect("/home");
    } catch (err) {
      if (err instanceof InputValidationError)
        return res.status(422).json({
          errors: [{ field: err.field || "body", message: err.message }],
        });
      if (err && err.statusCode === 409) {
        return res.status(409).json({
          error:
            "Record was changed by another staff member. Reload and try again.",
        });
      }
      console.error("Update data error:", err);
      await recordError("update", req.session.user.email, err);
      res.status(500).send("An error occurred while updating the data.");
    }
  },
);

router.post(
  "/delete",
  requireLogin,
  validateRequest(deleteSchema),
  async (req, res) => {
    if (!hasSessionUser(req))
      return res.status(401).json({ error: "Authentication required" });
    try {
      await ensureDbReady();
      const result = await deviceService.deleteById(
        req.body._id,
        req.session.user.email,
      );
      if (result.matchedCount === 0)
        return res.status(404).json({ error: "Record not found." });
      res.json({
        success: true,
        deleted: 1,
        _id: req.body._id,
        rno: req.body.rno,
      });
    } catch (err) {
      console.error("Delete error:", err);
      await recordError("delete", req.session.user.email, err);
      res.status(500).json({ error: "Failed to delete record" });
    }
  },
);

router.get("/session/status", requireLogin, (req, res) => {
  const maxAge = Number(
    req.session && req.session.cookie && req.session.cookie.maxAge
      ? req.session.cookie.maxAge
      : 8 * 60 * 60 * 1000,
  );
  const expiresAt = Date.now() + maxAge;
  res.json({
    ok: true,
    expiresAt,
    remainingMs: Math.max(0, expiresAt - Date.now()),
    maxAge,
  });
});

router.post("/session/extend", requireLogin, (req, res) => {
  const maxAge = Number(
    req.session && req.session.cookie && req.session.cookie.maxAge
      ? req.session.cookie.maxAge
      : 8 * 60 * 60 * 1000,
  );
  if (req.session && typeof req.session.touch === "function") {
    req.session.touch();
  }
  const expiresAt = Date.now() + maxAge;
  res.json({
    ok: true,
    expiresAt,
    remainingMs: Math.max(0, expiresAt - Date.now()),
    maxAge,
  });
});

router.post("/user/preferences", requireLogin, async (req, res) => {
  if (!hasSessionUser(req))
    return res.status(401).json({ error: "Authentication required" });

  const requestedDarkMode =
    req.body && typeof req.body.darkMode !== "undefined"
      ? Boolean(req.body.darkMode)
      : false;

  try {
    await ensureDbReady();
    const user = await findUserByEmail(req.session.user.email);
    if (!user) return res.status(404).json({ error: "Account not found." });

    const savedPreferences =
      user.preferences && typeof user.preferences === "object"
        ? user.preferences
        : {};
    const nextPreferences = {
      darkMode: requestedDarkMode,
      lang:
        typeof savedPreferences.lang === "string"
          ? sanitizePlainText(savedPreferences.lang).trim().slice(0, 16) || "en"
          : "en",
    };

    await signlogColl.update(
      { _id: user._id },
      { $set: { preferences: nextPreferences } },
    );

    req.session.user = {
      ...req.session.user,
      preferences: {
        darkMode: requestedDarkMode,
        lang: nextPreferences.lang,
      },
    };

    return res.json({
      ok: true,
      darkMode: requestedDarkMode,
      csrfToken: refreshCsrfToken(req, res),
    });
  } catch (err) {
    await recordError("user-preferences", req.session.user.email, err);
    return res.status(500).json({ error: "Unable to save your preferences." });
  }
});

router.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

router.use(
  "/api/v1",
  createApiV1Router({
    authService,
    deviceService,
    ensureDbReady,
    normalizeStudentRecord,
    sanitizePlainText,
    emailService,
    getPublicAppUrl,
    signupRateLimit,
    loginLockoutGuard,
    loginRateLimit,
    forgotRateLimit,
    totpChallengeRateLimit,
    consumePasswordResetRateLimit,
    clearPasswordResetRateLimit,
    passwordResetRequestLimit: PASSWORD_RESET_REQUEST_LIMIT,
    passwordResetVerifyLimit: PASSWORD_RESET_VERIFY_LIMIT,
    passwordResetOtpTtlMs: PASSWORD_RESET_OTP_TTL_MS,
    totpChallengeTtlMs: TOTP_CHALLENGE_TTL_MS,
    hasSessionUser,
    regenerateSession,
    establishUserSession,
    createClientFingerprint,
    createClientIpFingerprint,
    fingerprintsMatch,
    verifyTotpToken,
    decryptTotpSecret,
    encryptTotpSecret,
    generateTotpSecret: generateSecret,
    generateTotpUri: generateURI,
    getTotpEncryptionKey,
    qrCode: QRCode,
    buildSessionUser,
    refreshCsrfToken,
    recordLoginAudit,
    recordError,
  }),
);

Object.defineProperties(router, {
  InputValidationError: { value: InputValidationError },
  normalizeStudentRecord: { value: normalizeStudentRecord },
});

module.exports = router;
module.exports.resetRuntimeState = resetRuntimeState;
module.exports.getRuntimeState = getRuntimeState;
