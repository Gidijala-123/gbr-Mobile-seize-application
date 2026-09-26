const Module = require('node:module');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://localhost:27017/testdb';
process.env.SESSION_SECRET = 'test-session-secret';
process.env.GMAIL_USER = 'demo@example.com';
process.env.GMAIL_PASS = 'demo-password';

const appState = { users: new Map(), records: [], mail: [] };
function resetState() { appState.users.clear(); appState.records = []; appState.mail = []; }
function makeCollection(name) {
  return {
    createIndex: async () => { console.log('createIndex', name); },
    insert: async (payload) => {
      console.log('insert', name, payload.email || payload.rno || payload._id);
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
    find: async (filter = {}) => { return []; },
    update: async (query, update) => { return { ok: 1 }; },
    remove: async (filter = {}) => { console.log('remove', name, filter); return { deletedCount: 0 }; },
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
    console.log('patched monk requested');
    return () => db;
  }
  if (requested === 'nodemailer') {
    return { createTransport: () => ({ sendMail: async (mailOptions) => { console.log('sendMail', mailOptions.to); return { accepted: [mailOptions.to] }; }})};
  }
  return originalLoad.apply(this, arguments);
};

console.log('before require');
const router = require('./routes/index');
console.log('after require', router.stack.length);
const route = router.stack.find((layer) => layer.route && layer.route.path === '/postsignup' && layer.route.methods.post);
console.log('route found?', !!route);
const signup = route.route.stack[0].handle;
const req = { body: { email: 'demo@example.com', pwd: 'StrongPassword123' }, session: { regenerate: (cb) => cb(null), destroy: (cb) => cb() } };
const res = { statusCode: 200, body: undefined, status(code) { this.statusCode = code; return this; }, send(body) { this.body = body; return this; }, json(body) { this.body = body; return this; }, render(view) { this.view = view; return this; }, redirect(url) { this.redirectUrl = url; return this; }, sendStatus(code) { this.statusCode = code; return this; } };
console.log('before signup call');
signup(req, res).then(() => { console.log('signup complete', res.statusCode, res.body); process.exit(0); }).catch((err) => { console.error('signup failed', err); process.exit(1); });
