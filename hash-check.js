const crypto = require('crypto');
const { promisify } = require('util');
const pbkdf2 = promisify(crypto.pbkdf2);

console.log('start');
pbkdf2('StrongPassword123', 'salt', 60000, 64, 'sha512')
  .then((result) => {
    console.log('done', result.length);
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
