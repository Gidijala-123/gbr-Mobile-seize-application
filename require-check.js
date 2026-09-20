const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function patchedLoad(requested, parent, isMain) {
  if (requested === 'monk') {
    return () => {
      const db = {
        then: (callback) => Promise.resolve().then(callback).then(() => db),
        catch: (callback) => Promise.resolve().catch(callback),
        get: (collectionName) => ({ createIndex: async () => {}, insert: async () => ({ _id: 'x' }), findOne: async () => null, find: async () => [], update: async () => ({ ok: 1 }) }),
      };
      return db;
    };
  }
  if (requested === 'nodemailer') {
    return { createTransport: () => ({ sendMail: async () => ({ ok: true }) }) };
  }
  return originalLoad.apply(this, arguments);
};

process.env.MONGODB_URI = 'mongodb://localhost:27017/testdb';
process.env.SESSION_SECRET = 'secret';
process.env.GMAIL_USER = 'demo@example.com';
process.env.GMAIL_PASS = 'demo-password';

console.log('start');
require('./routes/index');
console.log('after require');
process.exit(0);
