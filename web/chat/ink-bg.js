/* 墨流待機背景（簡化版 Stable Fluids）：自動緩緩流動，透明疊在對話頁背景上。
   用法：InkBackground.start(canvas, { colors:[[r,g,b],...] }) */
(function(){
  const N = 76, SIZE = (N+2)*(N+2), IX = (i,j)=>i+(N+2)*j;
  const dt=0.11, visc=0.00002, diff=0.00003, FADE=0.9994, VDAMP=0.999;
  const SHOW=0.12, INTENSITY=0.5;            // INTENSITY=整體淡雅度（背景不搶戲）
  const mk=()=>new Float32Array(SIZE);
  const u=mk(),v=mk(),u0=mk(),v0=mk();
  const mass=mk(),mass0=mk(),massT=mk(),cR=mk(),cR0=mk(),cRT=mk(),cG=mk(),cG0=mk(),cGT=mk(),cB=mk(),cB0=mk(),cBT=mk();

  function addSource(x,s){ for(let i=0;i<SIZE;i++) x[i]+=dt*s[i]; }
  function setBnd(b,x){ for(let i=1;i<=N;i++){
      x[IX(0,i)]=b===1?-x[IX(1,i)]:x[IX(1,i)]; x[IX(N+1,i)]=b===1?-x[IX(N,i)]:x[IX(N,i)];
      x[IX(i,0)]=b===2?-x[IX(i,1)]:x[IX(i,1)]; x[IX(i,N+1)]=b===2?-x[IX(i,N)]:x[IX(i,N)]; }
    x[IX(0,0)]=0.5*(x[IX(1,0)]+x[IX(0,1)]); x[IX(0,N+1)]=0.5*(x[IX(1,N+1)]+x[IX(0,N)]);
    x[IX(N+1,0)]=0.5*(x[IX(N,0)]+x[IX(N+1,1)]); x[IX(N+1,N+1)]=0.5*(x[IX(N,N+1)]+x[IX(N+1,N)]); }
  function lin(b,x,x0,a,c,it){ for(let k=0;k<it;k++){
      for(let j=1;j<=N;j++)for(let i=1;i<=N;i++)
        x[IX(i,j)]=(x0[IX(i,j)]+a*(x[IX(i-1,j)]+x[IX(i+1,j)]+x[IX(i,j-1)]+x[IX(i,j+1)]))/c;
      setBnd(b,x);} }
  function diffuse(b,x,x0,d,it){ const a=dt*d*N*N; lin(b,x,x0,a,1+4*a,it); }
  function advect(b,d,d0,uu,vv){ const dt0=dt*N;
    for(let j=1;j<=N;j++)for(let i=1;i<=N;i++){
      let x=i-dt0*uu[IX(i,j)], y=j-dt0*vv[IX(i,j)];
      if(x<0.5)x=0.5; if(x>N+0.5)x=N+0.5; if(y<0.5)y=0.5; if(y>N+0.5)y=N+0.5;
      const i0=x|0,i1=i0+1,j0=y|0,j1=j0+1,s1=x-i0,s0=1-s1,t1=y-j0,t0=1-t1;
      d[IX(i,j)]=s0*(t0*d0[IX(i0,j0)]+t1*d0[IX(i0,j1)])+s1*(t0*d0[IX(i1,j0)]+t1*d0[IX(i1,j1)]);
    } setBnd(b,d); }
  function project(uu,vv,p,div){ const h=1/N;
    for(let j=1;j<=N;j++)for(let i=1;i<=N;i++){ div[IX(i,j)]=-0.5*h*(uu[IX(i+1,j)]-uu[IX(i-1,j)]+vv[IX(i,j+1)]-vv[IX(i,j-1)]); p[IX(i,j)]=0; }
    setBnd(0,div); setBnd(0,p); lin(0,p,div,1,4,12);
    for(let j=1;j<=N;j++)for(let i=1;i<=N;i++){ uu[IX(i,j)]-=0.5*(p[IX(i+1,j)]-p[IX(i-1,j)])/h; vv[IX(i,j)]-=0.5*(p[IX(i,j+1)]-p[IX(i,j-1)])/h; }
    setBnd(1,uu); setBnd(2,vv); }
  function velStep(){ addSource(u,u0); addSource(v,v0);
    diffuse(1,u0,u,visc,10); diffuse(2,v0,v,visc,10); project(u0,v0,u,v);
    advect(1,u,u0,u0,v0); advect(2,v,v0,u0,v0); project(u,v,u0,v0); }
  function densStep(d,src,tmp){ addSource(d,src); diffuse(0,tmp,d,diff,6); advect(0,d,tmp,u,v); }

  function splat(i,j,amt,col){ for(let dj=-2;dj<=2;dj++)for(let di=-2;di<=2;di++){
      const ii=i+di,jj=j+dj; if(ii<1||ii>N||jj<1||jj>N)continue;
      const fall=Math.max(0,1-(di*di+dj*dj)/8), a=amt*fall, k=IX(ii,jj);
      mass0[k]+=a; cR0[k]+=a*col[0]; cG0[k]+=a*col[1]; cB0[k]+=a*col[2]; } }
  function radialVel(i,j,F){ for(let a=0;a<12;a++){ const ang=a/12*Math.PI*2;
      const oi=Math.round(i+Math.cos(ang)*2.5), oj=Math.round(j+Math.sin(ang)*2.5);
      if(oi<1||oi>N||oj<1||oj>N)continue; u0[IX(oi,oj)]+=Math.cos(ang)*F; v0[IX(oi,oj)]+=Math.sin(ang)*F; } }

  let colors=[[28,42,92]], frameNo=0, started=false, cv, ctx, off, octx, img, W, H;
  let last=null, down=false, lastInteract=-1e9, pickMode='random', picked=null;
  function autoDrop(){ const i=2+(Math.random()*(N-4))|0, j=2+(Math.random()*(N-4))|0;
    splat(i,j,300,colors[(Math.random()*colors.length)|0]); radialVel(i,j,9); }
  // 手動互動：點/拖在背景上滴墨、攪動
  function cell(e){ const p=e.touches?e.touches[0]:e;
    return { i:Math.max(1,Math.min(N,((p.clientX/W)*N)|0)), j:Math.max(1,Math.min(N,((p.clientY/H)*N)|0)), x:p.clientX, y:p.clientY }; }
  function rndCol(){ return (pickMode==='fixed'&&picked) ? picked : colors[(Math.random()*colors.length)|0]; }
  function manualDrop(e){ const c=cell(e); splat(c.i,c.j,420,rndCol()); radialVel(c.i,c.j,14); last=c; lastInteract=performance.now(); }
  function manualStir(c){ if(!last)return;
    for(let dj=-1;dj<=1;dj++)for(let di=-1;di<=1;di++){ const ii=c.i+di,jj=c.j+dj; if(ii<1||ii>N||jj<1||jj>N)continue;
      u0[IX(ii,jj)]+=(c.x-last.x)*0.45; v0[IX(ii,jj)]+=(c.y-last.y)*0.45; }
    splat(c.i,c.j,75,rndCol()); lastInteract=performance.now(); }

  function render(){
    const data=img.data, BG=[0,0,0];
    for(let j=0;j<N+2;j++)for(let i=0;i<N+2;i++){
      const k=IX(i,j), idx=k*4, m=mass[k], ink=Math.min(1,m*SHOW)*INTENSITY;
      if(m>0.0001){ data[idx]=cR[k]/m; data[idx+1]=cG[k]/m; data[idx+2]=cB[k]/m; data[idx+3]=ink*255; }
      else { data[idx+3]=0; }   // 無墨處透明 → 露出對話頁背景
    }
    octx.putImageData(img,0,0);
    ctx.clearRect(0,0,W,H); ctx.imageSmoothingEnabled=true; ctx.drawImage(off,1,1,N,N,0,0,W,H);
  }
  function frame(){
    frameNo++;
    // 閒置 4 秒以上才自動滴墨（你手動玩時不會自動亂滴；沒人時恢復待機流動）
    if(frameNo%170===0 && performance.now()-lastInteract>4000) autoDrop();
    velStep(); densStep(mass,mass0,massT); densStep(cR,cR0,cRT); densStep(cG,cG0,cGT); densStep(cB,cB0,cBT);
    u0.fill(0); v0.fill(0); mass0.fill(0); cR0.fill(0); cG0.fill(0); cB0.fill(0);
    for(let k=0;k<SIZE;k++){ mass[k]*=FADE; cR[k]*=FADE; cG[k]*=FADE; cB[k]*=FADE; u[k]*=VDAMP; v[k]*=VDAMP; }
    render(); requestAnimationFrame(frame);
  }

  window.InkBackground = {
    start(canvas, opts){
      if(started) return; started=true;
      cv=canvas; ctx=cv.getContext('2d');
      off=document.createElement('canvas'); off.width=N+2; off.height=N+2; octx=off.getContext('2d'); img=octx.createImageData(N+2,N+2);
      const fit=()=>{ W=cv.width=innerWidth; H=cv.height=innerHeight; }; fit(); addEventListener('resize',fit);
      if(opts && opts.colors && opts.colors.length) colors=opts.colors;
      // 手動互動（背景接收點/拖）
      cv.addEventListener('mousedown', e=>{ down=true; manualDrop(e); });
      cv.addEventListener('mousemove', e=>{ if(down){ const c=cell(e); manualStir(c); last=c; } });
      addEventListener('mouseup', ()=>{ down=false; last=null; });
      cv.addEventListener('touchstart', e=>{ e.preventDefault(); down=true; manualDrop(e); }, {passive:false});
      cv.addEventListener('touchmove', e=>{ e.preventDefault(); if(down){ const c=cell(e); manualStir(c); last=c; } }, {passive:false});
      // 開場先點兩滴，畫面不會空白
      autoDrop(); setTimeout(autoDrop, 900);
      requestAnimationFrame(frame);
    },
    setColor(rgb){ pickMode='fixed'; picked=rgb; },   // 調色盤選固定色
    setRandom(){ pickMode='random'; },                // 隨機色
    clear(){ mass.fill(0); cR.fill(0); cG.fill(0); cB.fill(0); u.fill(0); v.fill(0); }  // 清水
  };
})();
