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

// Speed: Users/Branches are cached for a short time, session lookups a bit longer.
// Every write clears the cache, and password reset / logout evict the session.
var SHEET_CACHE_SECONDS = 120;
var SESSION_CACHE_SECONDS = 600;
var CACHED_SHEETS = { Users: true, Branches: true };
var MEMO_ = {}; // per-request copy of each sheet, reset in handle_

// Speed: the app asks "did anything change?" (ping) instead of reloading everything.
// dataVersion changes on every write to Tasks/Users/Branches.
var VERSIONED_SHEETS = { Tasks: true, Users: true, Branches: true };
var DIRTY_ = false;
var LOCK_HELD_ = false;
var SESSION_RENEW_DAYS = 3; // a session with less than this left is extended to SESSION_DAYS again
// Reads that return data also return the version they reflect (taken before reading).
var READS_WITH_VERSION = { bootstrap: true, listTasks: true, listUsers: true, listBranches: true };

// Done tasks older than this move to the Archive tab (once a day), so reads stay fast.
var ARCHIVE_AFTER_DAYS = 30;

var HEADERS = {
  Users: ['id', 'username', 'passwordHash', 'salt', 'name', 'role', 'branch', 'active', 'createdAt'],
  Tasks: ['id', 'title', 'description', 'branch', 'assignedTo', 'assignedBy', 'priority', 'status',
          'dueDate', 'remarks', 'createdAt', 'updatedAt', 'completedAt'],
  Sessions: ['token', 'userId', 'expiresAt'],
  Branches: ['name']
};
HEADERS.Archive = HEADERS.Tasks;

// ---------------------------------------------------------------------------
// One-time setup. Easiest: reload the Sheet and use the menu  Task App → Run setup.
// (Kept at the top so "setup" is also the default in the editor's Run dropdown.)
// ---------------------------------------------------------------------------

function setup() {
  MEMO_ = {};
  var ss = ss_();
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

  var msg;
  if (readAll_('Users').length === 0) {
    insertUser_({ username: 'admin', password: 'admin123', name: 'Admin', role: 'admin', branch: ALL_BRANCHES });
    msg = 'Setup done ✅  Login with  admin / admin123  and CHANGE THE PASSWORD immediately.';
  } else {
    msg = 'Setup done ✅  Existing users kept.';
  }
  Logger.log(msg);
  // Popup in the Sheet. getUi() fails when run from the script editor, which is fine.
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
}

/** Adds a "Task App" menu to the Sheet every time it is opened. */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Task App').addItem('Run setup', 'setup').addToUi();
}

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
    var res = handle_(req.action, req.payload || {}, req.token);
    out = { ok: true, data: res.data };
    if (res.version) out.version = res.version;
    if (res.readVersion) out.v = res.readVersion;
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
    // Not one of our own "no" answers (permission, validation...), so it's Google having a
    // hiccup (lock timeout, "Service Spreadsheets failed"...): the app may simply try again.
    if (!(err && err.user)) out.retry = true;
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
  resetPassword: resetPassword_,
  bootstrap: bootstrap_,
  applyOps: applyOps_,
  ping: ping_
};

var WRITE_ACTIONS = {
  login: true, logout: true, changePassword: true, addBranch: true, createTask: true,
  updateTask: true, deleteTask: true, createUser: true, updateUser: true, resetPassword: true,
  applyOps: true
};

// Task changes the app can queue and send together (see applyOps_).
var OP_HANDLERS = { createTask: createTask_, updateTask: updateTask_, deleteTask: deleteTask_ };
var MAX_OPS = 20;

/** Returns { data, version } — version is set only when this request changed data. */
function handle_(action, payload, token) {
  MEMO_ = {};
  DIRTY_ = false;
  var fn = PUBLIC_ACTIONS[action] || ACTIONS[action];
  if (!fn) throw userError_('Unknown action: ' + action);

  // One writer at a time, so two people don't overwrite the same row.
  var lock = null;
  if (WRITE_ACTIONS[action]) {
    lock = LockService.getScriptLock();
    lock.waitLock(30000);
    LOCK_HELD_ = true;
  }
  try {
    var data;
    var readVersion = READS_WITH_VERSION[action] ? getVersion_() : null;
    if (PUBLIC_ACTIONS[action]) {
      data = fn(payload);
    } else {
      var session = auth_(token);
      data = fn(payload, session.user, session.token);
    }
    if (lock) {
      try { archiveOldTasks_(); } catch (e) { Logger.log('Archive skipped: ' + e); }
    }
    var version = null;
    if (DIRTY_) {
      // "before" lets the app tell whether someone else also changed data meanwhile.
      var before = getVersion_();
      version = { before: before, v: bumpVersion_() };
    }
    return { data: data, version: version, readVersion: readVersion };
  } finally {
    LOCK_HELD_ = false;
    if (lock) lock.releaseLock();
  }
}

/** An error that is a real answer (permission, validation): never worth retrying. */
function userError_(message) {
  var e = new Error(message);
  e.user = true;
  return e;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function login_(p) {
  var username = clean_(p.username).toLowerCase();
  var user = find_(readAll_('Users'), function (u) { return u.username.toLowerCase() === username; });
  if (!user || user.active !== 'yes' || hash_(String(p.password || ''), user.salt) !== user.passwordHash) {
    throw userError_('Wrong username or password');
  }

  // Remove expired sessions while we're here, so the sheet doesn't grow forever.
  var now = Date.now();
  var sessions = readAll_('Sessions');
  for (var i = sessions.length - 1; i >= 0; i--) {
    if (Number(sessions[i].expiresAt) < now) deleteRow_('Sessions', sessions[i]._row);
  }

  var token = Utilities.getUuid() + Utilities.getUuid();
  append_('Sessions', { token: token, userId: user.id, expiresAt: String(now + SESSION_DAYS * 86400000) });
  return { token: token, user: publicUser_(user) };
}

function auth_(token) {
  if (!token) throw userError_('Please login');
  var session = cacheGet_('sess:' + token);
  if (!session) {
    session = find_(readAll_('Sessions'), function (s) { return s.token === token; });
    if (session) cachePut_('sess:' + token, { userId: session.userId, expiresAt: session.expiresAt }, SESSION_CACHE_SECONDS);
  }
  if (!session || Number(session.expiresAt) < Date.now()) throw userError_('Session expired, please login again');
  var user = find_(readAll_('Users'), function (u) { return u.id === session.userId; });
  if (!user || user.active !== 'yes') throw userError_('Account disabled');
  if (Number(session.expiresAt) - Date.now() < SESSION_RENEW_DAYS * 86400000) {
    try { renewSession_(token); } catch (e) { Logger.log('Session renew skipped: ' + e); }
  }
  return { user: user, token: token };
}

/** People who use the app every day are never logged out: extend the session to SESSION_DAYS again. */
function renewSession_(token) {
  var lock = null;
  if (!LOCK_HELD_) {
    lock = LockService.getScriptLock();
    if (!lock.tryLock(3000)) return; // busy: try again on a later request
  }
  try {
    delete MEMO_.Sessions; // fresh rows, in case another request removed some
    var s = find_(readAll_('Sessions'), function (x) { return x.token === token; });
    if (!s) return;
    s.expiresAt = String(Date.now() + SESSION_DAYS * 86400000);
    write_('Sessions', s._row, s);
    cachePut_('sess:' + token, { userId: s.userId, expiresAt: s.expiresAt }, SESSION_CACHE_SECONDS);
  } finally {
    if (lock) lock.releaseLock();
  }
}

function me_(p, user) {
  return publicUser_(user);
}

/** Cheap "did anything change?" check: no Sheet read. */
function ping_() {
  return { v: getVersion_() };
}

function props_() {
  return PropertiesService.getScriptProperties();
}

function getVersion_() {
  return props_().getProperty('dataVersion') || '0';
}

function bumpVersion_() {
  // Always higher than the last one, even for two writes in the same millisecond.
  var v = String(Math.max(Date.now(), Number(getVersion_()) + 1));
  props_().setProperty('dataVersion', v);
  return v;
}

/**
 * Once a day (on the first write of the day) move Done tasks finished more than
 * ARCHIVE_AFTER_DAYS ago to the Archive tab. Done in bulk: one read, two writes.
 */
function archiveOldTasks_() {
  var today = new Date().toISOString().slice(0, 10);
  var props = props_();
  if (props.getProperty('lastArchive') === today) return 0;
  props.setProperty('lastArchive', today); // at most one try per day, even if it fails

  var rows = readSheet_('Tasks');
  var cutoff = new Date(Date.now() - ARCHIVE_AFTER_DAYS * 86400000).toISOString();
  var old = rows.filter(function (t) { return t.status === 'Done' && t.completedAt && t.completedAt < cutoff; });
  if (!old.length) return 0;
  var keep = rows.filter(function (t) { return old.indexOf(t) === -1; });

  var cols = HEADERS.Tasks.length;
  var ss = ss_();
  var archive = ss.getSheetByName('Archive');
  if (!archive) {
    archive = ss.insertSheet('Archive');
    archive.getRange(1, 1, 1, cols).setValues([HEADERS.Archive]).setFontWeight('bold');
    archive.setFrozenRows(1);
  }
  // 1) Copy to Archive first, so nothing can be lost.
  archive.getRange(archive.getLastRow() + 1, 1, old.length, cols)
    .setValues(old.map(function (t) { return toRow_('Tasks', t); }));

  // 2) Rewrite Tasks: kept rows over the top first, then clear only the leftover tail.
  //    A failure between the two can leave duplicate rows, never missing ones.
  var tasks = getSheet_('Tasks');
  var last = tasks.getLastRow();
  if (keep.length) {
    tasks.getRange(2, 1, keep.length, cols).setValues(keep.map(function (t) { return toRow_('Tasks', t); }));
  }
  var tailStart = keep.length + 2;
  if (last >= tailStart) tasks.getRange(tailStart, 1, last - tailStart + 1, cols).clearContent();
  changed_('Tasks');
  return old.length;
}

/**
 * Everything a screen needs in ONE request (each Apps Script call costs ~1-2 s).
 * p: { branches: bool, users: bool, tasks: <listTasks payload> | null }
 */
function bootstrap_(p, user) {
  var assigner = isTop_(user) || user.role === 'manager';
  return {
    me: publicUser_(user),
    branches: p.branches ? listBranches_() : null,
    users: p.users && assigner ? listUsers_({}, user) : null,
    tasks: p.tasks ? listTasks_(p.tasks, user) : null
  };
}

function logout_(p, user, token) {
  var session = find_(readAll_('Sessions'), function (s) { return s.token === token; });
  if (session) deleteRow_('Sessions', session._row);
  forgetSession_(token);
  return true;
}

function changePassword_(p, user, token) {
  if (hash_(String(p.oldPassword || ''), user.salt) !== user.passwordHash) throw userError_('Old password is wrong');
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
  if (!name) throw userError_('Branch name is required');
  if (listBranches_().indexOf(name) !== -1) throw userError_('Branch already exists');
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

/**
 * Several queued task changes in ONE request (one lock, one Sheet read).
 * Each op is checked exactly like its single action. One failing op doesn't stop the rest.
 * p.ops: [{ type: 'createTask' | 'updateTask' | 'deleteTask', payload: {...} }]
 */
function applyOps_(p, user) {
  var ops = p.ops || [];
  if (ops.length > MAX_OPS) throw userError_('Too many changes at once');
  var results = [];
  for (var i = 0; i < ops.length; i++) {
    var op = ops[i];
    var fn = OP_HANDLERS[op && op.type];
    if (!fn) { results.push({ ok: false, error: 'Unknown change: ' + (op && op.type) }); continue; }
    try {
      results.push({ ok: true, data: fn(op.payload || {}, user) });
    } catch (e) {
      var error = String((e && e.message) || e);
      if (e && e.user) { results.push({ ok: false, error: error }); continue; }
      // Google hiccup: stop here so later changes keep their order; the app sends the rest again.
      results.push({ ok: false, retry: true, error: error });
      break;
    }
  }
  return results;
}

function createTask_(p, user) {
  requireAssigner_(user);

  // The app makes the id itself, so a retried request can't create a duplicate.
  if (p.id !== undefined && p.id !== '') {
    if (!/^T[a-z0-9]{8,32}$/i.test(String(p.id))) throw userError_('Invalid task id');
    var existing = find_(readAll_('Tasks'), function (t) { return t.id === p.id; });
    if (existing) {
      if (existing.assignedBy !== user.id) throw userError_('Task id already used');
      return strip_(existing);
    }
  }

  var title = clean_(p.title);
  if (!title) throw userError_('Task title is required');
  var branch = clean_(p.branch);
  checkBranchAccess_(user, branch);
  checkAssignee_(branch, p.assignedTo);

  var now = new Date().toISOString();
  var task = {
    id: p.id ? String(p.id) : newId_('T'),
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
  if (!task) throw userError_('Task not found');

  var changes = {};
  var canManage = isTop_(user) || (user.role === 'manager' && task.branch === user.branch);

  if (canManage) {
    if (p.title !== undefined) {
      changes.title = clean_(p.title);
      if (!changes.title) throw userError_('Task title is required');
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
    throw userError_('You cannot edit this task');
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
  if (!task) return true; // already gone (e.g. a retried request): same end result
  if (!(isTop_(user) || (user.role === 'manager' && task.branch === user.branch))) {
    throw userError_('You cannot delete this task');
  }
  deleteRow_('Tasks', task._row);
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
  if (!target) throw userError_('User not found');

  if (p.name !== undefined) {
    target.name = clean_(p.name);
    if (!target.name) throw userError_('Name is required');
  }
  if (p.role !== undefined) {
    if (ROLES.indexOf(p.role) === -1) throw userError_('Invalid role');
    if (target.id === user.id && !isTopRole_(p.role)) throw userError_('You cannot remove your own admin access');
    target.role = p.role;
  }
  if (p.branch !== undefined) target.branch = clean_(p.branch);
  if (p.active !== undefined) {
    if (target.id === user.id && !p.active) throw userError_('You cannot disable your own account');
    target.active = p.active ? 'yes' : 'no';
  }
  target.branch = validBranchForRole_(target.role, target.branch);

  write_('Users', target._row, target);
  return publicUser_(target);
}

function resetPassword_(p, user) {
  requireTop_(user);
  var target = find_(readAll_('Users'), function (u) { return u.id === p.id; });
  if (!target) throw userError_('User not found');
  setPassword_(target, p.newPassword);
  return true;
}

function insertUser_(p) {
  var username = clean_(p.username).toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
    throw userError_('Username: 3-30 characters, only letters, numbers, dot, dash, underscore');
  }
  var existing = find_(readAll_('Users'), function (u) { return u.username.toLowerCase() === username; });
  if (existing) throw userError_('Username already taken');
  var name = clean_(p.name);
  if (!name) throw userError_('Name is required');
  if (ROLES.indexOf(p.role) === -1) throw userError_('Invalid role');
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
    if (s.userId === target.id && s.token !== keepToken) {
      deleteRow_('Sessions', s._row);
      forgetSession_(s.token);
    }
  }
}

// ---------------------------------------------------------------------------
// Permission helpers
// ---------------------------------------------------------------------------

function isTopRole_(role) { return role === 'admin' || role === 'partner'; }
function isTop_(user) { return isTopRole_(user.role); }

function requireTop_(user) {
  if (!isTop_(user)) throw userError_('Only Admin or Partner can do this');
}

function requireAssigner_(user) {
  if (!isTop_(user) && user.role !== 'manager') throw userError_('Only Admin, Partner or Branch Manager can do this');
}

function checkBranchAccess_(user, branch) {
  if (listBranches_().indexOf(branch) === -1) throw userError_('Invalid branch');
  if (!isTop_(user) && branch !== user.branch) throw userError_('You can only assign tasks in your own branch');
}

function checkAssignee_(branch, userId) {
  var a = find_(readAll_('Users'), function (u) { return u.id === userId; });
  if (!a || a.active !== 'yes') throw userError_('Please choose a valid employee');
  if (!isTopRole_(a.role) && a.branch !== branch) throw userError_(a.name + ' is not in ' + branch + ' branch');
}

function validBranchForRole_(role, branch) {
  if (isTopRole_(role)) return ALL_BRANCHES;
  if (listBranches_().indexOf(branch) === -1) throw userError_('Please choose a valid branch');
  return branch;
}

function checkPassword_(pw) {
  if (!pw || String(pw).length < 6) throw userError_('Password must be at least 6 characters');
}

// ---------------------------------------------------------------------------
// Sheet helpers
// ---------------------------------------------------------------------------

function ss_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw userError_('This script is not linked to a Google Sheet. Open your Sheet → Extensions → Apps Script and paste the code there.');
  }
  return ss;
}

function getSheet_(name) {
  var sheet = ss_().getSheetByName(name);
  if (!sheet) throw userError_('Sheet "' + name + '" missing. Run setup() first.');
  return sheet;
}

/** All rows as objects. `_row` is the real sheet row number (header is row 1). */
function readAll_(name) {
  if (MEMO_[name]) return MEMO_[name];
  var rows = CACHED_SHEETS[name] ? cacheGet_('sheet:' + name) : null;
  if (!rows) {
    rows = readSheet_(name);
    if (CACHED_SHEETS[name]) cachePut_('sheet:' + name, rows, SHEET_CACHE_SECONDS);
  }
  MEMO_[name] = rows;
  return rows;
}

function readSheet_(name) {
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

/** Call after every write, so later reads in this request (and other requests) see fresh data. */
function changed_(name) {
  delete MEMO_[name];
  if (VERSIONED_SHEETS[name]) DIRTY_ = true;
  if (CACHED_SHEETS[name]) {
    try { CacheService.getScriptCache().remove('sheet:' + name); } catch (e) {}
  }
}

function cacheGet_(key) {
  try {
    var v = CacheService.getScriptCache().get(key);
    return v ? JSON.parse(v) : null;
  } catch (e) {
    return null;
  }
}

function cachePut_(key, value, seconds) {
  try {
    var json = JSON.stringify(value);
    if (json.length < 90000) CacheService.getScriptCache().put(key, json, seconds); // 100 KB limit per key
  } catch (e) {}
}

function forgetSession_(token) {
  try { CacheService.getScriptCache().remove('sess:' + token); } catch (e) {}
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
  changed_(name);
}

function write_(name, row, obj) {
  getSheet_(name).getRange(row, 1, 1, HEADERS[name].length).setValues([toRow_(name, obj)]);
  changed_(name);
}

function deleteRow_(name, row) {
  getSheet_(name).deleteRow(row);
  changed_(name);
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
  if (s && !/^\d{4}-\d{2}-\d{2}$/.test(s)) throw userError_('Due date must be YYYY-MM-DD');
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
