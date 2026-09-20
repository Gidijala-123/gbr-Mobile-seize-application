const Module = require('node:module');
const originalLoad = Module._load;

const appState = { users: new Map(), records: [], mail: [] };

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

Module._load = function patchedLoad(requested, parent, isMain) {
  if (requested === 'monk') {
    return () => ({
      then: (callback) => Promise.resolve().then(callback).then(() => db),
      catch: (callback) => Promise.resolve().catch(callback),
      get: (collectionName) => makeCollection(collectionName),
    });
  }
  if (requested === 'nodemailer') {
    return { createTransport: () => ({ sendMail: async () => ({ accepted: ['demo@example.com'] }) }) };
  }
  return originalLoad.apply(this, arguments);
};

process.env.MONGODB_URI = 'mongodb://localhost:27017/testdb';
process.env.SESSION_SECRET = 'secret';
process.env.GMAIL_USER = 'demo@example.com';
process.env.GMAIL_PASS = 'demo-password';

const router = require('./routes/index');
const getHandler = (pathname, method) => {
  const route = router.stack.find(
    (layer) => layer.route && layer.route.path === pathname && layer.route.methods[method.toLowerCase()]
  );
  return route && route.route.stack[0].handle;
};

const makeRes = () => ({
  statusCode: 200,
  body: undefined,
  view: undefined,
  redirectUrl: undefined,
  status(code) { this.statusCode = code; return this; },
  send(body) { this.body = body; return this; },
  json(body) { this.body = body; return this; },
  render(view, data) { this.view = view; this.viewData = data; return this; },
  redirect(url) { this.redirectUrl = url; return this; },
  sendStatus(code) { this.statusCode = code; return this; },
});

(async () => {
  const getHome = getHandler('/', 'get');
  const res = makeRes();
  console.log('calling get /');
  await getHome({ body: {}, session: { regenerate: (cb) => cb(null) } }, res);
  console.log('render view', res.view, 'status', res.statusCode);

  const signup = getHandler('/postsignup', 'post');
  const signupRes = makeRes();
  console.log('calling signup');
  await signup({ body: { email: 'demo@example.com', pwd: 'StrongPassword123' }, session: { regenerate: (cb) => cb(null) } }, signupRes);
  console.log('signup status', signupRes.statusCode, signupRes.body);

  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
