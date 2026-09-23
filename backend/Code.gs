/**
 * Company Task List — Google Apps Script backend.
 *
 * Google Sheet is the database. This script is deployed as a Web App and the
 * React app (on GitHub Pages) talks to it with POST requests.
 *
 * Every permission check happens HERE, not in React. Never trust the browser.
 *
 * Setup: see backend/README.md
 */

var SESSION_DAYS = 7;
var DEFAULT_BRANCHES = ['Raipur', 'Durg', 'Jagdalpur', 'Rajim', 'Kurud', 'Hardware'];
var ROLES = ['admin', 'partner', 'manager', 'user'];
var STATUSES = ['Pending', 'In Progress', 'Done'];
var PRIORITIES = ['Low', 'Medium', 'High'];
var ALL_BRANCHES = 'All';

var HEADERS = {
  Users: ['id', 'username', 'passwordHash', 'salt', 'name', 'role', 'branch', 'active', 'createdAt'],
  Tasks: ['id', 'title', 'description', 'branch', 'assignedTo', 'assignedBy', 'priority', 'status',
          'dueDate', 'remarks', 'createdAt', 'updatedAt', 'completedAt'],
  Sessions: ['token', 'userId', 'expiresAt'],
  Branches: ['name']
};

// ---------------------------------------------------------------------------
// Web App entry points
// ---------------------------------------------------------------------------

function doGet() {
  return ContentService.createTextOutput('Task List API is running.');
}

function doPost(e) {
  var out;
  try {
    var req = JSON.parse(e.postData.contents);
    out = { ok: true, data: handle_(req.action, req.payload || {}, req.token) };
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

var PUBLIC_ACTIONS = { login: login_ };

var ACTIONS = {
  me: me_,
  logout: logout_,
  changePassword: changePassword_,
  listBranches: listBranches_,
  addBranch: addBranch_,
  listTasks: listTasks_,
  createTask: createTask_,
  updateTask: updateTask_,
  deleteTask: deleteTask_,
  listUsers: listUsers_,
  createUser: createUser_,
  updateUser: updateUser_,
  resetPassword: resetPassword_
};

var WRITE_ACTIONS = {
  login: true, logout: true, changePassword: true, addBranch: true, createTask: true,
  updateTask: true, deleteTask: true, createUser: true, updateUser: true, resetPassword: true
};

function handle_(action, payload, token) {
  var fn = PUBLIC_ACTIONS[action] || ACTIONS[action];
  if (!fn) throw new Error('Unknown action: ' + action);

  // One writer at a time, so two people don't overwrite the same row.
  var lock = null;
  if (WRITE_ACTIONS[action]) {
    lock = LockService.getScriptLock();
    lock.waitLock(20000);
  }
  try {
    if (PUBLIC_ACTIONS[action]) return fn(payload);
    var session = auth_(token);
    return fn(payload, session.user, session.token);
  } finally {
    if (lock) lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// One-time setup (run manually from the Apps Script editor)
// ---------------------------------------------------------------------------

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(HEADERS).forEach(function (name) {
    var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    var cols = HEADERS[name].length;
    sheet.getRange(1, 1, 1, cols).setValues([HEADERS[name]]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    // Plain text everywhere, so Sheets doesn't turn dates/numbers into something else.
    sheet.getRange(1, 1, sheet.getMaxRows(), cols).setNumberFormat('@');
  });

  if (readAll_('Branches').length === 0) {
    DEFAULT_BRANCHES.forEach(function (b) { append_('Branches', { name: b }); });
  }

  if (readAll_('Users').length === 0) {
    insertUser_({ username: 'admin', password: 'admin123', name: 'Admin', role: 'admin', branch: ALL_BRANCHES });
    Logger.log('Setup done. Login with  admin / admin123  and CHANGE THE PASSWORD immediately.');
  } else {
    Logger.log('Setup done. Existing users kept.');
  }
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function login_(p) {
  var username = clean_(p.username).toLowerCase();
  var user = find_(readAll_('Users'), function (u) { return u.username.toLowerCase() === username; });
  if (!user || user.active !== 'yes' || hash_(String(p.password || ''), user.salt) !== user.passwordHash) {
    throw new Error('Wrong username or password');
  }

  // Remove expired sessions while we're here, so the sheet doesn't grow forever.
  var now = Date.now();
  var sessions = readAll_('Sessions');
  for (var i = sessions.length - 1; i >= 0; i--) {
    if (Number(sessions[i].expiresAt) < now) getSheet_('Sessions').deleteRow(sessions[i]._row);
  }

  var token = Utilities.getUuid() + Utilities.getUuid();
  append_('Sessions', { token: token, userId: user.id, expiresAt: String(now + SESSION_DAYS * 86400000) });
  return { token: token, user: publicUser_(user) };
}

function auth_(token) {
  if (!token) throw new Error('Please login');
  var session = find_(readAll_('Sessions'), function (s) { return s.token === token; });
  if (!session || Number(session.expiresAt) < Date.now()) throw new Error('Session expired, please login again');
  var user = find_(readAll_('Users'), function (u) { return u.id === session.userId; });
  if (!user || user.active !== 'yes') throw new Error('Account disabled');
  return { user: user, token: token };
}

function me_(p, user) {
  return publicUser_(user);
}

function logout_(p, user, token) {
  var session = find_(readAll_('Sessions'), function (s) { return s.token === token; });
  if (session) getSheet_('Sessions').deleteRow(session._row);
  return true;
}

function changePassword_(p, user, token) {
  if (hash_(String(p.oldPassword || ''), user.salt) !== user.passwordHash) throw new Error('Old password is wrong');
  setPassword_(user, p.newPassword, token);
  return true;
}

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------

function listBranches_() {
  return readAll_('Branches').map(function (b) { return b.name; });
}

function addBranch_(p, user) {
  requireTop_(user);
  var name = clean_(p.name);
  if (!name) throw new Error('Branch name is required');
  if (listBranches_().indexOf(name) !== -1) throw new Error('Branch already exists');
  append_('Branches', { name: name });
  return listBranches_();
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

function listTasks_(p, user) {
  var tasks = readAll_('Tasks');
  if (p.mine) {
    tasks = tasks.filter(function (t) { return t.assignedTo === user.id; });
  } else if (isTop_(user)) {
    if (p.branch && p.branch !== ALL_BRANCHES) tasks = tasks.filter(function (t) { return t.branch === p.branch; });
  } else if (user.role === 'manager') {
    tasks = tasks.filter(function (t) { return t.branch === user.branch; });
  } else {
    tasks = tasks.filter(function (t) { return t.assignedTo === user.id; });
  }

  var names = {};
  readAll_('Users').forEach(function (u) { names[u.id] = u.name; });
  return tasks.map(function (t) {
    var out = strip_(t);
    out.assignedToName = names[t.assignedTo] || '(deleted user)';
    out.assignedByName = names[t.assignedBy] || '(deleted user)';
    return out;
  });
}

function createTask_(p, user) {
  requireAssigner_(user);
  var title = clean_(p.title);
  if (!title) throw new Error('Task title is required');
  var branch = clean_(p.branch);
  checkBranchAccess_(user, branch);
  checkAssignee_(branch, p.assignedTo);

  var now = new Date().toISOString();
  var task = {
    id: newId_('T'),
    title: title,
    description: clean_(p.description),
    branch: branch,
    assignedTo: p.assignedTo,
    assignedBy: user.id,
    priority: oneOf_(p.priority, PRIORITIES, 'Medium'),
    status: 'Pending',
    dueDate: cleanDate_(p.dueDate),
    remarks: '',
    createdAt: now,
    updatedAt: now,
    completedAt: ''
  };
  append_('Tasks', task);
  return task;
}

function updateTask_(p, user) {
  var task = find_(readAll_('Tasks'), function (t) { return t.id === p.id; });
  if (!task) throw new Error('Task not found');

  var changes = {};
  var canManage = isTop_(user) || (user.role === 'manager' && task.branch === user.branch);

  if (canManage) {
    if (p.title !== undefined) {
      changes.title = clean_(p.title);
      if (!changes.title) throw new Error('Task title is required');
    }
    if (p.description !== undefined) changes.description = clean_(p.description);
    if (p.priority !== undefined) changes.priority = oneOf_(p.priority, PRIORITIES, task.priority);
    if (p.dueDate !== undefined) changes.dueDate = cleanDate_(p.dueDate);
    var branch = p.branch !== undefined ? clean_(p.branch) : task.branch;
    var assignee = p.assignedTo !== undefined ? p.assignedTo : task.assignedTo;
    if (branch !== task.branch || assignee !== task.assignedTo) {
      checkBranchAccess_(user, branch);
      checkAssignee_(branch, assignee);
      changes.branch = branch;
      changes.assignedTo = assignee;
    }
  } else if (task.assignedTo !== user.id) {
    throw new Error('You cannot edit this task');
  }

  // The person doing the task (and managers) can always update status + remarks.
  if (p.status !== undefined) {
    changes.status = oneOf_(p.status, STATUSES, task.status);
    if (changes.status === 'Done' && task.status !== 'Done') changes.completedAt = new Date().toISOString();
    if (changes.status !== 'Done') changes.completedAt = '';
  }
  if (p.remarks !== undefined) changes.remarks = clean_(p.remarks);

  changes.updatedAt = new Date().toISOString();
  for (var k in changes) task[k] = changes[k];
  write_('Tasks', task._row, task);
  return strip_(task);
}

function deleteTask_(p, user) {
  var task = find_(readAll_('Tasks'), function (t) { return t.id === p.id; });
  if (!task) throw new Error('Task not found');
  if (!(isTop_(user) || (user.role === 'manager' && task.branch === user.branch))) {
    throw new Error('You cannot delete this task');
  }
  getSheet_('Tasks').deleteRow(task._row);
  return true;
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

function listUsers_(p, user) {
  requireAssigner_(user);
  var users = readAll_('Users');
  if (!isTop_(user)) {
    // Managers only see their own branch (needed for the "assign to" dropdown).
    users = users.filter(function (u) { return u.branch === user.branch && u.active === 'yes'; });
  }
  return users.map(publicUser_);
}

function createUser_(p, user) {
  requireTop_(user);
  return publicUser_(insertUser_(p));
}

function updateUser_(p, user) {
  requireTop_(user);
  var target = find_(readAll_('Users'), function (u) { return u.id === p.id; });
  if (!target) throw new Error('User not found');

  if (p.name !== undefined) {
    target.name = clean_(p.name);
    if (!target.name) throw new Error('Name is required');
  }
  if (p.role !== undefined) {
    if (ROLES.indexOf(p.role) === -1) throw new Error('Invalid role');
    if (target.id === user.id && !isTopRole_(p.role)) throw new Error('You cannot remove your own admin access');
    target.role = p.role;
  }
  if (p.branch !== undefined) target.branch = clean_(p.branch);
  if (p.active !== undefined) {
    if (target.id === user.id && !p.active) throw new Error('You cannot disable your own account');
    target.active = p.active ? 'yes' : 'no';
  }
  target.branch = validBranchForRole_(target.role, target.branch);

  write_('Users', target._row, target);
  return publicUser_(target);
}

function resetPassword_(p, user) {
  requireTop_(user);
  var target = find_(readAll_('Users'), function (u) { return u.id === p.id; });
  if (!target) throw new Error('User not found');
  setPassword_(target, p.newPassword);
  return true;
}

function insertUser_(p) {
  var username = clean_(p.username).toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
    throw new Error('Username: 3-30 characters, only letters, numbers, dot, dash, underscore');
  }
  var existing = find_(readAll_('Users'), function (u) { return u.username.toLowerCase() === username; });
  if (existing) throw new Error('Username already taken');
  var name = clean_(p.name);
  if (!name) throw new Error('Name is required');
  if (ROLES.indexOf(p.role) === -1) throw new Error('Invalid role');
  checkPassword_(p.password);

  var salt = Utilities.getUuid();
  var u = {
    id: newId_('U'),
    username: username,
    passwordHash: hash_(String(p.password), salt),
    salt: salt,
    name: name,
    role: p.role,
    branch: validBranchForRole_(p.role, clean_(p.branch)),
    active: 'yes',
    createdAt: new Date().toISOString()
  };
  append_('Users', u);
  return u;
}

function setPassword_(target, password, keepToken) {
  checkPassword_(password);
  target.salt = Utilities.getUuid();
  target.passwordHash = hash_(String(password), target.salt);
  write_('Users', target._row, target);
  // Log out everywhere else.
  var sessions = readAll_('Sessions');
  for (var i = sessions.length - 1; i >= 0; i--) {
    var s = sessions[i];
    if (s.userId === target.id && s.token !== keepToken) getSheet_('Sessions').deleteRow(s._row);
  }
}

// ---------------------------------------------------------------------------
// Permission helpers
// ---------------------------------------------------------------------------

function isTopRole_(role) { return role === 'admin' || role === 'partner'; }
function isTop_(user) { return isTopRole_(user.role); }

function requireTop_(user) {
  if (!isTop_(user)) throw new Error('Only Admin or Partner can do this');
}

function requireAssigner_(user) {
  if (!isTop_(user) && user.role !== 'manager') throw new Error('Only Admin, Partner or Branch Manager can do this');
}

function checkBranchAccess_(user, branch) {
  if (listBranches_().indexOf(branch) === -1) throw new Error('Invalid branch');
  if (!isTop_(user) && branch !== user.branch) throw new Error('You can only assign tasks in your own branch');
}

function checkAssignee_(branch, userId) {
  var a = find_(readAll_('Users'), function (u) { return u.id === userId; });
  if (!a || a.active !== 'yes') throw new Error('Please choose a valid employee');
  if (!isTopRole_(a.role) && a.branch !== branch) throw new Error(a.name + ' is not in ' + branch + ' branch');
}

function validBranchForRole_(role, branch) {
  if (isTopRole_(role)) return ALL_BRANCHES;
  if (listBranches_().indexOf(branch) === -1) throw new Error('Please choose a valid branch');
  return branch;
}

function checkPassword_(pw) {
  if (!pw || String(pw).length < 6) throw new Error('Password must be at least 6 characters');
}

// ---------------------------------------------------------------------------
// Sheet helpers
// ---------------------------------------------------------------------------

function getSheet_(name) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('Sheet "' + name + '" missing. Run setup() first.');
  return sheet;
}

/** All rows as objects. `_row` is the real sheet row number (header is row 1). */
function readAll_(name) {
  var sheet = getSheet_(name);
  var headers = HEADERS[name];
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var values = sheet.getRange(2, 1, last - 1, headers.length).getValues();
  var rows = [];
  for (var i = 0; i < values.length; i++) {
    if (values[i].join('') === '') continue;
    var obj = { _row: i + 2 };
    for (var c = 0; c < headers.length; c++) obj[headers[c]] = cell_(values[i][c]);
    rows.push(obj);
  }
  return rows;
}

function cell_(v) {
  if (v instanceof Date) return v.toISOString();
  return v === null || v === undefined ? '' : String(v);
}

function toRow_(name, obj) {
  return HEADERS[name].map(function (h) {
    var v = obj[h] === undefined || obj[h] === null ? '' : String(obj[h]);
    // Leading apostrophe = "store as plain text". Stops formulas (=...) and date auto-conversion.
    return v === '' ? '' : "'" + v;
  });
}

function append_(name, obj) {
  getSheet_(name).appendRow(toRow_(name, obj));
}

function write_(name, row, obj) {
  getSheet_(name).getRange(row, 1, 1, HEADERS[name].length).setValues([toRow_(name, obj)]);
}

// ---------------------------------------------------------------------------
// Small utils
// ---------------------------------------------------------------------------

function find_(list, fn) {
  for (var i = 0; i < list.length; i++) if (fn(list[i])) return list[i];
  return null;
}

function strip_(obj) {
  var out = {};
  for (var k in obj) if (k !== '_row') out[k] = obj[k];
  return out;
}

function publicUser_(u) {
  return { id: u.id, username: u.username, name: u.name, role: u.role, branch: u.branch, active: u.active === 'yes' };
}

function clean_(v) {
  return v === undefined || v === null ? '' : String(v).trim().slice(0, 2000);
}

function cleanDate_(v) {
  var s = clean_(v);
  if (s && !/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error('Due date must be YYYY-MM-DD');
  return s;
}

function oneOf_(v, list, fallback) {
  return list.indexOf(v) !== -1 ? v : fallback;
}

function newId_(prefix) {
  return prefix + Date.now().toString(36) + Utilities.getUuid().slice(0, 4);
}

function hash_(password, salt) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + password, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}
