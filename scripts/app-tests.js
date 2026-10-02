const Module = require("node:module");
const assert = require("node:assert/strict");
const {
  User,
  DeviceRecord,
  Visitor,
  ErrorReport,
  RecordAuditLog,
  Session,
} = require("../models");
const { AppError, normalizeError } = require("../middleware/errorHandler");
const { createDeviceService } = require("../services/DeviceService");
const {
  createMongoConnectionService,
} = require("../services/MongoConnectionService");
const { createEmailService } = require("../services/EmailService");
const { insertIfMissing } = require("./seed");
const { createErrorReporter } = require("../services/ErrorReporter");
const {
  hashPassword,
  verifyPassword,
  safeHashCompare,
} = require("../utils/crypto");
const { createDbReadiness, sanitizeMongoUri } = require("../utils/db");
const { applyMongoUpdate } = require("../utils/mongoUpdate");
const { setFlash, consumeFlash } = require("../utils/flash");
const { calculatePasswordStrength } = require("../utils/passwordStrength");

process.env.NODE_ENV = "test";
process.env.MONGODB_URI = "mongodb://localhost:27017/testdb";
process.env.SESSION_SECRET = "test-session-secret";
process.env.GMAIL_USER = "demo@example.com";
process.env.GMAIL_PASS = "demo-password";
process.env.PUBLIC_APP_URL = "https://storage.example";

const appState = { users: new Map(), records: [], mail: [] };

function resetState() {
  appState.users.clear();
  appState.records = [];
  appState.mail = [];
}

function makeCollection(name) {
  return {
    createIndex: async () => {},
    insert: async (payload) => {
      if (name === "registration_coll") {
        const user = { ...payload, _id: `user-${appState.users.size + 1}` };
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
      return { ...payload, _id: `doc-${Date.now()}` };
    },
    findOne: async (filter = {}) => {
      if (name !== "registration_coll") return null;
      return (
        [...appState.users.values()].find((user) =>
          Object.entries(filter).every(([key, value]) => user[key] === value),
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
          appState.users.clear();
          return { deletedCount: appState.users.size };
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

const db = {
  then: (callback) =>
    Promise.resolve()
      .then(callback)
      .then(() => db),
  catch: (callback) => Promise.resolve().catch(callback),
  get: (collectionName) => makeCollection(collectionName),
};

const originalLoad = Module._load;
Module._load = function patchedLoad(requested, parent, isMain) {
  if (requested === "nodemailer") {
    return {
      createTransport: () => ({
        sendMail: async (mailOptions) => {
          appState.mail.push(mailOptions);
          return { accepted: [mailOptions.to] };
        },
      }),
    };
  }
  return originalLoad.apply(this, arguments);
};

const router = require("../routes/index");
const { InputValidationError, normalizeStudentRecord } = router;
const getHandler = (pathname, method) => {
  const route = router.stack.find(
    (layer) =>
      layer.route &&
      layer.route.path === pathname &&
      layer.route.methods[method.toLowerCase()],
  );
  return route && route.route.stack.at(-1).handle;
};

const makeReq = (overrides = {}) => {
  const session = {
    flash: {},
    regenerate: (cb) => cb(null),
    destroy: (cb) => cb(),
    ...(overrides.session || {}),
  };
  return {
    body: {},
    session,
    flash: (type, message) => setFlash(session, type, message),
    ...overrides,
  };
};

const makeRes = () => ({
  statusCode: 200,
  body: undefined,
  view: undefined,
  redirectUrl: undefined,
  status(code) {
    this.statusCode = code;
    return this;
  },
  send(body) {
    this.body = body;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
  render(view) {
    this.view = view;
    return this;
  },
  redirect(url) {
    this.redirectUrl = url;
    return this;
  },
  sendStatus(code) {
    this.statusCode = code;
    return this;
  },
});
const getLastMail = (subjectPattern) =>
  [...appState.mail]
    .reverse()
    .find((mail) => subjectPattern.test(mail.subject));

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
    return true;
  } catch (error) {
    console.log(`FAIL ${name}: ${error.message}`);
    return false;
  }
}

(async () => {
  let passed = 0;
  let total = 0;
  const run = async (name, fn) => {
    total += 1;
    if (await runTest(name, fn)) passed += 1;
  };

  await run("render sign-in page", async () => {
    const handler = getHandler("/", "get");
    const res = makeRes();
    await handler(makeReq(), res);
    assert.equal(res.view, "signLog_net");
  });

  await run("flash helper stores and consumes redirect messages", async () => {
    const session = { flash: { success: ["Saved successfully."] } };
    const messages = consumeFlash(session);
    assert.deepEqual(messages, [
      { type: "success", message: "Saved successfully." },
    ]);
    assert.deepEqual(session.flash, {});

    setFlash(session, "error", "Something went wrong.");
    assert.deepEqual(session.flash, { error: ["Something went wrong."] });
  });

  await run("password strength scoring matches the app rule set", async () => {
    assert.deepEqual(calculatePasswordStrength("Lowercase2026!"), {
      score: 6,
      label: "Strong",
      percent: 100,
      meetsPolicy: true,
    });
    assert.deepEqual(calculatePasswordStrength("weakpass"), {
      score: 1,
      label: "Weak",
      percent: 10,
      meetsPolicy: false,
    });
    assert.deepEqual(calculatePasswordStrength("Abc123!def"), {
      score: 5,
      label: "Strong",
      percent: 100,
      meetsPolicy: true,
    });
  });

  await run(
    "student record normalizer safely handles 10,000 deterministic malformed inputs",
    async () => {
      const validRecord = {
        Date: "2026-10-01",
        Time: "10:00",
        sname: "Student One",
        spno: "+919876543210",
        rno: "A101",
        clg: "ACET",
        brch: "MCA",
        year: "2",
        sec: "A",
        pname: "Parent One",
        ppno: "+919876543211",
        ename: "Staff One",
        epno: "+919876543212",
        eid: "EMP101",
        rsn: "Using phone",
        mmodel: "Phone Model",
        imei: "123456789012345",
        mclr: "Black",
      };
      const fields = ["pname", "rno", "spno", "imei"];
      const characters = Array.from(
        "<>/\\' -_0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZéह中😀\n\t",
      );
      const allowedFields = new Set(Object.keys(validRecord).concat("status"));
      let seed = 0x5eed1234;

      for (let iteration = 0; iteration < 10000; iteration += 1) {
        const nextRandom = () => {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          return seed;
        };
        const field = fields[iteration % fields.length];
        const length = nextRandom() % 80;
        let value = "";
        for (let index = 0; index < length; index += 1) {
          value += characters[nextRandom() % characters.length];
        }

        try {
          const normalized = normalizeStudentRecord(
            { ...validRecord, [field]: value },
            "At_office",
          );
          assert.ok(
            Object.keys(normalized).every((key) => allowedFields.has(key)),
          );
          assert.equal(normalized.status, "At_office");
          assert.ok(
            normalized[field].length <=
              { pname: 120, rno: 32, spno: 16, imei: 15 }[field],
          );
          assert.doesNotMatch(normalized[field], /<|>/);
          if (field === "spno" && normalized.spno)
            assert.match(normalized.spno, /^\+91[6-9]\d{9}$/);
          if (field === "imei") assert.match(normalized.imei, /^\d{15}$/);
        } catch (error) {
          assert.ok(
            error instanceof InputValidationError,
            `unexpected ${error && error.name}: ${error && error.message}`,
          );
        }
      }
    },
  );

  await run(
    "seed fixture insertion is idempotent across repeated runs",
    async () => {
      const documents = new Map();
      const collection = {
        findOne: async (filter) =>
          documents.get(JSON.stringify(filter)) || null,
        insertOne: async (document) => {
          const key = JSON.stringify({
            email: document.email,
            time: document.time,
          });
          if (documents.has(key)) {
            const error = new Error("duplicate key");
            error.code = 11000;
            throw error;
          }
          documents.set(key, { ...document, _id: "seed-test" });
        },
      };
      const fixture = {
        email: "staff@example.test",
        time: new Date("2026-10-01T12:00:00Z"),
      };

      assert.equal(await insertIfMissing(collection, fixture, fixture), true);
      assert.equal(await insertIfMissing(collection, fixture, fixture), false);
      assert.equal(documents.size, 1);
    },
  );

  await run("authenticated users are redirected from login page", async () => {
    const handler = getHandler("/", "get");
    const res = makeRes();
    await handler(
      makeReq({
        session: {
          user: {
            email: "staff@example.com",
            preferences: { darkMode: false },
          },
        },
      }),
      res,
    );
    assert.equal(res.redirectUrl, "/home");
  });

  await run("session extension refreshes the session timeout", async () => {
    const handler = getHandler("/session/extend", "post");
    const session = {
      cookie: { maxAge: 8 * 60 * 60 * 1000 },
      user: { email: "staff@example.com" },
      touch: () => {
        session.cookie.maxAge = 60 * 60 * 1000;
        session.touched = true;
      },
    };
    const res = makeRes();
    await handler(makeReq({ session }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(session.touched, true);
    assert.equal(res.body.ok, true);
    assert.ok(res.body.expiresAt > Date.now());
  });

  await run(
    "Mongoose models apply strict fields, defaults, enums, and virtuals",
    async () => {
      const user = new User({
        email: "STAFF@EXAMPLE.COM",
        pwd: "hashed-value",
        extra: true,
      });
      assert.equal(user.email, "staff@example.com");
      assert.equal(user.role, "staff");
      assert.deepEqual(user.preferences.toObject(), {
        darkMode: false,
        lang: "en",
      });
      assert.equal(user.extra, undefined);

      const record = new DeviceRecord({
        sname: " Student One ",
        status: "Unknown",
        extra: true,
      });
      assert.equal(record.studentName, "Student One");
      assert.equal(record.extra, undefined);
      assert.equal(record.statusChangedBy, null);
      assert.equal(record.statusChangedAt, null);
      const validationError = await record.validate().catch((error) => error);
      assert.ok(validationError.errors.status);

      assert.ok(new Visitor({ name: "Visitor" }).time instanceof Date);
      assert.ok(
        new ErrorReport({ type: "test", message: "failure" }).time instanceof
          Date,
      );
      const visitorIndexes = Visitor.schema.indexes().map(([keys]) => keys);
      assert.ok(
        visitorIndexes.some((keys) => keys.email === 1 && keys.time === -1),
      );
      assert.ok(visitorIndexes.some((keys) => keys.time === -1));
      assert.ok(visitorIndexes.some((keys) => keys.name === 1));
      const errorReportIndexes = ErrorReport.schema
        .indexes()
        .map(([keys]) => keys);
      assert.ok(errorReportIndexes.some((keys) => keys.time === 1));
      assert.ok(errorReportIndexes.some((keys) => keys.type === 1));
      assert.ok(
        errorReportIndexes.some((keys) => keys.email === 1 && keys.time === -1),
      );
      const session = new Session({
        _id: "session-1",
        session: { user: { id: "user-1" } },
      });
      assert.equal(session.userId, "user-1");
      const recordIndexes = DeviceRecord.schema.indexes().map(([keys]) => keys);
      assert.ok(
        recordIndexes.some((keys) => keys.status === 1 && keys.clg === 1),
      );
      assert.ok(
        recordIndexes.some((keys) => keys.brch === 1 && keys.year === 1),
      );
      assert.ok(recordIndexes.some((keys) => keys.createdAt === -1));
      const classRollIndex = DeviceRecord.schema
        .indexes()
        .find(
          ([keys]) =>
            keys.rno === 1 &&
            keys.clg === 1 &&
            keys.brch === 1 &&
            keys.year === 1 &&
            keys.sec === 1,
        );
      assert.equal(classRollIndex[1].unique, true);

      const auditEntry = new RecordAuditLog({
        recordId: "000000000000000000000001",
        field: "sname",
        oldValue: "Before",
        newValue: "After",
        changedByEmail: "staff@example.com",
        actionType: "UPDATE",
      });
      assert.ok(auditEntry.changedAt instanceof Date);
      assert.equal(auditEntry.hasChangedValue, true);
    },
  );

  await run(
    "central error normalization maps database errors and hides production details",
    async () => {
      assert.equal(new AppError("Forbidden", 403).statusCode, 403);
      assert.deepEqual(
        normalizeError({
          code: 11000,
          keyPattern: { email: 1 },
          keyValue: { email: "private@example.com" },
        }),
        {
          statusCode: 409,
          message: "A record with this email already exists.",
          field: "email",
        },
      );
      assert.equal(
        normalizeError({
          name: "ValidationError",
          message: "Invalid input",
          errors: { email: {} },
        }).statusCode,
        422,
      );
      assert.equal(
        normalizeError({ name: "CastError", path: "_id", message: "Bad id" })
          .statusCode,
        400,
      );
      assert.deepEqual(normalizeError({ code: "EBADCSRFTOKEN" }), {
        statusCode: 403,
        message: "Invalid or missing CSRF token.",
        field: null,
      });
      assert.equal(
        normalizeError(new Error("database password leaked"), "production")
          .message,
        "Internal Server Error",
      );
      assert.match(
        normalizeError(new Error("development detail"), "development").message,
        /development detail/,
      );
    },
  );

  await run("error reports persist the correlated request ID", async () => {
    const entries = [];
    const reporter = createErrorReporter({
      getErrorRepository: () => ({
        insert: async (entry) => entries.push(entry),
      }),
      logger: { error: () => {} },
    });
    await reporter.record(
      "test-error",
      "staff@example.com",
      new Error("failure"),
      "trace-123",
    );
    assert.equal(entries[0].requestId, "trace-123");
  });

  await run(
    "shared crypto helpers retain PBKDF2 hash compatibility",
    async () => {
      const hashedPassword = await hashPassword("Amber!Comet42Velvet", 1000);
      assert.match(hashedPassword, /^pbkdf2\$1000\$/);
      assert.equal(
        await verifyPassword("Amber!Comet42Velvet", hashedPassword),
        true,
      );
      assert.equal(
        await verifyPassword("Other!Comet93Velvet", hashedPassword),
        false,
      );
      assert.equal(await verifyPassword("password", "not-a-hash"), false);
      assert.equal(safeHashCompare("not-hex", Buffer.alloc(32)), false);
      await assert.rejects(hashPassword("password", 0), /positive integer/);
    },
  );

  await run(
    "shared database helpers sanitize URIs and gate readiness",
    async () => {
      assert.equal(
        sanitizeMongoUri(
          "mongodb://localhost/test?appName=legacy&retryWrites=true",
        ),
        "mongodb://localhost/test?retryWrites=true",
      );
      assert.equal(sanitizeMongoUri(null), null);

      let ready = null;
      let initializationError = null;
      let collectionsReady = false;
      const ensureReady = createDbReadiness({
        getReady: () => ready,
        getError: () => initializationError,
        areCollectionsReady: () => collectionsReady,
      });

      await assert.rejects(ensureReady(), /not initialized/);
      initializationError = new Error("connection failed");
      await assert.rejects(ensureReady(), /connection failed/);
      initializationError = null;
      ready = Promise.resolve();
      await assert.rejects(ensureReady(), /collections are not ready/);
      collectionsReady = true;
      await ensureReady();
    },
  );

  await run(
    "Mongo update operators increment counters and mutate arrays",
    async () => {
      const initial = { counter: 2, events: ["created"], roles: ["staff"] };
      const updated = applyMongoUpdate(initial, {
        $inc: { counter: 3 },
        $push: { events: { $each: ["returned", "audited"] } },
        $addToSet: { roles: { $each: ["admin", "staff"] } },
      });
      assert.equal(updated.counter, 5);
      assert.deepEqual(updated.events, ["created", "returned", "audited"]);
      assert.deepEqual(updated.roles, ["staff", "admin"]);
      assert.equal(initial.counter, 2);
    },
  );

  await run("email service reuses one lazily created transporter", async () => {
    let transportCount = 0;
    const messages = [];
    const brandingKeys = [
      "EMAIL_FROM_NAME",
      "EMAIL_FROM_ADDRESS",
      "COLLEGE_NAME",
      "COLLEGE_ADDRESS",
      "COLLEGE_PHONE",
      "SMTP_HOST",
      "SMTP_PORT",
      "SMTP_SECURE",
      "SMTP_USER",
      "SMTP_PASS",
      "SMTP_REJECT_UNAUTHORIZED",
    ];
    const previousBranding = Object.fromEntries(
      brandingKeys.map((key) => [key, process.env[key]]),
    );
    for (const key of brandingKeys) delete process.env[key];
    const emailService = createEmailService({
      nodemailer: {
        createTransport: (options) => {
          transportCount += 1;
          assert.equal(options.service, "gmail");
          assert.deepEqual(options.auth, {
            user: "demo@example.com",
            pass: "demo-password",
          });
          assert.equal(options.tls.rejectUnauthorized, true);
          return {
            sendMail: async (message) => {
              messages.push(message);
              return { accepted: [message.to] };
            },
          };
        },
      },
    });

    assert.equal(emailService.isConfigured(), true);
    await emailService.sendPasswordResetCode("staff@example.com", "654321");
    assert.deepEqual(messages[0].from, {
      name: "GBR Mobile Storage",
      address: "demo@example.com",
    });
    assert.match(messages[0].html, /Aditya College of Institutions/);
    assert.match(messages[0].html, /Ayodhya Nagar/);
    assert.match(
      messages[0].html,
      /password reset code expires in 10 minutes/i,
    );

    Object.assign(process.env, {
      EMAIL_FROM_NAME: "GBR Notifications",
      EMAIL_FROM_ADDRESS: "notifications@example.com",
      COLLEGE_NAME: "Example College",
      COLLEGE_ADDRESS: "North Campus, Kakinada",
      COLLEGE_PHONE: "+91 88888 12345",
    });
    await emailService.sendPasswordResetCode("staff@example.com", "123456");
    await emailService.sendNewDeviceAlert({
      user: { email: "staff@example.com" },
      ip: "192.0.2.10",
      userAgent: "test browser",
      location: "Unknown",
      time: "2026-10-01T12:00:00.000Z",
    });
    await emailService.sendSignupNotification({
      emailDisplay: "new@example.com",
      verificationToken: "token",
      publicAppUrl: "https://storage.example",
    });

    assert.equal(transportCount, 1);
    assert.equal(messages.length, 4);
    assert.ok(
      messages
        .slice(1)
        .every(
          (message) =>
            message.from.name === "GBR Notifications" &&
            message.from.address === "notifications@example.com",
        ),
    );
    assert.ok(
      messages.every(
        (message) =>
          typeof message.text === "string" && message.text.length > 0,
      ),
    );
    assert.match(messages[1].html, /Example College/);
    assert.match(messages[1].html, /North Campus, Kakinada/);
    assert.match(messages[1].html, /\+91 88888 12345/);
    assert.match(
      messages[1].html,
      /password reset code expires in 10 minutes/i,
    );
    assert.match(messages[1].html, /123456/);
    assert.match(
      messages[3].html,
      /Verify your GBR Mobile Storage account within 7 days/i,
    );
    for (const [key, value] of Object.entries(previousBranding)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  await run(
    "SMTP settings support local hosts and explicit certificate overrides",
    async () => {
      const keys = [
        "GMAIL_USER",
        "GMAIL_PASS",
        "EMAIL_FROM_ADDRESS",
        "SMTP_HOST",
        "SMTP_PORT",
        "SMTP_SECURE",
        "SMTP_USER",
        "SMTP_PASS",
        "SMTP_REJECT_UNAUTHORIZED",
      ];
      const previous = Object.fromEntries(
        keys.map((key) => [key, process.env[key]]),
      );
      Object.assign(process.env, {
        GMAIL_USER: "",
        GMAIL_PASS: "",
        EMAIL_FROM_ADDRESS: "local@example.test",
        SMTP_HOST: "127.0.0.1",
        SMTP_PORT: "1025",
        SMTP_SECURE: "false",
        SMTP_USER: "",
        SMTP_PASS: "",
        SMTP_REJECT_UNAUTHORIZED: "false",
      });
      let transportOptions;
      try {
        const emailService = createEmailService({
          nodemailer: {
            createTransport: (options) => {
              transportOptions = options;
              return {
                sendMail: async () => ({ accepted: ["local@example.test"] }),
              };
            },
          },
        });
        assert.equal(emailService.isConfigured(), true);
        await emailService.sendPasswordResetCode(
          "staff@example.test",
          "654321",
        );
        assert.equal(transportOptions.host, "127.0.0.1");
        assert.equal(transportOptions.port, 1025);
        assert.equal(transportOptions.secure, false);
        assert.equal(transportOptions.tls.rejectUnauthorized, false);
        assert.equal(transportOptions.auth, undefined);
      } finally {
        for (const [key, value] of Object.entries(previous)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    },
  );

  await run("signup creates account", async () => {
    resetState();
    const signup = getHandler("/postsignup", "post");
    const verifyEmail = getHandler("/verify-email", "get");
    const res = makeRes();
    await signup(
      makeReq({
        body: { email: "demo@example.com", pwd: "Amber!Comet42Velvet" },
      }),
      res,
    );
    assert.equal(res.statusCode, 204);
    assert.equal(appState.mail[0].to, "demo@example.com");
    assert.match(appState.mail[0].subject, /verify/i);

    const token = appState.mail[0].text.match(
      /verify-email\?token=([a-f0-9]{64})/i,
    )[1];
    const verifyRes = makeRes();
    await verifyEmail(makeReq({ query: { token } }), verifyRes);
    assert.equal(verifyRes.statusCode, 200);
  });

  await run(
    "signup canonicalizes provider aliases and preserves display email",
    async () => {
      resetState();
      const signup = getHandler("/postsignup", "post");
      const login = getHandler("/postlogin", "post");
      const forgot = getHandler("/postforgot", "post");
      const originalEmail = "J.o.h.n+first@GoogleMail.com";
      const signupRes = makeRes();
      await signup(
        makeReq({ body: { email: originalEmail, pwd: "Amber!Comet42Velvet" } }),
        signupRes,
      );
      assert.equal(signupRes.statusCode, 204);
      assert.equal(appState.mail[0].to, originalEmail);
      assert.match(appState.mail[0].subject, /verify/i);

      const duplicateRes = makeRes();
      await signup(
        makeReq({
          body: { email: "john+second@gmail.com", pwd: "Other!Comet93Velvet" },
        }),
        duplicateRes,
      );
      assert.equal(duplicateRes.statusCode, 204);
      assert.match(appState.mail[1].subject, /welcome back/i);

      const session = { regenerate: (callback) => callback(null) };
      const loginRes = makeRes();
      await login(
        makeReq({
          body: { email: "john+login@gmail.com", pwd: "Amber!Comet42Velvet" },
          session,
        }),
        loginRes,
      );
      assert.equal(loginRes.statusCode, 204);
      assert.equal(session.user.email, originalEmail);

      const forgotRes = makeRes();
      await forgot(makeReq({ body: { email: "john@gmail.com" } }), forgotRes);
      assert.equal(forgotRes.statusCode, 204);
      assert.equal(getLastMail(/reset code/i).to, originalEmail);

      const outlookSignupRes = makeRes();
      await signup(
        makeReq({
          body: { email: "staff+tag@outlook.com", pwd: "Amber!Comet42Velvet" },
        }),
        outlookSignupRes,
      );
      assert.equal(outlookSignupRes.statusCode, 204);
      const outlookDuplicateRes = makeRes();
      await signup(
        makeReq({
          body: { email: "staff@outlook.com", pwd: "Other!Comet93Velvet" },
        }),
        outlookDuplicateRes,
      );
      assert.equal(outlookDuplicateRes.statusCode, 204);

      const yahooSignupRes = makeRes();
      await signup(
        makeReq({
          body: { email: "Staff+tag@YAHOO.COM", pwd: "Amber!Comet42Velvet" },
        }),
        yahooSignupRes,
      );
      assert.equal(yahooSignupRes.statusCode, 204);
      const yahooDuplicateRes = makeRes();
      await signup(
        makeReq({
          body: { email: "staff@yahoo.com", pwd: "Other!Comet93Velvet" },
        }),
        yahooDuplicateRes,
      );
      assert.equal(yahooDuplicateRes.statusCode, 204);
    },
  );

  await run(
    "signup keeps the same response when signup email configuration is missing",
    async () => {
      const signup = getHandler("/postsignup", "post");
      const originalPublicUrl = process.env.PUBLIC_APP_URL;
      process.env.PUBLIC_APP_URL = "";
      try {
        const newAccountRes = makeRes();
        await signup(
          makeReq({
            body: { email: "neutral@example.com", pwd: "Amber!Comet42Velvet" },
          }),
          newAccountRes,
        );
        const existingAccountRes = makeRes();
        await signup(
          makeReq({
            body: { email: "neutral@example.com", pwd: "Other!Comet93Velvet" },
          }),
          existingAccountRes,
        );
        assert.equal(newAccountRes.statusCode, 204);
        assert.equal(existingAccountRes.statusCode, 204);
        assert.equal(newAccountRes.body, undefined);
        assert.equal(existingAccountRes.body, undefined);
      } finally {
        process.env.PUBLIC_APP_URL = originalPublicUrl;
      }
    },
  );

  await run(
    "signup rejects passwords missing mixed case or a symbol",
    async () => {
      const signup = getHandler("/postsignup", "post");
      const res = makeRes();
      await signup(
        makeReq({ body: { email: "weak@example.com", pwd: "AmberComet42" } }),
        res,
      );
      assert.equal(res.statusCode, 400);
      assert.equal(
        res.body,
        "Password must contain a number, a symbol, and mixed case letters.",
      );
    },
  );

  await run("signup rejects common passwords", async () => {
    const signup = getHandler("/postsignup", "post");
    const res = makeRes();
    await signup(
      makeReq({ body: { email: "common@example.com", pwd: "password123" } }),
      res,
    );
    assert.equal(res.statusCode, 400);
    assert.equal(res.body, "Choose a less common password.");
  });

  await run("login authenticates user", async () => {
    resetState();
    const signup = getHandler("/postsignup", "post");
    const login = getHandler("/postlogin", "post");
    await signup(
      makeReq({
        body: { email: "alice@example.com", pwd: "Amber!Comet42Velvet" },
      }),
      makeRes(),
    );

    const session = { regenerate: (callback) => callback(null) };
    const req = makeReq({
      body: {
        email: "alice@example.com",
        pwd: "Amber!Comet42Velvet",
        uname: "Alice",
      },
      session,
    });
    const loginRes = makeRes();
    await login(req, loginRes);
    assert.equal(loginRes.statusCode, 204);
    assert.equal(req.session.user.email, "alice@example.com");
    assert.equal(req.session.user.role, "staff");
    assert.equal(req.session.user.fullName, "Alice");
    assert.deepEqual(req.session.user.preferences, {
      darkMode: false,
      lang: "en",
    });
  });

  await run(
    "password change verifies current password and shared password rules",
    async () => {
      resetState();
      const signup = getHandler("/postsignup", "post");
      const changePassword = getHandler("/postchangepassword", "post");
      const login = getHandler("/postlogin", "post");
      await signup(
        makeReq({
          body: { email: "change@example.com", pwd: "Amber!Comet42Velvet" },
        }),
        makeRes(),
      );

      const unauthenticatedRes = makeRes();
      await changePassword(
        makeReq({
          body: { currentPwd: "Amber!Comet42Velvet", pwd: "New!Comet42Velvet" },
        }),
        unauthenticatedRes,
      );
      assert.equal(unauthenticatedRes.statusCode, 401);

      const session = { user: { id: "user-1", email: "change@example.com" } };
      const weakPasswordRes = makeRes();
      await changePassword(
        makeReq({
          body: { currentPwd: "Amber!Comet42Velvet", pwd: "AmberComet42" },
          session,
        }),
        weakPasswordRes,
      );
      assert.equal(weakPasswordRes.statusCode, 400);
      assert.equal(
        weakPasswordRes.body,
        "Password must contain a number, a symbol, and mixed case letters.",
      );

      const reusedCurrentRes = makeRes();
      await changePassword(
        makeReq({
          body: {
            currentPwd: "Amber!Comet42Velvet",
            pwd: "Amber!Comet42Velvet",
          },
          session,
        }),
        reusedCurrentRes,
      );
      assert.equal(reusedCurrentRes.statusCode, 400);
      assert.equal(
        reusedCurrentRes.body,
        "Cannot reuse any of your last 5 passwords.",
      );

      const changedRes = makeRes();
      await changePassword(
        makeReq({
          body: { currentPwd: "Amber!Comet42Velvet", pwd: "New!Comet42Velvet" },
          session,
        }),
        changedRes,
      );
      assert.equal(changedRes.statusCode, 204);

      const reusedPreviousRes = makeRes();
      await changePassword(
        makeReq({
          body: { currentPwd: "New!Comet42Velvet", pwd: "Amber!Comet42Velvet" },
          session,
        }),
        reusedPreviousRes,
      );
      assert.equal(reusedPreviousRes.statusCode, 400);
      assert.equal(
        reusedPreviousRes.body,
        "Cannot reuse any of your last 5 passwords.",
      );

      const oldPasswordRes = makeRes();
      await login(
        makeReq({
          body: { email: "change@example.com", pwd: "Amber!Comet42Velvet" },
        }),
        oldPasswordRes,
      );
      assert.equal(oldPasswordRes.statusCode, 401);
      const newPasswordRes = makeRes();
      await login(
        makeReq({
          body: { email: "change@example.com", pwd: "New!Comet42Velvet" },
        }),
        newPasswordRes,
      );
      assert.equal(newPasswordRes.statusCode, 204);
    },
  );

  await run(
    "password history retains only the five most recent passwords",
    async () => {
      resetState();
      const signup = getHandler("/postsignup", "post");
      const changePassword = getHandler("/postchangepassword", "post");
      const originalPassword = "Amber!Comet42Velvet";
      const passwordHistory = [
        "Nova!Cedar18Glass",
        "Quartz!River62Moon",
        "Copper!Valley39Dawn",
        "Silver!Garden84Flame",
        "Mango!Orbit27Stone",
        "Velvet!Bridge53Cloud",
      ];
      await signup(
        makeReq({
          body: { email: "history@example.com", pwd: originalPassword },
        }),
        makeRes(),
      );
      const session = {
        user: { id: "history-user", email: "history@example.com" },
      };
      let currentPassword = originalPassword;

      for (const nextPassword of passwordHistory) {
        const changeRes = makeRes();
        await changePassword(
          makeReq({
            body: { currentPwd: currentPassword, pwd: nextPassword },
            session,
          }),
          changeRes,
        );
        assert.equal(changeRes.statusCode, 204);
        currentPassword = nextPassword;
      }

      const expiredHistoryPasswordRes = makeRes();
      await changePassword(
        makeReq({
          body: { currentPwd: currentPassword, pwd: originalPassword },
          session,
        }),
        expiredHistoryPasswordRes,
      );
      assert.equal(expiredHistoryPasswordRes.statusCode, 204);
    },
  );

  await run("password reset uses an expiring, one-time OTP", async () => {
    resetState();
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
    const resetMail = getLastMail(/reset code/i);
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
    const reusedPasswordRes = makeRes();
    await reset(
      makeReq({
        body: { email: "forgot@example.com", otp, pwd: "Amber!Comet42Velvet" },
      }),
      reusedPasswordRes,
    );
    assert.equal(reusedPasswordRes.statusCode, 400);
    assert.equal(
      reusedPasswordRes.body,
      "Cannot reuse any of your last 5 passwords.",
    );

    const resetRes = makeRes();
    await reset(
      makeReq({
        body: { email: "forgot@example.com", otp, pwd: "Reset!Comet54Velvet" },
      }),
      resetRes,
    );
    assert.equal(resetRes.statusCode, 204);

    const oldPasswordAfterResetRes = makeRes();
    await login(
      makeReq({
        body: { email: "forgot@example.com", pwd: "Amber!Comet42Velvet" },
      }),
      oldPasswordAfterResetRes,
    );
    assert.equal(oldPasswordAfterResetRes.statusCode, 401);

    const newPasswordRes = makeRes();
    await login(
      makeReq({
        body: { email: "forgot@example.com", pwd: "Reset!Comet54Velvet" },
      }),
      newPasswordRes,
    );
    assert.equal(newPasswordRes.statusCode, 204);

    const reusedRes = makeRes();
    await reset(
      makeReq({
        body: { email: "forgot@example.com", otp, pwd: "Other!Comet93Velvet" },
      }),
      reusedRes,
    );
    assert.equal(reusedRes.statusCode, 400);
  });

  await run("password reset applies the shared password rules", async () => {
    const reset = getHandler("/postreset", "post");
    const res = makeRes();
    await reset(
      makeReq({
        body: {
          email: "reset@example.com",
          otp: "123456",
          pwd: "AmberComet42",
        },
      }),
      res,
    );
    assert.equal(res.statusCode, 400);
    assert.equal(
      res.body,
      "Password must contain a number, a symbol, and mixed case letters.",
    );
  });

  await run("password reset requests are rate-limited per email", async () => {
    resetState();
    const forgot = getHandler("/postforgot", "post");
    const email = "limited-reset@example.com";
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const res = makeRes();
      await forgot(makeReq({ body: { email } }), res);
      assert.equal(res.statusCode, 204);
    }

    const limitedRes = makeRes();
    await forgot(makeReq({ body: { email } }), limitedRes);
    assert.equal(limitedRes.statusCode, 429);
  });

  await run("expired password reset codes are rejected", async () => {
    resetState();
    const signup = getHandler("/postsignup", "post");
    const forgot = getHandler("/postforgot", "post");
    const reset = getHandler("/postreset", "post");
    const email = "expired-reset@example.com";
    await signup(
      makeReq({ body: { email, pwd: "Amber!Comet42Velvet" } }),
      makeRes(),
    );
    await forgot(makeReq({ body: { email } }), makeRes());

    const otp = getLastMail(/reset code/i).text.match(/\b\d{6}\b/)[0];
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

  await run(
    "password reset code attempts are rate-limited per email",
    async () => {
      const reset = getHandler("/postreset", "post");
      const email = "code-limit@example.com";
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const res = makeRes();
        await reset(
          makeReq({
            body: { email, otp: "000000", pwd: "Amber!Comet42Velvet" },
          }),
          res,
        );
        assert.equal(res.statusCode, 400);
      }

      const limitedRes = makeRes();
      await reset(
        makeReq({ body: { email, otp: "000000", pwd: "Amber!Comet42Velvet" } }),
        limitedRes,
      );
      assert.equal(limitedRes.statusCode, 429);
    },
  );

  await run("student record flow works", async () => {
    resetState();
    const signup = getHandler("/postsignup", "post");
    const login = getHandler("/postlogin", "post");
    const create = getHandler("/hh", "post");
    const edit = getHandler("/edit", "post");
    const change = getHandler("/change", "post");
    const update = getHandler("/update", "post");
    const listRecords = getHandler("/api/records", "get");
    const audit = getHandler("/api/records/:id/audit", "get");

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
    await login(
      makeReq({
        body: {
          email: "records@example.com",
          pwd: "Amber!Comet42Velvet",
          uname: "Records User",
        },
        session,
      }),
      makeRes(),
    );

    const createRes = makeRes();
    await create(
      makeReq({
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
      }),
      createRes,
    );
    assert.equal(createRes.redirectUrl, "/home");

    const duplicateRes = makeRes();
    await create(
      makeReq({
        body: {
          Date: "2026-09-18",
          Time: "10:01",
          sname: "Student Two",
          spno: "9999999998",
          rno: "A101",
          clg: "ABC College",
          brch: "CSE",
          year: "2",
          sec: "A",
          pname: "Parent Two",
          ppno: "8888888887",
          ename: "Emergency Two",
          epno: "7777777776",
          eid: "E102",
          rsn: "Second record",
          mmodel: "Pixel 9",
          imei: "223456789012345",
          mclr: "Black",
        },
        session,
      }),
      duplicateRes,
    );
    assert.equal(duplicateRes.statusCode, 409);
    assert.match(JSON.stringify(duplicateRes.body), /duplicate|already/i);

    const secondaryCreateRes = makeRes();
    await create(
      makeReq({
        body: {
          Date: "2026-09-18",
          Time: "10:01",
          sname: "Student Two",
          spno: "9999999998",
          rno: "A102",
          clg: "ABC College",
          brch: "CSE",
          year: "2",
          sec: "A",
          pname: "Parent Two",
          ppno: "8888888887",
          ename: "Emergency Two",
          epno: "7777777776",
          eid: "E102",
          rsn: "Second record",
          mmodel: "Pixel 9",
          imei: "223456789012345",
          mclr: "Black",
        },
        session,
      }),
      secondaryCreateRes,
    );
    assert.equal(secondaryCreateRes.redirectUrl, "/home");

    const messyCreateRes = makeRes();
    await create(
      makeReq({
        body: {
          Date: "2026-09-18",
          Time: "10:02",
          sname: "  mohammed   farhan  ",
          spno: "9848012345",
          rno: "A103",
          clg: "  acs   college  ",
          brch: " cse ",
          year: "2",
          sec: " a ",
          pname: "  ayesha   khan  ",
          ppno: "9848012346",
          ename: "  ram   shetty  ",
          epno: "9876543210",
          eid: "E103",
          rsn: "  <script>alert(1)</script> used during class  ",
          mmodel: "  iphone 15  ",
          imei: "123456789012346",
          mclr: "  silver   grey  ",
        },
        session,
      }),
      messyCreateRes,
    );
    assert.equal(messyCreateRes.redirectUrl, "/home");

    const messyListRes = makeRes();
    await listRecords(
      makeReq({
        session,
        query: {
          draw: "1",
          start: "0",
          length: "10",
          search: { value: "A103" },
        },
      }),
      messyListRes,
    );
    const messyRecord = messyListRes.body.data[0];
    assert.equal(messyRecord.sname, "Mohammed Farhan");
    assert.equal(messyRecord.pname, "Ayesha Khan");
    assert.equal(messyRecord.ename, "Ram Shetty");
    assert.equal(messyRecord.clg, "Acs College");
    assert.equal(messyRecord.brch, "Cse");
    assert.equal(messyRecord.mmodel, "Iphone 15");
    assert.equal(messyRecord.mclr, "Silver Grey");
    assert.equal(messyRecord.rsn, "Used During Class");
    assert.equal(messyRecord.spno, "+919848012345");
    assert.equal(messyRecord.ppno, "+919848012346");
    assert.equal(messyRecord.epno, "+919876543210");

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
    const firstSameRollRecord = listRes.body.data.find(
      (record) => record.sname === "Student One",
    );
    assert.ok(firstSameRollRecord);
    const recordId = firstSameRollRecord._id;

    const editRes = makeRes();
    await edit(makeReq({ body: { _id: recordId }, session }), editRes);
    assert.equal(editRes.statusCode, 200);
    assert.equal(editRes.body.rno, "A101");

    const changeRes = makeRes();
    await change(makeReq({ body: { _id: recordId }, session }), changeRes);
    assert.equal(changeRes.redirectUrl, "/home");

    const updateRes = makeRes();
    await update(
      makeReq({
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
          status: "Returned",
        },
        session,
      }),
      updateRes,
    );
    assert.equal(updateRes.redirectUrl, "/home");

    const statusEditRes = makeRes();
    await edit(makeReq({ body: { _id: recordId }, session }), statusEditRes);
    assert.equal(statusEditRes.body.status, "Returned");

    const inlineUpdateRes = makeRes();
    await update(
      makeReq({
        body: {
          _id: recordId,
          Date: "2026-09-18",
          Time: "12:00",
          sname: "Student One Updated",
          spno: "9999999999",
          rno: "A102",
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
          status: "At_office",
        },
        session,
      }),
      inlineUpdateRes,
    );
    assert.equal(inlineUpdateRes.redirectUrl, "/home");
    const renamedEditRes = makeRes();
    await edit(makeReq({ body: { _id: recordId }, session }), renamedEditRes);
    assert.equal(renamedEditRes.body.rno, "A102");
    assert.equal(renamedEditRes.body.pname, "Parent One");
    assert.equal(renamedEditRes.body.status, "At_office");

    const remainingRollRes = makeRes();
    await listRecords(
      makeReq({
        session,
        query: {
          draw: "2",
          start: "0",
          length: "10",
          search: { value: "A101" },
        },
      }),
      remainingRollRes,
    );
    assert.equal(remainingRollRes.body.recordsFiltered, 0);
    assert.deepEqual(remainingRollRes.body.data, []);

    const auditRes = makeRes();
    await audit(makeReq({ params: { id: recordId }, session }), auditRes);
    assert.equal(auditRes.statusCode, 200);
    const actions = new Set(
      auditRes.body.data.map((entry) => entry.actionType),
    );
    assert.ok(actions.has("CREATE"));
    assert.ok(actions.has("STATUS_CHANGE"));
    assert.ok(actions.has("UPDATE"));
    const nameChange = auditRes.body.data.find(
      (entry) => entry.field === "sname" && entry.actionType === "UPDATE",
    );
    assert.equal(nameChange.oldValue, "Student One");
    assert.equal(nameChange.newValue, "Student One Updated");
    assert.equal(nameChange.changedByEmail, "records@example.com");
  });

  await run(
    "server-side records API filters, sorts, and pages DataTables requests",
    async () => {
      resetState();
      const signup = getHandler("/postsignup", "post");
      const login = getHandler("/postlogin", "post");
      const create = getHandler("/hh", "post");
      const records = getHandler("/api/records", "get");
      await signup(
        makeReq({
          body: { email: "datatable@example.com", pwd: "Amber!Comet42Velvet" },
        }),
        makeRes(),
      );
      const session = {
        regenerate: (callback) => callback(null),
        user: undefined,
      };
      await login(
        makeReq({
          body: { email: "datatable@example.com", pwd: "Amber!Comet42Velvet" },
          session,
        }),
        makeRes(),
      );

      for (const [index, date] of [
        "2026-01-01",
        "2026-01-02",
        "2026-01-03",
      ].entries()) {
        await create(
          makeReq({
            session,
            body: {
              Date: date,
              Time: "10:00",
              sname: "ServerPageMarker",
              rno: `PAGE${index + 1}`,
              clg: "ABC College",
              brch: "CSE",
              year: "2",
              sec: "A",
              mmodel: "Phone Model",
              imei: `12345678901234${index}`,
            },
          }),
          makeRes(),
        );
      }

      const response = makeRes();
      await records(
        makeReq({
          session,
          query: {
            draw: "17",
            start: "0",
            length: "1",
            status: "At_office",
            search: { value: "ServerPageMarker" },
            order: [{ column: "0", dir: "desc" }],
            columns: [{ data: "Date" }],
          },
        }),
        response,
      );

      assert.equal(response.statusCode, 200);
      assert.equal(response.body.draw, 17);
      assert.equal(response.body.recordsFiltered, 3);
      assert.equal(response.body.data.length, 1);
      assert.equal(response.body.data[0].Date, "2026-01-03");
    },
  );

  await run(
    "optimistic concurrency rejects stale record updates and increments version numbers",
    async () => {
      let latestVersion = 0;
      const record = {
        _id: "rec-900",
        Date: "2026-09-18",
        Time: "10:00",
        sname: "Alpha Student",
        spno: "9876543210",
        rno: "A900",
        clg: "Test College",
        brch: "CSE",
        year: "2",
        sec: "A",
        pname: "Parent Alpha",
        ppno: "9123456789",
        ename: "Employee Alpha",
        epno: "9098765432",
        eid: "E900",
        rsn: "Normal use",
        mmodel: "Pixel 8",
        imei: "123456789012345",
        mclr: "Black",
        status: "At_office",
        deletedAt: null,
        __v: 0,
      };
      const repo = {
        find: async (filter = {}) => {
          if (filter._id === record._id && filter.deletedAt === null)
            return [record];
          return [];
        },
        update: async (filter, updateDoc) => {
          const expectedVersion = Number(filter.__v ?? latestVersion);
          if (record.__v !== expectedVersion) {
            return { ok: 0, matchedCount: 0, modifiedCount: 0 };
          }
          if (updateDoc.$set) Object.assign(record, updateDoc.$set);
          if (updateDoc.$inc && updateDoc.$inc.__v) {
            latestVersion =
              Number(record.__v || 0) + Number(updateDoc.$inc.__v);
            record.__v = latestVersion;
          }
          return { ok: 1, matchedCount: 1, modifiedCount: 1 };
        },
      };
      const auditRepo = { insert: async () => undefined };
      const service = createDeviceService({
        getRecordRepository: () => repo,
        getAuditRepository: () => auditRepo,
      });

      await assert.rejects(
        () =>
          service.updateById(
            record._id,
            { ...record, rsn: "Updated by stale draft", status: "Returned" },
            "records@example.com",
            999,
          ),
        /changed by another staff member/i,
      );

      const result = await service.updateById(
        record._id,
        {
          ...record,
          rsn: "Updated by current staff",
          status: "Returned",
        },
        "records@example.com",
        0,
      );
      assert.equal(result.matchedCount, 1);
      assert.equal(record.__v, 1);
      assert.equal(record.rsn, "Updated by current staff");
      assert.equal(record.status, "Returned");
    },
  );

  await run(
    "receipt numbers are generated sequentially per intake",
    async () => {
      let sequence = 0;
      const service = createDeviceService({
        getRecordRepository: () => ({
          find: async () => [],
          insert: async (record) => ({ ...record, _id: `rec-${sequence + 1}` }),
        }),
        getCounterRepository: () => ({
          findOneAndUpdate: async (filter, update) => {
            sequence += 1;
            return { _id: filter._id, seq: sequence };
          },
        }),
      });

      const first = await service.create(
        {
          Date: "2026-09-18",
          Time: "10:00",
          sname: "Alpha Student",
          rno: "A900",
          clg: "Test College",
          brch: "CSE",
          year: "2",
          sec: "A",
          mmodel: "Pixel 8",
          imei: "123456789012345",
          status: "At_office",
        },
        "records@example.com",
      );
      const second = await service.create(
        {
          Date: "2026-09-18",
          Time: "10:05",
          sname: "Beta Student",
          rno: "A901",
          clg: "Test College",
          brch: "CSE",
          year: "2",
          sec: "A",
          mmodel: "Pixel 9",
          imei: "123456789012346",
          status: "At_office",
        },
        "records@example.com",
      );

      assert.equal(first.receiptNo, "MSA-2026-000001");
      assert.equal(second.receiptNo, "MSA-2026-000002");
    },
  );

  await run(
    "device purge service targets only records older than the retention cutoff",
    async () => {
      const cutoff = new Date("2026-09-01T00:00:00.000Z");
      let purgeFilter;
      const service = createDeviceService({
        getRecordRepository: () => ({
          remove: async (filter) => {
            purgeFilter = filter;
            return { deletedCount: 2 };
          },
        }),
      });
      const result = await service.purgeDeletedBefore(cutoff);
      assert.deepEqual(purgeFilter, { deletedAt: { $lt: cutoff } });
      assert.equal(result.deletedCount, 2);
    },
  );

  await run(
    "Mongo connection retries back off and health reports connectivity",
    async () => {
      let attempts = 0;
      const delays = [];
      const mongo = createMongoConnectionService({
        connect: async () => {
          attempts += 1;
          if (attempts < 3) throw new Error("temporary outage");
          return "connected";
        },
        getConnection: () => ({
          readyState: 1,
          db: {
            admin: () => ({ ping: async () => ({ ok: 1 }) }),
            stats: async () => ({ db: "testdb", collections: 2 }),
          },
        }),
        wait: async (milliseconds) => delays.push(milliseconds),
        logger: { warn: () => {} },
        attempts: 5,
        initialDelayMs: 100,
      });

      assert.equal(await mongo.connectWithRetry("mongodb://test"), "connected");
      assert.equal(attempts, 3);
      assert.deepEqual(delays, [100, 200]);
      assert.deepEqual(await mongo.getHealth(), {
        healthy: true,
        mongo: { state: "connected", db: "testdb", collections: 2 },
      });

      let failedAttempts = 0;
      const retryDelays = [];
      const unavailableMongo = createMongoConnectionService({
        connect: async () => {
          failedAttempts += 1;
          throw new Error("database unavailable");
        },
        getConnection: () => ({ readyState: 0 }),
        wait: async (milliseconds) => retryDelays.push(milliseconds),
        logger: { warn: () => {} },
        attempts: 5,
        initialDelayMs: 100,
      });
      await assert.rejects(
        unavailableMongo.connectWithRetry("mongodb://test"),
        /database unavailable/,
      );
      assert.equal(failedAttempts, 5);
      assert.deepEqual(retryDelays, [100, 200, 400, 800]);

      const disconnected = createMongoConnectionService({
        connect: async () => {},
        getConnection: () => ({ readyState: 0 }),
      });
      assert.deepEqual(await disconnected.getHealth(), {
        healthy: false,
        mongo: { state: "disconnected" },
      });
    },
  );

  await run(
    "dashboard counts use parallel active-record count queries",
    async () => {
      const calls = [];
      const service = createDeviceService({
        getRecordRepository: () => ({
          countDocuments: async (filter, hint) => {
            calls.push({ filter, hint });
            return filter.status === "At_office"
              ? 6
              : filter.status === "Returned"
                ? 4
                : 10;
          },
        }),
      });
      const counts = await service.getDashboardCounts();
      assert.deepEqual(counts, { total: 10, atOffice: 6, returned: 4 });
      assert.deepEqual(calls, [
        { filter: { deletedAt: null }, hint: { deletedAt: 1, status: 1 } },
        {
          filter: { deletedAt: null, status: "At_office" },
          hint: { deletedAt: 1, status: 1 },
        },
        {
          filter: { deletedAt: null, status: "Returned" },
          hint: { deletedAt: 1, status: 1 },
        },
      ]);
    },
  );

  await run(
    "dashboard KPI trends include delta percentages and sparkline points",
    async () => {
      const today = new Date("2026-10-01T12:00:00Z");
      const calls = [];
      const service = createDeviceService({
        getRecordRepository: () => ({
          countDocuments: async (filter) => {
            calls.push(filter);
            const status = filter.status;
            if (filter.createdAt && filter.createdAt.$gte) {
              const start = new Date(filter.createdAt.$gte);
              const end = new Date(filter.createdAt.$lt);
              const isPrevious = end < new Date("2026-10-01T00:00:00Z");
              if (status === "At_office") {
                return isPrevious ? 4 : 8;
              }
              if (status === "Returned") {
                return isPrevious ? 3 : 6;
              }
              return isPrevious ? 10 : 14;
            }
            return 0;
          },
        }),
      });

      const trends = await service.getDashboardKpiTrends(today);
      assert.equal(trends.total.delta, 40);
      assert.equal(trends.atOffice.delta, 100);
      assert.equal(trends.returned.delta, 100);
      assert.match(trends.total.sparkline, /^\d+(?:,\d+){9}$/);
      assert.match(trends.atOffice.sparkline, /^\d+(?:,\d+){9}$/);
      assert.match(trends.returned.sparkline, /^\d+(?:,\d+){9}$/);
      assert.ok(calls.length >= 6);
    },
  );

  await run(
    "dashboard repeat offenders ranks students by seizure frequency",
    async () => {
      const service = createDeviceService({
        getRecordRepository: () => ({
          find: async (filter = {}) => [
            { sname: "Anjali Sharma", deletedAt: null },
            { sname: "Anjali Sharma", deletedAt: null },
            { sname: "Rahul Nair", deletedAt: null },
            { sname: "Rahul Nair", deletedAt: null },
            { sname: "Rahul Nair", deletedAt: null },
            { sname: "Meera Iyer", deletedAt: null },
          ],
        }),
      });

      const offenders = await service.getRepeatOffenders(3);
      assert.deepEqual(
        offenders.map((item) => item.name),
        ["Rahul Nair", "Anjali Sharma", "Meera Iyer"],
      );
      assert.deepEqual(
        offenders.map((item) => item.count),
        [3, 2, 1],
      );
    },
  );

  await run(
    "dashboard staff leaderboard counts total and current-month intakes",
    async () => {
      const service = createDeviceService({
        getRecordRepository: () => ({
          find: async () => [
            {
              ename: "Priya Rao",
              eid: "E-1",
              createdAt: new Date("2026-10-03T08:00:00Z"),
            },
            {
              ename: "Priya Rao",
              eid: "E-1",
              createdAt: new Date("2026-09-29T08:00:00Z"),
            },
            {
              ename: "Arun Das",
              eid: "E-2",
              createdAt: new Date("2026-10-02T08:00:00Z"),
            },
            { ename: "", eid: "", createdAt: new Date("2026-10-01T08:00:00Z") },
          ],
        }),
      });

      const leaderboard = await service.getEmployeeLeaderboard(
        5,
        new Date("2026-10-15T12:00:00Z"),
      );
      assert.deepEqual(leaderboard, [
        {
          name: "Priya Rao",
          employeeId: "E-1",
          totalIntakes: 2,
          monthIntakes: 1,
        },
        {
          name: "Arun Das",
          employeeId: "E-2",
          totalIntakes: 1,
          monthIntakes: 1,
        },
      ]);
    },
  );

  await run(
    "dashboard activity groups today's audit field changes",
    async () => {
      const activityDate = new Date("2026-10-01T12:00:00");
      const start = new Date(activityDate);
      start.setHours(0, 0, 0, 0);
      const service = createDeviceService({
        getAuditRepository: () => ({
          find: async () => [
            {
              recordId: "r-1",
              recordRno: "A101",
              actionType: "CREATE",
              changedByEmail: "staff@example.com",
              changedAt: new Date(start.getTime() + 3600000),
              field: "sname",
            },
            {
              recordId: "r-1",
              recordRno: "A101",
              actionType: "CREATE",
              changedByEmail: "staff@example.com",
              changedAt: new Date(start.getTime() + 3600500),
              field: "imei",
            },
            {
              recordId: "r-2",
              recordRno: "A102",
              actionType: "STATUS_CHANGE",
              changedByEmail: "staff@example.com",
              changedAt: new Date(start.getTime() + 7200000),
              field: "status",
              newValue: "Returned",
            },
            {
              recordId: "r-3",
              recordRno: "A103",
              actionType: "DELETE",
              changedByEmail: "staff@example.com",
              changedAt: new Date(start.getTime() - 1000),
              field: "deletedAt",
            },
          ],
        }),
      });

      const activities = await service.getDashboardActivity(20, activityDate);
      assert.equal(activities.length, 2);
      assert.deepEqual(
        activities.map((item) => item.summary),
        ["Marked returned", "Created record"],
      );
      assert.deepEqual(
        activities.map((item) => item.count),
        [1, 2],
      );
    },
  );

  await run(
    "dashboard shell renders loading skeleton placeholders",
    async () => {
      const pug = require("pug");
      const path = require("node:path");
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
    },
  );

  await run("dashboard aging KPIs count stale at-office records", async () => {
    const service = createDeviceService({
      getRecordRepository: () => ({
        countDocuments: async (filter) => {
          const createdAt = filter.createdAt || {};
          if (createdAt.$lt) {
            const cutoff = new Date(createdAt.$lt);
            if (cutoff.getTime() <= new Date("2026-07-01T12:00:00Z").getTime())
              return 3;
            if (cutoff.getTime() <= new Date("2026-09-01T12:00:00Z").getTime())
              return 7;
            if (cutoff.getTime() <= new Date("2026-09-24T12:00:00Z").getTime())
              return 12;
            return 0;
          }
          return 0;
        },
      }),
    });

    const aging = await service.getDashboardAgingKpis(
      new Date("2026-10-01T12:00:00Z"),
    );
    assert.deepEqual(aging, {
      over7Days: 12,
      over30Days: 7,
      over90Days: 7,
    });
  });

  await run(
    "visitor dashboard summary tracks today month and all-time counts",
    async () => {
      const { createVisitorService } = require("../services/VisitorService");
      const service = createVisitorService({
        getVisitorRepository: () => ({
          countDocuments: async (filter) => {
            const time = filter.time || {};
            if (time.$gte && time.$lt) {
              if (filter.email) return 3;
              return 12;
            }
            if (filter.time && filter.time.$gte) {
              return 8;
            }
            return 42;
          },
        }),
      });

      const summary = await service.getVisitorSummary(
        new Date("2026-10-01T12:00:00Z"),
      );
      assert.deepEqual(summary, {
        today: 8,
        thisMonth: 12,
        allTime: 42,
      });
    },
  );

  await run("unauthenticated home redirects", async () => {
    const home = getHandler("/home", "get");
    const res = makeRes();
    await home(makeReq(), res);
    assert.equal(res.redirectUrl, "/");
  });

  await run("logout clears session", async () => {
    resetState();
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
    await login(
      makeReq({
        body: {
          email: "logout@example.com",
          pwd: "Amber!Comet42Velvet",
          uname: "Logout User",
        },
        session,
      }),
      makeRes(),
    );

    const out = makeRes();
    await logout(makeReq({ session }), out);
    assert.equal(out.redirectUrl, "/");
  });

  console.log(`Summary: ${passed}/${total} checks passed`);
  process.exit(passed === total ? 0 : 1);
})();
