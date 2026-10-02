const { describe, test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const express = require("express");
const timeout = require("connect-timeout");
const compression = require("compression");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const sessionMiddleware = require("express-session");
const csrfProtection = require("@dr.pogodin/csurf").default;
const supertest = require("supertest");
const pug = require("pug");
const registeredComponents = require("../components/registry");
const { errorHandler } = require("../middleware/errorHandler");
const { generate: generateTotp } = require("otplib");
const { EventEmitter } = require("node:events");
const { wrapAsyncHandlers } = require("../middleware/asyncHandler");
const {
  installProcessErrorHandlers,
} = require("../middleware/processErrorHandlers");
const {
  createBodyParsers,
  getBodyParserLimits,
} = require("../middleware/bodyParsers");
const {
  getRequestId,
  requestIdMiddleware,
} = require("../middleware/requestContext");

process.env.NODE_ENV = "test";
process.env.MONGODB_URI = "mongodb://localhost:27017/testdb";
process.env.SESSION_SECRET = "test-session-secret";
process.env.GMAIL_USER = "demo@example.com";
process.env.GMAIL_PASS = "demo-password";
process.env.PUBLIC_APP_URL = "https://storage.example";
process.env.TOTP_ENCRYPTION_KEY = "test-totp-encryption-key-with-32-characters";
process.env.CORS_ORIGINS = "https://trusted.example";

const appState = {
  users: new Map(),
  records: [],
  mail: [],
};

function resetState() {
  appState.users.clear();
  appState.records = [];
  appState.mail = [];
  if (typeof router.resetRuntimeState === "function") {
    router.resetRuntimeState();
  }
}

function getRuntimeRecords() {
  if (typeof router.getRuntimeState === "function") {
    const runtime = router.getRuntimeState();
    if (runtime.studentData && Array.isArray(runtime.studentData.items)) {
      return runtime.studentData.items;
    }
  }
  return appState.records;
}

function makeCollection(name) {
  return {
    createIndex: async () => {},
    insert: async (payload) => {
      if (name === "registration_coll") {
        const user = {
          ...payload,
          deletedAt: payload.deletedAt ?? null,
          deletedBy: payload.deletedBy ?? null,
          _id: `user-${appState.users.size + 1}`,
        };
        appState.users.set(user.emailCanonical || user.email, user);
        return user;
      }

      if (name === "student_data") {
        const record = {
          ...payload,
          _id: `student-${appState.records.length + 1}`,
        };
        appState.records.push(record);
        return record;
      }

      if (name === "visitors_of_page") {
        return { ...payload, _id: `visit-${Date.now()}` };
      }

      if (name === "error_reports") {
        return { ...payload, _id: `error-${Date.now()}` };
      }

      return { ...payload, _id: `doc-${Date.now()}` };
    },
    findOne: async (filter = {}) => {
      if (name !== "registration_coll") return null;
      return (
        [...appState.users.values()].find((user) =>
          Object.entries(filter).every(([key, value]) => {
            const actual = user[key];
            if (value === null) return actual === null || actual === undefined;
            return actual === value;
          }),
        ) || null
      );
    },
    find: async (filter = {}) => {
      if (name === "student_data") {
        if (Object.keys(filter).length === 0) return [...appState.records];
        return appState.records.filter((record) => record.rno === filter.rno);
      }
      if (name === "registration_coll") return [...appState.users.values()];
      return [];
    },
    update: async (query, update) => {
      if (name === "registration_coll") {
        const user = [...appState.users.values()].find((item) =>
          Object.entries(query).every(([key, value]) => item[key] === value),
        );
        if (!user) return { ok: 0, matchedCount: 0 };
        Object.assign(user, update.$set);
        return { ok: 1, matchedCount: 1 };
      }

      if (name === "student_data") {
        const record = appState.records.find((item) => item.rno === query.rno);
        if (!record) return { ok: 0 };
        Object.assign(record, update.$set);
        return { ok: 1 };
      }

      return { ok: 1 };
    },
    remove: async (filter = {}) => {
      if (name === "registration_coll") {
        if (Object.keys(filter).length === 0) {
          const count = appState.users.size;
          appState.users.clear();
          return { deletedCount: count };
        }
        return { deletedCount: 0 };
      }

      if (name === "student_data") {
        if (Object.keys(filter).length === 0) {
          const count = appState.records.length;
          appState.records = [];
          return { deletedCount: count };
        }
        return { deletedCount: 0 };
      }

      return { deletedCount: 0 };
    },
  };
}

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "nodemailer") {
    return {
      createTransport: () => ({
        sendMail: async (mailOptions) => {
          appState.mail.push(mailOptions);
          return { accepted: [mailOptions.to] };
        },
      }),
    };
  }
  if (request === "connect-mongo") {
    return { default: { create: () => new sessionMiddleware.MemoryStore() } };
  }

  return originalLoad.apply(this, arguments);
};

function loadRouter() {
  delete require.cache[require.resolve("../routes/index")];
  return require("../routes/index");
}

let router = loadRouter();

function getHandler(pathname, method) {
  const route = router.stack.find(
    (layer) =>
      layer.route &&
      layer.route.path === pathname &&
      layer.route.methods[method.toLowerCase()],
  );
  return route && route.route.stack.at(-1).handle;
}

let app;

function buildApp() {
  const nextApp = express();
  const allowedCorsOrigins = new Set(
    String(process.env.CORS_ORIGINS || "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );

  nextApp.set("trust proxy", 1);
  nextApp.set("views", path.join(__dirname, "..", "views"));
  nextApp.set("view engine", "pug");
  nextApp.locals.components = registeredComponents.filter(
    (component) => !["LoginCard", "ForgotCard"].includes(component.name),
  );
  nextApp.locals.loginComponents = registeredComponents.filter(
    (component) => component.name === "LoginCard",
  );
  nextApp.locals.forgotComponents = registeredComponents.filter(
    (component) => component.name === "ForgotCard",
  );
  nextApp.disable("x-powered-by");
  nextApp.use(requestIdMiddleware);
  nextApp.use(timeout("30s"));
  nextApp.use((req, res, next) => {
    if (req.timedout) return next(new Error("ETIMEDOUT"));
    next();
  });
  nextApp.use(
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
  nextApp.use((req, res, next) => {
    res.locals.cspNonce = require("crypto").randomBytes(16).toString("base64");
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    next();
  });
  nextApp.use(compression());
  nextApp.use(
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
  const requestBodyParsers = {
    json: express.json({ limit: "2mb" }),
    urlencoded: express.urlencoded({ extended: false, limit: "2mb" }),
  };
  nextApp.use(requestBodyParsers.json);
  nextApp.use(requestBodyParsers.urlencoded);
  nextApp.use(mongoSanitize());
  nextApp.use(cookieParser());
  nextApp.use(
    express.static(path.join(__dirname, "..", "public"), { etag: true }),
  );
  nextApp.use("/components", (req, res, next) => {
    if (!/\.(css|js)$/.test(req.path)) return res.sendStatus(404);
    express.static(path.join(__dirname, "..", "components"), { etag: true })(
      req,
      res,
      next,
    );
  });
  nextApp.use(
    sessionMiddleware({
      name: "session",
      secret: process.env.SESSION_SECRET || "csrf-test-session-secret",
      cookie: {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        maxAge: 30 * 24 * 60 * 60 * 1000,
      },
      rolling: true,
      saveUninitialized: false,
      resave: false,
      store: new sessionMiddleware.MemoryStore(),
    }),
  );
  nextApp.use((req, res, next) => {
    const session = req.session || {};
    res.locals.flashMessages = [];
    req.flash = req.flash || (() => {});
    next();
  });
  nextApp.use(csrfProtection());
  function issueCsrfToken(req, res) {
    const csrfToken = req.csrfToken();
    res.locals.csrfToken = csrfToken;
    res.cookie("XSRF-TOKEN", csrfToken, {
      httpOnly: false,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    return csrfToken;
  }
  nextApp.locals.issueCsrfToken = issueCsrfToken;
  nextApp.use((req, res, next) => {
    issueCsrfToken(req, res);
    next();
  });
  nextApp.get("/test-csrf", (req, res) => {
    res.json({ csrfToken: res.locals.csrfToken });
  });
  nextApp.use(router);
  nextApp.use((req, res, next) =>
    next(Object.assign(new Error("Not Found"), { status: 404 })),
  );
  nextApp.use(errorHandler);
  return nextApp;
}

async function createCsrfAgent() {
  const agent = supertest.agent(app);
  const response = await agent.get("/test-csrf");
  return { agent, token: response.body.csrfToken };
}

function makeReq(overrides = {}) {
  const session = {
    regenerate: (callback) => callback(null),
    destroy: (callback) => callback(),
    ...(overrides.session || {}),
  };
  return {
    body: {},
    session,
    flash: () => {},
    ...overrides,
  };
}

function makeRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    view: undefined,
    viewData: undefined,
    redirectUrl: undefined,
  };

  res.status = function status(code) {
    this.statusCode = code;
    return this;
  };

  res.send = function send(body) {
    this.body = body;
    return this;
  };

  res.sendStatus = function sendStatus(code) {
    this.statusCode = code;
    return this;
  };

  res.json = function json(payload) {
    this.body = payload;
    return this;
  };

  res.render = function render(view, data) {
    this.view = view;
    this.viewData = data;
    return this;
  };

  res.redirect = function redirect(url) {
    this.redirectUrl = url;
    this.statusCode = 302;
    this.headers.location = url;
    return this;
  };

  return res;
}

describe("Application route validation", { concurrency: false }, () => {
  beforeEach(() => {
    router = loadRouter();
    resetState();
    app = buildApp();
  });

  test("GET / renders the sign-in page", async () => {
    const handler = getHandler("/", "get");
    const res = makeRes();

    await handler(makeReq(), res);

    assert.equal(res.view, "signLog_net");
  });

  test("GET /health reports Mongo readiness and process diagnostics", async () => {
    const response = await supertest(app).get("/health");
    assert.equal(response.status, 503);
    assert.equal(response.body.status, "degraded");
    assert.equal(response.body.mongo.state, "disconnected");
    assert.equal(typeof response.body.uptime, "number");
    assert.equal(typeof response.body.memory.heapUsed, "number");
    assert.equal(response.body.env, "test");
  });

  test("responses negotiate Brotli and gzip compression", async () => {
    const brotli = await supertest(app).get("/").set("Accept-Encoding", "br");
    assert.equal(brotli.status, 200);
    assert.equal(brotli.headers["content-encoding"], "br");
    assert.match(brotli.text, /GBR \| Mobile Storage Application/);

    const gzip = await supertest(app).get("/").set("Accept-Encoding", "gzip");
    assert.equal(gzip.status, 200);
    assert.equal(gzip.headers["content-encoding"], "gzip");
    assert.match(gzip.text, /GBR \| Mobile Storage Application/);
  });

  test("configurable body parsers accept a complete 2 MB URL-encoded form", async () => {
    assert.deepEqual(getBodyParserLimits({}), {
      jsonLimitMb: 1,
      formLimitMb: 5,
      parameterLimit: 1000,
    });
    const parsers = createBodyParsers(express, {
      JSON_LIMIT_MB: "3",
      FORM_LIMIT_MB: "5",
      PARAMETER_LIMIT: "1000",
    });
    const parserApp = express();
    parserApp.use(parsers.json);
    parserApp.use(parsers.urlencoded);
    parserApp.post("/body-check", (req, res) =>
      res.json({ payloadLength: req.body.payload.length }),
    );

    const payload = "x".repeat(2 * 1024 * 1024);
    const response = await supertest(parserApp)
      .post("/body-check")
      .type("form")
      .send(`payload=${payload}`);
    assert.equal(response.status, 200);
    assert.equal(response.body.payloadLength, payload.length);
  });

  test("auth pages load only their registered component assets", async () => {
    const login = await supertest(app).get("/");
    assert.equal(login.status, 200);
    assert.match(login.text, /\/components\/LoginCard\/login-card\.css/);
    assert.match(login.text, /\/components\/LoginCard\/login-card\.js/);
    assert.doesNotMatch(login.text, /\/components\/Sidebar\//);

    const forgot = await supertest(app).get("/forgot");
    assert.equal(forgot.status, 200);
    assert.match(forgot.text, /\/components\/ForgotCard\/forgot-card\.css/);
    assert.match(forgot.text, /\/components\/ForgotCard\/forgot-card\.js/);
    assert.doesNotMatch(forgot.text, /\/components\/Navbar\//);
  });

  test("dashboard KPI cards include trend deltas and sparkline markup", () => {
    const html = pug.renderFile(
      path.join(__dirname, "..", "views", "home.pug"),
      {
        components: [],
        darkMode: false,
        csrfToken: "test-token",
        cspNonce: "test-nonce",
        data: [],
        data1: [],
        data2: [],
        data3: [],
        deletedData: [],
        deletedCount: 0,
        count: 42,
        count1: 18,
        count2: 24,
        dashboardKpis: {
          total: { delta: 12, sparkline: "0,8,6,10,9,12,10,13,14,15" },
          atOffice: { delta: -6, sparkline: "14,13,12,11,10,12,11,9,8,7" },
          returned: { delta: 18, sparkline: "2,3,4,6,5,8,10,12,13,14" },
        },
        previousLogin: null,
      },
    );

    assert.match(html, /class="trend-badge positive"/i);
    assert.match(html, /class="sparkline"/i);
    assert.match(html, /vs last 30 days/i);
  });

  test("dashboard heatmap renders a GitHub-style calendar grid", () => {
    const html = pug.renderFile(
      path.join(__dirname, "..", "views", "home.pug"),
      {
        components: [],
        darkMode: false,
        csrfToken: "test-token",
        cspNonce: "test-nonce",
        data: [],
        data1: [],
        data2: [],
        data3: [],
        deletedData: [],
        deletedCount: 0,
        count: 42,
        count1: 18,
        count2: 24,
        dashboardKpis: {
          total: { delta: 12, sparkline: "0,8,6,10,9,12,10,13,14,15" },
          atOffice: { delta: -6, sparkline: "14,13,12,11,10,12,11,9,8,7" },
          returned: { delta: 18, sparkline: "2,3,4,6,5,8,10,12,13,14" },
        },
        dashboardHeatmap: [
          { date: "2026-09-01", count: 0 },
          { date: "2026-09-02", count: 2 },
          { date: "2026-09-03", count: 4 },
        ],
        previousLogin: null,
      },
    );

    assert.match(html, /dashboard-heatmap/i);
    assert.match(html, /heatmap-day/i);
    assert.match(html, /12 month activity/i);
  });

  test("dashboard repeat offenders card renders rank list and counts", () => {
    const html = pug.renderFile(
      path.join(__dirname, "..", "views", "home.pug"),
      {
        components: [],
        darkMode: false,
        csrfToken: "test-token",
        cspNonce: "test-nonce",
        data: [],
        data1: [],
        data2: [],
        data3: [],
        deletedData: [],
        deletedCount: 0,
        count: 42,
        count1: 18,
        count2: 24,
        dashboardKpis: {},
        dashboardHeatmap: [],
        repeatOffenders: [
          { name: "Anjali Sharma", count: 6 },
          { name: "Rahul Nair", count: 4 },
        ],
        previousLogin: null,
      },
    );

    assert.match(html, /repeat-offenders/i);
    assert.match(html, /Anjali Sharma/i);
    assert.match(html, /6 times/i);
  });

  test("dashboard exposes loading skeleton placeholders for data and tables", () => {
    const html = pug.renderFile(
      path.join(__dirname, "..", "views", "home.pug"),
      {
        components: [],
        darkMode: false,
        csrfToken: "test-token",
        cspNonce: "test-nonce",
        data: [],
        data1: [],
        data2: [],
        data3: [],
        deletedData: [],
        deletedCount: 0,
        count: 0,
        count1: 0,
        count2: 0,
        dashboardKpis: {},
        dashboardHeatmap: [],
        previousLogin: null,
      },
    );

    assert.match(html, /dashboard-loading-skeleton/i);
    assert.match(html, /table-loading-skeleton/i);
  });

  test("dashboard tables use mobile-safe overflow and responsive settings", () => {
    const dataTableSource = fs.readFileSync(
      path.join(__dirname, "..", "components", "DataTable", "data-table.js"),
      "utf8",
    );
    const cssSource = fs.readFileSync(
      path.join(__dirname, "..", "components", "DataTable", "data-table.css"),
      "utf8",
    );

    assert.match(dataTableSource, /responsive:\s*true/i);
    assert.match(dataTableSource, /scrollX:\s*true/i);
    assert.match(cssSource, /overflow-x:\s*auto/i);
    assert.match(cssSource, /@media\s*\(max-width:\s*768px\)/i);
  });

  test("auth and dashboard stat cards use a mobile-safe stacked layout", () => {
    const loginCss = fs.readFileSync(
      path.join(__dirname, "..", "components", "LoginCard", "login-card.css"),
      "utf8",
    );
    const statCss = fs.readFileSync(
      path.join(__dirname, "..", "components", "StatCard", "stat-card.css"),
      "utf8",
    );

    assert.match(loginCss, /@media\s*\(max-width:\s*480px\)/i);
    assert.match(loginCss, /overflow:\s*auto/i);
    assert.match(loginCss, /auth-wrapper\s*\{[^}]*width:\s*min\(100%/is);
    assert.match(statCss, /@media\s*\(max-width:\s*480px\)/i);
    assert.match(statCss, /grid-template-columns:\s*1fr/i);
  });

  test("toast and session warning stay within mobile viewport bounds", () => {
    const toastCss = fs.readFileSync(
      path.join(__dirname, "..", "components", "Toast", "toast.css"),
      "utf8",
    );
    const sessionCss = fs.readFileSync(
      path.join(
        __dirname,
        "..",
        "components",
        "SessionWarning",
        "session-warning.css",
      ),
      "utf8",
    );

    assert.match(toastCss, /max-width:\s*95vw/i);
    assert.match(
      toastCss,
      /word-break:\s*break-word|overflow-wrap:\s*anywhere/i,
    );
    assert.match(sessionCss, /@media\s*\(max-width:\s*480px\)/i);
    assert.match(sessionCss, /width:\s*min\(90vw,\s*380px\)|width:\s*90vw/i);
  });

  test("dashboard component tree renders in light and dark modes", () => {
    const componentRegistry = require("../components/registry");
    const components = componentRegistry.filter(
      (component) => !["LoginCard", "ForgotCard"].includes(component.name),
    );
    const template = require.resolve("../views/home.pug");
    const requiredMarkup = [
      'id="darkModeToggle"',
      'id="example2"',
      'id="example3"',
      'id="example4"',
      'id="recycleBinTable"',
      'id="smartSearch"',
      'id="contact"',
      'id="help"',
      'id="totp-security-modal"',
      'id="toast-container"',
      'id="confirm-modal"',
      'id="record-detail-modal"',
      'id="record-detail-status-history"',
      'id="record-detail-return-history"',
      'id="intake-wizard"',
      'id="intake-step-indicator"',
      'id="intake-next-step"',
      'id="mobile-sidebar-backdrop"',
      'id="live-clock"',
      'id="analytics-panel"',
      'href="#analytics"',
    ];
    const toastMarkup =
      'id="toast-container" role="status" aria-live="polite" aria-atomic="true"';

    for (const component of componentRegistry) {
      const basename = path.basename(component.css, ".css");
      const partial = path.join(
        __dirname,
        "..",
        "components",
        component.name,
        `${basename}.pug`,
      );
      assert.doesNotThrow(() => pug.compileFile(partial), component.name);
    }

    for (const darkMode of [false, true]) {
      const html = pug.renderFile(template, {
        components,
        darkMode,
        csrfToken: "test-token",
        cspNonce: "test-nonce",
        data: [],
        data1: [],
        data2: [],
        data3: [],
        deletedData: [],
        deletedCount: 0,
        count: 0,
        count1: 0,
        count2: 0,
        previousLogin: null,
      });
      assert.match(
        html,
        darkMode ? /class="home-body dark-mode"/ : /class="home-body"/,
      );
      for (const markup of requiredMarkup)
        assert.ok(html.includes(markup), markup);
      assert.ok(html.includes(toastMarkup), "toast live region markup");
      assert.ok(html.includes('id="sidebar"'), "sidebar id");
      assert.ok(html.includes('role="navigation"'), "sidebar navigation role");
      assert.ok(
        html.includes('aria-label="Primary navigation"'),
        "sidebar accessible name",
      );
      assert.ok(
        html.includes('aria-hidden="false"'),
        "sidebar visibility state",
      );
    }
  });

  test("component assets render on the dashboard and Pug source stays private", async () => {
    const agent = supertest.agent(app);
    const assetIp = "198.51.100.240";
    let token = (
      await agent.get("/").set("X-Forwarded-For", assetIp)
    ).text.match(/name="csrf-token" content="([^"]+)"/)[1];
    const email = "component-assets@example.com";
    const signup = await agent
      .post("/postsignup")
      .set("X-Forwarded-For", assetIp)
      .set("X-CSRF-Token", token)
      .send({ email, pwd: "Amber!Comet42Velvet" });
    assert.equal(signup.status, 204);

    const verificationToken = appState.mail
      .at(-1)
      .text.match(/verify-email\?token=([a-f0-9]{64})/i)[1];
    const verified = await agent
      .get(`/verify-email?token=${verificationToken}`)
      .set("X-Forwarded-For", assetIp);
    assert.equal(verified.status, 200);

    token = (await agent.get("/").set("X-Forwarded-For", assetIp)).text.match(
      /name="csrf-token" content="([^"]+)"/,
    )[1];
    const login = await agent
      .post("/postlogin")
      .set("X-Forwarded-For", assetIp)
      .set("X-CSRF-Token", token)
      .send({ email, pwd: "Amber!Comet42Velvet" });
    assert.equal(login.status, 204, login.text);

    const home = await agent.get("/home").set("X-Forwarded-For", assetIp);
    assert.equal(home.status, 200);
    assert.match(home.text, /\/components\/Navbar\/navbar\.css/);
    assert.match(home.text, /\/components\/DataTable\/data-table\.js/);
    assert.match(home.text, /stat-card-component/);
    assert.match(home.text, /data-table-component/);
    assert.doesNotMatch(
      home.text,
      /javascripts\/(?:features|common-scripts)\.js/,
    );

    for (const asset of [
      "/components/Shared/shared.css",
      "/components/Sidebar/sidebar.css",
      "/components/DataTable/data-table.css",
      "/components/Navbar/navbar.js",
    ]) {
      const response = await agent.get(asset);
      assert.equal(response.status, 200, asset);
      assert.ok(response.text.length > 0, asset);
    }
    const pugSource = await agent.get("/components/Navbar/navbar.pug");
    assert.equal(pugSource.status, 404);
  });

  test("central error middleware serves HTML and JSON 404 responses", async () => {
    const htmlResponse = await supertest(app).get("/missing-resource");
    assert.equal(htmlResponse.status, 404);
    assert.match(htmlResponse.text, /Back to Home/);
    assert.match(htmlResponse.text, /Not Found/);
    assert.match(
      htmlResponse.text,
      new RegExp(
        `Request ID: <code>${htmlResponse.headers["x-request-id"]}</code>`,
      ),
    );

    const jsonResponse = await supertest(app)
      .get("/api/missing-resource")
      .set("Accept", "application/json");
    assert.equal(jsonResponse.status, 404);
    assert.equal(jsonResponse.body.error, "Not Found");
    assert.equal(
      jsonResponse.body.requestId,
      jsonResponse.headers["x-request-id"],
    );

    const legacyUsersResponse = await supertest(app)
      .get("/users")
      .set("Accept", "application/json");
    assert.equal(legacyUsersResponse.status, 404);
    assert.equal(legacyUsersResponse.body.error, "Not Found");
    assert.equal(
      legacyUsersResponse.body.requestId,
      legacyUsersResponse.headers["x-request-id"],
    );
  });

  test("request IDs propagate through asynchronous handlers", async () => {
    const contextApp = express();
    contextApp.use(requestIdMiddleware);
    contextApp.get("/trace", async (req, res) => {
      await Promise.resolve();
      res.json({ id: req.id, contextId: getRequestId() });
    });

    const suppliedId = await supertest(contextApp)
      .get("/trace")
      .set("X-Request-Id", "client-trace-123");
    assert.equal(suppliedId.headers["x-request-id"], "client-trace-123");
    assert.deepEqual(suppliedId.body, {
      id: "client-trace-123",
      contextId: "client-trace-123",
    });

    const generatedId = await supertest(contextApp).get("/trace");
    assert.match(generatedId.headers["x-request-id"], /^[a-f0-9]{16}$/);
    assert.equal(generatedId.body.contextId, generatedId.body.id);
  });

  test("slow routes return 504 Gateway Timeout after the request window", async () => {
    const timeoutApp = express();
    timeoutApp.use(requestIdMiddleware);
    timeoutApp.use(timeout("1ms"));
    timeoutApp.get("/slow", (req, res) => {
      setTimeout(() => {
        if (req.timedout) return;
        return res.json({ ok: true });
      }, 25);
    });
    timeoutApp.use((error, req, res, next) => {
      if (req.timedout || (error && error.code === "ETIMEDOUT")) {
        return res
          .status(504)
          .json({ error: "Gateway Timeout", requestId: req.id });
      }
      next(error);
    });

    const response = await supertest(timeoutApp).get("/slow");
    assert.equal(response.status, 504);
    assert.equal(response.body.error, "Gateway Timeout");
    assert.match(response.body.requestId, /^[a-f0-9]{16}$/);
  });

  test("async route rejections reach Express error middleware", async () => {
    const asyncRouter = wrapAsyncHandlers(express.Router());
    asyncRouter.get("/async-failure", async () => {
      throw new Error("async route failure");
    });
    const asyncApp = express();
    asyncApp.use(asyncRouter);
    asyncApp.use((error, req, res, next) => {
      res.status(503).json({ error: error.message });
    });

    const response = await supertest(asyncApp).get("/async-failure");
    assert.equal(response.status, 503);
    assert.deepEqual(response.body, { error: "async route failure" });
  });

  test("fatal process errors close the HTTP server before exiting", () => {
    const processEvents = new EventEmitter();
    const events = [];
    const server = {
      listening: true,
      close(callback) {
        events.push("close");
        callback();
      },
    };
    const timer = { unref() {} };
    installProcessErrorHandlers({
      server,
      processObject: processEvents,
      logger: { error: () => events.push("log") },
      exit: (code) => events.push(`exit:${code}`),
      setTimeoutFn: () => timer,
      clearTimeoutFn: () => events.push("clear-timeout"),
    });

    assert.equal(processEvents.listenerCount("uncaughtException"), 1);
    assert.equal(processEvents.listenerCount("unhandledRejection"), 1);
    processEvents.emit("unhandledRejection", new Error("async failure"));
    assert.deepEqual(events, ["log", "close", "clear-timeout", "exit:1"]);
  });

  test("POST /postsignup creates a valid account and rejects duplicates", async () => {
    const signup = getHandler("/postsignup", "post");
    const verifyEmail = getHandler("/verify-email", "get");

    const firstReq = makeReq({
      body: { email: "demo@example.com", pwd: "Amber!Comet42Velvet" },
    });
    const firstRes = makeRes();
    await signup(firstReq, firstRes);

    assert.equal(firstRes.statusCode, 204);
    assert.equal(appState.mail[0].to, "demo@example.com");
    assert.match(appState.mail[0].subject, /verify/i);
    const token = appState.mail[0].text.match(
      /verify-email\?token=([a-f0-9]{64})/i,
    )[1];
    const verificationRes = makeRes();
    await verifyEmail(makeReq({ query: { token } }), verificationRes);
    assert.equal(verificationRes.statusCode, 200);

    const duplicateReq = makeReq({
      body: { email: "demo@example.com", pwd: "Amber!Comet42Velvet" },
    });
    const duplicateRes = makeRes();
    await signup(duplicateReq, duplicateRes);

    assert.equal(duplicateRes.statusCode, 204);
    assert.equal(duplicateRes.body, undefined);
    assert.match(appState.mail[1].subject, /welcome back/i);
  });

  test("signup and reset reject common or weak passwords", async () => {
    const signup = getHandler("/postsignup", "post");
    const reset = getHandler("/postreset", "post");

    const commonSignup = makeRes();
    await signup(
      makeReq({ body: { email: "common@example.com", pwd: "password123" } }),
      commonSignup,
    );
    assert.equal(commonSignup.statusCode, 400);
    assert.match(String(commonSignup.body), /common/i);

    const weakSignup = makeRes();
    await signup(
      makeReq({ body: { email: "weak@example.com", pwd: "lowercase2026!" } }),
      weakSignup,
    );
    assert.equal(weakSignup.statusCode, 400);
    assert.match(String(weakSignup.body), /mixed case/i);

    const weakPasswords = [
      ["UPPERCASE2026!", /mixed case/i],
      ["NoNumber!Password", /number/i],
      ["NoSymbol2026Ab", /symbol/i],
    ];
    for (let index = 0; index < weakPasswords.length; index += 1) {
      const [password, expectedMessage] = weakPasswords[index];
      const response = makeRes();
      await signup(
        makeReq({
          body: { email: `weak-${index}@example.com`, pwd: password },
        }),
        response,
      );
      assert.equal(response.statusCode, 400);
      assert.match(String(response.body), expectedMessage);
    }

    const commonReset = makeRes();
    await reset(
      makeReq({
        body: {
          email: "common@example.com",
          otp: "000000",
          pwd: "password123",
        },
      }),
      commonReset,
    );
    assert.equal(commonReset.statusCode, 400);
    assert.match(String(commonReset.body), /common/i);

    const weakReset = makeRes();
    await reset(
      makeReq({
        body: {
          email: "weak@example.com",
          otp: "000000",
          pwd: "lowercase2026!",
        },
      }),
      weakReset,
    );
    assert.equal(weakReset.statusCode, 400);
    assert.match(String(weakReset.body), /mixed case/i);
  });

  test("POST /postlogin authenticates a user and sets the session", async () => {
    const signup = getHandler("/postsignup", "post");
    const login = getHandler("/postlogin", "post");

    await signup(
      makeReq({
        body: { email: "alice@example.com", pwd: "Amber!Comet42Velvet" },
      }),
      makeRes(),
    );

    const req = makeReq({
      body: {
        email: "alice@example.com",
        pwd: "Amber!Comet42Velvet",
        uname: "Alice",
      },
      session: {
        regenerate: (callback) => callback(null),
      },
    });
    const res = makeRes();
    await login(req, res);

    assert.equal(res.statusCode, 204);
    assert.equal(req.session.user.email, "alice@example.com");
  });

  test("GET /api/records accepts authenticated DataTables paging parameters", async () => {
    const create = getHandler("/hh", "post");
    const recordSession = {
      user: { id: "datatable-user", email: "datatable-http@example.com" },
    };
    for (const [index, date] of [
      "2026-02-01",
      "2026-02-02",
      "2026-02-03",
    ].entries()) {
      await create(
        makeReq({
          session: recordSession,
          body: {
            Date: date,
            Time: "10:00",
            sname: "HttpPageMarker",
            rno: `HTTP${index + 1}`,
            clg: "ABC College",
            brch: "CSE",
            year: "2",
            sec: "A",
            mmodel: "Phone Model",
            imei: `22345678901234${index}`,
          },
        }),
        makeRes(),
      );
    }

    await getHandler("/postsignup", "post")(
      makeReq({
        body: {
          email: "datatable-http@example.com",
          pwd: "Amber!Comet42Velvet",
        },
      }),
      makeRes(),
    );
    const agent = supertest.agent(app);
    const csrfToken = (await agent.get("/")).text.match(
      /name="csrf-token" content="([^"]+)"/,
    )[1];
    const login = await agent
      .post("/postlogin")
      .set("X-CSRF-Token", csrfToken)
      .send({
        email: "datatable-http@example.com",
        pwd: "Amber!Comet42Velvet",
      });
    assert.equal(login.status, 204);

    const response = await agent.get("/api/records").query({
      draw: 29,
      start: 0,
      length: 1,
      status: "At_office",
      "search[value]": "HttpPageMarker",
      "order[0][column]": 0,
      "order[0][dir]": "desc",
      "columns[0][data]": "Date",
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.draw, 29);
    assert.equal(response.body.recordsFiltered, 3);
    assert.equal(response.body.data.length, 1);
    assert.equal(response.body.data[0].Date, "2026-02-03");
  });

  test("Record detail modal exposes a device-photo gallery contract", () => {
    const totalListMarkup = fs.readFileSync(
      path.join(__dirname, "..", "components", "DataTable", "total-list.pug"),
      "utf8",
    );
    const detailModalMarkup = fs.readFileSync(
      path.join(__dirname, "..", "components", "RecordDetailModal", "record-detail-modal.pug"),
      "utf8",
    );

    assert.match(totalListMarkup, /data-device-photos=/);
    assert.match(detailModalMarkup, /record-detail-photo-gallery|record-detail-photo/);
  });

  test("POST /hh accepts uploaded device photos and stores them on the record", async () => {
    const signup = getHandler("/postsignup", "post");
    const login = getHandler("/postlogin", "post");
    const create = getHandler("/hh", "post");

    await signup(
      makeReq({
        body: { email: "devicephoto@example.com", pwd: "Amber!Comet42Velvet" },
      }),
      makeRes(),
    );

    const session = {
      regenerate: (callback) => callback(null),
      user: undefined,
    };
    await login(
      makeReq({
        body: {
          email: "devicephoto@example.com",
          pwd: "Amber!Comet42Velvet",
          uname: "Device Photo User",
        },
        session,
      }),
      makeRes(),
    );

    const req = makeReq({
      body: {
        Date: "2026-09-21",
        Time: "10:20",
        sname: "Photo Student",
        spno: "9090909090",
        rno: "P120",
        clg: "ABC College",
        brch: "CSE",
        year: "2",
        sec: "A",
        pname: "Parent Photo",
        ppno: "8080808080",
        ename: "Employee Photo",
        epno: "7070707070",
        eid: "E220",
        rsn: "Device photographed during intake",
        mmodel: "Apple iPhone",
        imei: "123456789012345",
        mclr: "Silver",
        devicePhotos: [
          "/uploads/device-records/1.jpg",
          "/uploads/device-records/2.jpg",
        ],
      },
      session,
    });

    const res = makeRes();
    await create(req, res);

    assert.equal(res.statusCode, 302);
    const savedRecord = getRuntimeRecords().find((record) => record.rno === "P120");
    assert.ok(savedRecord);
    assert.deepEqual(savedRecord.devicePhotos, [
      "/uploads/device-records/1.jpg",
      "/uploads/device-records/2.jpg",
    ]);
  });

  test("POST /change rejects incomplete return acknowledgement payloads", async () => {
    const signup = getHandler("/postsignup", "post");
    const login = getHandler("/postlogin", "post");
    const create = getHandler("/hh", "post");
    const change = getHandler("/change", "post");

    await signup(
      makeReq({
        body: { email: "returnvalidation@example.com", pwd: "Amber!Comet42Velvet" },
      }),
      makeRes(),
    );

    const session = {
      regenerate: (callback) => callback(null),
      user: undefined,
    };
    await login(
      makeReq({
        body: {
          email: "returnvalidation@example.com",
          pwd: "Amber!Comet42Velvet",
          uname: "Return Validation User",
        },
        session,
      }),
      makeRes(),
    );

    const createReq = makeReq({
      body: {
        Date: "2026-09-23",
        Time: "09:00",
        sname: "Validation Student",
        spno: "9090909092",
        rno: "P140",
        clg: "ABC College",
        brch: "CSE",
        year: "2",
        sec: "A",
        pname: "Parent Validation",
        ppno: "8080808082",
        ename: "Employee Validation",
        epno: "7070707072",
        eid: "E240",
        rsn: "Sign off validation record",
        mmodel: "Samsung A40",
        imei: "123456789012347",
        mclr: "Black",
      },
      session,
    });
    const createRes = makeRes();
    await create(createReq, createRes);
    const recordId = getRuntimeRecords().find((record) => record.rno === "P140")._id;

    const invalidChangeRes = makeRes();
    await change(
      makeReq({
        body: {
          _id: recordId,
          returnedBy: "",
          returnRelation: "Parent",
          returnedAt: "2026-09-23T09:45",
        },
        session,
      }),
      invalidChangeRes,
    );

    assert.equal(invalidChangeRes.statusCode, 422);
    assert.equal(getRuntimeRecords().find((record) => record._id === recordId).status, "At_office");
  });

  test("POST /change records return acknowledgement details", async () => {
    const signup = getHandler("/postsignup", "post");
    const login = getHandler("/postlogin", "post");
    const create = getHandler("/hh", "post");
    const change = getHandler("/change", "post");

    await signup(
      makeReq({
        body: { email: "returnmeta@example.com", pwd: "Amber!Comet42Velvet" },
      }),
      makeRes(),
    );

    const session = {
      regenerate: (callback) => callback(null),
      user: undefined,
    };
    await login(
      makeReq({
        body: {
          email: "returnmeta@example.com",
          pwd: "Amber!Comet42Velvet",
          uname: "Return Meta User",
        },
        session,
      }),
      makeRes(),
    );

    const createReq = makeReq({
      body: {
        Date: "2026-09-22",
        Time: "12:00",
        sname: "Return Student",
        spno: "9090909091",
        rno: "P130",
        clg: "ABC College",
        brch: "CSE",
        year: "2",
        sec: "A",
        pname: "Parent Return",
        ppno: "8080808081",
        ename: "Employee Return",
        epno: "7070707071",
        eid: "E230",
        rsn: "Phone returned after parent pickup",
        mmodel: "Samsung A35",
        imei: "123456789012346",
        mclr: "Blue",
      },
      session,
    });
    const createRes = makeRes();
    await create(createReq, createRes);
    const recordId = getRuntimeRecords().find((record) => record.rno === "P130")._id;

    const changeRes = makeRes();
    await change(
      makeReq({
        body: {
          _id: recordId,
          returnedBy: "Parent Return",
          returnRelation: "Parent",
          returnedAt: "2026-09-22T12:40",
          returnNotes: "Signed and handed over on time.",
          returnSignature: "data:image/png;base64,signature-demo",
        },
        session,
      }),
      changeRes,
    );

    assert.equal(changeRes.redirectUrl, "/home");
    const returnedRecord = getRuntimeRecords().find((record) => record._id === recordId);
    assert.equal(returnedRecord.status, "Returned");
    assert.equal(returnedRecord.returnedBy, "Parent Return");
    assert.equal(returnedRecord.returnRelation, "Parent");
    assert.equal(returnedRecord.returnNotes, "Signed and handed over on time.");
    assert.equal(returnedRecord.returnSignature, "data:image/png;base64,signature-demo");
  });

  test("POST /hh applies a selected preset reason when creating a record", async () => {
    const signup = getHandler("/postsignup", "post");
    const login = getHandler("/postlogin", "post");
    const create = getHandler("/hh", "post");
    const listRecords = getHandler("/api/records", "get");

    await signup(
      makeReq({
        body: { email: "reasonpreset@example.com", pwd: "Amber!Comet42Velvet" },
      }),
      makeRes(),
    );

    const session = {
      regenerate: (callback) => callback(null),
      user: undefined,
    };
    await login(
      makeReq({
        body: {
          email: "reasonpreset@example.com",
          pwd: "Amber!Comet42Velvet",
          uname: "Reason Preset User",
        },
        session,
      }),
      makeRes(),
    );

    const createReq = makeReq({
      body: {
        Date: "2026-09-20",
        Time: "09:15",
        sname: "Preset Student",
        spno: "9999999999",
        rno: "P101",
        clg: "ABC College",
        brch: "CSE",
        year: "2",
        sec: "A",
        pname: "Parent Preset",
        ppno: "8888888888",
        ename: "Employee Preset",
        epno: "7777777777",
        eid: "E201",
        reasonPreset: "Used during class",
        rsn: "",
        mmodel: "Samsung Galaxy",
        imei: "123456789012345",
        mclr: "Black",
      },
      session,
    });
    const createRes = makeRes();
    await create(createReq, createRes);
    assert.equal(createRes.redirectUrl, "/home");

    const listRes = makeRes();
    await listRecords(
      makeReq({
        session,
        query: {
          draw: "1",
          start: "0",
          length: "10",
          status: "At_office",
          search: { value: "P101" },
        },
      }),
      listRes,
    );
    assert.equal(listRes.statusCode, 200);
    assert.equal(listRes.body.data[0].rsn, "Used during class");
  });

  test("POST /hh, /change, /edit, and /update manage the student record lifecycle", async () => {
    const signup = getHandler("/postsignup", "post");
    const login = getHandler("/postlogin", "post");
    const create = getHandler("/hh", "post");
    const edit = getHandler("/edit", "post");
    const change = getHandler("/change", "post");
    const update = getHandler("/update", "post");
    const listRecords = getHandler("/api/records", "get");

    await signup(
      makeReq({
        body: { email: "records@example.com", pwd: "Amber!Comet42Velvet" },
      }),
      makeRes(),
    );

    const session = {
      regenerate: (callback) => callback(null),
      user: undefined,
    };
    const loginReq = makeReq({
      body: {
        email: "records@example.com",
        pwd: "Amber!Comet42Velvet",
        uname: "Records User",
      },
      session,
    });
    await login(loginReq, makeRes());

    const createReq = makeReq({
      body: {
        Date: "2026-09-18",
        Time: "10:00",
        sname: "Student One",
        spno: "9999999999",
        rno: "A101",
        clg: "ABC College",
        brch: "CSE",
        year: "2",
        sec: "A",
        pname: "Parent One",
        ppno: "8888888888",
        ename: "Emergency One",
        epno: "7777777777",
        eid: "E101",
        rsn: "Lost phone",
        mmodel: "iPhone 15",
        imei: "123456789012345",
        mclr: "Blue",
      },
      session,
    });
    const createRes = makeRes();
    await create(createReq, createRes);
    assert.equal(createRes.redirectUrl, "/home");

    const listRes = makeRes();
    await listRecords(
      makeReq({
        session,
        query: {
          draw: "1",
          start: "0",
          length: "10",
          status: "At_office",
          search: { value: "A101" },
        },
      }),
      listRes,
    );
    const recordId = listRes.body.data[0]._id;

    const editReq = makeReq({ body: { _id: recordId }, session });
    const editRes = makeRes();
    await edit(editReq, editRes);
    assert.equal(editRes.statusCode, 200);
    assert.equal(editRes.body.rno, "A101");
    assert.deepEqual(
      Object.keys(editRes.body).sort(),
      [
        "Date",
        "Time",
        "__v",
        "_id",
        "clg",
        "brch",
        "eid",
        "ename",
        "epno",
        "imei",
        "mclr",
        "mmodel",
        "pname",
        "ppno",
        "receiptNo",
        "rno",
        "rsn",
        "sec",
        "sname",
        "spno",
        "status",
        "year",
      ].sort(),
    );

    const missingEditRes = makeRes();
    await edit(
      makeReq({ body: { _id: "000000000000000000000099" }, session }),
      missingEditRes,
    );
    assert.equal(missingEditRes.statusCode, 404);

    const changeReq = makeReq({ body: { _id: recordId }, session });
    const changeRes = makeRes();
    await change(changeReq, changeRes);
    assert.equal(changeRes.redirectUrl, "/home");

    const returnedListRes = makeRes();
    await listRecords(
      makeReq({
        session,
        query: {
          draw: "1",
          start: "0",
          length: "10",
          status: "Returned",
          search: { value: "A101" },
        },
      }),
      returnedListRes,
    );
    const returnedRecord = returnedListRes.body.data[0];
    assert.equal(returnedRecord.statusChangedBy, session.user.email);
    assert.ok(returnedRecord.statusChangedAt instanceof Date);

    const missingReturnRes = makeRes();
    await change(
      makeReq({
        body: { _id: "000000000000000000000099" },
        session,
      }),
      missingReturnRes,
    );
    assert.equal(missingReturnRes.statusCode, 404);

    const updateReq = makeReq({
      body: {
        _id: recordId,
        Date: "2026-09-18",
        Time: "12:00",
        sname: "Student One Updated",
        spno: "9999999999",
        rno: "A101",
        clg: "ABC College",
        brch: "CSE",
        year: "2",
        sec: "A",
        pname: "Parent One",
        ppno: "8888888888",
        ename: "Emergency One",
        epno: "7777777777",
        eid: "E101",
        rsn: "Recovered",
        mmodel: "iPhone 16",
        imei: "123456789012345",
        mclr: "Blue",
      },
      session,
    });
    const updateRes = makeRes();
    await update(updateReq, updateRes);
    assert.equal(updateRes.redirectUrl, "/home");
  });

  test("password reset leaves the old password valid and consumes its OTP once", async () => {
    const signup = getHandler("/postsignup", "post");
    const forgot = getHandler("/postforgot", "post");
    const reset = getHandler("/postreset", "post");
    const login = getHandler("/postlogin", "post");

    await signup(
      makeReq({
        body: { email: "forgot@example.com", pwd: "Amber!Comet42Velvet" },
      }),
      makeRes(),
    );

    const res = makeRes();
    await forgot(makeReq({ body: { email: "forgot@example.com" } }), res);

    assert.equal(res.statusCode, 204);
    const resetMail = appState.mail.find((mail) =>
      /reset code/i.test(mail.subject),
    );
    assert.equal(
      appState.mail.filter((mail) => /reset code/i.test(mail.subject)).length,
      1,
    );
    assert.equal(resetMail.to, "forgot@example.com");
    assert.match(resetMail.text, /\b\d{6}\b/);

    const oldPasswordRes = makeRes();
    await login(
      makeReq({
        body: { email: "forgot@example.com", pwd: "Amber!Comet42Velvet" },
      }),
      oldPasswordRes,
    );
    assert.equal(oldPasswordRes.statusCode, 204);

    const otp = resetMail.text.match(/\b\d{6}\b/)[0];
    let resetSessionRegenerated = false;
    const resetSession = {
      user: { id: "user-reset", email: "forgot@example.com" },
      regenerate(callback) {
        resetSessionRegenerated = true;
        delete this.user;
        callback(null);
      },
    };
    const reusedPasswordRes = makeRes();
    await reset(
      makeReq({
        body: { email: "forgot@example.com", otp, pwd: "Amber!Comet42Velvet" },
      }),
      reusedPasswordRes,
    );
    assert.equal(reusedPasswordRes.statusCode, 400);
    assert.match(String(reusedPasswordRes.body), /Cannot reuse/i);

    const resetRes = makeRes();
    await reset(
      makeReq({
        body: { email: "forgot@example.com", otp, pwd: "Reset!Comet54Velvet" },
        session: resetSession,
      }),
      resetRes,
    );
    assert.equal(resetRes.statusCode, 204);
    assert.equal(resetSessionRegenerated, true);
    assert.equal(resetSession.user, undefined);

    const newPasswordRes = makeRes();
    await login(
      makeReq({
        body: { email: "forgot@example.com", pwd: "Amber!Comet42Velvet" },
      }),
      newPasswordRes,
    );
    assert.equal(newPasswordRes.statusCode, 401);
    const resetPasswordLogin = makeRes();
    await login(
      makeReq({
        body: { email: "forgot@example.com", pwd: "Reset!Comet54Velvet" },
      }),
      resetPasswordLogin,
    );
    assert.equal(resetPasswordLogin.statusCode, 204);

    const reusedRes = makeRes();
    await reset(
      makeReq({
        body: { email: "forgot@example.com", otp, pwd: "Other!Comet93Velvet" },
      }),
      reusedRes,
    );
    assert.equal(reusedRes.statusCode, 400);
  });

  test("expired password reset OTPs are rejected", async () => {
    const signup = getHandler("/postsignup", "post");
    const forgot = getHandler("/postforgot", "post");
    const reset = getHandler("/postreset", "post");
    const email = "expired-reset@example.com";
    await signup(
      makeReq({ body: { email, pwd: "Amber!Comet42Velvet" } }),
      makeRes(),
    );
    await forgot(makeReq({ body: { email } }), makeRes());

    const otp = appState.mail
      .find((mail) => /reset code/i.test(mail.subject))
      .text.match(/\b\d{6}\b/)[0];
    const realNow = Date.now;
    Date.now = () => realNow() + 11 * 60 * 1000;
    const expiredRes = makeRes();
    try {
      await reset(
        makeReq({ body: { email, otp, pwd: "Amber!Comet42Velvet" } }),
        expiredRes,
      );
    } finally {
      Date.now = realNow;
    }
    assert.equal(expiredRes.statusCode, 400);
  });

  test("POST /postlogin locks an IP for one hour after five failed attempts", async () => {
    const ip = "198.51.100.31";
    const { agent, token } = await createCsrfAgent();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await agent
        .post("/postlogin")
        .set("X-Forwarded-For", ip)
        .set("X-CSRF-Token", token)
        .send({ email: "invalid", pwd: "bad" });
      assert.equal(response.status, 422);
      assert.ok(response.body.errors.some((error) => error.field === "email"));
    }

    const limitedResponse = await agent
      .post("/postlogin")
      .set("X-Forwarded-For", ip)
      .set("X-CSRF-Token", token)
      .send({ email: "invalid", pwd: "bad" });
    assert.equal(limitedResponse.status, 429);
    assert.ok(limitedResponse.body.retryAfter > 59 * 60 * 1000);

    const lockedResponse = await agent
      .post("/postlogin")
      .set("X-Forwarded-For", ip)
      .set("X-CSRF-Token", token)
      .send({ email: "invalid", pwd: "bad" });
    assert.equal(lockedResponse.status, 429);
    assert.ok(lockedResponse.body.retryAfter > 0);
  });

  test("POST /postsignup and /postforgot return 429 with retryAfter", async () => {
    const signupIp = "198.51.100.32";
    const signupClient = await createCsrfAgent();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await signupClient.agent
        .post("/postsignup")
        .set("X-Forwarded-For", signupIp)
        .set("X-CSRF-Token", signupClient.token)
        .send({ email: "invalid", pwd: "bad" });
      assert.equal(response.status, 422);
      assert.ok(Array.isArray(response.body.errors));
    }
    const signupLimited = await signupClient.agent
      .post("/postsignup")
      .set("X-Forwarded-For", signupIp)
      .set("X-CSRF-Token", signupClient.token)
      .send({ email: "invalid", pwd: "bad" });
    assert.equal(signupLimited.status, 429);
    assert.ok(signupLimited.body.retryAfter > 0);

    const forgotIp = "198.51.100.33";
    const forgotClient = await createCsrfAgent();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await forgotClient.agent
        .post("/postforgot")
        .set("X-Forwarded-For", forgotIp)
        .set("X-CSRF-Token", forgotClient.token)
        .send({ email: "invalid" });
      assert.equal(response.status, 422);
      assert.equal(response.body.errors[0].field, "email");
    }
    const forgotLimited = await forgotClient.agent
      .post("/postforgot")
      .set("X-Forwarded-For", forgotIp)
      .set("X-CSRF-Token", forgotClient.token)
      .send({ email: "invalid" });
    assert.equal(forgotLimited.status, 429);
    assert.ok(forgotLimited.body.retryAfter > 0);
  });

  test("accounts lock after repeated failed password attempts", async () => {
    const { agent, token } = await createCsrfAgent();
    const testIp = "198.51.100.240";
    const email = `lockout-${Date.now()}@example.com`;
    const password = "Amber!Comet42Velvet";

    const signup = await agent
      .post("/postsignup")
      .set("X-Forwarded-For", testIp)
      .set("X-CSRF-Token", token)
      .send({ email, pwd: password });
    assert.equal(signup.status, 204);

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const ip = `198.51.100.${240 + attempt}`;
      const response = await agent
        .post("/postlogin")
        .set("X-Forwarded-For", ip)
        .set("X-CSRF-Token", token)
        .send({ email, pwd: `Wrong-pass-${attempt}` });

      if (attempt < 5) {
        assert.equal(response.status, 401, JSON.stringify(response.body));
      } else {
        assert.equal(response.status, 429, JSON.stringify(response.body));
        assert.ok(response.body.retryAfter > 0);
        assert.match(
          String(response.body.error || ""),
          /locked|temporarily|retry/i,
        );
      }
    }

    const stillLocked = await agent
      .post("/postlogin")
      .set("X-Forwarded-For", "198.51.100.246")
      .set("X-CSRF-Token", token)
      .send({ email, pwd: password });
    assert.equal(stillLocked.status, 429, JSON.stringify(stillLocked.body));
    assert.ok(stillLocked.body.retryAfter > 0);
  });

  test("authenticated users can persist their dark mode preference", async () => {
    const { agent, token } = await createCsrfAgent();
    const testIp = "198.51.100.241";
    const email = `dark-mode-${Date.now()}@example.com`;
    const password = "Amber!Comet42Velvet";

    const signup = await agent
      .post("/postsignup")
      .set("X-Forwarded-For", testIp)
      .set("X-CSRF-Token", token)
      .send({ email, pwd: password });
    assert.equal(signup.status, 204);

    const login = await agent
      .post("/postlogin")
      .set("X-Forwarded-For", testIp)
      .set("X-CSRF-Token", token)
      .send({ email, pwd: password });
    assert.equal(login.status, 204);

    const home = await agent.get("/home").set("X-Forwarded-For", testIp);
    const nextToken = home.text.match(/name="csrf-token" content="([^"]+)"/)[1];

    const preferenceUpdate = await agent
      .post("/user/preferences")
      .set("X-Forwarded-For", testIp)
      .set("X-CSRF-Token", nextToken)
      .send({ darkMode: true });
    assert.equal(
      preferenceUpdate.status,
      200,
      JSON.stringify(preferenceUpdate.body),
    );
    assert.equal(preferenceUpdate.body.ok, true);
    assert.equal(preferenceUpdate.body.darkMode, true);
  });

  test("state-changing routes reject missing CSRF tokens", async () => {
    const { agent } = await createCsrfAgent();
    const routes = [
      "/postsignup",
      "/postlogin",
      "/postforgot",
      "/postreset",
      "/postlogin/totp",
      "/totp/setup",
      "/totp/confirm",
      "/totp/disable",
      "/hh",
      "/change",
      "/edit",
      "/update",
      "/delete",
    ];

    for (const route of routes) {
      const response = await agent.post(route).send({});
      assert.equal(
        response.status,
        403,
        `${route} should require a CSRF token`,
      );
    }
  });

  test("protected routes reject unauthenticated requests at middleware", async () => {
    const { agent, token } = await createCsrfAgent();
    const protectedPosts = [
      "/hh",
      "/change",
      "/edit",
      "/update",
      "/delete",
      "/totp/setup",
      "/totp/confirm",
      "/totp/disable",
    ];

    for (const route of protectedPosts) {
      const response = await agent
        .post(route)
        .set("X-CSRF-Token", token)
        .send({});
      assert.equal(
        response.status,
        401,
        `${route} should require authentication`,
      );
    }

    const totpStatus = await agent.get("/totp/status");
    assert.equal(totpStatus.status, 401);

    const home = await agent.get("/home");
    assert.equal(home.status, 302);
    assert.equal(home.headers.location, "/");
  });

  test("authenticated sessions are rejected when the user-agent fingerprint changes", async () => {
    const agent = supertest.agent(app);
    let csrfToken = (await agent.get("/")).text.match(
      /name="csrf-token" content="([^"]+)"/,
    )[1];
    const email = "fingerprint-check@example.com";
    const signup = await agent
      .post("/postsignup")
      .set("X-CSRF-Token", csrfToken)
      .send({ email, pwd: "Amber!Comet42Velvet" });
    assert.equal(signup.status, 204);

    csrfToken = (await agent.get("/")).text.match(
      /name="csrf-token" content="([^"]+)"/,
    )[1];
    const login = await agent
      .post("/postlogin")
      .set("X-CSRF-Token", csrfToken)
      .set("User-Agent", "Fingerprint Browser A")
      .send({ email, pwd: "Amber!Comet42Velvet" });
    assert.equal(login.status, 204);

    const changedDevice = await agent
      .get("/home")
      .set("User-Agent", "Fingerprint Browser B");
    assert.equal(changedDevice.status, 302);
    assert.equal(changedDevice.headers.location, "/");

    const ipAgent = supertest.agent(app);
    const ipLoginPage = await ipAgent
      .get("/")
      .set("User-Agent", "Fingerprint Browser A")
      .set("X-Forwarded-For", "198.51.100.70");
    const ipLogin = await ipAgent
      .post("/postlogin")
      .set(
        "X-CSRF-Token",
        ipLoginPage.text.match(/name="csrf-token" content="([^"]+)"/)[1],
      )
      .set("User-Agent", "Fingerprint Browser A")
      .set("X-Forwarded-For", "198.51.100.70")
      .send({ email, pwd: "Amber!Comet42Velvet" });
    assert.equal(ipLogin.status, 204);

    const changedIp = await ipAgent
      .get("/home")
      .set("User-Agent", "Fingerprint Browser A")
      .set("X-Forwarded-For", "198.51.100.71");
    assert.equal(changedIp.status, 302);
    assert.equal(changedIp.headers.location, "/");
  });

  test("a valid CSRF token allows an auth request", async () => {
    const { agent, token } = await createCsrfAgent();
    const response = await agent
      .post("/postsignup")
      .set("X-CSRF-Token", token)
      .send({ email: "csrf-valid@example.com", pwd: "Amber!Comet42Velvet" });

    assert.equal(response.status, 204);
  });

  test("v1 API uses JSON envelopes and advertises legacy successors", async () => {
    const { agent, token } = await createCsrfAgent();
    const apiIp = "198.51.100.230";
    const uniqueRno = `V1${Date.now().toString(36).toUpperCase()}`;
    const uniqueImei = `9${String(Date.now()).padStart(14, "0").slice(-14)}`;
    const unauthorized = await agent.get("/api/v1/users/me");
    assert.equal(unauthorized.status, 401);
    assert.equal(unauthorized.body.success, false);
    const unknownRoute = await agent.get("/api/v1/not-a-route");
    assert.equal(unknownRoute.status, 404);
    assert.equal(unknownRoute.body.success, false);

    const signup = await agent
      .post("/api/v1/auth/signup")
      .set("X-Forwarded-For", apiIp)
      .set("X-CSRF-Token", token)
      .send({ email: "v1-api@example.com", pwd: "Amber!Comet42Velvet" });

    assert.equal(signup.status, 200);
    assert.equal(signup.body.success, true);
    assert.match(signup.body.data.message, /verification instructions/i);

    const verificationToken = appState.mail
      .at(-1)
      .text.match(/verify-email\?token=([a-f0-9]{64})/i)[1];
    const verification = await agent
      .post("/api/v1/auth/verify-email")
      .set("X-CSRF-Token", token)
      .send({ token: verificationToken });
    assert.equal(verification.status, 200);
    assert.deepEqual(verification.body, {
      success: true,
      data: { verified: true },
    });

    const login = await agent
      .post("/api/v1/auth/login")
      .set("X-Forwarded-For", apiIp)
      .set("X-CSRF-Token", token)
      .send({ email: "v1-api@example.com", pwd: "Amber!Comet42Velvet" });
    assert.equal(login.status, 200);
    assert.equal(login.body.success, true);
    assert.equal(login.body.data.user.email, "v1-api@example.com");
    assert.ok(login.body.data.user.id);

    const profile = await agent
      .get("/api/v1/users/me")
      .set("X-Forwarded-For", apiIp);
    assert.equal(profile.status, 200);
    assert.equal(profile.body.success, true);
    assert.equal(profile.body.data.email, "v1-api@example.com");
    assert.equal(Object.hasOwn(profile.body.data, "pwd"), false);

    const currentToken = (await agent.get("/test-csrf")).body.csrfToken;
    const setupTotp = await agent
      .post("/api/v1/auth/totp/setup")
      .set("X-Forwarded-For", apiIp)
      .set("X-CSRF-Token", currentToken)
      .send({});
    assert.equal(setupTotp.status, 200, JSON.stringify(setupTotp.body));
    const totpCode = await generateTotp({ secret: setupTotp.body.data.secret });
    const confirmTotp = await agent
      .post("/api/v1/auth/totp/confirm")
      .set("X-Forwarded-For", apiIp)
      .set("X-CSRF-Token", currentToken)
      .send({ code: totpCode });
    assert.equal(confirmTotp.status, 200);
    assert.equal(confirmTotp.body.data.enabled, true);
    assert.equal(confirmTotp.body.data.recoveryCodes.length, 10);

    const disableTotp = await agent
      .post("/api/v1/auth/totp/disable")
      .set("X-Forwarded-For", apiIp)
      .set("X-CSRF-Token", (await agent.get("/test-csrf")).body.csrfToken)
      .send({
        password: "Amber!Comet42Velvet",
        code: await generateTotp({ secret: setupTotp.body.data.secret }),
      });
    assert.equal(disableTotp.status, 200);
    assert.equal(disableTotp.body.data.enabled, false);

    const recordToken = (await agent.get("/test-csrf")).body.csrfToken;
    const invalidRecord = await agent
      .post("/api/v1/records")
      .set("X-Forwarded-For", apiIp)
      .set("X-CSRF-Token", recordToken)
      .send({});
    assert.equal(invalidRecord.status, 422);
    assert.equal(invalidRecord.body.success, false);
    assert.ok(invalidRecord.body.errors.length > 0);

    const created = await agent
      .post("/api/v1/records")
      .set("X-Forwarded-For", apiIp)
      .set("X-CSRF-Token", recordToken)
      .send({
        sname: "API Student",
        rno: uniqueRno,
        clg: "ABC College",
        brch: "CSE",
        year: "2",
        sec: "A",
        mmodel: "Phone Model",
        imei: uniqueImei,
      });
    assert.equal(created.status, 201);
    assert.equal(created.body.success, true);
    assert.equal(created.body.data.record.sname, "API Student");
    assert.equal(Object.hasOwn(created.body.data.record, "deletedBy"), false);

    const records = await agent
      .get("/api/v1/records?page=1&pageSize=10&search=API%20Student")
      .set("X-Forwarded-For", apiIp);
    assert.equal(records.status, 200);
    assert.equal(records.body.success, true);
    assert.equal(records.body.data.records.length, 1);
    assert.equal(records.body.data.pagination.total, 1);

    const legacyLogout = await agent
      .get("/logout")
      .set("X-Forwarded-For", apiIp);
    assert.equal(legacyLogout.status, 302);
    assert.equal(legacyLogout.headers.deprecation, "@1790812800");
    assert.match(legacyLogout.headers.link, /\/api\/v1\/auth\/logout/);
  });

  test("app sends Helmet headers and serves external auth component scripts", async () => {
    const response = await supertest(app)
      .get("/")
      .set("X-Forwarded-Proto", "https");
    const csp = response.headers["content-security-policy"];
    const nonceDirective = csp.match(/script-src[^;]*'nonce-[^']+'/);

    assert.equal(response.status, 200);
    assert.ok(nonceDirective);
    assert.match(response.text, /\/components\/LoginCard\/login-card\.js/);
    assert.doesNotMatch(response.text, /<script nonce=/);
    assert.match(csp, /script-src-attr 'none'/);
    assert.match(csp, /https:\/\/fonts\.googleapis\.com/);
    assert.match(csp, /https:\/\/cdnjs\.cloudflare\.com/);
    assert.equal(response.headers["x-frame-options"], "SAMEORIGIN");
    assert.equal(response.headers["x-content-type-options"], "nosniff");
    assert.equal(
      response.headers["referrer-policy"],
      "strict-origin-when-cross-origin",
    );
    assert.match(response.headers["strict-transport-security"], /preload/);
    assert.ok(
      response.headers["set-cookie"].some((cookie) =>
        /session=.*samesite=strict/i.test(cookie),
      ),
    );
    assert.equal(
      response.headers["permissions-policy"],
      "camera=(), microphone=(), geolocation=()",
    );
  });

  test("the mounted app rejects a state-changing request without a CSRF token", async () => {
    const response = await supertest(app)
      .post("/postsignup")
      .send({ email: "csrf-blocked@example.com", pwd: "Amber!Comet42Velvet" });

    assert.equal(response.status, 403);
    assert.equal(response.body.error, "Invalid or missing CSRF token.");
  });

  test("CORS only allows configured origins and upload routes stay absent", async () => {
    const allowed = await supertest(app)
      .get("/")
      .set("Origin", "https://trusted.example");
    assert.equal(
      allowed.headers["access-control-allow-origin"],
      "https://trusted.example",
    );
    assert.equal(allowed.headers["access-control-allow-credentials"], "true");

    const blocked = await supertest(app)
      .get("/")
      .set("Origin", "https://untrusted.example");
    assert.equal(blocked.headers["access-control-allow-origin"], undefined);

    const preflight = await supertest(app)
      .options("/postlogin")
      .set("Origin", "https://trusted.example")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type,x-csrf-token");
    assert.equal(preflight.status, 204);
    assert.equal(
      preflight.headers["access-control-allow-origin"],
      "https://trusted.example",
    );
    assert.match(
      preflight.headers["access-control-allow-headers"],
      /x-csrf-token/i,
    );

    const { agent, token } = await createCsrfAgent();
    const upload = await agent
      .post("/upload")
      .set("X-CSRF-Token", token)
      .send({ file: "not-an-upload" });
    assert.equal(upload.status, 404);
  });

  test("the mounted app sanitizes Mongo operators and stored record text", async () => {
    const agent = supertest.agent(app);
    const testIp = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
    const loginPage = await agent.get("/").set("X-Forwarded-For", testIp);
    const tokenMatch = loginPage.text.match(
      /name="csrf-token" content="([^"]+)"/,
    );
    assert.ok(tokenMatch);
    let token = tokenMatch[1];
    const email = `input-sanitizer-${Date.now()}@example.com`;

    const signup = await agent
      .post("/postsignup")
      .set("X-Forwarded-For", testIp)
      .set("X-CSRF-Token", token)
      .send({ email, pwd: "Amber!Comet42Velvet" });
    assert.equal(signup.status, 204);

    const login = await agent
      .post("/postlogin")
      .set("X-Forwarded-For", testIp)
      .set("X-CSRF-Token", token)
      .send({ email, pwd: "Amber!Comet42Velvet" });
    assert.equal(login.status, 204);

    const home = await agent.get("/home").set("X-Forwarded-For", testIp);
    token = home.text.match(/name="csrf-token" content="([^"]+)"/)[1];
    const validRecord = {
      Date: "2026-09-30",
      Time: "12:00",
      sname: "Asha Rao",
      spno: "9876543210",
      rno: `MSA${Date.now().toString(36).toUpperCase()}`,
      clg: "ABC College",
      brch: "CSE",
      year: "2",
      sec: "A",
      pname: "Raj Rao",
      ppno: "9876543211",
      ename: "Dr. Staff",
      epno: "9876543212",
      eid: "EMP001",
      rsn: "Using phone during class",
      mmodel: "Phone Model",
      imei: `8${String(Date.now()).padStart(14, "0").slice(-14)}`,
      mclr: "Blue",
    };

    for (const invalidFields of [
      { rno: { $ne: null } },
      { rno: "MSA-001" },
      { spno: "12345" },
      { imei: "12345" },
    ]) {
      const invalid = await agent
        .post("/hh")
        .set("X-Forwarded-For", testIp)
        .set("X-CSRF-Token", token)
        .send({ ...validRecord, ...invalidFields });
      assert.equal(invalid.status, 422);
      assert.ok(Array.isArray(invalid.body.errors));
    }

    const missingRequiredField = await agent
      .post("/hh")
      .set("X-Forwarded-For", testIp)
      .set("X-CSRF-Token", token)
      .send({ ...validRecord, sname: " " });
    assert.equal(missingRequiredField.status, 422);
    assert.ok(
      missingRequiredField.body.errors.some((error) => error.field === "sname"),
    );

    const create = await agent
      .post("/hh")
      .set("X-Forwarded-For", testIp)
      .set("X-CSRF-Token", token)
      .send({
        ...validRecord,
        sname: "Asha <script>alert(1)</script> Rao",
        rsn: "Using phone <img src=x onerror=alert(1)>",
      });
    assert.equal(create.status, 302);

    const currentHome = await agent.get("/home").set("X-Forwarded-For", testIp);
    token = currentHome.text.match(/name="csrf-token" content="([^"]+)"/)[1];
    const listedRecords = await agent
      .get("/api/records")
      .query({
        draw: 1,
        start: 0,
        length: 10,
        search: { value: validRecord.rno },
      })
      .set("X-Forwarded-For", testIp);
    const recordId = listedRecords.body.data[0]._id;
    const edit = await agent
      .post("/edit")
      .set("X-Forwarded-For", testIp)
      .set("X-CSRF-Token", token)
      .send({ _id: recordId });

    assert.equal(edit.status, 200);
    assert.equal(edit.body.sname, "Asha Rao");
    assert.equal(edit.body.rsn, "Using Phone");
    assert.doesNotMatch(
      JSON.stringify(edit.body),
      /<script|onerror|alert\(1\)/i,
    );

    const returned = await agent
      .post("/change")
      .set("X-CSRF-Token", token)
      .send({ _id: recordId });
    assert.equal(returned.status, 302);

    const returnedRecords = await agent.get("/api/records").query({
      draw: 1,
      start: 0,
      length: 10,
      status: "Returned",
      "search[value]": validRecord.rno,
    });
    assert.equal(returnedRecords.body.recordsFiltered, 1);
    assert.equal(returnedRecords.body.data[0]._id, recordId);

    const deleted = await agent
      .post("/delete")
      .set("X-CSRF-Token", token)
      .send({ _id: recordId });
    assert.equal(deleted.status, 200);
    assert.equal(deleted.body.deleted, 1);

    const activeWhileDeleted = await agent.get("/api/records").query({
      draw: 1,
      start: 0,
      length: 10,
      search: { value: validRecord.rno },
    });
    assert.equal(activeWhileDeleted.body.recordsFiltered, 0);
    const recycleBinPage = await agent.get("/home");
    assert.match(recycleBinPage.text, /Recently Deleted/);
    assert.match(recycleBinPage.text, /Asha Rao/);

    const recycleBin = await agent.get("/api/recyclebin");
    const deletedRecord = recycleBin.body.data.find(
      (record) => record._id === recordId,
    );
    assert.ok(deletedRecord);
    assert.equal(deletedRecord.deletedBy, email);

    const restored = await agent
      .post(`/restore/${recordId}`)
      .set("X-CSRF-Token", token)
      .send({});
    assert.equal(restored.status, 200);
    assert.equal(restored.body.restored, 1);

    const activeAgain = await agent.get("/api/records").query({
      draw: 1,
      start: 0,
      length: 10,
      search: { value: validRecord.rno },
    });
    assert.equal(activeAgain.body.recordsFiltered, 1);
    assert.equal(activeAgain.body.data[0]._id, recordId);

    const recordActivity = await agent.get(`/api/records/${recordId}/audit`);
    assert.equal(recordActivity.status, 200);
    assert.ok(
      recordActivity.body.data.some((event) => event.actionType === "CREATE"),
    );
    assert.ok(
      recordActivity.body.data.some((event) => event.actionType === "DELETE"),
    );
    assert.ok(
      recordActivity.body.data.some((event) => event.actionType === "RESTORE"),
    );

    const activityPage = await agent.get("/audit");
    assert.equal(activityPage.status, 200);
    assert.match(activityPage.text, /Record Activity/);
    assert.match(activityPage.text, /sidebar-component/);
    assert.match(activityPage.text, /id="auditTable"/);
    assert.match(activityPage.text, new RegExp(validRecord.rno, "i"));
  });

  test("TOTP enrollment, challenge login, recovery codes, and disable work", async () => {
    const agent = supertest.agent(app);
    const readCsrfToken = (html) =>
      html.match(/name="csrf-token" content="([^"]+)"/)[1];
    const email = "totp-enabled@example.com";
    let csrfToken = readCsrfToken((await agent.get("/")).text);

    const signup = await agent
      .post("/postsignup")
      .set("X-CSRF-Token", csrfToken)
      .send({ email, pwd: "Amber!Comet42Velvet" });
    assert.equal(signup.status, 204);

    const login = await agent
      .post("/postlogin")
      .set("X-CSRF-Token", csrfToken)
      .send({ email, pwd: "Amber!Comet42Velvet" });
    assert.equal(login.status, 204);

    csrfToken = readCsrfToken((await agent.get("/home")).text);
    const setup = await agent
      .post("/totp/setup")
      .set("X-CSRF-Token", csrfToken)
      .send({});
    assert.equal(setup.status, 200);
    assert.match(setup.body.qrCode, /^data:image\/png;base64,/);
    assert.ok(setup.body.secret);

    const firstCode = await generateTotp({ secret: setup.body.secret });
    const confirmation = await agent
      .post("/totp/confirm")
      .set("X-CSRF-Token", csrfToken)
      .send({ code: firstCode });
    assert.equal(confirmation.status, 200);
    assert.equal(confirmation.body.recoveryCodes.length, 10);
    const recoveryCode = confirmation.body.recoveryCodes[0];

    await agent.get("/logout");
    csrfToken = readCsrfToken((await agent.get("/")).text);
    const passwordChallenge = await agent
      .post("/postlogin")
      .set("X-CSRF-Token", csrfToken)
      .send({ email, pwd: "Amber!Comet42Velvet" });
    assert.equal(passwordChallenge.status, 202);
    assert.equal(passwordChallenge.body.requiresTotp, true);

    const secondCode = await generateTotp({ secret: setup.body.secret });
    const completedLogin = await agent
      .post("/postlogin/totp")
      .set("X-CSRF-Token", passwordChallenge.body.csrfToken)
      .send({ code: secondCode });
    assert.equal(completedLogin.status, 204);

    await agent.get("/logout");
    csrfToken = readCsrfToken((await agent.get("/")).text);
    const recoveryChallenge = await agent
      .post("/postlogin")
      .set("X-CSRF-Token", csrfToken)
      .send({ email, pwd: "Amber!Comet42Velvet" });
    assert.equal(recoveryChallenge.status, 202);
    const recoveredLogin = await agent
      .post("/postlogin/totp")
      .set("X-CSRF-Token", recoveryChallenge.body.csrfToken)
      .send({ recoveryCode });
    assert.equal(recoveredLogin.status, 204);

    await agent.get("/logout");
    csrfToken = readCsrfToken((await agent.get("/")).text);
    const reusedChallenge = await agent
      .post("/postlogin")
      .set("X-CSRF-Token", csrfToken)
      .send({ email, pwd: "Amber!Comet42Velvet" });
    assert.equal(reusedChallenge.status, 202);
    const reusedRecovery = await agent
      .post("/postlogin/totp")
      .set("X-CSRF-Token", reusedChallenge.body.csrfToken)
      .send({ recoveryCode });
    assert.equal(reusedRecovery.status, 401);

    const activeCode = await generateTotp({ secret: setup.body.secret });
    const validDisableChallenge = await agent
      .post("/postlogin/totp")
      .set("X-CSRF-Token", reusedChallenge.body.csrfToken)
      .send({ code: activeCode });
    assert.equal(validDisableChallenge.status, 204);

    csrfToken = readCsrfToken((await agent.get("/home")).text);
    const disabled = await agent
      .post("/totp/disable")
      .set("X-CSRF-Token", csrfToken)
      .send({
        password: "Amber!Comet42Velvet",
        code: confirmation.body.recoveryCodes[1],
      });
    assert.equal(disabled.status, 200);
    assert.ok(disabled.body.csrfToken);
    const status = await agent.get("/totp/status");
    assert.equal(status.body.enabled, false);

    const reEnrollment = await agent
      .post("/totp/setup")
      .set("X-CSRF-Token", disabled.body.csrfToken)
      .send({});
    assert.equal(reEnrollment.status, 200);
  });

  test("successful sign-ins alert by email only when device context changes", async () => {
    const agent = supertest.agent(app);
    const email = "new-device-audit@example.com";
    const signupIp = "198.51.100.59";
    let csrfToken = (await agent.get("/")).text.match(
      /name="csrf-token" content="([^"]+)"/,
    )[1];
    const signup = await agent
      .post("/postsignup")
      .set("X-Forwarded-For", signupIp)
      .set("X-CSRF-Token", csrfToken)
      .send({ email, pwd: "Amber!Comet42Velvet" });
    assert.equal(signup.status, 204);

    const signIn = async (client, ip, userAgent) => {
      await client
        .get("/logout")
        .set("User-Agent", userAgent)
        .set("X-Forwarded-For", ip);
      const loginPage = await client
        .get("/")
        .set("User-Agent", userAgent)
        .set("X-Forwarded-For", ip);
      const token = loginPage.text.match(
        /name="csrf-token" content="([^"]+)"/,
      )[1];
      const response = await client
        .post("/postlogin")
        .set("X-CSRF-Token", token)
        .set("X-Forwarded-For", ip)
        .set("User-Agent", userAgent)
        .send({ email, pwd: "Amber!Comet42Velvet" });
      if (response.status === 204) {
        await client
          .get("/home")
          .set("User-Agent", userAgent)
          .set("X-Forwarded-For", ip);
      }
      return response;
    };

    assert.equal(
      (await signIn(agent, "198.51.100.60", "Audit Test Browser")).status,
      204,
    );
    const newDeviceEmails = () =>
      appState.mail.filter((mail) => /new sign-in/i.test(mail.subject));
    assert.equal(newDeviceEmails().length, 0);
    assert.equal(
      (await signIn(agent, "198.51.100.60", "Audit Test Browser")).status,
      204,
    );
    assert.equal(newDeviceEmails().length, 0);
    const lastLogin = await agent
      .get("/home")
      .set("User-Agent", "Audit Test Browser")
      .set("X-Forwarded-For", "198.51.100.60");
    assert.match(lastLogin.text, /Audit Test Browser/);
    const newDeviceAgent = supertest.agent(app);
    assert.equal(
      (await signIn(newDeviceAgent, "198.51.100.61", "Different Browser"))
        .status,
      204,
    );
    assert.equal(newDeviceEmails().length, 1);
    assert.equal(newDeviceEmails()[0].to, email);
    assert.match(newDeviceEmails()[0].text, /198\.51\.100\.61/);
  });

  test("PATCH /api/v1/users/me updates the public profile details", async () => {
    const { agent, token } = await createCsrfAgent();
    const email = `profile-details-${Date.now()}@example.com`;
    const password = "Amber!Comet42Velvet";

    await agent
      .post("/postsignup")
      .set("X-CSRF-Token", token)
      .send({ email, pwd: password });

    const loginPage = await agent.get("/");
    const loginToken = loginPage.text.match(
      /name="csrf-token" content="([^\"]+)"/,
    )[1];
    const login = await agent
      .post("/postlogin")
      .set("X-CSRF-Token", loginToken)
      .send({ email, pwd: password });
    assert.equal(login.status, 204);

    const profile = await agent.get("/profile");
    const profileToken = profile.text.match(
      /name="csrf-token" content="([^"]+)"/,
    )[1];

    const updated = await agent
      .patch("/api/v1/users/me")
      .set("X-CSRF-Token", profileToken)
      .send({
        fullName: "Ada Lovelace",
        designation: "Senior Clerk",
        phoneNumber: "+919876543210",
        avatarUrl: "https://example.com/avatar.png",
      });

    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.fullName, "Ada Lovelace");
    assert.equal(updated.body.data.designation, "Senior Clerk");
    assert.equal(updated.body.data.phoneNumber, "+919876543210");
    assert.equal(updated.body.data.avatarUrl, "https://example.com/avatar.png");

    const refreshedProfile = await agent.get("/profile");
    assert.equal(refreshedProfile.status, 200);
    assert.match(refreshedProfile.text, /Ada Lovelace/i);
    assert.match(refreshedProfile.text, /Senior Clerk/i);
    assert.match(refreshedProfile.text, /\+919876543210/);
  });

  test("DELETE /api/v1/users/me soft deletes the current account and blocks future logins", async () => {
    const { agent, token } = await createCsrfAgent();
    const email = `delete-account-${Date.now()}@example.com`;
    const password = "Amber!Comet42Velvet";

    await agent
      .post("/postsignup")
      .set("X-CSRF-Token", token)
      .send({ email, pwd: password });

    const loginPage = await agent.get("/");
    const loginToken = loginPage.text.match(
      /name="csrf-token" content="([^"]+)"/,
    )[1];
    const login = await agent
      .post("/postlogin")
      .set("X-CSRF-Token", loginToken)
      .send({ email, pwd: password });
    assert.equal(login.status, 204);

    const profile = await agent.get("/profile");
    const profileToken = profile.text.match(
      /name="csrf-token" content="([^"]+)"/,
    )[1];

    const deleted = await agent
      .delete("/api/v1/users/me")
      .set("X-CSRF-Token", profileToken)
      .send({ currentPwd: password });

    assert.equal(deleted.status, 200);
    assert.equal(deleted.body.data.deleted, true);
    assert.equal(deleted.body.data.email, email);

    const freshAgent = supertest.agent(app);
    const resetLoginPage = await freshAgent.get("/");
    const resetToken = resetLoginPage.text.match(
      /name="csrf-token" content="([^"]+)"/,
    )[1];
    const rejectedLogin = await freshAgent
      .post("/postlogin")
      .set("X-CSRF-Token", resetToken)
      .send({ email, pwd: password });
    assert.equal(rejectedLogin.status, 401);
  });

  test("GET /profile renders account details and accepts a password change", async () => {
    const { agent, token } = await createCsrfAgent();
    const email = `profile-${Date.now()}@example.com`;
    const originalPassword = "Amber!Comet42Velvet";
    const newPassword = "Brighter!Moon99Trail";

    await agent
      .post("/postsignup")
      .set("X-CSRF-Token", token)
      .send({ email, pwd: originalPassword });

    const loginPage = await agent.get("/");
    const loginToken = loginPage.text.match(
      /name="csrf-token" content="([^"]+)"/,
    )[1];
    const login = await agent
      .post("/postlogin")
      .set("X-CSRF-Token", loginToken)
      .send({ email, pwd: originalPassword });
    assert.equal(login.status, 204);

    const profile = await agent.get("/profile");
    assert.equal(profile.status, 200);
    assert.match(profile.text, /My Profile/i);
    assert.match(
      profile.text,
      new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
    );
    const profileToken = profile.text.match(
      /name="csrf-token" content="([^"]+)"/,
    )[1];

    const changed = await agent
      .post("/postchangepassword")
      .set("X-CSRF-Token", profileToken)
      .send({
        currentPwd: originalPassword,
        pwd: newPassword,
      });
    assert.equal(changed.status, 204);

    await agent.get("/logout");
    const nextLoginPage = await agent.get("/");
    const nextToken = nextLoginPage.text.match(
      /name="csrf-token" content="([^"]+)"/,
    )[1];
    const reLogin = await agent
      .post("/postlogin")
      .set("X-CSRF-Token", nextToken)
      .send({ email, pwd: newPassword });
    assert.equal(reLogin.status, 204);
  });

  test("GET /home redirects unauthenticated users", async () => {
    const home = getHandler("/home", "get");
    const res = makeRes();

    await home(makeReq(), res);

    assert.equal(res.redirectUrl, "/");
  });

  test("POST /session/extend refreshes the session expiry", async () => {
    const handler = getHandler("/session/extend", "post");
    const session = {
      cookie: { maxAge: 8 * 60 * 60 * 1000 },
      user: { email: "session@example.com" },
      touch: () => {
        session.cookie.maxAge = 60 * 60 * 1000;
        session.touched = true;
      },
    };
    const req = makeReq({ session });
    const res = makeRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(session.touched, true);
    assert.equal(res.body.ok, true);
    assert.ok(res.body.expiresAt > Date.now());
  });

  test("GET /logout clears the session", async () => {
    const signup = getHandler("/postsignup", "post");
    const login = getHandler("/postlogin", "post");
    const logout = getHandler("/logout", "get");

    await signup(
      makeReq({
        body: { email: "logout@example.com", pwd: "Amber!Comet42Velvet" },
      }),
      makeRes(),
    );

    const session = {
      regenerate: (callback) => callback(null),
      destroy: (callback) => callback(),
    };
    const loginReq = makeReq({
      body: {
        email: "logout@example.com",
        pwd: "Amber!Comet42Velvet",
        uname: "Logout User",
      },
      session,
    });
    await login(loginReq, makeRes());

    const logoutReq = makeReq({ session });
    const logoutRes = makeRes();
    await logout(logoutReq, logoutRes);

    assert.equal(logoutRes.redirectUrl, "/");
  });
});
