/**
 * FOMO Ranking · backend sobre Google Sheets
 *
 * Cómo se usa (README.md tiene los pasos con detalle):
 *  1. Crea una Google Sheet vacía y abre Extensiones > Apps Script.
 *  2. Pega este archivo, guarda y ejecuta la función setup() una vez (te pedirá permisos).
 *  3. Implementar > Nueva implementación > Aplicación web
 *     Ejecutar como: Yo · Quién tiene acceso: Cualquier usuario.
 *  4. Copia la URL que acaba en /exec en config.js de la web.
 *
 * Quién es admin lo decides tú y solo tú: escribe SI en la columna "admin" de la pestaña Usuarios.
 * Los teléfonos solo se envían a cuentas con SI en esa columna.
 */

var TABS = {
  Usuarios: ['id', 'nombre', 'rol', 'bio', 'avatar', 'contacto', 'pin_hash', 'token_hash', 'creado', 'admin', 'instagram'],
  Quedadas: ['id', 'nombre', 'fecha', 'estado', 'max_fotos'],
  Fotos: ['id', 'evento', 'autor', 'etiquetado', 'archivo', 'creado'],
  Votos: ['usuario', 'evento', 'foto', 'tipo', 'momento'],
  Config: ['clave', 'valor']
};
var CAP = { love: 1, like: 2, dislike: 1 };
var ROLES = ['fotografo', 'modelo'];
var ADMIN_VALUES = ['si', 'sí', 'true', 'x', '1'];

/* ---------- instalación ---------- */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(TABS).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    var cols = TABS[name];
    sh.getRange(1, 1, sh.getMaxRows(), Math.max(cols.length, sh.getMaxColumns())).setNumberFormat('@');
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground('#FFAB61');
    sh.setFrozenRows(1);
  });
  ['Hoja 1', 'Hoja1', 'Sheet1'].forEach(function (n) {
    var d = ss.getSheetByName(n);
    if (d && ss.getSheets().length > 1) ss.deleteSheet(d);
  });
  var cfg = rows_('Config');
  function has(k) { return cfg.some(function (r) { return r.clave === k; }); }
  if (!has('codigo')) addRow_('Config', ['codigo', 'fomo-halloween']);
  if (!has('carpeta')) {
    var folder = DriveApp.createFolder('FOMO Ranking - fotos');
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    addRow_('Config', ['carpeta', folder.getId()]);
  }
  if (rows_('Quedadas').length === 0) addRow_('Quedadas', ['q_halloween-2026', 'Halloween', '2026-10-17', 'abierta', '3']);
  Logger.log('Listo. Código de la comunidad: ' + cfg_('codigo') + ' (cámbialo en la pestaña Config).');
}

/* ---------- entrada web ---------- */
function doGet() {
  return json_({ ok: true, name: 'FOMO Ranking API' });
}

function doPost(e) {
  var out;
  try {
    out = route_(JSON.parse(e.postData.contents));
  } catch (err) {
    out = { ok: false, code: err.code || 'error', error: err.code ? err.message : 'Ha pasado algo raro. Inténtalo otra vez.' };
    if (!err.code) console.error(err && err.stack || err);
  }
  return json_(out);
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

var WRITE = { register: 1, login: 1, updateProfile: 1, upload: 1, deletePhoto: 1, vote: 1, createEvent: 1, setEvent: 1, deleteEvent: 1, deleteUser: 1 };

function route_(req) {
  if (req.action === 'state') return state_(req);
  if (!WRITE[req.action]) fail_('bad_action', 'Acción desconocida');
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    return H[req.action](req);
  } finally {
    lock.releaseLock();
  }
}

/* ---------- utilidades ---------- */
function fail_(code, msg) { var e = new Error(msg || code); e.code = code; throw e; }
function tz_() { return SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || 'Europe/Madrid'; }
function sheet_(n) { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(n); }
function ig_(s) {
  // Acepta "@usuario", "usuario" o un enlace de instagram.com/usuario. Devuelve '' si no es válido.
  var v = String(s == null ? '' : s).trim().replace(/^(https?:\/\/)?(www\.)?instagram\.com\//i, '').replace(/^@+/, '').split(/[/?#]/)[0];
  return /^[A-Za-z0-9._]{1,30}$/.test(v) ? v.toLowerCase() : '';
}
function clean_(s, n) { return String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n); }
function uid_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 10); }
function now_() { return String(Date.now()); }
function hex_(bytes) { return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join(''); }
function sha_(s) { return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s)); }
function hashPin_(pin, id) { return sha_(pin + ':' + id); }
function newToken_() { return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''); }

function rows_(name) {
  var sh = sheet_(name);
  var v = sh.getDataRange().getValues();
  var head = v.shift();
  var out = [];
  v.forEach(function (r, i) {
    if (r[0] === '' || r[0] == null) return;
    var o = { _row: i + 2 };
    head.forEach(function (k, j) {
      var x = r[j];
      if (x instanceof Date) x = Utilities.formatDate(x, tz_(), 'yyyy-MM-dd');
      o[k] = x == null ? '' : String(x);
    });
    out.push(o);
  });
  return out;
}
function addRow_(name, arr) { sheet_(name).appendRow(arr.map(String)); }
function setCell_(name, row, col, val) {
  sheet_(name).getRange(row, TABS[name].indexOf(col) + 1).setValue(String(val));
}
function deleteWhere_(name, pred) {
  var rs = rows_(name).filter(pred).sort(function (a, b) { return b._row - a._row; });
  var sh = sheet_(name);
  rs.forEach(function (r) { sh.deleteRow(r._row); });
  return rs;
}
function cfg_(key) {
  var r = rows_('Config').filter(function (x) { return x.clave === key; })[0];
  return r ? r.valor : '';
}
function isAdmin_(u) { return ADMIN_VALUES.indexOf(String(u.admin || '').trim().toLowerCase()) > -1; }

function auth_(req) {
  if (!req.token) return null;
  var h = sha_(String(req.token));
  var us = rows_('Usuarios');
  for (var i = 0; i < us.length; i++) {
    if (us[i].token_hash && us[i].token_hash.split(',').indexOf(h) > -1) return us[i];
  }
  return null;
}
function need_(req) { var u = auth_(req); if (!u) fail_('auth', 'Vuelve a entrar con tu nombre y tu PIN'); return u; }
function needAdmin_(req) { var u = need_(req); if (!isAdmin_(u)) fail_('forbidden', 'Solo para admins'); return u; }

function findEvent_(id) {
  return rows_('Quedadas').filter(function (q) { return q.id === String(id); })[0] || null;
}
function saveImg_(b64, name, maxLen) {
  if (typeof b64 !== 'string' || b64.length > maxLen) fail_('image', 'La imagen es demasiado grande');
  var raw = b64.replace(/^data:image\/jpeg;base64,/, '');
  var bytes;
  try { bytes = Utilities.base64Decode(raw); } catch (e) { fail_('image', 'No se pudo leer la imagen'); }
  if (bytes.length < 4 || bytes[0] !== -1 || bytes[1] !== -40) fail_('image', 'La imagen tiene que ser un JPG');
  var folder = DriveApp.getFolderById(cfg_('carpeta'));
  var f = folder.createFile(Utilities.newBlob(bytes, 'image/jpeg', name + '.jpg'));
  f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return f.getId();
}
function trashFile_(id) {
  if (!id) return;
  try { DriveApp.getFileById(id).setTrashed(true); } catch (e) { /* ya no existe */ }
}

function votes_(me) {
  var counts = {}, mine = {};
  rows_('Votos').forEach(function (v) {
    var c = counts[v.foto] || (counts[v.foto] = { love: 0, like: 0, dislike: 0 });
    if (c[v.tipo] !== undefined) c[v.tipo]++;
    if (me && v.usuario === me.id) mine[v.foto] = v.tipo;
  });
  return { counts: counts, myVotes: mine };
}

function state_(req) {
  var me = auth_(req);
  if (!me) return { ok: true, me: null };
  var admin = isAdmin_(me);
  var v = votes_(me);
  return {
    ok: true,
    me: { id: me.id, nombre: me.nombre, rol: me.rol, bio: me.bio, avatar: me.avatar, instagram: me.instagram || '', admin: admin, contacto: me.contacto },
    users: rows_('Usuarios').map(function (u) {
      var o = { id: u.id, nombre: u.nombre, rol: u.rol, bio: u.bio, avatar: u.avatar, instagram: u.instagram || '', admin: isAdmin_(u), creado: Number(u.creado) || 0 };
      if (admin) o.contacto = u.contacto;
      return o;
    }),
    events: rows_('Quedadas').map(function (q) {
      return { id: q.id, nombre: q.nombre, fecha: q.fecha, estado: q.estado === 'cerrada' ? 'closed' : 'open', max: Number(q.max_fotos) || 3 };
    }),
    photos: rows_('Fotos').map(function (f) {
      return { id: f.id, evento: f.evento, autor: f.autor, etiquetado: f.etiquetado, archivo: f.archivo, creado: Number(f.creado) || 0 };
    }),
    counts: v.counts,
    myVotes: v.myVotes
  };
}

/* ---------- acciones ---------- */
var H = {};

H.register = function (req) {
  var code = String(cfg_('codigo') || '').trim().toLowerCase();
  if (!code || String(req.code || '').trim().toLowerCase() !== code) fail_('code', 'El código de la comunidad no es correcto');
  var nombre = clean_(req.nombre, 40), bio = clean_(req.bio, 160), contacto = clean_(req.contacto, 60), pin = String(req.pin || '');
  if (nombre.length < 2) fail_('invalid', 'Escribe tu nombre');
  if (ROLES.indexOf(req.rol) < 0) fail_('invalid', 'Elige si eres fotógrafo/a o modelo');
  if (contacto.length < 6) fail_('invalid', 'Añade tu WhatsApp o teléfono');
  if (!/^\d{4,6}$/.test(pin)) fail_('invalid', 'El PIN tiene que ser de 4 a 6 números');
  var insta = ig_(req.instagram);
  if (req.instagram && !insta) fail_('invalid', 'Ese usuario de Instagram no parece válido');
  var taken = rows_('Usuarios').some(function (u) { return u.nombre.toLowerCase() === nombre.toLowerCase(); });
  if (taken) fail_('name_taken', 'Ese nombre ya está en uso. Añade tu apellido o un número');
  var id = 'u_' + uid_(), token = newToken_();
  var avatar = req.avatar ? saveImg_(req.avatar, 'avatar-' + id, 200000) : '';
  addRow_('Usuarios', [id, nombre, req.rol, bio, avatar, contacto, hashPin_(pin, id), sha_(token), now_(), '', insta]);
  return { ok: true, token: token };
};

H.login = function (req) {
  var nombre = clean_(req.nombre, 40).toLowerCase(), pin = String(req.pin || '');
  var cache = CacheService.getScriptCache(), key = 'fail:' + nombre;
  if (Number(cache.get(key) || 0) >= 5) fail_('locked', 'Demasiados intentos. Espera 10 minutos');
  var u = rows_('Usuarios').filter(function (x) { return x.nombre.toLowerCase() === nombre; })[0];
  if (!u || hashPin_(pin, u.id) !== u.pin_hash) {
    cache.put(key, String(Number(cache.get(key) || 0) + 1), 600);
    fail_('bad_login', 'Nombre o PIN incorrectos');
  }
  var token = newToken_();
  var hashes = (u.token_hash ? u.token_hash.split(',') : []).filter(Boolean);
  hashes.push(sha_(token));
  setCell_('Usuarios', u._row, 'token_hash', hashes.slice(-3).join(','));
  return { ok: true, token: token };
};

H.updateProfile = function (req) {
  var me = need_(req);
  if (req.nombre != null) {
    var nombre = clean_(req.nombre, 40);
    if (nombre.length < 2) fail_('invalid', 'Escribe tu nombre');
    var taken = rows_('Usuarios').some(function (u) { return u.id !== me.id && u.nombre.toLowerCase() === nombre.toLowerCase(); });
    if (taken) fail_('name_taken', 'Ese nombre ya está en uso');
    setCell_('Usuarios', me._row, 'nombre', nombre);
  }
  if (req.rol != null) {
    if (ROLES.indexOf(req.rol) < 0) fail_('invalid', 'Rol no válido');
    setCell_('Usuarios', me._row, 'rol', req.rol);
  }
  if (req.bio != null) setCell_('Usuarios', me._row, 'bio', clean_(req.bio, 160));
  if (req.instagram != null) {
    var insta = ig_(req.instagram);
    if (String(req.instagram).trim() && !insta) fail_('invalid', 'Ese usuario de Instagram no parece válido');
    setCell_('Usuarios', me._row, 'instagram', insta);
  }
  if (req.contacto) {
    var c = clean_(req.contacto, 60);
    if (c.length < 6) fail_('invalid', 'Ese contacto parece demasiado corto');
    setCell_('Usuarios', me._row, 'contacto', c);
  }
  if (req.avatar) {
    var fid = saveImg_(req.avatar, 'avatar-' + me.id, 200000);
    trashFile_(me.avatar);
    setCell_('Usuarios', me._row, 'avatar', fid);
  }
  return { ok: true };
};

H.upload = function (req) {
  var me = need_(req);
  var ev = findEvent_(req.evento);
  if (!ev) fail_('invalid', 'Esa quedada no existe');
  if (ev.estado === 'cerrada') fail_('closed', 'Esta quedada está cerrada');
  var mine = rows_('Fotos').filter(function (f) { return f.evento === ev.id && f.autor === me.id; }).length;
  if (mine >= (Number(ev.max_fotos) || 3)) fail_('limit', 'Ya has subido el máximo de fotos a esta quedada');
  var tag = String(req.etiquetado || '');
  if (tag) {
    var ok = tag !== me.id && rows_('Usuarios').some(function (u) { return u.id === tag; });
    if (!ok) fail_('invalid', 'La persona etiquetada no existe');
  }
  var id = 'f_' + uid_();
  var file = saveImg_(req.foto, 'foto-' + id, 700000);
  addRow_('Fotos', [id, ev.id, me.id, tag, file, now_()]);
  return { ok: true, id: id };
};

H.deletePhoto = function (req) {
  var me = need_(req);
  var f = rows_('Fotos').filter(function (x) { return x.id === String(req.id); })[0];
  if (!f) return { ok: true };
  if (f.autor !== me.id && !isAdmin_(me)) fail_('forbidden', 'No puedes borrar esta foto');
  trashFile_(f.archivo);
  deleteWhere_('Fotos', function (x) { return x.id === f.id; });
  deleteWhere_('Votos', function (x) { return x.foto === f.id; });
  return { ok: true };
};

H.vote = function (req) {
  var me = need_(req);
  var ev = findEvent_(req.evento);
  if (!ev) fail_('invalid', 'Esa quedada no existe');
  if (ev.estado === 'cerrada') fail_('closed', 'Esta quedada está cerrada');
  var f = rows_('Fotos').filter(function (x) { return x.id === String(req.foto) && x.evento === ev.id; })[0];
  if (!f) fail_('invalid', 'Esa foto ya no está');
  if (f.autor === me.id || f.etiquetado === me.id) fail_('own', 'No puedes votar tus fotos ni las que te etiquetan');
  var tipo = req.tipo;
  if (tipo != null && CAP[tipo] === undefined) fail_('invalid', 'Voto no válido');
  var photos = {};
  rows_('Fotos').forEach(function (x) { if (x.evento === ev.id) photos[x.id] = true; });
  var mine = rows_('Votos').filter(function (v) { return v.usuario === me.id && v.evento === ev.id && photos[v.foto]; });
  var current = mine.filter(function (v) { return v.foto === f.id; })[0];
  if (tipo) {
    var used = mine.filter(function (v) { return v.tipo === tipo && v.foto !== f.id; }).length;
    if (used >= CAP[tipo]) fail_('cap', 'Ya has usado todos tus votos de ese tipo');
    if (current) {
      setCell_('Votos', current._row, 'tipo', tipo);
      setCell_('Votos', current._row, 'momento', now_());
    } else {
      addRow_('Votos', [me.id, ev.id, f.id, tipo, now_()]);
    }
  } else if (current) {
    deleteWhere_('Votos', function (v) { return v.usuario === me.id && v.foto === f.id; });
  }
  var v = votes_(me);
  return { ok: true, counts: v.counts, myVotes: v.myVotes };
};

H.createEvent = function (req) {
  needAdmin_(req);
  var nombre = clean_(req.nombre, 40), fecha = clean_(req.fecha, 10);
  var max = Math.max(1, Math.min(10, parseInt(req.max, 10) || 3));
  if (nombre.length < 2) fail_('invalid', 'Ponle un nombre a la quedada');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) fail_('invalid', 'Fecha no válida');
  var id = 'q_' + uid_();
  addRow_('Quedadas', [id, nombre, fecha, 'abierta', String(max)]);
  return { ok: true, id: id };
};

H.setEvent = function (req) {
  needAdmin_(req);
  var q = findEvent_(req.id);
  if (!q) fail_('invalid', 'Esa quedada no existe');
  setCell_('Quedadas', q._row, 'estado', req.estado === 'closed' ? 'cerrada' : 'abierta');
  return { ok: true };
};

H.deleteEvent = function (req) {
  needAdmin_(req);
  var q = findEvent_(req.id);
  if (!q) return { ok: true };
  deleteWhere_('Fotos', function (f) { return f.evento === q.id; }).forEach(function (f) { trashFile_(f.archivo); });
  deleteWhere_('Votos', function (v) { return v.evento === q.id; });
  deleteWhere_('Quedadas', function (x) { return x.id === q.id; });
  return { ok: true };
};

H.deleteUser = function (req) {
  var me = needAdmin_(req);
  var u = rows_('Usuarios').filter(function (x) { return x.id === String(req.id); })[0];
  if (!u) return { ok: true };
  if (u.id === me.id || isAdmin_(u)) fail_('forbidden', 'No se puede eliminar a un admin');
  var gone = deleteWhere_('Fotos', function (f) { return f.autor === u.id; });
  gone.forEach(function (f) { trashFile_(f.archivo); });
  var ids = {};
  gone.forEach(function (f) { ids[f.id] = true; });
  deleteWhere_('Votos', function (v) { return v.usuario === u.id || ids[v.foto]; });
  rows_('Fotos').filter(function (f) { return f.etiquetado === u.id; }).forEach(function (f) { setCell_('Fotos', f._row, 'etiquetado', ''); });
  trashFile_(u.avatar);
  deleteWhere_('Usuarios', function (x) { return x.id === u.id; });
  return { ok: true };
};
