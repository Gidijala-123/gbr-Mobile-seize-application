const Module = require('node:module');
const appState = { users: new Map(), records: [], mail: [] };
const originalLoad = Module._load;
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
Module._load = function patchedLoad(requested, parent, isMain) {
  if (requested === 'monk') return () => db;
  if (requested === 'nodemailer') return { createTransport: () => ({ sendMail: async (mailOptions) => { appState.mail.push(mailOptions); return { accepted: [mailOptions.to] }; } }) };
  return originalLoad.apply(this, arguments);
};
process.env.MONGODB_URI = 'mongodb://localhost:27017/testdb';
process.env.SESSION_SECRET = 'secret';
process.env.GMAIL_USER = 'demo@example.com';
process.env.GMAIL_PASS = 'demo-password';
const router = require('./routes/index');
const getHandler = (pathname, method) => {
  const route = router.stack.find((layer) => layer.route && layer.route.path === pathname && layer.route.methods[method.toLowerCase()]);
  return route && route.route.stack[0].handle;
};
const makeRes = () => ({ statusCode: 200, body: undefined, view: undefined, redirectUrl: undefined, status(code){ this.statusCode=code; return this; }, send(body){ this.body=body; return this; }, json(body){ this.body=body; return this; }, render(view){ this.view=view; return this; }, redirect(url){ this.redirectUrl=url; return this; }, sendStatus(code){ this.statusCode=code; return this; } });
const makeReq = (body = {}, session = {}) => ({ body, session: { regenerate: (cb) => cb(null), destroy: (cb) => cb(), ...session } });
(async () => {
  console.log('start');
  const home = getHandler('/', 'get');
  const res = makeRes();
  await home(makeReq(), res);
  console.log('page ok', res.view, res.statusCode);

  const signup = getHandler('/postsignup', 'post');
  const signupRes = makeRes();
  await signup(makeReq({ email: 'demo@example.com', pwd: 'StrongPassword123' }), signupRes);
  console.log('signup ok', signupRes.statusCode, signupRes.body);

  const login = getHandler('/postlogin', 'post');
  const invalid = makeRes();
  const sess = { regenerate: (cb) => cb(null) };
  await login(makeReq({ email: 'demo@example.com', pwd: 'StrongPassword123', uname: 'Alice' }, sess), invalid);
  console.log('login ok', invalid.statusCode, sess.user);

  process.exit(0);
})().catch((err) => { console.error(err); process.exit(1); });
