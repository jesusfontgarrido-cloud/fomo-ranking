const assert = require('assert');
const { makeEnv } = require('./mock');
const JPG = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0, 0, 0]).toString('base64');
const PNG = 'data:image/jpeg;base64,' + Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]).toString('base64');

const env = makeEnv();
const { call, sheets, ctx } = env;
let n = 0;
function ok(name, fn) { fn(); n++; console.log('ok -', name); }

env.ctx.setup();
ok('setup crea las pestañas y la quedada de Halloween', () => {
  assert.deepStrictEqual(Object.keys(sheets).sort(), ['Config', 'Fotos', 'Quedadas', 'Usuarios', 'Votos']);
  assert.strictEqual(sheets.Quedadas.data[1][1], 'Halloween');
  assert.strictEqual(sheets.Config.data.length, 3);
});
env.ctx.setup();
ok('setup es repetible sin duplicar', () => {
  assert.strictEqual(sheets.Config.data.length, 3);
  assert.strictEqual(sheets.Quedadas.data.length, 2);
});

const code = 'fomo-halloween';
const reg = (nombre, rol, extra = {}) => call(Object.assign({ action: 'register', code, nombre, rol, bio: 'hola', contacto: '+34 600 111 222', pin: '1234' }, extra));
const ana = reg('Ana', 'modelo'), luis = reg('Luis', 'fotografo', { avatar: JPG }), eva = reg('Eva', 'modelo'), jesus = reg('Jesús', 'fotografo');

ok('registro correcto devuelve token', () => { assert.ok(ana.ok && ana.token.length > 30); });
ok('código incorrecto se rechaza', () => assert.strictEqual(reg('X1', 'modelo', { code: 'nope' }).code, 'code'));
ok('nombre repetido (sin importar mayúsculas)', () => assert.strictEqual(reg('ana', 'modelo').code, 'name_taken'));
ok('PIN inválido y contacto corto', () => {
  assert.strictEqual(reg('Pin', 'modelo', { pin: '12' }).code, 'invalid');
  assert.strictEqual(reg('Con', 'modelo', { contacto: '123' }).code, 'invalid');
});
ok('avatar png falso se rechaza', () => assert.strictEqual(reg('Fake', 'modelo', { avatar: PNG }).code, 'image'));

ok('login correcto y fallos con bloqueo a los 5', () => {
  assert.ok(call({ action: 'login', nombre: 'ana', pin: '1234' }).ok);
  for (let i = 0; i < 5; i++) assert.strictEqual(call({ action: 'login', nombre: 'ana', pin: '9999' }).code, 'bad_login');
  assert.strictEqual(call({ action: 'login', nombre: 'ana', pin: '1234' }).code, 'locked');
});

const st = (t) => call({ action: 'state', token: t });
ok('sin token no hay datos', () => assert.strictEqual(call({ action: 'state' }).me, null));
ok('token falso no entra', () => assert.strictEqual(st('x'.repeat(40)).me, null));
ok('un usuario normal no recibe teléfonos', () => {
  const s = st(ana.token);
  assert.strictEqual(s.me.id.startsWith('u_'), true);
  assert.ok(s.users.every(u => u.contacto === undefined));
  assert.strictEqual(s.me.admin, false);
});

// Jesús se hace admin editando la hoja
const urow = sheets.Usuarios.data.find(r => r[1] === 'Jesús');
urow[9] = 'SI';
ok('admin (columna SI) recibe teléfonos', () => {
  const s = st(jesus.token);
  assert.strictEqual(s.me.admin, true);
  assert.ok(s.users.every(u => u.contacto && u.contacto.includes('600')));
});
ok('solo admin crea quedadas', () => {
  assert.strictEqual(call({ action: 'createEvent', token: ana.token, nombre: 'Otoño', fecha: '2026-11-01' }).code, 'forbidden');
  assert.ok(call({ action: 'createEvent', token: jesus.token, nombre: 'Otoño', fecha: '2026-11-01', max: 2 }).ok);
  assert.strictEqual(call({ action: 'createEvent', token: jesus.token, nombre: 'Mal', fecha: '1/1/26' }).code, 'invalid');
});

const evId = st(ana.token).events.find(e => e.nombre === 'Halloween').id;
const up = (t, tag) => call({ action: 'upload', token: t, evento: evId, etiquetado: tag || '', foto: JPG });
const idOf = (tok) => st(tok).me.id;
let photoA, photoL, photoE;
ok('subir fotos con etiqueta y límite de 3', () => {
  photoA = up(ana.token, idOf(luis.token));
  photoL = up(luis.token, idOf(ana.token));
  photoE = up(eva.token);
  assert.ok(photoA.ok && photoL.ok && photoE.ok);
  assert.ok(up(ana.token).ok); assert.ok(up(ana.token).ok);
  assert.strictEqual(up(ana.token).code, 'limit');
  assert.strictEqual(call({ action: 'upload', token: ana.token, evento: evId, etiquetado: 'u_fantasma', foto: JPG }).code, 'limit');
});
ok('foto png falsa y etiquetarse a sí misma', () => {
  assert.strictEqual(call({ action: 'upload', token: eva.token, evento: evId, foto: PNG }).code, 'image');
  assert.strictEqual(call({ action: 'upload', token: eva.token, evento: evId, etiquetado: idOf(eva.token), foto: JPG }).code, 'invalid');
});

const vote = (t, foto, tipo) => call({ action: 'vote', token: t, evento: evId, foto, tipo });
ok('votar: topes 1 encanta, 2 gusta, 1 no me gusta', () => {
  const lj = photoL.id, ej = photoE.id;
  assert.ok(vote(jesus.token, lj, 'love').ok);
  assert.strictEqual(vote(jesus.token, ej, 'love').code, 'cap');
  assert.ok(vote(jesus.token, ej, 'like').ok);
  assert.ok(vote(jesus.token, photoA.id, 'like').ok);
  const s = st(jesus.token);
  assert.strictEqual(s.myVotes[lj], 'love');
  assert.deepStrictEqual(s.counts[lj], { love: 1, like: 0, dislike: 0 });
});
ok('cambiar y quitar un voto libera el cupo', () => {
  assert.ok(vote(jesus.token, photoE.id, 'dislike').ok);
  assert.strictEqual(vote(jesus.token, photoA.id, 'dislike').code, 'cap');
  assert.ok(vote(jesus.token, photoE.id, null).ok);
  assert.ok(vote(jesus.token, photoA.id, 'dislike').ok);
  assert.strictEqual(sheets.Votos.data.filter(r => r[0] === idOf(jesus.token)).length, 2);
});
ok('no se vota lo propio ni donde te etiquetan', () => {
  assert.strictEqual(vote(ana.token, photoA.id, 'like').code, 'own');
  assert.strictEqual(vote(ana.token, photoL.id, 'like').code, 'own');
  assert.strictEqual(vote(luis.token, photoA.id, 'like').code, 'own');
});
ok('quedada cerrada no admite votos ni fotos', () => {
  assert.ok(call({ action: 'setEvent', token: jesus.token, id: evId, estado: 'closed' }).ok);
  assert.strictEqual(vote(eva.token, photoL.id, 'like').code, 'closed');
  assert.strictEqual(up(eva.token).code, 'closed');
  assert.ok(call({ action: 'setEvent', token: jesus.token, id: evId, estado: 'open' }).ok);
});
ok('borrar foto: solo autor o admin; limpia votos y archivo', () => {
  assert.strictEqual(call({ action: 'deletePhoto', token: eva.token, id: photoA.id }).code, 'forbidden');
  const before = env.drive.trashed.size;
  assert.ok(call({ action: 'deletePhoto', token: ana.token, id: photoA.id }).ok);
  assert.strictEqual(env.drive.trashed.size, before + 1);
  assert.ok(!st(ana.token).photos.some(p => p.id === photoA.id));
  assert.ok(!sheets.Votos.data.slice(1).some(r => r[2] === photoA.id));
});
ok('borrar usuario: solo admin, no a admins, limpia todo y quita etiquetas', () => {
  assert.strictEqual(call({ action: 'deleteUser', token: eva.token, id: idOf(ana.token) }).code, 'forbidden');
  assert.strictEqual(call({ action: 'deleteUser', token: jesus.token, id: idOf(jesus.token) }).code, 'forbidden');
  const anaId = idOf(ana.token);
  assert.ok(call({ action: 'deleteUser', token: jesus.token, id: anaId }).ok);
  const s = st(jesus.token);
  assert.ok(!s.users.some(u => u.id === anaId));
  assert.ok(!s.photos.some(p => p.autor === anaId));
  assert.ok(s.photos.every(p => p.etiquetado !== anaId));
  assert.strictEqual(st(ana.token).me, null);
});
ok('actualizar perfil y borrar quedada con sus fotos', () => {
  assert.ok(call({ action: 'updateProfile', token: eva.token, bio: 'nueva bio', contacto: '+34 611 222 333' }).ok);
  assert.strictEqual(st(eva.token).me.bio, 'nueva bio');
  assert.ok(call({ action: 'deleteEvent', token: jesus.token, id: evId }).ok);
  assert.strictEqual(st(eva.token).photos.length, 0);
});
ok('acción desconocida', () => assert.strictEqual(call({ action: 'hack' }).code, 'bad_action'));
console.log('\n' + n + ' pruebas correctas');
