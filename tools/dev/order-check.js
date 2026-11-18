// Controllo dell'ordine dei pezzi: per ogni coppia di pezzi che si coprono sullo schermo, quello che sta
// tutto dietro (u o v più piccoli) deve essere disegnato prima. Uso: node order-check.js
const path=require('path');const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage();
await p.goto('file://'+path.resolve(process.env.GAME || path.join(__dirname, '..', '..'), 'index.html'));await p.waitForTimeout(300);
const res=await p.evaluate(()=>{
  const S=4, W=400, H=400, OX=200, OY=230;
  const mk=()=>{const cv=document.createElement('canvas');cv.width=W;cv.height=H;const c=cv.getContext('2d',{willReadFrequently:true});c.setTransform(S,0,0,S,OX,OY);return c;};
  const jobs=[];
  for (const [name,fn] of [['school',(c,r,v)=>drawSchool(c,0,0,0,r)],['highSchool',(c,r,v)=>drawHighSchool(c,0,0,0,r)],['university',(c,r,v)=>drawUniversity(c,0,0,0,r)],
    ['garden',(c,r,v)=>drawGarden(c,0,0,0,r,v)],['park',(c,r,v)=>drawPark(c,0,0,0,r,v)],['bigPark',(c,r,v)=>drawBigPark(c,0,0,0,r,v)]])
    for (let v=0; v<(name.includes('ark')||name==='garden'?5:1); v++) for (let r=0;r<4;r++) jobs.push([name,v,r,fn]);
  const errs=[]; const old=drawPart2; DETAIL=true; FINE=true;
  for (const [name,v,r,fn] of jobs) {
    const list=[];
    drawPart2=function(c,ax,ay,base,rr,pp,bb){ list.push({pp,bb:bb.slice(),args:[...arguments].slice(1)}); return old.apply(this,arguments); };
    // per gli edifici in withRotSize, ricordo anche ROT_SIZE al momento del disegno
    const _old=drawPart2; drawPart2=function(){ const it=_old.apply(this,arguments); list[list.length-1].rs=ROT_SIZE; return it; };
    fn(mk(),r,v);
    drawPart2=old;
    const masks=list.map(it=>{const c=mk(); const rs=ROT_SIZE; ROT_SIZE=it.rs; old(c,...it.args); ROT_SIZE=rs; return c.getImageData(0,0,W,H).data;});
    const behind=(a,b)=>{const e=1e-6;return a[2]<=b[0]+e||a[3]<=b[1]+e;};
    for (let i=0;i<list.length;i++) for (let j=i+1;j<list.length;j++) {
      const grow=it=>{ const bb=it.bb; if(!it.pp.draw||it.pp.h!==16) return bb; const h=(bb[2]-bb[0])/2, e=Math.max(0,0.18-h); return [bb[0]-e,bb[1]-e,bb[2]+e,bb[3]+e]; };   // albero: la chioma vera
      const A=grow(list[i]), B=grow(list[j]);   // A disegnato prima di B
      if (!(behind(B,A) && !behind(A,B))) continue;   // problema solo se B sta tutto dietro A ma è disegnato dopo
      let n=0; const ma=masks[i], mb=masks[j];
      for (let k=3;k<ma.length;k+=4) if (ma[k]>200 && mb[k]>200) n++;
      if (n>8) errs.push(name+' v'+v+' r'+(r+1)+': '+(list[j].pp.draw?'albero ':'')+JSON.stringify(list[j].pp.box||'gruppo')+' dietro, disegnato sopra '+(list[i].pp.draw?'albero ':'')+JSON.stringify(list[i].pp.box||'gruppo')+' ('+n+' px)');
    }
  }
  return errs;
});
console.log(res.length? res.join('\n') : 'nessun errore di ordine');
await b.close();})();
