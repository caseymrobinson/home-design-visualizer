// Headless path-trace check: raster frame, then N traced samples, from the default orbit view.
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 640, height: 440 } });
p.on('pageerror', (e) => console.log('ERR', e.message));
p.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && console.log('CONSOLE', m.text().slice(0, 300)));
await p.goto('http://localhost:5173/?pdb=1&mirrors=0');
await p.waitForTimeout(30000);
const shot = async (n) => {
  const d = await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(document.querySelector('canvas').toDataURL()))));
  writeFileSync(`screenshots/${n}.png`, Buffer.from(d.split(',')[1], 'base64'));
};
if (process.env.VIEW) {
  const a = JSON.parse(process.env.VIEW);
  await p.evaluate(() => window.__store.getState().setMode('walk'));
  await p.waitForTimeout(3000);
  await p.evaluate((a) => window.__camera.goto({ id: 'x', label: '', x: a[0], y: a[1], lookX: a[2], lookY: a[3], lookH: a[4] }), a);
  await p.waitForTimeout(15000);
}
if (process.env.LIGHT) {
  await p.evaluate((l) => window.__store.getState().update((d) => Object.assign(d.lighting, l)), JSON.parse(process.env.LIGHT));
  await p.waitForTimeout(8000);
}
await shot('trace-raster');
const target = Number(process.env.SAMPLES || 24);
await p.evaluate((t) => window.__store.getState().setRender({ active: true, target: t }), target);
const t0 = Date.now();
for (;;) {
  await p.waitForTimeout(5000);
  const r = await p.evaluate(() => window.__store.getState().render);
  console.log(r.phase, r.samples, Math.round((Date.now() - t0) / 1000) + 's');
  if (r.phase === 'done' || Date.now() - t0 > 400000) break;
}
await shot('trace-pt');
if (process.env.TWICE) {
  await p.evaluate(() => window.__store.getState().setRender({ active: false }));
  await p.evaluate((l) => window.__store.getState().update((d) => Object.assign(d.lighting, l)), JSON.parse(process.env.TWICE));
  await p.waitForTimeout(8000);
  await p.evaluate((t) => window.__store.getState().setRender({ active: true, target: t }), target);
  const t1 = Date.now();
  for (;;) {
    await p.waitForTimeout(5000);
    const r = await p.evaluate(() => window.__store.getState().render);
    if (r.phase === 'done' || Date.now() - t1 > 400000) break;
  }
  await shot('trace-pt2');
}
await b.close();
