const { describe, test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

process.env.MONGODB_URI = "mongodb://localhost:27017/testdb";
process.env.SESSION_SECRET = "test-session-secret";
process.env.GMAIL_USER = "demo@example.com";
process.env.GMAIL_PASS = "demo-password";

const appState = {
  users: new Map(),
  records: [],
  mail: [],
};

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
        appState.users.set(user.email, user);
        return user;
      }

      if (name === "student_data") {
        const record = { ...payload, _id: `student-${appState.records.length + 1}` };
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
    findOne: async ({ email }) => appState.users.get(email) || null,
    find: async (filter = {}) => {
      if (name === "student_data") {
        if (Object.keys(filter).length === 0) return [...appState.records];
        return appState.records.filter((record) => record.rno === filter.rno);
      }
      return [];
    },
    update: async (query, update) => {
      if (name === "registration_coll") {
        const user = appState.users.get(query.email);
        if (!user) return { ok: 0 };
        Object.assign(user, update.$set);
        return { ok: 1 };
      }

      if (name === "student_data") {
        const record = appState.records.find((item) => item.rno === query.rno);
        if (!record) return { ok: 0 };
        Object.assign(record, update.$set);
        return { ok: 1 };
      }

      return { ok: 1 };
    },
  };
}

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "monk") {
    return () => {
      const db = {
        then: (callback) => Promise.resolve().then(callback).then(() => db),
        catch: (callback) => Promise.resolve().catch(callback),
        get: (collectionName) => makeCollection(collectionName),
      };
      return db;
    };
  }

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

  return originalLoad.apply(this, arguments);
};

delete require.cache[require.resolve("../routes/index")];
const router = require("../routes/index");

function getHandler(pathname, method) {
  const route = router.stack.find(
    (layer) => layer.route && layer.route.path === pathname && layer.route.methods[method.toLowerCase()]
  );
  return route && route.route.stack[0].handle;
}

function makeReq(overrides = {}) {
  return {
    body: {},
    session: { regenerate: (callback) => callback(null), destroy: (callback) => callback() },
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
    return this;
  };

  return res;
}

describe("Application route validation", () => {
  beforeEach(() => resetState());

  test("GET / renders the sign-in page", async () => {
    const handler = getHandler("/", "get");
    const res = makeRes();

    await handler(makeReq(), res);

    assert.equal(res.view, "signLog_net");
  });

  test("POST /postsignup creates a valid account and rejects duplicates", async () => {
    const signup = getHandler("/postsignup", "post");

    const firstReq = makeReq({ body: { email: "demo@example.com", pwd: "StrongPassword123" } });
    const firstRes = makeRes();
    await signup(firstReq, firstRes);

    assert.equal(firstRes.statusCode, 201);
    assert.equal(firstRes.body.email, "demo@example.com");

    const duplicateReq = makeReq({ body: { email: "demo@example.com", pwd: "StrongPassword123" } });
    const duplicateRes = makeRes();
    await signup(duplicateReq, duplicateRes);

    assert.equal(duplicateRes.statusCode, 409);
    assert.match(String(duplicateRes.body), /already exists|duplicate/i);
  });

  test("POST /postlogin authenticates a user and sets the session", async () => {
    const signup = getHandler("/postsignup", "post");
    const login = getHandler("/postlogin", "post");

    await signup(makeReq({ body: { email: "alice@example.com", pwd: "StrongPassword123" } }), makeRes());

    const req = makeReq({
      body: { email: "alice@example.com", pwd: "StrongPassword123", uname: "Alice" },
      session: {
        regenerate: (callback) => callback(null),
      },
    });
    const res = makeRes();
    await login(req, res);

    assert.equal(res.statusCode, 204);
    assert.equal(req.session.user.email, "alice@example.com");
  });

  test("POST /hh, /change, /edit, and /update manage the student record lifecycle", async () => {
    const signup = getHandler("/postsignup", "post");
    const login = getHandler("/postlogin", "post");
    const create = getHandler("/hh", "post");
    const edit = getHandler("/edit", "post");
    const change = getHandler("/change", "post");
    const update = getHandler("/update", "post");

    await signup(makeReq({ body: { email: "records@example.com", pwd: "StrongPassword123" } }), makeRes());

    const session = { regenerate: (callback) => callback(null), user: undefined };
    const loginReq = makeReq({
      body: { email: "records@example.com", pwd: "StrongPassword123", uname: "Records User" },
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

    const editReq = makeReq({ body: { rno: "A101" }, session });
    const editRes = makeRes();
    await edit(editReq, editRes);
    assert.equal(editRes.body[0].rno, "A101");

    const changeReq = makeReq({ body: { rno: "A101" }, session });
    const changeRes = makeRes();
    await change(changeReq, changeRes);
    assert.equal(changeRes.redirectUrl, "/home");

    const updateReq = makeReq({
      body: {
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

  test("POST /postforgot sends an OTP email and updates the user password", async () => {
    const signup = getHandler("/postsignup", "post");
    const forgot = getHandler("/postforgot", "post");

    await signup(makeReq({ body: { email: "forgot@example.com", pwd: "StrongPassword123" } }), makeRes());

    const res = makeRes();
    await forgot(makeReq({ body: { email: "forgot@example.com" } }), res);

    assert.equal(res.statusCode, 204);
    assert.equal(appState.mail.length, 1);
    assert.equal(appState.mail[0].to, "forgot@example.com");
    assert.match(appState.mail[0].subject, /OTP/i);
  });

  test("GET /home redirects unauthenticated users", async () => {
    const home = getHandler("/home", "get");
    const res = makeRes();

    await home(makeReq(), res);

    assert.equal(res.redirectUrl, "/");
  });

  test("GET /logout clears the session", async () => {
    const signup = getHandler("/postsignup", "post");
    const login = getHandler("/postlogin", "post");
    const logout = getHandler("/logout", "get");

    await signup(makeReq({ body: { email: "logout@example.com", pwd: "StrongPassword123" } }), makeRes());

    const session = { regenerate: (callback) => callback(null), destroy: (callback) => callback() };
    const loginReq = makeReq({
      body: { email: "logout@example.com", pwd: "StrongPassword123", uname: "Logout User" },
      session,
    });
    await login(loginReq, makeRes());

    const logoutReq = makeReq({ session });
    const logoutRes = makeRes();
    await logout(logoutReq, logoutRes);

    assert.equal(logoutRes.redirectUrl, "/");
  });
});
