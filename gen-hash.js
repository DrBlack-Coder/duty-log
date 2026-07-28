// Run locally to turn your chosen password into the hash the server checks
// against, so the real password never has to sit in an env var in plain text.
//   node gen-hash.js "your password here"
const bcrypt = require("bcryptjs");

const pw = process.argv[2];
if (!pw) {
  console.error('Usage: node gen-hash.js "your password"');
  process.exit(1);
}
bcrypt.hash(pw, 10).then((hash) => {
  console.log("\nPut this in Render as APP_PASSWORD_HASH:\n");
  console.log(hash);
  console.log("");
});
