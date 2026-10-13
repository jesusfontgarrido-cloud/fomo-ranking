const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
const B = 'http://localhost:8123';
const post = async (o) => (await fetch(B + '/api', { method: 'POST', body: JSON.stringify(o) })).json();
const img = (i) => 'data:image/jpeg;base64,' + fs.readFileSync(`img${i}.jpg`).toString('base64');
let errors = [];
(async () => {
  // datos de comunidad
  const mk = async (n, rol, extra = {}) => post({ action: 'register', code: 'fomo-halloween', nombre: n, rol, bio: 'Retrato y calle en Sevilla.', contacto: '+34 600 11' + Math.floor(Math.random()*9000+1000), pin: '1234', ...extra });
  const ana = await mk('Ana Ruiz', 'modelo'), luis = await mk('Luis Mora', 'fotografo'), eva = await mk('Eva Soto', 'modelo'), pablo = await mk('Pablo Gil', 'fotografo');
  const st = async (t) => post({ action: 'state', token: t });
  const evId = (await st(ana.token)).events[0].id;
  const idOf = async (t) => (await st(t)).me.id;
  const lid = await idOf(luis.token), aid = await idOf(ana.token);
  const pa = await post({ action: 'upload', token: ana.token, evento: evId, etiquetado: lid, foto: img(0) });
  const pl = await post({ action: 'upload', token: luis.token, evento: evId, etiquetado: aid, foto: img(1) });
  const pe = await post({ action: 'upload', token: eva.token, evento: evId, foto: img(2) });
  const pp = await post({ action: 'upload', token: pablo.token, evento: evId, foto: img(3) });
  // votos para que el podio tenga datos
  await post({ action: 'vote', token: eva.token, evento: evId, foto: pa.id, tipo: 'love' });
  await post({ action: 'vote', token: eva.token, evento: evId, foto: pp.id, tipo: 'like' });
  await post({ action: 'vote', token: pablo.token, evento: evId, foto: pe.id, tipo: 'love' });
  await post({ action: 'vote', token: pablo.token, evento: evId, foto: pl.id, tipo: 'dislike' });

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  // las fotos de Drive no existen aquí: servir imágenes de prueba según el id
  const driveIds = {};
  await page.route(/lh3\.googleusercontent\.com\/d\//, async (route) => {
    const id = decodeURIComponent(route.request().url().split('/d/')[1].split('=')[0]);
    driveIds[id] = driveIds[id] ?? Object.keys(driveIds).length % 4;
    await route.fulfill({ status: 200, contentType: 'image/jpeg', body: fs.readFileSync(`img${driveIds[id]}.jpg`) });
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());

  await page.goto(B);
  await page.waitForSelector('#auth-form');
  await page.screenshot({ path: 'shot-1-login.png' });

  // registro de Jesús
  await page.click('[data-act=authMode][data-id=register]');
  await page.fill('#f-code', 'mal-codigo'); await page.fill('#f-name', 'Jesús'); await page.fill('#f-pin', '4321');
  await page.fill('#f-bio', 'Admin de FOMO.'); await page.fill('#f-contact', '+34 655 000 111');
  await page.click('#f-go');
  await page.waitForSelector('#f-err:not([hidden])');
  console.log('error código:', await page.textContent('#f-err'));
  await page.fill('#f-code', 'FOMO-Halloween');
  await page.screenshot({ path: 'shot-2-register.png', fullPage: true });
  await page.click('#f-go');
  await page.waitForSelector('#sheet .panel');
  console.log('ayuda tras registro:', (await page.textContent('#sheet h2')).slice(0, 40));
  await page.click('#sheet [data-act=closeSheet].btn');
  await page.waitForSelector('.podium');
  console.log('admin visible antes de ser admin:', await page.locator('.nav button', { hasText: 'Admin' }).count());
  await page.screenshot({ path: 'shot-3-ranking-user.png' });

  // hacerle admin editando la "hoja" y recargar
  await fetch(B + '/admin-me');
  await page.reload(); await page.waitForSelector('.podium');
  console.log('pestaña Admin ahora:', await page.locator('.nav button', { hasText: 'Admin' }).count());
  await page.screenshot({ path: 'shot-4-ranking-admin.png' });

  // votar
  await page.click('.nav button:has-text("Votar")');
  await page.waitForSelector('.vc');
  await page.screenshot({ path: 'shot-5-votar.png' });
  const first = page.locator('.vc').first();
  await first.locator('.vb.love').click();
  await page.waitForTimeout(150);
  await page.locator('.vc').nth(1).locator('.vb.like').click();
  await page.locator('.vc').nth(2).locator('.vb.love').click(); // tope: 1 encanta
  await page.waitForTimeout(1200);
  console.log('toast tope:', await page.textContent('#toast'));
  console.log('presionados:', await page.locator('.vb[aria-pressed=true]').count());
  await page.reload(); await page.waitForSelector('.podium');
  await page.click('.nav button:has-text("Votar")'); await page.waitForSelector('.vc');
  console.log('votos persistidos tras recargar:', await page.locator('.vb[aria-pressed=true]').count());
  await page.screenshot({ path: 'shot-6-votar-despues.png' });

  // subir foto
  await page.click('.nav button:has-text("Ranking")');
  await page.click('[data-act=openUpload]');
  await page.setInputFiles('#up-file', 'img4.jpg');
  await page.waitForSelector('#up-go:not([disabled])');
  await page.screenshot({ path: 'shot-7-subir.png' });
  await page.click('#up-go');
  await page.waitForSelector('#toast.show');
  console.log('toast subida:', await page.textContent('#toast'));
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'shot-8-ranking-despues.png' });

  // admin
  await page.click('.nav button:has-text("Admin")');
  await page.click('[data-act=adminSec][data-id=usuarios]');
  await page.waitForSelector('.arow');
  const txt = await page.textContent('main');
  console.log('teléfonos visibles para admin:', /\+34 600/.test(txt));
  await page.screenshot({ path: 'shot-9-admin-usuarios.png', fullPage: true });
  // borrar a Pablo
  const row = page.locator('.arow', { hasText: 'Pablo Gil' });
  await row.locator('[data-act=delUser]').click(); await row.locator('[data-act=delUser]').click();
  await page.waitForFunction(() => !document.body.innerText.includes('Pablo Gil'));
  console.log('Pablo borrado OK');

  // modo claro
  await page.click('[data-act=theme]');
  await page.click('.nav button:has-text("Ranking")');
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'shot-10-claro.png' });
  // salir
  await page.click('.nav button:has-text("Perfil")'); await page.screenshot({ path: 'shot-11-perfil-claro.png' });
  await page.click('[data-act=logout]'); await page.waitForSelector('#auth-form');
  console.log('logout OK');
  // usuario normal no ve teléfonos
  await page.fill('#f-name', 'ana ruiz'); await page.fill('#f-pin', '1234'); await page.click('#f-go');
  await page.waitForSelector('.podium');
  await page.click('.nav button:has-text("Perfil")');
  console.log('Ana ve pestaña Admin:', await page.locator('.nav button', { hasText: 'Admin' }).count(), '| chip contacto de otros:', /\+34 6/.test(await page.textContent('main')));
  // desktop
  const p2 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await p2.route(/lh3\.googleusercontent\.com\/d\//, r => r.fulfill({ status: 200, contentType: 'image/jpeg', body: fs.readFileSync('img0.jpg') }));
  await p2.goto(B); await p2.waitForSelector('#auth-form'); await p2.screenshot({ path: 'shot-12-desktop.png' });
  console.log('errores de consola/página:', errors.length ? errors : 'ninguno');
  await browser.close();
})().catch(e => { console.error('FALLO', e); console.log(errors); process.exit(1); });
