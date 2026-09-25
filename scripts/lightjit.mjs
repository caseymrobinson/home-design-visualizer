import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 480, height: 300 } });
p.on('console', m => { if (m.type()==='error') console.log('ERR', m.text().slice(0,200)); });
await p.goto('http://localhost:5173/?pdb=1' + (process.env.Q||''));
await p.waitForTimeout(35000);
const avg = () => p.evaluate(() => new Promise(r => requestAnimationFrame(() => { const c=document.querySelector('canvas'); const t=document.createElement('canvas'); t.width=48;t.height=30; const x=t.getContext('2d'); x.drawImage(c,0,0,48,30); const d=x.getImageData(0,0,48,30).data; let s=0; for(let i=0;i<d.length;i+=4)s+=d[i]+d[i+1]+d[i+2]; r((s/(d.length/4*3)).toFixed(0)); })));
const envBad = () => p.evaluate(() => { const { gl } = window.__three; const rt = window.__envRT; const buf = new Uint16Array(64*64*4); gl.readRenderTargetPixels(rt,96,96,64,64,buf,0); let bad=0, max=0; for (let i=0;i<buf.length;i++){ const e=(buf[i]>>10)&31; if (e===31) bad++; else max=Math.max(max,e);} return bad+'/'+max; });
console.log('start', await avg(), await envBad());
await p.evaluate(() => { let t = 6; const iv = setInterval(() => { t += 0.25; window.__store.getState().update(d => { d.lighting.time = t; }, false); if (t >= 20) clearInterval(iv); }, 60); });
for (let i=0;i<5;i++){ await p.waitForTimeout(2500); console.log('drag', await avg(), await envBad()); }
const steps = [['daylight',false],['daylight',true],['time',12]];
for (const [k,v] of steps) {
  await p.evaluate(([k,v]) => window.__store.getState().update(d => { d.lighting[k] = v; }, false), [k,v]);
  const a = [];
  for (let i=0;i<3;i++){ await p.waitForTimeout(3000); a.push(await avg()); }
  console.log(k, v, a.join(' '), 'env', await envBad());
}
await b.close();
