// Reset erica_demo password and mint a JWT for screenshot session.
const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const db = new Database('/home/kitkat/projects/radcase/radcase.db');
const ERICA_ID = '1fa5dab5-c5f6-40fd-a851-52c5ebc8f18b';

// Reset password
const hash = bcrypt.hashSync('demo1234', 10);
db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, ERICA_ID);
console.log('Password reset OK');

// Mint token like the auth route does
const SECRET = process.env.JWT_SECRET || 'dev-secret-please-change';
const token = jwt.sign({ id: ERICA_ID, username: 'erica_demo' }, SECRET, { expiresIn: '7d' });
console.log('Generated token (signed with default dev secret):');
console.log(token);
db.close();
