import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 900, height: 620 } });
p.on('pageerror', e => console.log('ERR', e.message));
await p.goto('http://localhost:5173/?pdb=1&mirrors=0');
await p.waitForTimeout(30000);
const shot = async (n) => { const d = await p.evaluate(() => new Promise(r => requestAnimationFrame(() => r(document.querySelector('canvas').toDataURL())))); writeFileSync(`screenshots/cu-${n}.png`, Buffer.from(d.split(',')[1],'base64')); };
const go = (a) => p.evaluate((a) => window.__camera.goto({ id: 'x', label: '', x: a[0], y: a[1], lookX: a[2], lookY: a[3], lookH: a[4] }), a);
await p.evaluate(() => { window.__store.getState().setMode('walk'); window.__store.setState({ fov: 40 }); });
await p.waitForTimeout(6000);
for (const [n, a] of JSON.parse(process.env.VIEWS)) { await go(a); await p.waitForTimeout(Number(process.env.T || 30000)); await shot(n); }
await b.close();
