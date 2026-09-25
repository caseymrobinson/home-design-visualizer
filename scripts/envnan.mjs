import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 640, height: 400 } });
p.on('console', m => { if (m.type()==='error') console.log('ERR', m.text().slice(0,200)); });
await p.goto('http://localhost:5173/?pdb=1');
await p.waitForTimeout(35000);
const scan = () => p.evaluate(() => { const { gl } = window.__three; const rt = window.__envRT; const buf = new Uint16Array(256*256*4); gl.readRenderTargetPixels(rt,0,0,256,256,buf,0); let nan=0; for (let i=0;i<buf.length;i++) if (((buf[i]>>10)&31)===31) nan++; return nan; });
console.log('before', await scan());
await p.evaluate(() => { const s = window.__store.getState(); s.select(s.design().items.find(i=>i.type==='toilet').id); });
await p.waitForTimeout(15000);
console.log('after select', await scan());
await p.evaluate(() => { const s=window.__store.getState(); const t=s.design().items.find(i=>i.type==='toilet'); for (let k=1;k<=9;k++) s.updateItem(t.id,{x:t.x-k},false); });
for (let i=0;i<4;i++){ await p.waitForTimeout(5000); console.log('after move', await scan(), await p.evaluate(()=>{const e=window.__three.scene.environment; return e?e.constructor.name+e.uuid.slice(0,4):'null'})); }
console.log(await p.evaluate(() => { const out=[]; window.__three.scene.traverse(o=>{ if(!o.visible) return; const e=o.matrixWorld.elements; if(e.some(v=>!isFinite(v))) out.push('M '+o.type+' '+o.name); if(o.isMesh){ o.geometry.computeBoundingSphere(); if(!isFinite(o.geometry.boundingSphere.radius)) out.push('G '+o.type+' '+(o.parent&&o.parent.type)); } if(o.isLight && (!isFinite(o.intensity))) out.push('L '+o.type); }); return out.slice(0,20); }));
await b.close();
