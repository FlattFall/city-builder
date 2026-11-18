// Aiuole e file di fiori sotto un pezzo (gazebo, panchina, giochi...): per ogni parco, versione e rotazione
const path=require('path');const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage();
await p.goto('file://'+path.resolve(__dirname, '..', '..', 'index.html'));await p.waitForTimeout(300);
console.log(await p.evaluate(()=>{
  const out=[]; const ofb=flowerBed, ofs=flowerStrip, od=drawParts2;
  for (const [name,fn,n] of [['garden',(v)=>drawGarden(document.createElement('canvas').getContext('2d'),0,0,0,0,v),1],['park',(v)=>drawPark(document.createElement('canvas').getContext('2d'),0,0,0,0,v),2],['bigPark',(v)=>drawBigPark(document.createElement('canvas').getContext('2d'),0,0,0,0,v),3]])
    for (let v=0; v<5; v++) {
      const beds=[]; let parts=[];
      flowerBed=(c,ax,ay,base,r,cu,cv,rad)=>beds.push([cu-rad,cv-rad,cu+rad,cv+rad]);
      flowerStrip=(c,ax,ay,base,r,u0,v0,u1,v1)=>beds.push([u0,v0,u1,v1]);
      drawParts2=(c,ax,ay,base,r,ps)=>{ parts=ps.flatMap(q=>q.group?[{box:q.group.map(g=>g.box).reduce((a,b)=>[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[2],b[2]),Math.max(a[3],b[3])])}]:[q]); };
      fn(v);
      for (const bd of beds) for (const q of parts) {
        if (q.draw) continue;   // gli alberi possono stare vicino ai fiori: la chioma è in alto
        const ix=Math.min(bd[2],q.box[2])-Math.max(bd[0],q.box[0]), iy=Math.min(bd[3],q.box[3])-Math.max(bd[1],q.box[1]);
        if (ix>0.02&&iy>0.02) out.push(name+' v'+v+': aiuola '+JSON.stringify(bd.map(x=>+x.toFixed(2)))+' sotto '+JSON.stringify(q.box.map(x=>+x.toFixed(2))));
      }
    }
  flowerBed=ofb; flowerStrip=ofs; drawParts2=od;
  return out.length?out.join('\n'):'nessuna aiuola sotto un oggetto';
}));
await b.close();})();
