import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 640, height: 400 } });
await p.goto('http://localhost:5173/?pdb=1' + (process.env.Q||''));
await p.waitForTimeout(40000);
const avg = () => p.evaluate(() => new Promise(r => requestAnimationFrame(() => { const c=document.querySelector('canvas'); const t=document.createElement('canvas'); t.width=64;t.height=40; const x=t.getContext('2d'); x.drawImage(c,0,0,64,40); const d=x.getImageData(0,0,64,40).data; let s=0; for(let i=0;i<d.length;i+=4)s+=d[i]+d[i+1]+d[i+2]; r((s/(d.length/4*3)).toFixed(1)); })));
console.log('before', await avg());
await p.evaluate((process_nodims) => { const s=window.__store.getState(); const t=s.design().items.find(i=>i.type==='toilet'); s.select(t.id); s.set({dragging:true, showDims: !process_nodims}); let k=0; const iv=setInterval(()=>{ s.updateItem(t.id,{x:t.x-(++k)},false); if(k>8){clearInterval(iv); s.set({dragging:false});} },150); }, !!process.env.NODIMS);
for (let i=0;i<6;i++){ await p.waitForTimeout(2500); console.log('t'+i, await avg()); }
await p.waitForTimeout(20000); console.log('after', await avg()); const d=await p.evaluate(()=>document.querySelector('canvas').toDataURL()); (await import('fs')).writeFileSync('screenshots/bright.png', Buffer.from(d.split(',')[1],'base64'));
await b.close();
