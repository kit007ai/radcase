const Database = require('better-sqlite3');
const db = new Database('/home/kitkat/projects/radcase/radcase.db', {readonly:true});
const u = db.prepare("SELECT id, username, email, created_at FROM users WHERE username LIKE '%erica%' OR username LIKE '%demo%'").all();
console.log(u);
console.log('\nTotal cases with image_count > 0:', db.prepare('SELECT COUNT(*) AS c FROM cases WHERE image_count > 0').get().c);
console.log('Total cases:', db.prepare('SELECT COUNT(*) AS c FROM cases').get().c);
