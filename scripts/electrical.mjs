// Headless check of switches & outlets (fresh storage → default design).
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 900, height: 620 } });
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto('http://localhost:5173/?pdb=1&mirrors=0');
await p.waitForTimeout(25000);
await p.evaluate(() => {
  const st = window.__store.getState();
  st.update((d) => {
    // Extra variants beside the defaults to compare styles
    const sw = d.items.find((i) => i.type === 'switch');
    d.items.push({ ...structuredClone(sw), id: 'sw-t', y: sw.y - 6, params: { gangs: 1, style: 'toggle', plate: 'black' } });
    const ou = d.items.find((i) => i.type === 'outlet');
    d.items.push({ ...structuredClone(ou), id: 'ou-u', x: ou.x - 5, params: { gangs: 1, style: 'usb', plate: 'finish' } });
  });
  st.setMode('walk');
  window.__store.setState({ fov: 28 });
});
await p.waitForTimeout(5000);
const shot = async (n) => {
  const d = await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(document.querySelector('canvas').toDataURL()))));
  writeFileSync(`screenshots/elec-${n}.png`, Buffer.from(d.split(',')[1], 'base64'));
};
const go = (a) => p.evaluate((a) => window.__camera.goto({ id: 'x', label: '', x: a[0], y: a[1], lookX: a[2], lookY: a[3], lookH: a[4] }), a);
for (const [n, a] of [['switch', [84, 88, 100.5, 90.5, 47]], ['outlet', [51.5, 84, 51.5, 100, 44]]]) { await go(a); await p.waitForTimeout(10000); await shot(n); }
await b.close();
