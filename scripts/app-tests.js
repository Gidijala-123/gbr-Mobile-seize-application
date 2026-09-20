const Module = require('node:module');
const assert = require('node:assert/strict');

process.env.MONGODB_URI = 'mongodb://localhost:27017/testdb';
process.env.SESSION_SECRET = 'test-session-secret';
process.env.GMAIL_USER = 'demo@example.com';
process.env.GMAIL_PASS = 'demo-password';

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
      if (name === 'registration_coll') {
        const user = { ...payload, _id: `user-${appState.users.size + 1}` };
        appState.users.set(user.email, user);
        return user;
      }
      if (name === 'student_data') {
        const record = { ...payload, _id: `student-${appState.records.length + 1}` };
        appState.records.push(record);
        return record;
      }
      return { ...payload, _id: `doc-${Date.now()}` };
    },
    findOne: async ({ email }) => appState.users.get(email) || null,
    find: async (filter = {}) => {
      if (name === 'student_data') {
        if (Object.keys(filter).length === 0) return [...appState.records];
        return appState.records.filter((record) => record.rno === filter.rno);
      }
      return [];
    },
    update: async (query, update) => {
      if (name === 'registration_coll') {
        const user = appState.users.get(query.email);
        if (!user) return { ok: 0 };
        Object.assign(user, update.$set);
        return { ok: 1 };
      }
      if (name === 'student_data') {
        const record = appState.records.find((item) => item.rno === query.rno);
        if (!record) return { ok: 0 };
        Object.assign(record, update.$set);
        return { ok: 1 };
      }
      return { ok: 1 };
    },
  };
}

const db = {
  then: (callback) => Promise.resolve().then(callback).then(() => db),
  catch: (callback) => Promise.resolve().catch(callback),
  get: (collectionName) => makeCollection(collectionName),
};

const originalLoad = Module._load;
Module._load = function patchedLoad(requested, parent, isMain) {
  if (requested === 'monk') {
    return () => db;
  }
  if (requested === 'nodemailer') {
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

const router = require('../routes/index');
const getHandler = (pathname, method) => {
  const route = router.stack.find(
    (layer) => layer.route && layer.route.path === pathname && layer.route.methods[method.toLowerCase()]
  );
  return route && route.route.stack[0].handle;
};

const makeReq = (overrides = {}) => ({
  body: {},
  session: { regenerate: (cb) => cb(null), destroy: (cb) => cb() },
  ...overrides,
});

const makeRes = () => ({
  statusCode: 200,
  body: undefined,
  view: undefined,
  redirectUrl: undefined,
  status(code) { this.statusCode = code; return this; },
  send(body) { this.body = body; return this; },
  json(body) { this.body = body; return this; },
  render(view) { this.view = view; return this; },
  redirect(url) { this.redirectUrl = url; return this; },
  sendStatus(code) { this.statusCode = code; return this; },
});

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

  await run('render sign-in page', async () => {
    const handler = getHandler('/', 'get');
    const res = makeRes();
    await handler(makeReq(), res);
    assert.equal(res.view, 'signLog_net');
  });

  await run('signup creates account', async () => {
    resetState();
    const signup = getHandler('/postsignup', 'post');
    const res = makeRes();
    await signup(makeReq({ body: { email: 'demo@example.com', pwd: 'StrongPassword123' } }), res);
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.email, 'demo@example.com');
  });

  await run('login authenticates user', async () => {
    resetState();
    const signup = getHandler('/postsignup', 'post');
    const login = getHandler('/postlogin', 'post');
    await signup(makeReq({ body: { email: 'alice@example.com', pwd: 'StrongPassword123' } }), makeRes());

    const session = { regenerate: (callback) => callback(null) };
    const req = makeReq({ body: { email: 'alice@example.com', pwd: 'StrongPassword123', uname: 'Alice' }, session });
    const loginRes = makeRes();
    await login(req, loginRes);
    assert.equal(loginRes.statusCode, 204);
    assert.equal(req.session.user.email, 'alice@example.com');
  });

  await run('forgot password flow sends reset email', async () => {
    resetState();
    const signup = getHandler('/postsignup', 'post');
    const forgot = getHandler('/postforgot', 'post');
    await signup(makeReq({ body: { email: 'forgot@example.com', pwd: 'StrongPassword123' } }), makeRes());
    const res = makeRes();
    await forgot(makeReq({ body: { email: 'forgot@example.com' } }), res);
    assert.equal(res.statusCode, 204);
    assert.equal(appState.mail.length, 1);
    assert.equal(appState.mail[0].to, 'forgot@example.com');
  });

  await run('student record flow works', async () => {
    resetState();
    const signup = getHandler('/postsignup', 'post');
    const login = getHandler('/postlogin', 'post');
    const create = getHandler('/hh', 'post');
    const edit = getHandler('/edit', 'post');
    const update = getHandler('/update', 'post');

    await signup(makeReq({ body: { email: 'records@example.com', pwd: 'StrongPassword123' } }), makeRes());
    const session = { regenerate: (callback) => callback(null), user: undefined };
    await login(makeReq({ body: { email: 'records@example.com', pwd: 'StrongPassword123', uname: 'Records User' }, session }), makeRes());

    const createRes = makeRes();
    await create(makeReq({ body: { Date: '2026-09-18', Time: '10:00', sname: 'Student One', spno: '9999999999', rno: 'A101', clg: 'ABC College', brch: 'CSE', year: '2', sec: 'A', pname: 'Parent One', ppno: '8888888888', ename: 'Emergency One', epno: '7777777777', eid: 'E101', rsn: 'Lost phone', mmodel: 'iPhone 15', imei: '123456789012345', mclr: 'Blue' }, session }), createRes);
    assert.equal(createRes.redirectUrl, '/home');

    const editRes = makeRes();
    await edit(makeReq({ body: { rno: 'A101' }, session }), editRes);
    assert.equal(editRes.body[0].rno, 'A101');

    const updateRes = makeRes();
    await update(makeReq({ body: { Date: '2026-09-18', Time: '12:00', sname: 'Student One Updated', spno: '9999999999', rno: 'A101', clg: 'ABC College', brch: 'CSE', year: '2', sec: 'A', pname: 'Parent One', ppno: '8888888888', ename: 'Emergency One', epno: '7777777777', eid: 'E101', rsn: 'Recovered', mmodel: 'iPhone 16', imei: '123456789012345', mclr: 'Blue' }, session }), updateRes);
    assert.equal(updateRes.redirectUrl, '/home');
  });

  await run('unauthenticated home redirects', async () => {
    const home = getHandler('/home', 'get');
    const res = makeRes();
    await home(makeReq(), res);
    assert.equal(res.redirectUrl, '/');
  });

  await run('logout clears session', async () => {
    resetState();
    const signup = getHandler('/postsignup', 'post');
    const login = getHandler('/postlogin', 'post');
    const logout = getHandler('/logout', 'get');

    await signup(makeReq({ body: { email: 'logout@example.com', pwd: 'StrongPassword123' } }), makeRes());
    const session = { regenerate: (callback) => callback(null), destroy: (callback) => callback() };
    await login(makeReq({ body: { email: 'logout@example.com', pwd: 'StrongPassword123', uname: 'Logout User' }, session }), makeRes());

    const out = makeRes();
    await logout(makeReq({ session }), out);
    assert.equal(out.redirectUrl, '/');
  });

  console.log(`Summary: ${passed}/${total} checks passed`);
  process.exit(passed === total ? 0 : 1);
})();
