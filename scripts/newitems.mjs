// Headless check of new items: perched trailing plants, wall art, towel ring, square TP holder.
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 900, height: 620 } });
p.on('pageerror', (e) => console.log('ERR', e.message));
p.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !/deprecat|renamed|KHR_/.test(m.text()) && console.log('CONSOLE', m.text().slice(0, 200)));
await p.goto('http://localhost:5173/?pdb=1&mirrors=0');
await p.waitForTimeout(25000);
await p.evaluate(([ART, PAL]) => {
  const st = window.__store.getState();
  const mk = (o) => ({ id: 'n' + Math.random().toString(36).slice(2), rot: 0, d: 12, w: 12, ...o });
  st.update((d) => {
    d.items.push(mk({ type: 'plant', x: 84, y: 95, z: 34, h: 14, rot: Math.PI, params: { kind: 'pothos', pot: '#e9e4da', potStyle: 'cylinder', trail: 34 } }));
    d.items.push(mk({ type: 'plant', x: 9, y: 97, z: 67.5, h: 12, rot: Math.PI, params: { kind: 'pearls', pot: '#b9a58c', potStyle: 'bowl', trail: 30 } }));
    d.items.push(mk({ type: 'art', x: 0, y: 70, z: 46, w: 16, h: 20, d: 1.1, rot: Math.PI / 2, surface: { kind: 'wall', wall: 3 }, params: { art: ART, palette: PAL, seed: 3, frame: 'oak', mat: true } }));
    d.items.push(mk({ type: 'towel-ring', x: 0, y: 84, z: 40, w: 10, d: 3, h: 2, rot: Math.PI / 2, surface: { kind: 'wall', wall: 3 }, params: { towel: true, towelColor: '#d9a13b', side: 'left' } }));
    d.items.push(mk({ type: 'plant', x: 92, y: 60, z: 0, h: 30, rot: -Math.PI / 2, params: { kind: 'monstera', pot: '#cbbba5' } }));
  });
  st.setMode('walk');
  window.__store.setState({ fov: 50 });
}, [process.env.ART || 'arches', process.env.PAL || 'sage']);
await p.waitForTimeout(6000);
const shot = async (n) => {
  const d = await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(document.querySelector('canvas').toDataURL()))));
  writeFileSync(`screenshots/new-${n}.png`, Buffer.from(d.split(',')[1], 'base64'));
};
const go = (a) => p.evaluate((a) => window.__camera.goto({ id: 'x', label: '', x: a[0], y: a[1], lookX: a[2], lookY: a[3], lookH: a[4] }), a);
for (const [n, a] of JSON.parse(process.env.VIEWS)) { await go(a); await p.waitForTimeout(12000); await shot(n); }
await b.close();
