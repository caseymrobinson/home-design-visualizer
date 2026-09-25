import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 900, height: 600 } });
p.on('pageerror', e => console.log('ERR', e.message));
await p.goto('http://localhost:5173/?pdb=1&mirrors=0');
await p.waitForTimeout(25000);
await p.evaluate(() => { const s = window.__store.getState(); s.update(d => { for (const it of d.items) { if (it.type==='mirror') Object.assign(it.params, { frame: 'black', rail: 'black', shape: 'rect' }); if (it.type==='shower-trim') it.params.handheld = 'combo'; } }, false); });
await p.waitForTimeout(15000);
const shot = async (n) => { const d = await p.evaluate(() => new Promise(r => requestAnimationFrame(() => r(document.querySelector('canvas').toDataURL())))); writeFileSync(`screenshots/opt-${n}.png`, Buffer.from(d.split(',')[1],'base64')); };
// close-up cameras
const look = (pos, tgt) => p.evaluate(([pos, tgt]) => window.__camera.goto({ id: 'x', label: '', x: pos[0], y: pos[2], lookX: tgt[0], lookY: tgt[2], lookH: tgt[1] }), [pos, tgt]);
await p.evaluate(() => window.__store.getState().setMode('walk'));
await p.waitForTimeout(8000);
await look([54, 62, 58], [54, 58, 100]); await p.waitForTimeout(30000); await shot('mirrors');
await look([66, 62, 44], [100.5, 52, 14]); await p.waitForTimeout(30000); await shot('shower');
await b.close();
