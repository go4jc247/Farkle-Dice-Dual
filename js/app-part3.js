(function(){
  fetch('data/wdata.b64').then(r=>r.text()).then(b64=>{
    b64=b64.trim();
    if(b64){
      const bin=atob(b64); const bytes=new Uint8Array(bin.length);
      for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
      setW(new Float32Array(bytes.buffer));
    }
  }).catch(e=>console.error('Failed to load physics data', e));
})();

const $ = id => document.getElementById(id);
const PIPS = {1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
const fmt = n => n.toLocaleString('en-US');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const reduced = (typeof window.matchMedia==='function') && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const HOLD = reduced ? 700 : 1950;
const LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><rect x="4" y="10.5" width="16" height="11" rx="2.5"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/></svg>';
/* Swappable RNG used by every physics-random draw (rnd, qRandom, staggerMul, d6, and the
   couple of inline Math.random() calls inside throwDice itself). Normal play leaves this
   pointed at Math.random -- zero behavior change. Cheat Mode temporarily points it at a
   seeded generator so a fast, invisible "rehearsal" roll and the real, visible roll that
   follows can draw the exact same sequence of "random" numbers and so play out identically
   except for the one deliberate starting-orientation correction. */
let PHYS_RNG = Math.random;
function mulberry32(seed){
  let a=seed>>>0;
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = (a,b) => a + PHYS_RNG()*(b-a);

/* which rotation brings each face to the front (opposite faces sum to 7) */
const FACE_ROT={1:[0,0], 2:[-90,0], 3:[0,-90], 4:[0,90], 5:[90,0], 6:[0,180]};

function dieEl(face, cls){
  const d=document.createElement('div');
  d.className='die '+(cls||'');
  const sh=document.createElement('div'); sh.className='sh'; d.appendChild(sh);
  const gl=document.createElement('div'); gl.className='gl'; d.appendChild(gl);
  const cube=document.createElement('div'); cube.className='cube';
  for(let f=1;f<=6;f++){
    const fa=document.createElement('div'); fa.className='f f'+f;
    const on=PIPS[f];
    for(let i=0;i<9;i++){
      const p=document.createElement('div');
      p.className = on.includes(i) ? 'p on' : 'p';
      fa.appendChild(p);
    }
    cube.appendChild(fa);
  }
  d.appendChild(cube);
  d._cube=cube; d._sh=sh;
  setFace(d,face);
  return d;
}
/* a cube has no 'current face' -- you rotate the one you want to the front */
function setFace(el,face,rz){
  const r=FACE_ROT[face];
  el._cube.style.transform='rotateZ('+(rz||0)+'deg) rotateX('+r[0]+'deg) rotateY('+r[1]+'deg)';
}
/* Quaternion rotation keeps each die's visible tumble tied to the direction it is
   actually travelling. These are the same rotation primitives used by the physics
   playground, without any of that playground's visual collision guides. */
const qIdentity = ()=>[1,0,0,0];
function qMul(a,b){
  const [aw,ax,ay,az]=a, [bw,bx,by,bz]=b;
  return [
    aw*bw-ax*bx-ay*by-az*bz,
    aw*bx+ax*bw+ay*bz-az*by,
    aw*by-ax*bz+ay*bw+az*bx,
    aw*bz+ax*by-ay*bx+az*bw
  ];
}
function qNorm(q){
  const [w,x,y,z]=q, m=Math.hypot(w,x,y,z)||1;
  return [w/m,x/m,y/m,z/m];
}
function qFromAxisAngle(ax,ay,az,angle){
  const len=Math.hypot(ax,ay,az);
  if(len<1e-8) return qIdentity();
  ax/=len; ay/=len; az/=len;
  const s=Math.sin(angle/2);
  return [Math.cos(angle/2),ax*s,ay*s,az*s];
}
function qRandom(){
  return qNorm(qMul(qFromAxisAngle(1,0,0,rnd(0,7)), qMul(qFromAxisAngle(0,1,0,rnd(0,7)), qFromAxisAngle(0,0,1,rnd(0,7)))));
}
function qSlerp(a,b,t){
  let [aw,ax,ay,az]=a,[bw,bx,by,bz]=b;
  let dot=aw*bw+ax*bx+ay*by+az*bz;
  if(dot<0){ bw=-bw;bx=-bx;by=-by;bz=-bz; dot=-dot; }
  if(dot>0.9995){
    const w=aw+(bw-aw)*t,x=ax+(bx-ax)*t,y=ay+(by-ay)*t,z=az+(bz-az)*t;
    return qNorm([w,x,y,z]);
  }
  const theta0=Math.acos(dot),theta=theta0*t;
  const s0=Math.cos(theta)-dot*Math.sin(theta)/Math.sin(theta0);
  const s1=Math.sin(theta)/Math.sin(theta0);
  return qNorm([aw*s0+bw*s1,ax*s0+bx*s1,ay*s0+by*s1,az*s0+bz*s1]);
}
function qToMat(q){
  const [w,x,y,z]=q;
  return [
    1-2*(y*y+z*z), 2*(x*y-w*z),   2*(x*z+w*y),
    2*(x*y+w*z),   1-2*(x*x+z*z), 2*(y*z-w*x),
    2*(x*z-w*y),   2*(y*z+w*x),   1-2*(x*x+y*y)
  ];
}
function matToCss(m){
  const [r00,r01,r02,r10,r11,r12,r20,r21,r22]=m;
  return `matrix3d(${r00},${r10},${r20},0,${r01},${r11},${r21},0,${r02},${r12},${r22},0,0,0,0,1)`;
}
const LOCAL_NORMAL={1:[0,0,1],6:[0,0,-1],3:[1,0,0],4:[-1,0,0],2:[0,-1,0],5:[0,1,0]};
function faceUp(m){
  const r20=m[6], r21=m[7], r22=m[8];
  const scores={1:r22,6:-r22,3:r20,4:-r20,2:-r21,5:r21};
  let best=1,bestV=-Infinity;
  for(const f in scores) if(scores[f]>bestV){ bestV=scores[f]; best=+f; }
  return best;
}
function worldNormal(m,local){
  const [r00,r01,r02,r10,r11,r12,r20,r21,r22]=m;
  const [x,y,z]=local;
  return [r00*x+r01*y+r02*z,r10*x+r11*y+r12*z,r20*x+r21*y+r22*z];
}
const countsOf = faces => { const c=[0,0,0,0,0,0]; for(const f of faces) c[f-1]++; return c; };
const d6 = () => 1+Math.floor(PHYS_RNG()*6);
const dieSize = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--die'));

/* ================= the throw ================= */
/* Top-down 2D: dice fly in fast, bounce off the four walls AND off each other,
   tumbling faces while quick, then settle. Substepped so nothing tunnels. */
const SUB = 12;              /* physics substeps per animation frame */
const WALL_E = 0.70;         /* wall restitution */
const DIE_E  = 0.86;         /* die-on-die restitution */
const DRAG   = 0.893;        /* per-frame velocity decay */
const GAP    = 1.17;         /* centre distance / die size -- keeps rotated squares apart */
const MIN_BOUNCE = 3;        /* every die must hit a wall at least three times -- more bounces
                                 means more tumble time before physics is allowed to settle it */
const SNAP_Z_TO_90 = false;  /* true = old behavior (Z-tilt forced to 0/90/180/270 on settle).
                                 false = Z is purely cosmetic (doesn't affect which face shows),
                                 so it's left to decay naturally instead of being force-corrected --
                                 that forced correction was the source of the "rolls backward"
                                 look, since it could fight the die's own established spin.
                                 Flip back to true to fully restore the old behavior. */
const FLOOR  = 17;           /* speed floor enforced until it has */
const LOCKSP = 3.2;          /* below this it stops tumbling and eases onto its face */
const SNAP   = 11;           /* frames spent easing into the final orientation */

function collide(B, min){
  for(let i=0;i<B.length;i++) for(let j=i+1;j<B.length;j++){
    const a=B[i], b=B[j];
    if(a.wait||b.wait) continue;
    let dx=b.x-a.x, dy=b.y-a.y;
    let d=Math.hypot(dx,dy);
    if(d>=min) continue;
    if(d<0.0001){ dx=Math.random()-0.5; dy=Math.random()-0.5; d=Math.hypot(dx,dy); }
    const nx=dx/d, ny=dy/d, push=(min-d)/2;
    a.x-=nx*push; a.y-=ny*push; b.x+=nx*push; b.y+=ny*push;
    const rvn=(b.vx-a.vx)*nx + (b.vy-a.vy)*ny;
    if(rvn<0){
      const jn=-(1+DIE_E)*rvn/2;
      a.vx-=jn*nx; a.vy-=jn*ny; b.vx+=jn*nx; b.vy+=jn*ny;
      const k=Math.min(1.2,Math.abs(jn)/22);
      a.wx-=jn*0.85; b.wx+=jn*0.85;
      a.wy+=jn*0.65; b.wy-=jn*0.65;
      a.wz+=(Math.random()*2-1)*20*k; b.wz-=(Math.random()*2-1)*20*k;
    }
  }
}
function walls(b,PAD,minY,maxX,maxY){
  let hit=false;
  if(b.x<PAD){ b.x=PAD; b.vx=Math.abs(b.vx)*WALL_E; hit=true; }
  else if(b.x>maxX){ b.x=maxX; b.vx=-Math.abs(b.vx)*WALL_E; hit=true; }
  if(b.y<minY){ b.y=minY; b.vy=Math.abs(b.vy)*WALL_E; hit=true; }
  else if(b.y>maxY){ b.y=maxY; b.vy=-Math.abs(b.vy)*WALL_E; hit=true; }
  if(hit){
    b.hits++;
    const k=Math.min(1.2, Math.hypot(b.vx,b.vy)/55);
    b.wx += (Math.random()*2-1)*42*k;
    b.wy += (Math.random()*2-1)*42*k;
    b.wz += (Math.random()*2-1)*28*k;
  }
}

function throwDiceLegacy(n, clickable, tags){
  const arena=$('arena');
  arena.querySelectorAll('.die:not(.held)').forEach(e=>e.remove());
  const W=arena.clientWidth, H=arena.clientHeight, SZ=dieSize(), PAD=6;
  const shelfH=$('shelf').offsetHeight;
  const maxX=W-SZ-PAD, maxY=H-SZ-PAD, minY=shelfH+PAD, MIN=SZ*GAP;

  const B=Array.from({length:n},(_,i)=>{
    const el=dieEl(1,'inpit'+(tags?' '+tags[i]:''));  /* placeholder face -- the real value
                                                           isn't known until the die stops tumbling */
    arena.appendChild(el);
    const left=i%2===0;
    const vx = left ? rnd(12,50) : rnd(-50,-12), vy = rnd(-142,-100);
    const s0 = Math.hypot(vx,vy);
    return { el, face:null,
      x: left ? rnd(PAD, W*0.30) : rnd(W*0.70-SZ, maxX),
      y: H + SZ*0.6 + i*26,
      vx, vy,
      rx:rnd(0,360), ry:rnd(0,360), rz:rnd(0,360),
      /* tumble scales with how hard it was thrown -- boosted so the die visibly spins
         several times over before it settles, instead of just tipping into place */
      wx:rnd(-1,1)*s0*0.55, wy:rnd(-1,1)*s0*0.55, wz:rnd(-1,1)*s0*0.4,
      delay: Math.round(rnd(0,3) + i*rnd(0.4,2.2)),   /* they leave the hand in sequence */
      drag:  rnd(0.876,0.906),                        /* each finds its own friction */
      lock:  rnd(2.6,4.4),                            /* and settles at its own moment */
      snapN: Math.round(rnd(9,17)),
      wait:true, hits:0, snap:null };
  });
  const place=b=>{
    b.el.style.transform='translate('+b.x.toFixed(1)+'px,'+b.y.toFixed(1)+'px)';
    spin(b.el,b.rx,b.ry,b.rz);
  };
  B.forEach(place);

  const settle=()=>{
    separate(B,MIN,PAD,minY,maxX,maxY);
    /* fallback: if a die hit the frame cap before ever slowing into its snap (shouldn't
       normally happen), read its outcome off whatever tilt it's currently at */
    for(const b of B) if(b.face==null) b.face=faceFromRot(b.rx,b.ry);
    const faces=B.map(b=>b.face);
    const vf=rollLookup(faces).vf;
    for(const b of B){
      /* Skip anything the player already clicked into pending/committed while this roll's
         OTHER dice were still finishing their tumble -- layoutShelf() already gave it its
         final position and upright rotation, and this loop runs after the whole roll's
         animation ends, not per-die, so without this check it would silently stomp back
         over that with a stale, mid-tumble rotation value. */
      if(b.el.classList.contains('sel') || b.el.classList.contains('held')) continue;
      b.el.style.filter='';
      b.el._ok = !!vf[b.face-1];
      if(b.el._ok) b.el.classList.add('ok');   /* brighten only after it stops */
      b.el._sh.style.transform='translateY(8px)';
      setFace(b.el, b.face, b.rz);   /* use the die's actual current tilt, not a stale value captured
                                        back when its snap began -- it may have kept decaying since */
      b.el.style.transform='translate('+b.x.toFixed(1)+'px,'+b.y.toFixed(1)+'px)';
    }
    wire(B,clickable,vf);
    return faces;
  };

  if(reduced){
    for(const b of B){
      b.x=rnd(PAD,maxX); b.y=rnd(minY,maxY);
      b.face=faceFromRot(b.rx,b.ry); b.snap={z1:b.rz}; b.wait=false;
    }
    return Promise.resolve(settle());
  }

  return new Promise(resolve=>{
    let frame=0;
    (function step(){
      frame++;
      for(let s=0;s<SUB;s++){
        for(const b of B){
          if(b.wait) continue;
          b.x+=b.vx/SUB; b.y+=b.vy/SUB;
          walls(b,PAD,minY,maxX,maxY);
        }
        collide(B,MIN);
        for(const b of B){ if(!b.wait) walls(b,PAD,minY,maxX,maxY); }
      }
      let moving=false;
      for(const b of B){
        if(b.wait){
          if(frame>b.delay) b.wait=false; else { moving=true; place(b); continue; }
        }
        const DRAG=b.drag;
        b.vx*=DRAG; b.vy*=DRAG;
        let sp=Math.hypot(b.vx,b.vy);
        if(b.hits<MIN_BOUNCE && sp<FLOOR){        /* keep it alive until it has bounced twice */
          const k=FLOOR/(sp||0.001); b.vx*=k; b.vy*=k; sp=FLOOR;
        }
        if(sp>1.2 || b.hits<MIN_BOUNCE) moving=true;

        if(!b.snap && sp<=b.lock && b.hits>=MIN_BOUNCE){
          /* the physics has decided the outcome by now -- read off whichever face is
             already closest to facing the viewer at this exact tilt, then ease into
             the NEAREST orientation that shows it cleanly, so it settles without jumping */
          b.face=faceFromRot(b.rx,b.ry);
          const t=FACE_ROT[b.face];
          b.snap={p:0, x0:b.rx, y0:b.ry, z0:b.rz,
                  x1:Math.round((b.rx-t[0])/360)*360+t[0],
                  y1:Math.round((b.ry-t[1])/360)*360+t[1],
                  z1:SNAP_Z_TO_90 ? Math.round(b.rz/90)*90 : b.rz};
        }
        if(b.snap){
          b.snap.p=Math.min(1,b.snap.p+1/b.snapN);
          const e=1-Math.pow(1-b.snap.p,3);
          b.rx=b.snap.x0+(b.snap.x1-b.snap.x0)*e;
          b.ry=b.snap.y0+(b.snap.y1-b.snap.y0)*e;
          if(SNAP_Z_TO_90){
            b.rz=b.snap.z0+(b.snap.z1-b.snap.z0)*e;
          }else{
            b.rz+=b.wz; b.wz*=DRAG;   /* Z keeps decaying naturally -- no correction needed */
          }
          if(b.snap.p<1) moving=true;
        }else{
          b.rx+=b.wx; b.ry+=b.wy; b.rz+=b.wz;
          b.wx*=DRAG; b.wy*=DRAG; b.wz*=DRAG;
        }
        b.el.style.filter = sp>6 ? 'blur('+Math.min(2.6,sp/26).toFixed(2)+'px)' : '';
        b.el._sh.style.transform='translateY('+(8+Math.min(9,sp*0.1)).toFixed(1)+'px) scale('+
                              (1+Math.min(.3,sp*0.004)).toFixed(3)+')';
        place(b);
      }
      if(moving && frame<130) requestAnimationFrame(step);
      else{ resolve(settle()); }
    })();
  });
}
function separate(B,MIN,PAD,minY,maxX,maxY){
  for(let it=0; it<90; it++){
    let moved=false;
    for(let i=0;i<B.length;i++) for(let j=i+1;j<B.length;j++){
      const a=B[i],b=B[j];
      let dx=b.x-a.x, dy=b.y-a.y, d=Math.hypot(dx,dy);
      if(d>=MIN) continue;
      if(d<0.0001){ dx=Math.random()-0.5; dy=Math.random()-0.5; d=Math.hypot(dx,dy); }
      const push=(MIN-d)/2/d;
      a.x-=dx*push; a.y-=dy*push; b.x+=dx*push; b.y+=dy*push;
      moved=true;
    }
    for(const b of B){
      b.x=Math.max(PAD,Math.min(maxX,b.x));
      b.y=Math.max(minY,Math.min(maxY,b.y));
    }
    if(!moved) break;
  }
}

/* ================= travel-driven dice physics =================
   Ported from dice-playground.html. The collision bubbles remain mathematical
   only: no bubble element or dotted guide is created or drawn in the game. */
const PHYS_RESTITUTION=0.78;
const PHYS_ROLL_RADIUS=26;
const PHYS_START_BUBBLE_SCALE=0.15;
const PHYS_REST_BUBBLE_SCALE=1.3225*0.90;
const PHYS_INITIAL_DRAG=0.004;
const PHYS_SETTLED_SPEED_EPS=4;
const PHYS_SETTLED_TILT_EPS=2*Math.PI/180;
const PHYS_SETTLED_MASS=0.05;
const PHYS_READY_TILT_EPS=12*Math.PI/180;
const PHYS_MAX_SECONDS=14;
const PHYS_SNAP_TRIGGER_SPEED=40;   /* "almost stopped" -- once travel speed drops below this,
                                        the magnet's gentle-but-wiggly correction hands off to a
                                        single decisive snap instead, so the tail end doesn't shake */
const PHYS_CONTROL={
  launch:1920, launchStagger:20,
  decelRampMs:1050, decelStagger:10,
  fullDragTenths:70, dragStagger:35,
  magnetStart:280, magnetStartStagger:35,
  magnetRampMs:1250, magnetRampStagger:40,
  magnetForce:5500, magnetForceStagger:20,
  snapMs:425, snapStagger:20,
  highlightDelayMs:200
};
const PHYS_DEFAULTS=JSON.parse(JSON.stringify(PHYS_CONTROL));
/* A completely separate, fixed profile just for the single-die roll-for-first at the very
   start of a game -- that's a different moment than a real 6-dice turn and should feel much
   snappier, not sit around waiting the same way. Not exposed on sliders (yet) -- if that's
   wanted later it's easy to add, same pattern as PHYS_CONTROL above. */
const PHYS_CONTROL_ROLLOFF={
  launch:2460, launchStagger:20,
  decelRampMs:300, decelStagger:0,
  fullDragTenths:120, dragStagger:35,
  magnetStart:280, magnetStartStagger:35,
  magnetRampMs:200, magnetRampStagger:40,
  magnetForce:7900, magnetForceStagger:20,
  snapMs:250, snapStagger:20,
  highlightDelayMs:0
};
let physicsRollSerial=0;

const physicsClamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const physicsMix=(a,b,t)=>a+(b-a)*t;
/* Every setting has its own stagger: each die rolls its own value for that setting,
   somewhere within \u00b1stagger% of the slider's base number, instead of every die sharing
   the exact same number. That's what keeps a faster launch mattering all the way through
   (instead of every die decelerating along an identical shared curve and settling within a
   hair of each other), and it now applies per-setting rather than as one blanket multiplier.
   Returns a MULTIPLIER (apply by multiplying into the base value); floored so it can never
   hit zero or go negative. */
function staggerMul(pct){ return Math.max(0.05,1+rnd(-1,1)*(pct/100)); }
function physicsTuning(ctrl){
  ctrl=ctrl||PHYS_CONTROL;
  const forceT=physicsClamp((ctrl.magnetForce-500)/(9000-500),0,1);
  const decelRampSeconds=ctrl.decelRampMs/1000;
  const magnetRampSeconds=ctrl.magnetRampMs/1000;
  return {
    launchSpeed:ctrl.launch, launchStagger:ctrl.launchStagger,
    decelRampSeconds, decelStagger:ctrl.decelStagger,
    fullDrag:ctrl.fullDragTenths/1000, dragStagger:ctrl.dragStagger,
    magnetStartSpeed:ctrl.magnetStart, magnetStartStagger:ctrl.magnetStartStagger,
    magnetRampSeconds, magnetRampStagger:ctrl.magnetRampStagger,
    magnetForce:ctrl.magnetForce, magnetForceStagger:ctrl.magnetForceStagger,
    /* A stronger field also adds a little more drag while it corrects the tilt. */
    magnetDragPerSecond:physicsMix(0.8,2.4,forceT),
    snapSeconds:ctrl.snapMs/1000, snapStagger:ctrl.snapStagger,
    highlightDelayMs:ctrl.highlightDelayMs,
    readyMaxSeconds:Math.min(12,Math.max(6,5+decelRampSeconds+magnetRampSeconds+ctrl.snapMs/1000))
  };
}

function physicsBubbleScale(speed,launchSpeed){
  /* Exactly 15% at launch. It stays tiny through the first 12% of speed loss,
     then grows smoothly to its resting size by the time 75% has been lost. */
  const lost=1-physicsClamp(speed/(launchSpeed||1),0,1);
  const t=physicsClamp((lost-0.12)/(0.75-0.12),0,1);
  const eased=t*t*(3-2*t);
  return physicsMix(PHYS_START_BUBBLE_SCALE,PHYS_REST_BUBBLE_SCALE,eased);
}

function physicsTiltOf(q){
  const m=qToMat(q), f=faceUp(m), wn=worldNormal(m,LOCAL_NORMAL[f]);
  return {wn,angle:Math.acos(Math.max(-1,Math.min(1,wn[2])))};
}
/* the minimal rotation that would bring the currently-nearest face fully flat --
   used by the final snap below, so the die tips upright without any extra twist */
function physicsAlignQuat(q){
  const m=qToMat(q), f=faceUp(m), wn=worldNormal(m,LOCAL_NORMAL[f]);
  const dot=Math.max(-1,Math.min(1,wn[2]));
  if(dot>0.99999) return qIdentity();
  if(dot<-0.99999) return qFromAxisAngle(1,0,0,Math.PI);
  const ax=wn[1]*1-wn[2]*0, ay=wn[2]*0-wn[0]*1, az=wn[0]*0-wn[1]*0;
  return qFromAxisAngle(ax,ay,az,Math.acos(dot));
}
/* Cheat Mode: the rotation that relabels a die's outcome from whatever it naturally
   settled on to whatever face was picked, WITHOUT touching how it tumbled to get there.
   Every place the physics reads "which face is up" (faceUp, physicsAlignQuat) only ever
   looks at the die's own current spin -- nothing depends on its position, its neighbors,
   or the wall bounces it took to get there. That's what makes this safe: this rotation
   is applied once, after the tumble is already finished, and it's purely a relabeling of
   that already-decided orientation -- not a steer, not a fake-and-swap. */
function faceCorrectionQuat(naturalFace,desiredFace){
  if(naturalFace===desiredFace) return qIdentity();
  const A=LOCAL_NORMAL[desiredFace], B=LOCAL_NORMAL[naturalFace];
  const dot=Math.max(-1,Math.min(1,A[0]*B[0]+A[1]*B[1]+A[2]*B[2]));
  if(dot>0.99999) return qIdentity();
  if(dot<-0.99999){
    const perp=Math.abs(A[0])<0.9 ? [1,0,0] : [0,1,0];
    const ax=A[1]*perp[2]-A[2]*perp[1], ay=A[2]*perp[0]-A[0]*perp[2], az=A[0]*perp[1]-A[1]*perp[0];
    return qFromAxisAngle(ax,ay,az,Math.PI);
  }
  const ax=A[1]*B[2]-A[2]*B[1], ay=A[2]*B[0]-A[0]*B[2], az=A[0]*B[1]-A[1]*B[0];
  return qFromAxisAngle(ax,ay,az,Math.acos(dot));
}

/* A lightweight stand-in for a real die element, used only for the invisible "rehearsal"
   pass below -- it accepts every write the physics loop makes (style, classList, _cube,
   _sh, onclick) without touching the real page, so the exact same throwDice code can run
   headless without a single special case inside the physics itself. */
function fakeDieEl(){
  return {
    style:{}, _cube:{style:{}}, _sh:{style:{}}, onclick:null, _ok:false,
    classList:{contains:()=>false, add(){}, remove(){}, toggle(){}}
  };
}
const PHYS_FIXED_DT = 1/60;   /* deterministic simulation step -- see the note on PHYS_RNG above */
function throwDice(n,clickable,tags,isRollOff,targetFaces,record){
  const rollSerial=++physicsRollSerial;
  const tuning=physicsTuning(isRollOff ? PHYS_CONTROL_ROLLOFF : PHYS_CONTROL);
  /* A brief speed/spin burst right at launch, decaying back to the normal curve after
     BOOST_DURATION -- without this, a roll that happens to have little velocity left by
     the time it's down to just one or two dice can look like a die barely rolled at all,
     which reads as suspicious even though the outcome was never actually under anyone's
     control. The very last remaining die of a turn (not the separate roll-for-first) gets
     the biggest, longest burst, since that's the moment it matters most to see it fly. */
  const BOOST_FACTOR = isRollOff ? 1 : (n===1 ? 3.2 : 2);
  const BOOST_DURATION = isRollOff ? 0 : (n===1 ? 1.1 : 0.7);
  const arena=$('arena');
  if(!record) arena.querySelectorAll('.die:not(.held)').forEach(e=>e.remove());
  const W=arena.clientWidth,H=arena.clientHeight,SZ=dieSize();
  const activeTop=$('shelf').offsetHeight;
  const cx=W/2;
  /* Dice are thrown from the top-center of the board rather than its middle: they spawn
     infinitely small right where they'd leave the cup, and grow to full size over the first
     25% of the board's playable height as they fall -- growDist is that 25% distance, and
     each die's own spawnY (below) is what its individual growth is measured from. */
  const spawnY=activeTop+SZ*0.2;
  const growDist=(H-activeTop)*0.25;

  const B=Array.from({length:n},(_,i)=>{
    let el;
    if(record){ el=fakeDieEl(); }
    else{ el=dieEl(1,'inpit'+(tags?' '+tags[i]:'')); arena.appendChild(el); }
    /* biased into a downward cone (not a full circle) so every die visibly falls away from
       the top instead of possibly launching back up toward the shelf it just left */
    const angle=Math.PI/2+(Math.random()-0.5)*Math.PI*0.7;
    const baseSpeed=tuning.launchSpeed;
    const speed=baseSpeed*staggerMul(tuning.launchStagger)*BOOST_FACTOR;
    const y0=spawnY+rnd(-6,6)-SZ/2;
    return {
      el,face:null,
      x:cx+rnd(-18,18)-SZ/2,
      y:y0,
      spawnY:y0,growProgress:0,
      vx:Math.cos(angle)*speed,
      vy:Math.sin(angle)*speed,
      q:qRandom(),settled:false,bubbleScale:PHYS_START_BUBBLE_SCALE,
      launchSpeed:speed,age:0,magnetAge:0,
      forceFace:false,frozen:false,
      /* Every setting above has its own stagger -- each die rolls its own value for that
         setting within +/- the setting's own stagger percent, instead of every die sharing
         the exact same number. That's what keeps a faster launch mattering all the way
         through (otherwise every die decays along an identical shared curve and settles
         within a hair of each other). */
      decelJitter:staggerMul(tuning.decelStagger),
      dragJitter:staggerMul(tuning.dragStagger),
      magnetStartJitter:staggerMul(tuning.magnetStartStagger),
      magnetRampJitter:staggerMul(tuning.magnetRampStagger),
      magnetForceJitter:staggerMul(tuning.magnetForceStagger),
      snapping:false,snapFrom:null,snapTo:null,snapElapsed:0,snapJitter:staggerMul(tuning.snapStagger)
    };
  });

  const place=b=>{
    const g=b.growProgress!=null?b.growProgress:1, gEase=1-Math.pow(1-g,2);
    const scaleTerm=g<1?` scale(${Math.max(0.001,gEase).toFixed(3)})`:'';
    b.el.style.transform=`translate(${b.x.toFixed(1)}px,${b.y.toFixed(1)}px)${scaleTerm}`;
    if(b.forceFace) setFace(b.el,b.face,0);
    else b.el._cube.style.transform=matToCss(qToMat(b.q));
  };
  if(!record) B.forEach(place);

  /* Cheat Mode recording only: one snapshot of every die's position and spin per physics
     step. Recorded once, headless and instant; played back later at normal speed by
     playRecordedRoll below -- see the comment there for why this replaced trying to
     reproduce the same roll twice live. */
  const frames = record ? [] : null;
  const recordFrame=()=>{
    frames.push(B.map(b=>({x:b.x,y:b.y,growProgress:b.growProgress,q:b.q,forceFace:b.forceFace,face:b.face})));
  };
  if(record) recordFrame();

  const finish=()=>{
    const faces=[];
    for(let i=0;i<B.length;i++){
      const b=B[i];
      if(b.face==null) b.face=faceUp(qToMat(b.q));
      /* Cheat Mode's reduced-motion path only -- dice appear already resting there (see the
         `if(reduced)` branch below), so relabeling the result directly is the whole story;
         there's no tumble to have gotten this from a corrected start in the first place. */
      if(targetFaces && targetFaces[i] && targetFaces[i]!==b.face){
        b.q=qNorm(qMul(b.q,faceCorrectionQuat(b.face,targetFaces[i])));
        b.face=targetFaces[i];
        b.forceFace=true; b.snapping=false; b.settled=true; b.frozen=true; b.vx=0; b.vy=0;
      }
      /* the "ready" check only requires tilt under 12 degrees, so a die that's still mid-snap
         (a few degrees off) can otherwise get locked in looking slightly crooked -- force it
         perfectly flat right here, which still preserves whatever natural in-plane twist it
         already had, it just corrects the tilt itself. This has to happen before a recording
         is handed back too, or the tape itself ends a few degrees short of flat and Cheat
         Mode rolls always look like they never quite finished settling. */
      if(!b.forceFace) b.q=qNorm(qMul(physicsAlignQuat(b.q),b.q));
      faces.push(b.face);
    }
    if(record){ recordFrame(); return {faces,frames}; }   /* headless recording: hand the tape back, nothing to draw */
    const vf=rollLookup(faces).vf;
    for(const b of B){
      if(b.el.classList.contains('sel')||b.el.classList.contains('held')) continue;
      b.el.style.filter='';
      b.el._ok=!!vf[b.face-1];
      if(b.el._ok) b.el.classList.add('ok');
      b.el._sh.style.transform='translateY(8px)';
      place(b);
    }
    wire(B,clickable,vf);
    return faces;
  };

  if(reduced){
    const cols=Math.ceil(Math.sqrt(n));
    const rows=Math.ceil(n/cols);
    const usableW=W-SZ,usableH=H-activeTop-SZ;
    B.forEach((b,i)=>{
      const col=i%cols,row=Math.floor(i/cols);
      b.x=SZ/2+(col+1)*usableW/(cols+1)-SZ/2;
      b.y=activeTop+SZ/2+(row+1)*usableH/(rows+1)-SZ/2;
      b.face=d6(); b.forceFace=true; b.settled=true;
    });
    return Promise.resolve(finish());
  }

  /* One fixed-size physics step, decoupled from real elapsed time -- a recording made this
     way plays back at the same speed it was made at regardless of how fast the CPU produced
     it, since "how much has happened" is just "how many steps", never how much wall-clock
     time passed making them. */
  function advance(dt,gameResolved){
    for(const b of B){
      if(b.frozen||b.el.classList.contains('sel')||b.el.classList.contains('held')){
        b.frozen=true; b.vx=0; b.vy=0;
        continue;
      }
      const speed=Math.hypot(b.vx,b.vy);
      b.age+=dt;
      b.bubbleScale=physicsBubbleScale(speed,b.launchSpeed);
      const R=SZ*b.bubbleScale/2;
      const minX=R-SZ/2,maxX=W-R-SZ/2;
      const minY=activeTop+R-SZ/2,maxY=H-R-SZ/2;

      b.x+=b.vx*dt;
      b.y+=b.vy*dt;
      if(b.growProgress<1) b.growProgress=Math.max(b.growProgress,physicsClamp((b.y-b.spawnY)/growDist,0,1));
      const dragT=physicsClamp(b.age/(tuning.decelRampSeconds*b.decelJitter),0,1);
      const progressiveDrag=dragT*dragT*(3-2*dragT);
      const dragPerFrame=physicsMix(PHYS_INITIAL_DRAG,tuning.fullDrag*b.dragJitter,progressiveDrag);
      const decay=Math.pow(1-dragPerFrame,dt*60);
      b.vx*=decay; b.vy*=decay;
      if(BOOST_FACTOR>1 && b.age<BOOST_DURATION){
        const burstDecay=Math.pow(1/BOOST_FACTOR,dt/BOOST_DURATION);
        b.vx*=burstDecay; b.vy*=burstDecay;
      }

      if(b.x<minX){ b.x=minX; b.vx=-b.vx*PHYS_RESTITUTION; }
      if(b.x>maxX){ b.x=maxX; b.vx=-b.vx*PHYS_RESTITUTION; }
      if(b.y<minY){ b.y=minY; b.vy=-b.vy*PHYS_RESTITUTION; }
      if(b.y>maxY){ b.y=maxY; b.vy=-b.vy*PHYS_RESTITUTION; }

      const speedNow=Math.hypot(b.vx,b.vy);
      if(b.snapping){
        /* committed to a clean landing -- interpolate straight to the exact flat
           orientation over the slider's duration instead of continuing to spring/wiggle */
        b.snapElapsed+=dt;
        const dur=Math.max(0.01,tuning.snapSeconds*b.snapJitter);
        const u=Math.min(1,b.snapElapsed/dur);
        const eu=1-Math.pow(1-u,3);
        b.q=qSlerp(b.snapFrom,b.snapTo,eu);
        b.vx=0; b.vy=0;
        b.settled=u>=1;
        /* collision only fully disappears once the WHOLE snap has actually finished playing
           out -- while it's still mid-rotation it keeps its normal near-rest footprint, so it
           can't look like it's already "done" and passable while still visibly turning. Passive
           overlaps no longer reset the snap timer (see the collision code above), so waiting for
           a real finish here doesn't risk the old stuck-forever loop. */
        b.bubbleScale=physicsBubbleScale(0,b.launchSpeed);   /* stays at its normal near-rest size -- the group-level check below is what actually removes collision, only once EVERY die is settled */
      }else if(speedNow<PHYS_SNAP_TRIGGER_SPEED){
        b.snapping=true;
        b.snapFrom=b.q;
        b.snapTo=qNorm(qMul(physicsAlignQuat(b.q),b.q));
        b.snapElapsed=0;
        b.vx=0; b.vy=0;
        b.settled=false;
        b.bubbleScale=physicsBubbleScale(0,b.launchSpeed);
      }else{
        const {wn,angle}=physicsTiltOf(b.q);
        const magnetStartSpeed=tuning.magnetStartSpeed*b.magnetStartJitter;
        const magnetRampSeconds=tuning.magnetRampSeconds*b.magnetRampJitter;
        if(speedNow<=magnetStartSpeed) b.magnetAge+=dt;
        else b.magnetAge=Math.max(0,b.magnetAge-dt*2);
        const magnetT=physicsClamp(b.magnetAge/magnetRampSeconds,0,1);
        const magnetStrength=magnetT*magnetT*(3-2*magnetT);
        if(magnetStrength>0&&angle>1e-4){
          b.vx+=-wn[0]*tuning.magnetForce*b.magnetForceJitter*angle*magnetStrength*dt;
          b.vy+=-wn[1]*tuning.magnetForce*b.magnetForceJitter*angle*magnetStrength*dt;
          const extraDecay=1-Math.min(0.99,magnetStrength*tuning.magnetDragPerSecond*dt);
          b.vx*=extraDecay; b.vy*=extraDecay;
        }
        b.settled=false;
      }
    }

    /* collision only disappears for the whole group once EVERY die (that isn't already
       held/frozen) has fully finished its snap -- not the instant each one individually
       does. Anything still rolling keeps full protection the whole time, which is what
       stops a fast-moving die from sliding deep into an early-settled one's space; the
       only moment it's actually safe to drop it everywhere is once nobody's moving at all. */
    const allSettledThisFrame=B.every(d=>d.frozen||d.settled);

    for(let i=0;i<B.length;i++){
      for(let j=i+1;j<B.length;j++){
        const a=B[i],b=B[j];
        if(a.frozen||b.frozen) continue;
        if(allSettledThisFrame) continue;   /* nothing left to protect against -- skip collision entirely */
        let dx=b.x-a.x,dy=b.y-a.y,dist=Math.hypot(dx,dy);
        if(dist<0.0001){ dx=Math.random()-0.5; dy=Math.random()-0.5; dist=Math.hypot(dx,dy)||0.0001; }
        const minDist=SZ*(a.bubbleScale+b.bubbleScale)/2;
        if(dist>=minDist) continue;

        const nx=dx/dist,ny=dy/dist;
        const massA=a.settled?PHYS_SETTLED_MASS:1;
        const massB=b.settled?PHYS_SETTLED_MASS:1;
        const invA=1/massA,invB=1/massB,invSum=invA+invB;
        const overlap=minDist-dist;
        a.x-=nx*overlap*(invA/invSum); a.y-=ny*overlap*(invA/invSum);
        b.x+=nx*overlap*(invB/invSum); b.y+=ny*overlap*(invB/invSum);

        const rA=SZ*a.bubbleScale/2,rB=SZ*b.bubbleScale/2;
        a.x=physicsClamp(a.x,rA-SZ/2,W-rA-SZ/2);
        a.y=physicsClamp(a.y,activeTop+rA-SZ/2,H-rA-SZ/2);
        b.x=physicsClamp(b.x,rB-SZ/2,W-rB-SZ/2);
        b.y=physicsClamp(b.y,activeTop+rB-SZ/2,H-rB-SZ/2);

        const rvx=b.vx-a.vx,rvy=b.vy-a.vy;
        const velAlongNormal=rvx*nx+rvy*ny;
        if(velAlongNormal<0){
          const impulse=-(1+PHYS_RESTITUTION)*velAlongNormal/invSum;
          a.vx-=impulse*invA*nx; a.vy-=impulse*invA*ny;
          b.vx+=impulse*invB*nx; b.vy+=impulse*invB*ny;
          /* only a genuine impact (real closing velocity) should knock either one out of
             a snap in progress -- a passive overlap between two things already sitting
             still isn't a "hit", and interrupting on that alone is what let two settling
             dice reset each other forever without ever finishing */
          a.settled=false; b.settled=false; a.snapping=false; b.snapping=false;
        }
      }
    }

    for(let i=0;i<B.length;i++){
      const b=B[i];
      if(b.frozen) continue;
      const speed=Math.hypot(b.vx,b.vy);
      if(speed>0.02){
        const omega=speed/PHYS_ROLL_RADIUS;
        const dq=qFromAxisAngle(-b.vy,b.vx,0,omega*dt);
        b.q=qNorm(qMul(dq,b.q));
      }
      if(!record){
        place(b);
        if(gameResolved&&S&&S.els[i]===b.el) S.pos[i]={x:b.x,y:b.y};
      }
    }
    if(record) recordFrame();
  }

  const isReady=()=>B.every(b=>b.frozen||(
    Math.hypot(b.vx,b.vy)<PHYS_SETTLED_SPEED_EPS&&physicsTiltOf(b.q).angle<PHYS_READY_TILT_EPS
  ));
  const forceRemainingFaces=()=>{
    for(const b of B){
      if(Math.hypot(b.vx,b.vy)>=PHYS_SETTLED_SPEED_EPS||physicsTiltOf(b.q).angle>=PHYS_READY_TILT_EPS){
        b.face=faceUp(qToMat(b.q));
        b.forceFace=true;
        b.vx=0; b.vy=0;
        b.frozen=true;
      }
    }
    if(record) recordFrame();   /* the forced settle is itself a real change worth taping */
  };

  if(record){
    /* Headless recording: the same physics, run as fast as the CPU allows instead of once
       per real screen frame -- nothing here is ever drawn. */
    let elapsed=0;
    const maxSteps=Math.ceil(PHYS_MAX_SECONDS/PHYS_FIXED_DT)+60;
    for(let steps=0;steps<maxSteps;steps++){
      elapsed+=PHYS_FIXED_DT;
      advance(PHYS_FIXED_DT,false);
      const ready=isReady();
      const readyTimedOut=elapsed>=tuning.readyMaxSeconds;
      if(ready||readyTimedOut){
        if(readyTimedOut&&!ready) forceRemainingFaces();
        return Promise.resolve(finish());
      }
    }
    forceRemainingFaces();
    return Promise.resolve(finish());
  }

  return new Promise(resolve=>{
    let elapsed=0,gameResolved=false;
    function step(){
      elapsed+=PHYS_FIXED_DT;
      advance(PHYS_FIXED_DT,gameResolved);

      const ready=isReady();
      const readyTimedOut=elapsed>=tuning.readyMaxSeconds;
      if(!gameResolved&&(ready||readyTimedOut)){
        if(readyTimedOut&&!ready) forceRemainingFaces();
        gameResolved=true;
        resolve(finish());
      }

      /* The playground never has to block a game turn while its last tiny magnetic
         correction finishes. Once the face is safely determined, let that same
         low-speed physics continue in the background. Tapping/holding a die freezes
         it immediately so the game layout always wins. */
      const fullySettled=B.every(b=>b.frozen||b.settled);
      if(rollSerial===physicsRollSerial&&!fullySettled&&elapsed<PHYS_MAX_SECONDS){
        requestAnimationFrame(step);
      }else if(!gameResolved){
        forceRemainingFaces();
        gameResolved=true;
        resolve(finish());
      }
    }
    requestAnimationFrame(step);
  });
}
/* Cheat Mode's actual entry point. A roll is recorded once, headless and instant (throwDice
   with record=true); the natural finishing faces from that recording tell us the fixed
   relabeling (see faceCorrectionQuat) each die needs. Then the recording is played back for
   real, at normal speed, on real dice -- position exactly as recorded, spin composed with
   that fixed relabeling at every frame, not just the last one. Nothing is re-simulated, so
   there's no second live physics run that could drift from the first: the only thing that
   differs from an ordinary roll is a fixed rotation baked into the playback the whole way
   through, not a correction applied after the fact. */
async function throwDiceWithTargets(n,clickable,tags,isRollOff,targetFaces){
  if(reduced){
    /* No tumble to correct mid-flight when motion is reduced -- dice just appear already
       resting, so the existing finish()-time correction (see throwDice) is the whole story. */
    return throwDice(n,clickable,tags,isRollOff,targetFaces);
  }
  const {faces:naturalFaces,frames}=await throwDice(n,clickable,tags,isRollOff,null,true);
  const corrections=naturalFaces.map((nat,i)=>
    targetFaces[i] ? faceCorrectionQuat(nat,targetFaces[i]) : qIdentity());
  const finalFaces=naturalFaces.map((nat,i)=>targetFaces[i]||nat);
  return playRecordedRoll(frames,corrections,finalFaces,clickable,n,tags);
}
function playRecordedRoll(frames,corrections,finalFaces,clickable,n,tags){
  const arena=$('arena');
  arena.querySelectorAll('.die:not(.held)').forEach(e=>e.remove());
  const els=Array.from({length:n},(_,i)=>{
    const el=dieEl(1,'inpit'+(tags?' '+tags[i]:''));
    arena.appendChild(el);
    return el;
  });
  const drawFrame=frame=>{
    for(let i=0;i<n;i++){
      const el=els[i], f=frame[i];
      const g=f.growProgress!=null?f.growProgress:1, gEase=1-Math.pow(1-g,2);
      const scaleTerm=g<1?` scale(${Math.max(0.001,gEase).toFixed(3)})`:'';
      el.style.transform=`translate(${f.x.toFixed(1)}px,${f.y.toFixed(1)}px)${scaleTerm}`;
      if(f.forceFace){
        /* Rare (a die that hit the settle timeout mid-recording): forceFace frames render
           by number, not by spin, so there's no rotation to relabel here -- show this die's
           already-decided final face directly instead. */
        setFace(el,finalFaces[i],0);
      }else{
        el._cube.style.transform=matToCss(qToMat(qMul(f.q,corrections[i])));
      }
    }
  };
  return new Promise(resolve=>{
    let idx=0;
    function tick(){
      drawFrame(frames[idx]);
      idx++;
      if(idx<frames.length){ requestAnimationFrame(tick); return; }
      /* Playback finished -- do exactly what the real roll's own finish() does: highlight
         the scoring dice and wire up clicking them, same as any other roll. */
      const vf=rollLookup(finalFaces).vf;
      const lastFrame=frames[frames.length-1];
      const B=els.map((el,i)=>({el,face:finalFaces[i],x:lastFrame[i].x,y:lastFrame[i].y}));
      for(const b of B){
        b.el.style.filter='';
        b.el._ok=!!vf[b.face-1];
        if(b.el._ok) b.el.classList.add('ok');
        b.el._sh.style.transform='translateY(8px)';
      }
      wire(B,clickable,vf);
      resolve(finalFaces);
    }
    requestAnimationFrame(tick);
  });
}
function wire(B,clickable,vf){
  S.els=B.map(b=>b.el);
  B.forEach((b,i)=>{
    if(b.el.classList.contains('sel') || b.el.classList.contains('held')) return; /* already claimed -- don't touch */
    S.pos[i]={x:b.x,y:b.y};
    if(clickable && vf[b.face-1]) b.el.onclick=()=>toggle(i);
  });
}
function placeAll(){
  S.els.forEach((el,i)=>{
    if(S.sel.has(i) || el.classList.contains('held')) return;   /* positioned by layoutShelf instead */
    const p=S.pos[i];
    el.style.transform='translate('+p.x.toFixed(1)+'px,'+p.y.toFixed(1)+'px)';
  });
}

/* ================= game ================= */
let S=null, hints=false, stats=true, MODE='ai', groupMode='auto', showBrackets=true, shadeInvalid=true;
let inGameSession=false;   /* true from the moment a mode is picked (including the roll-off) until
                               the player is back at Choose Mode -- this, not S.turn, is what should
                               gate the in-game menu and block other game-starting actions, since the
                               roll-off happens before S.turn is ever set. */
/* Bumped every time a game is torn down mid-play (End Game). The async turn loops below
   (solverTurn, farkle, endTurn, proceedTo, rollOff, humanRoll, commit, and their helpers)
   capture the epoch when they start and re-check it after every await; if it's moved on,
   they stop touching S/the DOM instead of running their remaining steps against whatever
   game has since been reset into the same S variable. */
let gameEpoch=0;
const stale = e => e!==gameEpoch;
let cheatMode=false;   /* testing-only: lets you pick your own roll's outcome, see faceCorrectionQuat */
let awaitingRollOffRedraw=null;   /* set only while a roll-off side's control (Roll button or cheat
                                      picker) is up and waiting for a tap; calling it redraws that same
                                      control in the other style, without restarting the wait itself. */
/* Cheat Mode's face picker: reuses the real die element (dieEl) and the shelf slot dice
   already use when set aside, so it looks identical to the game's own dice -- just tap
   one to cycle its face, then Roll plays a completely normal, real roll that happens to
   be told what to land on. */
function showCheatPicker(n){
  setBanner('Cheat Mode','Tap each die to set its result, then Roll');
  $('advice').innerHTML='';
  const picks=Array(n).fill(1);
  $('shelf').innerHTML='';
  /* Every die in this game is position:absolute with no layout of its own -- normally
     moveToShelf()/layoutShelf() work out each one's left/top. This picker isn't part of
     that system (these aren't real committed dice), so it lays itself out here instead;
     skipping this was the bug that piled all six on top of each other at the same spot. */
  const SZ=dieSize(), gap=10;
  const shelfW=$('shelf').clientWidth||$('arena').clientWidth||360;
  const totalW=n*SZ+(n-1)*gap;
  const startX=Math.max(6,(shelfW-totalW)/2);
  const topY=Math.max(6,($('shelf').clientHeight-SZ)/2);
  for(let i=0;i<n;i++){
    const el=dieEl(picks[i],'held');
    el.style.left=(startX+i*(SZ+gap))+'px';
    el.style.top=topY+'px';
    el.onclick=()=>{ picks[i]=picks[i]%6+1; setFace(el,picks[i]); };
    $('shelf').appendChild(el);
  }
  mkBtn('Roll','',()=>{ $('shelf').innerHTML=''; humanRoll(n,picks.slice()); });
}
/* Same idea as showCheatPicker, but for one side of the roll-off: a single die, labeled with
   whose it is. Cheating only ever sets your own die -- the other side rolls (or is cheated)
   through its own separate turn at this same picker, never both at once. */
function showCheatPickerRollOffSide(side,onConfirm){
  const label = side==='you' ? seatLabel('you') : seatLabel('sol');
  setBanner('Cheat Mode','Tap '+label+'\u2019s die to set it, then Roll');
  $('advice').innerHTML='';
  let pick=1;
  $('shelf').innerHTML='';
  const SZ=dieSize();
  const shelfW=$('shelf').clientWidth||$('arena').clientWidth||360;
  const topY=Math.max(6,($('shelf').clientHeight-SZ)/2);
  const el=dieEl(pick,'held');
  el.style.left=((shelfW-SZ)/2)+'px';
  el.style.top=topY+'px';
  el.title=label;
  el.onclick=()=>{ pick=pick%6+1; setFace(el,pick); };
  $('shelf').appendChild(el);
  mkBtn('Roll','',()=>{ $('shelf').innerHTML=''; onConfirm(pick); });
}
/* Flipping the Cheat Mode switch only matters right at the "about to roll the first six"
   moment -- that's the only point with a button to swap. If you're not there (mid-roll,
   the AI's turn, roll-off, or you've already rolled this turn), do nothing: the setting
   still takes effect normally the next time that moment comes around. */
function maybeShowRollControl(){
  if(!S || S.turn!=='you' || S.busy || S.dice.length) return;
  $('ctl').innerHTML='';
  if(cheatMode){
    showCheatPicker(S.n||6);
  }else{
    $('shelf').innerHTML='';
    setBanner(S.need>0?'Last Round':turnHeading(S.turn),
      S.need>0 ? needPhrase(S.turn)+' <b>'+fmt(S.need*50)+'</b> in one turn'
               : (seatScore(S.turn)===0 ? 'First bank must be <b>'+fmt(RULES.onBoard)+'</b> or more' : ''));
    mkBtn('Roll Six Dice','',()=>humanRoll(S.n||6));
  }
}
let PENDING_RULES=cloneRules(RULES);

/* ---- named opponents: same underlying optimal-play math for everyone, but each persona
   nudges the roll-again/bank decision away from the true optimum with some probability.
   aggression>0 pushes them to keep rolling when they should stop (risk-taker);
   aggression<0 pushes them to bank when they should keep going (overly cautious).
   Ranked roughly best-to-worst by how far they stray from perfect play. ---- */
const PERSONAS = [
  {name:'Alexander', aggression: 0, color:'#24313D', largeAvatar:"assets/images/img002.webp", avatar:'assets/images/img003.webp', expr:{Default:'assets/images/img003.webp',Thinking:'assets/images/img004.webp',Confident:'assets/images/img005.webp',Excited:'assets/images/img006.webp',Surprised:'assets/images/img007.webp',Worried:'assets/images/img008.webp',Disappointed:'assets/images/img009.webp'},     tag:'Ice-cold and exact \u2014 plays it razor-optimal.',
   bio:'Alexander never blinks. Every roll, every keep, every bank is exactly what the math says it should be \u2014 no nerves, no greed, no hunches. He treats the dice like a spreadsheet with better lighting. Beat him and you\u2019ll have beaten the game itself, not just a player.'},
  {name:'Liam',      aggression: 0.06, color:'#4A2E12', largeAvatar:"assets/images/img010.webp", avatar:'assets/images/img011.webp', expr:{Default:'assets/images/img011.webp',Thinking:'assets/images/img012.webp',Confident:'assets/images/img013.webp',Excited:'assets/images/img014.webp',Surprised:'assets/images/img015.webp',Worried:'assets/images/img016.webp',Disappointed:'assets/images/img017.webp'},  tag:'Mostly textbook, with a slight itch to push his luck.',
   bio:'Liam plays a clean, disciplined game \u2014 right up until the dice are hot, and then you can see the itch. He\u2019ll take a smart risk most of the time, but every so often that one extra roll he didn\u2019t need to take gives him away. Confident, likeable, and just a little too sure of himself.'},
  {name:'Henry',     aggression:-0.06, color:'#1B3A2C', largeAvatar:"assets/images/img018.webp", avatar:'assets/images/img019.webp', expr:{Default:'assets/images/img019.webp',Thinking:'assets/images/img020.webp',Confident:'assets/images/img021.webp',Excited:'assets/images/img022.webp',Surprised:'assets/images/img023.webp',Worried:'assets/images/img024.webp',Disappointed:'assets/images/img025.webp'},  tag:'Mostly textbook, but banks a touch early for safety.',
   bio:'Henry is the guy you\u2019d want managing your retirement fund. He plays it about as close to perfect as it gets, but when the total starts climbing he\u2019ll lock it in a beat sooner than he strictly needs to. Reliable, unshowy, quietly hard to beat.'},
  {name:'Olivia',    aggression: 0.12, color:'#4A1638', largeAvatar:"assets/images/img026.webp", avatar:'assets/images/img027.webp', expr:{Default:'assets/images/img027.webp',Thinking:'assets/images/img028.webp',Confident:'assets/images/img029.webp',Excited:'assets/images/img030.webp',Surprised:'assets/images/img031.webp',Worried:'assets/images/img032.webp',Disappointed:'assets/images/img033.webp'},  tag:'Likes the thrill of one more roll.',
   bio:'Olivia loves the moment right before the dice land \u2014 that\u2019s the whole appeal for her. She\u2019ll usually make the sound call, but "usually" is doing some work in that sentence, because she\u2019s never met a hot streak she didn\u2019t want to ride one roll further than she should.'},
  {name:'Charlotte', aggression:-0.12, color:'#0F3538', largeAvatar:"assets/images/img034.webp", avatar:'assets/images/img035.webp', expr:{Default:'assets/images/img035.webp',Thinking:'assets/images/img036.webp',Confident:'assets/images/img037.webp',Excited:'assets/images/img038.webp',Surprised:'assets/images/img039.webp',Worried:'assets/images/img040.webp',Disappointed:'assets/images/img041.webp'},  tag:'Prefers a sure thing over a big swing.',
   bio:'Charlotte would rather bank a modest, certain score than gamble on a big one. She\u2019s composed, methodical, and treats every roll like it might be the one that ends her turn \u2014 because deep down, she\u2019s convinced it usually is. Steady, a little tense, hard to rattle.'},
  {name:'Benjamin',  aggression: 0.20, color:'#4A1414', largeAvatar:"assets/images/img042.webp", avatar:'assets/images/img043.webp', expr:{Default:'assets/images/img043.webp',Thinking:'assets/images/img044.webp',Confident:'assets/images/img045.webp',Excited:'assets/images/img046.webp',Surprised:'assets/images/img047.webp',Worried:'assets/images/img048.webp',Disappointed:'assets/images/img049.webp'},  tag:'A gambler at heart \u2014 often pushes past the smart stop.',
   bio:'Benjamin is at the table for the thrill of it, not the spreadsheet. He\u2019ll keep rolling well past the point where the smart money says stop, chasing the score that makes the whole table gasp. Sometimes it pays off spectacularly. Often it doesn\u2019t. He wouldn\u2019t have it any other way.'},
  {name:'Grace',     aggression:-0.18, color:'#2E2440', largeAvatar:"assets/images/img050.webp", avatar:'assets/images/img051.webp', expr:{Default:'assets/images/img051.webp',Thinking:'assets/images/img052.webp',Confident:'assets/images/img053.webp',Excited:'assets/images/img054.webp',Surprised:'assets/images/img055.webp',Worried:'assets/images/img056.webp',Disappointed:'assets/images/img057.webp'},  tag:'Cautious to a fault \u2014 banks well before she has to.',
   bio:'Grace gets visibly relieved every time she banks. She\u2019d rather walk away with a small, safe pile of points than risk it disappearing on one bad roll, and it shows \u2014 she locks in well before the odds actually tell her to. Sweet, a little anxious, allergic to losing what she\u2019s already won.'},
  {name:'Amelia',    aggression: 0.30, color:'#4A2408', largeAvatar:"assets/images/img058.webp", avatar:'assets/images/img059.webp', expr:{Default:'assets/images/img059.webp',Thinking:'assets/images/img060.webp',Confident:'assets/images/img061.webp',Excited:'assets/images/img062.webp',Surprised:'assets/images/img063.webp',Worried:'assets/images/img064.webp',Disappointed:'assets/images/img065.webp'},  tag:'Chases hot dice long after the odds turn against her.',
   bio:'Amelia believes in streaks the way some people believe in horoscopes. Once the dice start going her way she just can\u2019t bring herself to stop \u2014 long after the odds have quietly turned against her, she\u2019s still rolling, certain the next one will be the one. Occasionally she\u2019s right.'},
  {name:'Emma',      aggression:-0.26, color:'#26333D', largeAvatar:"assets/images/img066.webp", avatar:'assets/images/img067.webp', expr:{Default:'assets/images/img067.webp',Thinking:'assets/images/img068.webp',Confident:'assets/images/img069.webp',Excited:'assets/images/img070.webp',Surprised:'assets/images/img071.webp',Worried:'assets/images/img072.webp',Disappointed:'assets/images/img073.webp'},  tag:'Nervous with the dice \u2014 quick to lock in whatever she has.',
   bio:'Emma does not trust the dice, and honestly, who can blame her. The instant she has anything worth keeping, she\u2019s banking it \u2014 no lingering, no pushing for more. It costs her points over a long game, but she\u2019ll never know the sting of a big farkle either.'},
  {name:'Noah',      aggression: 0.42, color:'#401515', largeAvatar:"assets/images/img074.webp", avatar:'assets/images/img075.webp', expr:{Default:'assets/images/img075.webp',Thinking:'assets/images/img076.webp',Confident:'assets/images/img077.webp',Excited:'assets/images/img078.webp',Surprised:'assets/images/img079.webp',Worried:'assets/images/img080.webp',Disappointed:'assets/images/img081.webp'},  tag:'Reckless \u2014 farkles out more than anyone at the table.',
   bio:'Noah has one gear: more. He chases hot dice, ignores the smart stop, and farkles out spectacularly more often than anyone else at the table \u2014 and somehow always seems surprised by it. When it works, it\u2019s the loudest win of the night. When it doesn\u2019t, well, at least it\u2019s entertaining.'}
];
const NEW_AVATARS = [
  {name:"Aisha", color:"#46270B", bg:"#46270B", avatar:"assets/images/img082.webp"},
  {name:"Andre", color:"#113825", bg:"#113825", avatar:"assets/images/img083.webp"},
  {name:"Camila", color:"#4F0D32", bg:"#4F0D32", avatar:"assets/images/img084.webp"},
  {name:"Daniel", color:"#1A2A3A", bg:"#1A2A3A", avatar:"assets/images/img085.webp"},
  {name:"Elena", color:"#541B00", bg:"#541B00", avatar:"assets/images/img086.webp"},
  {name:"Evelyn", color:"#430A2A", bg:"#430A2A", avatar:"assets/images/img087.webp"},
  {name:"Fatima", color:"#4C2804", bg:"#4C2804", avatar:"assets/images/img088.webp"},
  {name:"George", color:"#0D3925", bg:"#0D3925", avatar:"assets/images/img089.webp"},
  {name:"Ingrid", color:"#491B03", bg:"#491B03", avatar:"assets/images/img090.webp"},
  {name:"Jamal", color:"#2B1C43", bg:"#2B1C43", avatar:"assets/images/img091.webp"},
  {name:"Kenji", color:"#012E34", bg:"#012E34", avatar:"assets/images/img092.webp"},
  {name:"Lucia", color:"#4C0B33", bg:"#4C0B33", avatar:"assets/images/img093.webp"},
  {name:"Mara", color:"#3C0C0A", bg:"#3C0C0A", avatar:"assets/images/img094.webp"},
  {name:"Marcus", color:"#113726", bg:"#113726", avatar:"assets/images/img095.webp"},
  {name:"Mateo", color:"#46270E", bg:"#46270E", avatar:"assets/images/img096.webp"},
  {name:"Nadia", color:"#540C0D", bg:"#540C0D", avatar:"assets/images/img097.webp"},
  {name:"Naomi", color:"#4F070B", bg:"#4F070B", avatar:"assets/images/img098.webp"},
  {name:"Omar", color:"#202E3D", bg:"#202E3D", avatar:"assets/images/img099.webp"},
  {name:"Priya", color:"#093135", bg:"#093135", avatar:"assets/images/img100.webp"},
  {name:"Raj", color:"#093035", bg:"#093035", avatar:"assets/images/img101.webp"},
  {name:"Samuel", color:"#2D2244", bg:"#2D2244", avatar:"assets/images/img102.webp"},
  {name:"Sophia", color:"#1B2838", bg:"#1B2838", avatar:"assets/images/img103.webp"},
  {name:"Talia", color:"#380A0C", bg:"#380A0C", avatar:"assets/images/img104.webp"},
  {name:"Thomas", color:"#192736", bg:"#192736", avatar:"assets/images/img105.webp"},
  {name:"Victor", color:"#1F2B37", bg:"#1F2B37", avatar:"assets/images/img106.webp"},
  {name:"Anaya", color:"#2D1F42", bg:"#2D1F42", avatar:"assets/images/img107.webp"},
  {name:"Caleb", color:"#450A2B", bg:"#450A2B", avatar:"assets/images/img108.webp"},
  {name:"Eli", color:"#3A0C0E", bg:"#3A0C0E", avatar:"assets/images/img109.webp"},
  {name:"Elsie", color:"#212E3C", bg:"#212E3C", avatar:"assets/images/img110.webp"},
  {name:"Finn", color:"#430B0E", bg:"#430B0E", avatar:"assets/images/img111.webp"},
  {name:"Hana", color:"#103523", bg:"#103523", avatar:"assets/images/img112.webp"},
  {name:"Leo", color:"#43250B", bg:"#43250B", avatar:"assets/images/img113.webp"},
  {name:"Maya", color:"#192939", bg:"#192939", avatar:"assets/images/img114.webp"},
  {name:"Zuri", color:"#062F35", bg:"#062F35", avatar:"assets/images/img115.webp"}
,
  {name:"Amina", color:"#4F596D", bg:"#4F596D", avatar:"assets/images/img116.webp"},
  {name:"Arjun", color:"#6D310A", bg:"#6D310A", avatar:"assets/images/img117.webp"},
  {name:"Kai", color:"#6D270A", bg:"#6D270A", avatar:"assets/images/img118.webp"},
  {name:"Keira", color:"#313B45", bg:"#313B45", avatar:"assets/images/img119.webp"},
  {name:"Layla", color:"#593B59", bg:"#593B59", avatar:"assets/images/img120.webp"},
  {name:"Malik", color:"#773B0A", bg:"#773B0A", avatar:"assets/images/img121.webp"},
  {name:"Mei", color:"#0A4545", bg:"#0A4545", avatar:"assets/images/img122.webp"},
  {name:"Nico", color:"#6D1D0A", bg:"#6D1D0A", avatar:"assets/images/img123.webp"},
  {name:"Owen", color:"#945931", bg:"#945931", avatar:"assets/images/img124.webp"},
  {name:"Theo", color:"#310A13", bg:"#310A13", avatar:"assets/images/img125.webp"},
  {name:"Valeria", color:"#131D13", bg:"#131D13", avatar:"assets/images/img126.webp"}
];
function randomPersona(exclude){
  let p;
  do{ p=PERSONAS[Math.floor(Math.random()*PERSONAS.length)]; }while(exclude && p.name===exclude.name);
  return p;
}
let personaYou=null, personaSol=null;
let myProfile=null;   /* the human's own chosen look (borrowed persona art, or an uploaded photo) --
                          persists across games; null means "no picture", just the placeholder */
let myName='You';     /* the human's own chosen display name, set from the avatar wheel screen */
const personaFor = who => {
  if(who==='you') return personaYou || myProfile;
  if(MODE==='pass') return p2Profile;   /* Pass & Play: the right seat is a second human, with their own picked avatar -- not the AI persona system */
  return personaSol;
};
let p2Profile=null, p2Name=null, p2AvatarColor=null;   /* Player 2's own avatar/name/color, set from the New Game screen -- mirrors myProfile/myName/avatarColor for the left seat */
let avatarWheelTarget='you';   /* which profile the avatar wheel screen is currently editing: 'you' or 'p2' */
/* generic silhouette placeholders for whichever seat doesn't have a chosen portrait
   (a human player, Pass & Play's Player 1/2, etc) -- tinted to match that seat's color */
const AVATAR_PLACEHOLDER_YOU='data:image/svg+xml;utf8,'+encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
  +'<rect width="100" height="100" fill="#3A2A10"/>'
  +'<circle cx="50" cy="38" r="18" fill="#F7CE55"/>'
  +'<path d="M50 60c-22 0-34 14-34 30v10h68V90c0-16-12-30-34-30z" fill="#F7CE55"/>'
  +'</svg>');
const AVATAR_PLACEHOLDER_SOL='data:image/svg+xml;utf8,'+encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
  +'<rect width="100" height="100" fill="#0F2E38"/>'
  +'<circle cx="50" cy="38" r="18" fill="#7FD8FF"/>'
  +'<path d="M50 60c-22 0-34 14-34 30v10h68V90c0-16-12-30-34-30z" fill="#7FD8FF"/>'
  +'</svg>');
function avatarSrcFor(who){
  const p=personaFor(who);
  if(p && p.expr && p.expr.Default) return p.expr.Default;
  if(p && p.avatar) return p.avatar;
  return who==='you' ? AVATAR_PLACEHOLDER_YOU : AVATAR_PLACEHOLDER_SOL;
}
function avatarBgFor(who){
  const p=personaFor(who);
  if(p) return p.bg || p.color || (who==='you' ? youColor : '#7FD8FF');
  return '';
}
function applyAvatarBackground(who){
  const el=$(who==='you' ? 'youAvatar' : 'solAvatar');
  el.style.backgroundColor=avatarBgFor(who) || '';
}
/* ---- idle breathing: speed reflects mood rather than ticking at a fixed rate. The RATE
   itself is smoothed every frame toward whatever the current mood calls for -- it's never
   assigned outright -- so it can ease from calm to excited (or back) but can never visibly
   snap from one speed to another. A held breath is the same mechanism aimed at a near-zero
   target: it still eases there and back, it just aims very low for a moment. */
const BREATH_RATE={you:1,sol:1}, BREATH_TARGET={you:1,sol:1}, BREATH_PHASE={you:0,sol:Math.PI};
const BREATH_HOLD_RESUME={you:1,sol:1};
const BREATH_BASE_HZ=1/5.4;   /* one full cycle every 5.4s at the calm baseline rate of 1 */
const BREATH_MOOD={ Default:1, Thinking:1.15, Confident:1.05, Worried:1.4,
  Surprised:1.85, Excited:1.85, Disappointed:0.75 };
function setBreathMood(who,mood){
  if(reduced) return;
  const rate=BREATH_MOOD[mood] ?? 1;
  BREATH_TARGET[who]=rate; BREATH_HOLD_RESUME[who]=rate;
}
function holdBreath(who,ms){
  if(reduced) return;
  BREATH_TARGET[who]=0.08;
  setTimeout(()=>{ if(BREATH_TARGET[who]===0.08) BREATH_TARGET[who]=BREATH_HOLD_RESUME[who]; }, ms||500);
}
function paintBreath(who,el){
  if(!el) return;
  const p=BREATH_PHASE[who], s=(Math.sin(p)+1)/2;
  const scaleY=1.04-0.035*s, scaleX=1.04+0.028*s, rot=Math.sin(p+0.4)*0.7;
  el.style.transform='scaleY('+scaleY.toFixed(4)+') scaleX('+scaleX.toFixed(4)+') rotate('+rot.toFixed(3)+'deg)';
}
let breathLastT=null;
function breathStep(t){
  if(breathLastT===null) breathLastT=t;
  const dt=Math.min((t-breathLastT)/1000,0.05); breathLastT=t;
  ['you','sol'].forEach(who=>{
    /* a ~0.9s time-constant: fast enough to feel responsive within a second, slow enough
       that it always reads as a change of pace rather than a cut */
    BREATH_RATE[who]+=(BREATH_TARGET[who]-BREATH_RATE[who])*Math.min(1,dt/0.9);
    BREATH_PHASE[who]+=BREATH_RATE[who]*BREATH_BASE_HZ*Math.PI*2*dt;
    paintBreath(who, $(who==='you'?'youAvatar':'solAvatar'));
  });
  const chaseImg=$('chaseAvatarImg');
  if(chaseImg && document.getElementById('board').classList.contains('chase') && S && S.turn) paintBreath(S.turn, chaseImg);
  requestAnimationFrame(breathStep);
}
if(!reduced) requestAnimationFrame(breathStep);

/* ---- reactions: whichever seat has a persona (with expression art) briefly shows how
   they're feeling at key moments -- thinking it over, fired up after a big roll, worried
   when they're the one who has to catch up, crushed after a farkle -- then eases back to
   their normal resting face on its own. Seats without expression art (a human "You" with
   no persona, Pass & Play's Player 1/2) are simply untouched for the face itself, but their
   breathing still follows the same mood -- that part doesn't need expression art to work. */
const exprTimers={you:null,sol:null}, BREATH_BASELINE={you:'Default',sol:'Default'};
function setExpression(who,emotion,holdMs,sustained){
  setBreathMood(who,emotion);
  if(sustained) BREATH_BASELINE[who]=emotion;
  const p=personaFor(who);
  if(!p || !p.expr || !p.expr[emotion]) return;
  const imgEl=$(who==='you' ? 'youAvatar' : 'solAvatar');
  imgEl.src=p.expr[emotion];
  applyAvatarBackground(who);
  clearTimeout(exprTimers[who]);
  exprTimers[who]=setTimeout(()=>{ imgEl.src=avatarSrcFor(who); applyAvatarBackground(who); setBreathMood(who,BREATH_BASELINE[who]); }, holdMs||1800);
}
/* the actual corner avatar+nameplate block grows in place to the center of the board --
   no separate copy, no darkened backdrop, just that same element getting bigger and
   rising above everything else while it's their turn */
function spotlightOn(who){
  /* grows whatever avatar is currently showing -- a chosen persona, a custom profile
     picture, or just the default placeholder -- so every seat gets the same treatment,
     not only the ones with a picked-out picture */
  const block=$(who==='you' ? 'youAvatarBlock' : 'solAvatarBlock');
  const board=$('board');
  const zone=$('portraitZone')||board;
  block.classList.remove('spotlighted');
  block.style.setProperty('--spotDX','0px');
  block.style.setProperty('--spotDY','0px');
  block.style.setProperty('--spotScale','1');
  const blockRect=block.getBoundingClientRect();
  const zoneRect=zone.getBoundingClientRect();
  const dx=(zoneRect.left+zoneRect.width/2)-(blockRect.left+blockRect.width/2);
  const dy=(zoneRect.top+zoneRect.height/2)-(blockRect.top+blockRect.height/2);
  /* Size against the portrait-only zone so the name pill never covers the odds bar. */
  const scale=Math.min(zoneRect.width/blockRect.width, zoneRect.height/blockRect.height)*0.92;
  block.style.setProperty('--spotDX',dx+'px');
  block.style.setProperty('--spotDY',dy+'px');
  block.style.setProperty('--spotScale',scale);
  block.classList.add('spotlighted');
}
function spotlightOff(who){
  const block=$(who==='you' ? 'youAvatarBlock' : 'solAvatarBlock');
  block.classList.remove('spotlighted');
}

/* ---- seat colors: each opponent's ring/nameplate is a vivid version of their own
   persona color (not a flat generic cyan), "You" gets a color you pick yourself, and if
   the two would ever land on the same color, "You" gets an automatic alternate -- a
   hue-shifted version of your own pick, not some unrelated fallback swatch. ---- */
function hexToHsl(hex){
  hex=hex.replace('#','');
  const r=parseInt(hex.slice(0,2),16)/255, g=parseInt(hex.slice(2,4),16)/255, b=parseInt(hex.slice(4,6),16)/255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b);
  let h,s,l=(max+min)/2;
  if(max===min){ h=s=0; }
  else{
    const d=max-min;
    s=l>0.5 ? d/(2-max-min) : d/(max+min);
    switch(max){
      case r: h=(g-b)/d+(g<b?6:0); break;
      case g: h=(b-r)/d+2; break;
      case b: h=(r-g)/d+4; break;
    }
    h/=6;
  }
  return [h*360,s,l];
}
function hslToHex(h,s,l){
  h/=360;
  const hue2rgb=(p,q,t)=>{
    if(t<0)t+=1; if(t>1)t-=1;
    if(t<1/6) return p+(q-p)*6*t;
    if(t<1/2) return q;
    if(t<2/3) return p+(q-p)*(2/3-t)*6;
    return p;
  };
  let r,g,b;
  if(s===0){ r=g=b=l; }
  else{
    const q=l<0.5 ? l*(1+s) : l+s-l*s, p=2*l-q;
    r=hue2rgb(p,q,h+1/3); g=hue2rgb(p,q,h); b=hue2rgb(p,q,h-1/3);
  }
  const toHex=x=>('0'+Math.round(x*255).toString(16)).slice(-2);
  return '#'+toHex(r)+toHex(g)+toHex(b);
}
function vibrantColor(hex,sat,light){ const [h]=hexToHsl(hex); return hslToHex(h,sat||0.72,light||0.58); }
function hueOfColor(hex){ return hexToHsl(hex)[0]; }
function rotateHueColor(hex,degrees){ const h=(hueOfColor(hex)+degrees+360)%360; return hslToHex(h,0.72,0.58); }
function hueDistance(h1,h2){ const d=Math.abs(h1-h2)%360; return Math.min(d,360-d); }
function textColorForBg(hex){ const [,,l]=hexToHsl(hex); return l>0.52 ? '#20140A' : '#FFF6E0'; }
function rgbForHex(hex){
  const clean=hex.replace('#','');
  return [parseInt(clean.slice(0,2),16),parseInt(clean.slice(2,4),16),parseInt(clean.slice(4,6),16)].join(',');
}

/* A controlled, approximately equal-brightness spectrum for interface accents.
   Portraits keep their exact chosen background; only rings, odds, buttons and
   turn perimeter colors are mapped to the nearest approved hue. */
const ACCENT_WHITELIST=Object.freeze([
  '#DD404F', // coral
  '#DD7F40', // tangerine
  '#DDAB40', // amber
  '#DDD240', // citrine
  '#9DDD40', // lime
  '#40DD87', // mint
  '#40DDCF', // aqua
  '#40B1DD', // sky
  '#4085DD', // blue
  '#5140DD', // periwinkle
  '#A140DD', // violet
  '#DD409F'  // rose
]);
function approvedAccentFor(hex){
  const hue=hueOfColor(hex);
  return ACCENT_WHITELIST.reduce((best,color)=>{
    const distance=hueDistance(hue,hueOfColor(color));
    return distance<best.distance ? {color,distance} : best;
  },{color:ACCENT_WHITELIST[0],distance:Infinity}).color;
}
function mixHex(from,to,amount){
  const channels=value=>value.replace('#','').match(/.{2}/g).map(part=>parseInt(part,16));
  const a=channels(from), b=channels(to);
  return '#'+a.map((value,index)=>Math.round(value+(b[index]-value)*amount).toString(16).padStart(2,'0')).join('');
}
function paletteForColor(hex){
  const mid=approvedAccentFor(hex);
  return {
    light:mixHex(mid,'#FFF8E8',.18),
    mid,
    dark:mixHex(mid,'#163524',.14),
    deep:mixHex(mid,'#0D2418',.30),
    rgb:rgbForHex(mid)
  };
}

const YOU_SWATCHES=['#F7CE55','#E14747','#E19447','#E1D047','#8CE147','#47E19B','#47D6E1','#4797E1','#7E47E1','#E147AC'];
let youColor=YOU_SWATCHES[0];   /* the human player's chosen avatar color -- gold by default, same as always */

/* A player's chosen color is personal -- it only ever shows on their own avatar picture and
   nameplate. Everything shared (the score number, the avatar ring/glow, the odds bar, and the
   felt's own turn-accent tint) always stays the fixed house theme: gold for you, teal-blue for
   the opponent, regardless of what avatar/color either side has picked. */
const YOU_FIXED_ACCENT='#F7CE55', SOL_FIXED_ACCENT='#4FD4EA';
const YOU_FELT_PALETTE={light:'#FFF0BC',mid:'#F7CE55',dark:'#D9A32B',deep:'#8F6414',rgb:rgbForHex('#F7CE55')};
const SOL_FELT_PALETTE={light:'#BDF2FA',mid:'#4FD4EA',dark:'#1FA9C6',deep:'#126273',rgb:rgbForHex('#4FD4EA')};
function rawColorForSeat(who){
  const p=personaFor(who);
  return who==='you'
    ? (avatarColor || (p&&(p.bg||p.color)) || youColor)
    : ((p&&(p.bg||p.color)) || '#7FD8FF');
}
function baseColorForSeat(who){ return approvedAccentFor(rawColorForSeat(who)); }
function setPaletteVars(el,prefix,palette){
  el.style.setProperty('--'+prefix+'1',palette.light);
  el.style.setProperty('--'+prefix+'2',palette.mid);
  el.style.setProperty('--'+prefix+'3',palette.dark);
  el.style.setProperty('--'+prefix+'4',palette.deep);
}
function applyActiveAccent(who){
  const felt=document.querySelector('.felt');
  if(!felt) return;
  const palette=who==='sol' ? SOL_FELT_PALETTE : YOU_FELT_PALETTE;
  setPaletteVars(felt,'gold',palette);
  felt.style.setProperty('--accentRgb',palette.rgb);
  felt.dataset.activeSeat=who||'you';
}
function applySeatColors(){
  const setSide=(sideId,plateId,plateColor,fixedColor)=>{
    $(sideId).style.setProperty('--ringColor',fixedColor);
    $(sideId).style.setProperty('--glowColor',fixedColor+'88');
    $(sideId).style.setProperty('--numColor',fixedColor);
    $(plateId).style.setProperty('--plateColor',plateColor);
    $(plateId).style.setProperty('--plateText',textColorForBg(plateColor));
  };
  setSide('youSide','youlabel',rawColorForSeat('you'),YOU_FIXED_ACCENT);
  setSide('solSide','sollabel',rawColorForSeat('sol'),SOL_FIXED_ACCENT);
  applyActiveAccent(S&&S.turn?S.turn:'you');
}
function refreshSeatAvatars(){
  $('youAvatar').src=avatarSrcFor('you');
  $('solAvatar').src=avatarSrcFor('sol');
  applyAvatarBackground('you');
  applyAvatarBackground('sol');
  applySeatColors();
}

/* ---- seats keep fixed left/right positions, while their colors come from their avatars.
   Which one is human vs computer, and what they're called, depends on MODE. ---- */
const other = who => who==='you' ? 'sol' : 'you';
const seatScore = who => who==='you' ? S.p : S.a;
const isHumanSeat = who => MODE==='pass' || (MODE==='ai' && who==='you');
const isYou = who => MODE==='ai' && who==='you';   /* the one actual human, addressed in 2nd person */
function seatLabel(who){
  if(MODE==='pass'){
    if(who==='you') return (myName && myName!=='You') ? myName : 'Player 1';
    return p2Name || 'Player 2';
  }
  const p=personaFor(who);
  if(p) return p.name;
  return who==='you' ? myName : 'You';
}
/* "You" gets friendly 2nd-person phrasing; everyone else -- named personas or Player 1/2 -- is 3rd person */
function moverName(who){ return isYou(who) ? 'You' : seatLabel(who); }
function moverPhrase(who){ return moverName(who); }
function turnHeading(who){ return isYou(who) ? 'Your Turn' : seatLabel(who)+'\u2019s Turn'; }
function needPhrase(forWho){
  return isYou(forWho) ? 'You need' : seatLabel(forWho)+' needs';
}
function oddsAvailable(){ return isDefaultRules(); }

function resetGameState(){
  gameEpoch++;   /* invalidates any in-flight turn/roll logic still holding an earlier epoch */
  $('winScreen').classList.remove('on'); stopConfetti();
  spotlightOff('you'); spotlightOff('sol');
  S={p:0,a:0,turn:null,dice:[],sel:new Set(),vf:[],els:[],pos:[],heldEls:[],heldVals:[],heldGroups:[],
     returned:new Set(),bracketEls:[],
     tt:0,n:6,dp:null,need:0,over:false,busy:false};
  $('board').classList.remove('chase');
  $('log').innerHTML='';
  $('arena').querySelectorAll('.die').forEach(e=>e.remove());
  $('arena').querySelectorAll('.gbracket').forEach(e=>e.remove());
  $('ttv').textContent='0';
  hideFlash(); showOdds(0.5,'Nobody On The Board Yet'); render();
}
function chooseMode(){
  resetGameState();
  inGameSession=false;
  personaYou=null; personaSol=null;
  $('youlabel').textContent='You'; $('sollabel').textContent='Computer';
  refreshSeatAvatars();
  setBanner('Choose Mode', isDefaultRules()
    ? 'Standard rules \u2014 the opponent plays the exact optimum'
    : 'Custom rules \u2014 the opponent maximizes expected points');
  $('advice').innerHTML='';
  /* Mode selection lives in exactly one place -- the burger menu's Play section.
     The board itself only offers a single way back into that menu, so there is
     never a second, separate set of Vs Computer / Pass & Play / AI vs AI buttons
     to fall out of sync with the real ones. */
  $('ctl').innerHTML='';
  mkBtn('Open Menu To Start','',openMenu);
}
function pickMode(m,persona,keepYouPersona){
  clearTimeout(demoContinueTimer);
  inGameSession=true;
  /* Any staged rule edits from the menu take effect starting with this game --
     this is the single place a new game actually begins, regardless of which
     menu button led here. Skip the (fairly heavy) table rebuild when nothing
     actually changed, so starting a game with default/unmodified rules stays
     instant. */
  if(JSON.stringify(PENDING_RULES)!==JSON.stringify(RULES)){
    setRules(PENDING_RULES);
    recomputeFarkle();
  }
  MODE=m;
  if(m==='ai'){ personaYou=null; personaSol=persona||randomPersona(); }
  else if(m==='watch'){ personaYou=keepYouPersona||randomPersona(); personaSol=randomPersona(personaYou); }
  else{ personaYou=null; personaSol=null; }
  $('youlabel').textContent=seatLabel('you');
  $('sollabel').textContent=seatLabel('sol');
  refreshSeatAvatars();
  setBanner('Roll For First','Highest die takes the dice');
  let taglines='';
  if(personaYou) taglines += '<br><span class="x">'+personaYou.name+': '+personaYou.tag+'</span>';
  if(personaSol) taglines += '<br><span class="x">'+personaSol.name+': '+personaSol.tag+'</span>';
  $('advice').innerHTML = (MODE==='pass'
    ? '<span class="x">'+seatLabel('you')+' is left, '+seatLabel('sol')+' is right</span>'
    : MODE==='watch'
      ? '<span class="x">'+seatLabel('you')+' is left, '+seatLabel('sol')+' is right \u2014 sit back and watch</span>'
      : '<span class="x">You are left, '+seatLabel('sol')+' is right</span>') + taglines;
  $('ctl').innerHTML='';
  rollOff();   /* handles each side's own tap (or auto-rolls it, if that side isn't human-controlled) internally */
}
function newGame(){ chooseMode(); }
/* "Play Again" from the end-of-game screen -- same mode, and for a Vs Computer game, the exact
   same opponent, without making you walk back through mode/opponent selection. Pass & Play and
   AI vs AI just start a fresh round of that same mode (a fresh random pair is part of AI vs AI's
   whole appeal, so that's not preserved -- only the mode itself is). */
let lastMode=null, lastPersonaYou=null, lastPersonaSol=null;
function playAgainSameMode(){
  const m=lastMode||'ai', keepPersona=(m==='ai')?lastPersonaSol:undefined;
  resetGameState();
  pickMode(m,keepPersona);
}
function backToMainMenu(){
  chooseMode();
  openMenu();
}

let arenaNoticeTimer=null;
function setBanner(main,sub){
  const notice=$('arenaNotice'), head=$('arenaNoticeMain'), detail=$('arenaNoticeSub');
  if(!notice||!head||!detail) return;
  let title=String(main||'').replace(/\u00a0/g,'').trim();
  let body=String(sub||'');
  const bodyText=body.replace(/<[^>]*>/g,'').replace(/\u00a0/g,'').trim();
  /* The centered spotlight already identifies the active player. */
  if(/turn$/i.test(title)) title='';
  /* Mode selection is setup copy, not an in-game event. */
  if(title==='Choose Mode'){ title=''; body=''; }
  if(!title&&!bodyText){
    clearTimeout(arenaNoticeTimer); notice.classList.remove('on'); return;
  }
  head.textContent=title; detail.innerHTML=body||'';
  notice.classList.add('on');
  clearTimeout(arenaNoticeTimer);
  const duration=(title==='Last Round'||/wins?|won|victory/i.test(title))?2600:1500;
  arenaNoticeTimer=setTimeout(()=>notice.classList.remove('on'),duration);
}
function mkBtn(label,cls,fn,dis,icon,sub){
  const b=document.createElement('button');
  b.className='btn '+(cls||'');
  b.innerHTML='<span class="lab">'+(icon||'')+'<span>'+label+'</span></span>'
            + (sub?'<span class="sub">'+sub+'</span>':'');
  b.disabled=!!dis; b.onclick=fn;
  $('ctl').appendChild(b); return b;
}
/* chance of a farkle on n fresh dice, straight off the (rebuildable) roll tables */
let FARKLE=[0,0,0,0,0,0,0];
function recomputeFarkle(){
  for(let n=1;n<=6;n++){ let p=0; for(const r of ROLLS[n]) if(!r.opts.length) p+=r.w; FARKLE[n]=p; }
}
recomputeFarkle();
function log(msg,who){
  const d=document.createElement('div');
  if(who==='s') d.className='s';
  d.innerHTML=msg; $('log').prepend(d);
}
function render(){ $('pnum').textContent=fmt(S.p); $('anum').textContent=fmt(S.a); }
function showFlash(t,s,bad,withBtn){
  $('ftxt').textContent=t; $('ftxt').className='ftxt '+(bad?'bad':'gold');
  $('fsub').textContent=s||'';
  $('hbtn').className='hbtn'+(withBtn?' show':'');
  $('flash').classList.toggle('dim', !!bad);
  $('flash').classList.add('on');
}
function hideFlash(){
  $('flash').classList.remove('on');
  $('hbtn').className='hbtn';      /* strip 'show' -- otherwise it lingers, invisible but clickable, over the dice */
  $('hbtn').onclick=null;
}
/* an interactive flash the player must tap through -- used to pass the device */
function handoff(next){
  $('arena').querySelectorAll('.die').forEach(e=>e.remove());   /* clean felt behind the announcement, not the last held dice */
  S.heldEls=[]; S.heldVals=[]; S.heldGroups=[]; clearBrackets();
  return new Promise(res=>{
    showFlash(seatLabel(next)+'\u2019s Turn','Pass the device, then continue',false,true);
    $('hbtn').onclick=()=>{ hideFlash(); res(); };
  });
}
async function proceedTo(next){
  const myEpoch=gameEpoch;
  applyActiveAccent(next);
  if(MODE==='pass') await handoff(next);
  if(stale(myEpoch)) return;
  startTurn(next);
}

function showOdds(pWin,cap){
  const pct=Math.max(0,Math.min(1,pWin));
  $('ofill').style.width=(pct*100).toFixed(2)+'%';
  $('ospark').style.left=(pct*100).toFixed(2)+'%';
  $('oyou').textContent=(pct*100).toFixed(1)+'%';
  $('osol').textContent=((1-pct)*100).toFixed(1)+'%';
  $('ocap').textContent=cap;
}
/* The final countdown: once someone has passed the winning score, the other side gets
   one last turn to catch up. Rather than bury that inside the normal you-vs-them
   scoreboard, swap in a big "how much left, and how likely" readout that updates as
   they roll -- the number falls and the odds climb together as the turn goes well. */
function updateChasePanel(n,t){
  $('board').classList.add('chase');
  const chaser=S.turn, remaining=Math.max(0,S.need-t);
  $('board').classList.toggle('chase-sol', chaser==='sol');
  $('chaseAvatarImg').src = avatarSrcFor(chaser);
  $('chaseLabel').textContent = (isYou(chaser) ? 'YOU NEED' : seatLabel(chaser).toUpperCase()+' NEEDS');
  const numEl=$('chaseNum');
  numEl.textContent=fmt(remaining*50);
  numEl.className='chasenum';
  const p = remaining<=0 ? 1 : (oddsAvailable() ? G[Math.min(n,6)][Math.min(remaining,520)] : null);
  if(p===null){
    $('chaseProbFill').style.width='0%';
    $('chaseProbText').textContent='Custom Rules';
  }else{
    $('chaseProbFill').style.width=(p*100).toFixed(2)+'%';
    $('chaseProbText').textContent=(p*100).toFixed(1)+'% chance';
  }
}
const oddsLocked = () => S.p===0 && S.a===0;
function baseOdds(){
  if(S.over) return;
  $('board').classList.remove('chase');
  if(S.need>0){ updateChasePanel(S.n,S.tt); return; }
  if(!oddsAvailable()){ showOdds(0.5,'Custom Rules \u2014 Odds Unavailable'); return; }
  if(oddsLocked()){ showOdds(0.5,'Nobody On The Board Yet'); return; }
  showOdds(S.turn==='you'?Wv(idxOf(S.p),idxOf(S.a)):1-Wv(idxOf(S.a),idxOf(S.p)),'Live Win Chance');
}
function liveOdds(n,t){
  if(S.need>0){ updateChasePanel(n,t); return; }
  if(!oddsAvailable()||oddsLocked()||!S.dp) return;
  const v=S.dp.V[n*STRIDE+Math.min(t,TMAX)];
  showOdds(S.turn==='you'?v:1-v,'Live Win Chance');
}

/* One side's die: a real human seat gets a Roll button (or, in Cheat Mode, a single-die picker
   for just that seat -- never the other one), so Pass & Play genuinely hands control back and
   forth; a non-human seat (the AI in Vs Computer, or either side in Demo Mode) just rolls on
   its own, exactly as before. */
async function rollOneSide(side,bannerText){
  const tag = side==='you' ? 'youdie' : 'soldie';
  const idx = side==='you' ? 0 : 1;
  applyActiveAccent(side);
  setBanner('Roll For First', bannerText);
  if(!isHumanSeat(side)){ $('ctl').innerHTML=''; return await rollOneOff(tag,idx); }
  return await new Promise(resolve=>{
    function draw(){
      $('ctl').innerHTML='';
      if(cheatMode){
        showCheatPickerRollOffSide(side, async(face)=>{
          awaitingRollOffRedraw=null;
          resolve(await rollOneOff(tag,idx,face));
        });
      }else{
        setBanner('Roll For First', bannerText);
        mkBtn('Roll','',async()=>{
          awaitingRollOffRedraw=null;
          $('ctl').innerHTML='';
          resolve(await rollOneOff(tag,idx));
        });
      }
    }
    awaitingRollOffRedraw=draw;
    draw();
  });
}
async function rollOff(){
  const myEpoch=gameEpoch;
  S.busy=true; $('ctl').innerHTML='';

  let you=await rollOneSide('you', (isYou('you')?'Your':seatLabel('you'))+' die');
  if(stale(myEpoch)) return;
  let sol=await rollOneSide('sol', 'Rolled <b>'+you.f+'</b> \u2014 now '+seatLabel('sol')+'\u2019s die');
  if(stale(myEpoch)) return;

  while(you.f===sol.f){                      /* dead heat: each side rolls its own die again, same as the first time */
    setBanner('Tied On '+you.f,'Rolling again');
    await sleep(reduced?150:380);
    if(stale(myEpoch)) return;
    $('arena').querySelectorAll('.die').forEach(e=>e.remove());
    you=await rollOneSide('you', (isYou('you')?'Your':seatLabel('you'))+' die');
    if(stale(myEpoch)) return;
    sol=await rollOneSide('sol', 'Rolled <b>'+you.f+'</b> \u2014 now '+seatLabel('sol')+'\u2019s die');
    if(stale(myEpoch)) return;
  }

  const youWin=you.f>sol.f;
  applyActiveAccent(youWin?'you':'sol');
  (youWin?sol:you).el.classList.add('loser');
  (youWin?you:sol).el.classList.add('winner');
  const winnerLabel = youWin ? (isYou('you')?'You Go First':seatLabel('you')+' Goes First')
                              : seatLabel('sol')+' Goes First';
  setBanner(winnerLabel, 'Rolled <b>'+you.f+'</b> &nbsp;&middot;&nbsp; <b>'+sol.f+'</b>');
  log('Roll-off &mdash; '+seatLabel('you')+' <b>'+you.f+'</b>, '+seatLabel('sol')+' <b>'+sol.f+'</b>.');
  await sleep(reduced?150:220);
  if(stale(myEpoch)) return;
  showFlash(winnerLabel, you.f+' vs '+sol.f);
  await sleep(reduced?300:700);
  if(stale(myEpoch)) return;
  hideFlash();
  S.busy=false;
  startTurn(youWin?'you':'sol');
}
async function parkPair(elY,elS){
  const W=$('arena').clientWidth, SZ=dieSize(), y=($('shelf').offsetHeight-SZ)/2;
  [[elY,12],[elS,W-SZ-12]].forEach(([el,x])=>{
    el.classList.add('held'); el.style.zIndex=6;
    void el.offsetWidth;
    el.style.transform='translate('+x.toFixed(1)+'px,'+y.toFixed(1)+'px)';
  });
  await sleep(reduced?100:330);
}
/* one die, thrown alone, then parked on its owner's side of the shelf */
async function rollOneOff(tag,side,targetFace){
  const myEpoch=gameEpoch;
  const [f]=targetFace
    ? await throwDiceWithTargets(1,false,[tag],true,[targetFace])   /* Cheat Mode: corrected from the start of the throw, same as the main roll */
    : await throwDice(1,false,[tag],true);                          /* the physical tumble decides the outcome */
  if(stale(myEpoch)) return {f:0,el:document.createElement('div')};   /* game ended mid-roll -- caller's own check discards this */
  await sleep(reduced?150:PHYS_CONTROL_ROLLOFF.highlightDelayMs);   /* sit on the felt so you can read it -- the roll-off's own, much snappier pause */
  if(stale(myEpoch)) return {f:0,el:document.createElement('div')};
  const el=S.els[0], W=$('arena').clientWidth, SZ=dieSize();
  const y=($('shelf').offsetHeight-SZ)/2, x=(side===0)?12:(W-SZ-12);
  el.classList.add('held'); el.style.zIndex=6;
  void el.offsetWidth;
  el.style.transform='translate('+x.toFixed(1)+'px,'+y.toFixed(1)+'px)';
  setFace(el, f);                                     /* park it upright, not at whatever tilt it landed on */
  await sleep(reduced?100:330);                       /* travel up to its corner */
  await sleep(reduced?60:250);                        /* beat before the next roll */
  return {f,el};
}

function startTurn(who){
  hideFlash();
  spotlightOff(other(who));
  spotlightOn(who);
  setExpression(who, S.need>0 ? 'Worried' : 'Thinking', 1400, true);
  S.turn=who; S.tt=0; S.n=6; S.dice=[]; S.sel.clear(); S.els=[]; S.pos=[]; S.heldEls=[]; S.heldVals=[]; S.heldGroups=[];
  applyActiveAccent(who);
  S.returned=new Set(); clearBrackets();
  S.dp = (S.need>0 || !oddsAvailable()) ? null
       : turnDP(idxOf(seatScore(who)), idxOf(seatScore(other(who))));
  $('arena').querySelectorAll('.die').forEach(e=>e.remove());
  $('ttv').textContent='0';
  baseOdds();
  if(isHumanSeat(who)){
    setBanner(S.need>0?'Last Round':turnHeading(who),
      S.need>0 ? needPhrase(who)+' <b>'+fmt(S.need*50)+'</b> in one turn'
               : (seatScore(who)===0 ? 'First bank must be <b>'+fmt(RULES.onBoard)+'</b> or more' : ''));
    $('ctl').innerHTML=''; $('advice').innerHTML='';
    if(cheatMode) showCheatPicker(6); else mkBtn('Roll Six Dice','',()=>humanRoll(6));
  }else{
    setBanner(S.need>0?'Last Round':seatLabel(who)+'\u2019s Turn',
      S.need>0 ? needPhrase(who)+' <b>'+fmt(S.need*50)+'</b>' : '');
    $('ctl').innerHTML=''; $('advice').innerHTML='';
    solverTurn(who);
  }
}

async function humanRoll(n,targetFaces){
  const myEpoch=gameEpoch;
  S.busy=true; S.n=n; S.sel.clear(); S.returned=new Set();
  $('ctl').innerHTML=''; $('advice').innerHTML='<span class="x">Rolling\u2026</span>';
  holdBreath('you',550);
  S.dice=targetFaces
    ? await throwDiceWithTargets(n,true,null,false,targetFaces)   /* Cheat Mode: corrected from the start of the throw */
    : await throwDice(n,true,null,false);                          /* the physical tumble decides the outcome */
  if(stale(myEpoch)) return;
  const info=rollLookup(S.dice); S.vf=info.vf;
  S.busy=false;
  if(info.opts.length===0) return farkle(S.turn);
  liveOdds(n,S.tt);
  const delay=physicsTuning().highlightDelayMs;
  if(delay>0) await sleep(delay);   /* a beat between the dice settling and revealing which ones score */
  if(stale(myEpoch)) return;
  paint();
}
function toggle(i){
  if(S.busy) return;
  if(groupMode==='manual'){ S.sel.has(i)?S.sel.delete(i):S.sel.add(i); paint(); return; }

  if(S.sel.has(i)){
    /* pull just this one die back down, then evict anything left over that's now dead */
    S.sel.delete(i); S.returned.add(i);
    const remaining=[...S.sel];
    const remCounts=countsOf(remaining.map(idx=>S.dice[idx]));
    const {dead}=computeGroups(remCounts);
    if(dead.length) for(const idx of remaining) if(dead.includes(S.dice[idx])){ S.sel.delete(idx); S.returned.add(idx); }
  } else {
    /* bring up the WHOLE group this die belongs to, per the best grouping of the pool */
    const poolIdx=S.dice.map((_,idx)=>idx).filter(idx=>!S.sel.has(idx));
    const poolCounts=countsOf(poolIdx.map(idx=>S.dice[idx]));
    const {groups,compound}=computeGroups(poolCounts);
    const face=S.dice[i];
    let g=groups.find(gr=>gr.allSix || gr.face===face);
    /* The auto-picked grouping above doesn't include this die at all -- it only scores as
       part of the all-six compound (e.g. a pair sitting beside a bigger 4-of-a-kind), which
       lost out on points and so got left out of `groups` entirely. Falling back to it here,
       rather than treating the die as dead weight, is what actually lets you choose hot dice
       over the higher-scoring split. */
    if(!g && compound) g={kind:compound.kind,label:compound.label,allSix:true,pts:compound.pts};
    if(!g) return;                              /* genuinely dead weight -- shouldn't normally be reachable */
    if(g.allSix) poolIdx.forEach(idx=>S.sel.add(idx));
    else{
      S.sel.add(i);                              /* the die actually clicked always wins a slot */
      let need=g.count-1;
      for(const idx of poolIdx){
        if(need<=0) break;
        if(idx===i) continue;
        if(S.dice[idx]===face){ S.sel.add(idx); need--; }
      }
    }
  }
  paint();
}
function selScore(){
  if(!S.sel.size) return null;
  return scoreAll(countsOf([...S.sel].map(i=>S.dice[i])));
}
/* the SMALLEST legal set containing everything already picked -- i.e. the
   fewest extra dice that make an illegal selection legal. Ties go to the higher score. */
function bestCompletion(){
  const rollC=countsOf(S.dice), selC=countsOf([...S.sel].map(i=>S.dice[i]));
  let best=null; const sub=[0,0,0,0,0,0];
  (function rec(i){
    if(i===6){
      const k=sub.reduce((a,b)=>a+b,0); if(!k) return;
      const sc=scoreAll(sub); if(sc===null) return;
      if(!best || k<best.n || (k===best.n && sc>best.pts)) best={pts:sc,n:k,counts:sub.slice()};
      return;
    }
    for(let c=selC[i];c<=rollC[i];c++){ sub[i]=c; rec(i+1); }
    sub[i]=selC[i];
  })(0);
  return best;
}
function paint(){
  const sc=selScore(), els=S.els;
  els.forEach((el,i)=>{ el.className='die inpit'+(shadeInvalid&&!S.vf[S.dice[i]-1]?' dead':'')+(S.sel.has(i)?' sel':''); });

  let rec=null, matched=false;
  if(hints && S.dp && S.need===0){
    const info=rollLookup(S.dice); let best=-1e18;
    for(const o of info.opts){
      const v=S.dp.V[o.left*STRIDE+Math.min(o.pi+S.tt,TMAX+170)];
      if(v>best){best=v;rec=o;}
    }
  }
  if(rec){
    const selC=countsOf([...S.sel].map(i=>S.dice[i]));
    matched = rec.keep.every((c,f)=>c===selC[f]);
    if(!matched){                       /* ring the dice still waiting to be picked */
      const want=rec.keep.map((c,f)=>Math.max(0,c-selC[f]));
      for(let i=0;i<S.dice.length;i++){
        const f=S.dice[i]-1;
        if(!S.sel.has(i) && want[f]>0){ want[f]--; els[i].classList.add('hint'); }
      }
    }
  }

  /* Bank always pays the true best achievable from every live die this roll --
     pending and still-in-pool alike -- never just whatever happens to be clicked. */
  const liveCounts=countsOf(S.dice);
  const bankBest=bestAchievable(liveCounts);
  const bankPts=bankBest?bankBest.pts:null;
  const bankTotal=S.tt*50+(bankPts||0);

  const total=S.tt*50+(sc||0);
  $('ttv').textContent=fmt(total);
  const valid=sc!==null, allKept=valid&&S.sel.size===S.dice.length;
  const myScore=seatScore(S.turn);
  const canBank=bankPts!==null&&(myScore>0||bankTotal>=RULES.onBoard);
  const after=myScore+bankTotal, nextN=allKept?6:(S.dice.length-S.sel.size);
  const wins = canBank && (S.need>0 ? bankTotal>=S.need*50 : after>=RULES.winAt);
  let bankSub;
  if(bankPts===null) bankSub='Nothing scores here';
  else if(S.need>0) bankSub = bankTotal>=S.need*50 ? 'Beats '+seatLabel(other(S.turn))+' &mdash; you win'
                                               : 'Short &mdash; need '+fmt(S.need*50);
  else if(!canBank) bankSub='First bank must be '+fmt(RULES.onBoard);
  else if(after>=RULES.winAt) bankSub=seatLabel(other(S.turn))+' gets one turn to beat '+fmt(after);
  else bankSub='You&rsquo;d be on '+fmt(after);
  const rollSub = !valid ? '&nbsp;'
    : stats ? (Math.round(FARKLE[nextN]*100)+'% farkle risk')
            : (allKept ? 'All six again' : nextN+(nextN===1?' die next':' dice next'));

  $('ctl').innerHTML='';
  const bRoll=mkBtn(allKept?'Hot Dice \u2014 Roll 6':('Keep &amp; Roll '+(S.dice.length-S.sel.size)),
                    '',()=>commit(true),!valid,'',rollSub);
  const bBank=mkBtn((S.need>0?'Stop At ':'Bank ')+fmt(bankTotal),
                    wins?'final':'pale',()=>commit(false),!canBank,canBank?'':LOCK,bankSub);
  if(matched && !wins){                 /* everything picked -- now ring the button to press */
    const nt=Math.min(S.tt+rec.pi,TMAX);
    const target=S.dp.POL[rec.left*(TMAX+1)+nt] ? bRoll : bBank;
    if(!target.disabled) target.classList.add('rec');
  }

  /* Manual mode can still build a partially-illegal selection (automatic mode can't,
     by construction -- it only ever adds or evicts whole valid groups). Gold-pulse
     the dice that would complete it, manual mode only. */
  let comp=null;
  if(groupMode==='manual' && S.sel.size && !valid){
    comp=bestCompletion();
    if(comp){
      const selC=countsOf([...S.sel].map(i=>S.dice[i]));
      const extra=comp.counts.map((c,f)=>Math.max(0,c-selC[f]));
      for(let i=0;i<S.dice.length;i++){
        const f=S.dice[i]-1;
        if(!S.sel.has(i) && extra[f]>0 && !els[i].classList.contains('hint')){
          extra[f]--; els[i].classList.add('need');
        }
      }
    }
  }
  if(groupMode==='manual' && S.sel.size && !valid){
    $('advice').innerHTML = comp
      ? '<span class="x">Not scoring yet \u2014 add the pulsing dice for '+fmt(comp.pts)+'</span>'
      : '<span class="x">That set can\u2019t score \u2014 deselect something</span>';
  }
  else if(S.need>0) $('advice').textContent='Roll to '+fmt(S.need*50)+'. Stopping short loses.';
  else if(hints) $('advice').innerHTML='';
  else if(!S.sel.size) $('advice').innerHTML='<span class="x">Tap the brighter dice to keep them</span>';
  else $('advice').innerHTML='';
  layoutShelf();
  placeAll();
}
/* a kept die keeps its element and slides up to its slot on the shelf */
function moveToShelf(indices){
  const vals = indices.map(i => S.dice[i]);
  indices.forEach(i=>{
    const el=S.els[i];
    el.onclick=null;
    el.classList.remove('sel','hint','need','dead');
    el.classList.add('held');
    S.heldEls.push(el);
    S.heldVals.push(S.dice[i]);
    S.sel.delete(i);
  });
  /* Lock in the group(s) formed by THIS commit only. This roll's dice never get
     re-merged with an earlier or later roll's commitment, even if they're the same
     face -- three separate single 1s across three rolls stay three separate 100s,
     not one retroactive three-of-a-kind. */
  const {groups} = groupsForExactSet(countsOf(vals));
  const used = new Set();
  groups.forEach(g=>{
    const wantFace = g.allSix ? null : g.face;
    const members=[];
    for(const i of indices){
      if(members.length >= (g.allSix?6:g.count)) break;
      if(used.has(i)) continue;
      if(g.allSix || S.dice[i]===wantFace){ members.push(i); used.add(i); }
    }
    members.sort((a,b) => S.dice[b]-S.dice[a]);   /* largest face on the left, smallest on the right */
    S.heldGroups.push({ els: members.map(i=>S.els[i]), faces: members.map(i=>S.dice[i]), pts: g.pts });
  });
  layoutShelf();
}
function clearHeld(){
  S.heldEls.forEach(el=>el.remove());
  S.heldEls=[]; S.heldVals=[]; S.heldGroups=[];
  clearBrackets();
}
function clearBrackets(){
  (S.bracketEls||[]).forEach(el=>el.remove());
  S.bracketEls=[];
}
function makeBracket(cls){
  const el=document.createElement('div');
  el.className='gbracket '+cls;
  $('arena').appendChild(el);
  S.bracketEls=S.bracketEls||[];
  S.bracketEls.push(el);
  return el;
}
function makeOutline(cls){
  const el=document.createElement('div');
  el.className='goutline '+cls;
  $('arena').appendChild(el);
  S.bracketEls=S.bracketEls||[];
  S.bracketEls.push(el);
  return el;
}
/* Lays out BOTH committed (locked from earlier rolls this turn) and pending (picked
   this roll, not locked yet) dice in the same top lane. Committed sits flush at the
   top with its value bracket below; pending sits half a die-height lower with its
   bracket filling the gap above it. Either state only ever needs 1.5 die-heights. */
function layoutShelf(){
  clearBrackets();
  const arena=$('arena'), W=arena.clientWidth;
  const baseSZ = dieSize();
  const gapWithinFrac=0.06, gapBetweenFrac=0.11;   // gapBetween halved from before per feedback
  const labelPad=4;

  // Pre-resolve pending group membership (same assignment logic as before) so we know
  // exact per-group die counts before deciding whether anything needs to shrink to fit.
  const pendingIdx = [...S.sel];
  const pendingGroupsRaw = pendingIdx.length ? groupsForExactSet(countsOf(pendingIdx.map(i=>S.dice[i]))).groups : [];
  let usedPending = new Set();
  const pendingGroups = pendingGroupsRaw.map(g=>{
    const wantFace = g.allSix ? null : g.face;
    const members=[];
    for(const idx of pendingIdx){
      if(members.length >= (g.allSix?6:g.count)) break;
      if(usedPending.has(idx)) continue;
      if(g.allSix || S.dice[idx]===wantFace){ members.push(idx); usedPending.add(idx); }
    }
    members.sort((a,b) => S.dice[b]-S.dice[a]);   /* largest face on the left, smallest on the right */
    return {pts:g.pts, members};
  });
  const committedGroups = S.heldGroups;

  const groupCounts = [...committedGroups.map(g=>g.els.length), ...pendingGroups.map(g=>g.members.length)];

  // Natural (unscaled) total width for tight-left, halved-gap layout: every die and
  // every gap adds up to exactly the available width when it all just fits; if it
  // doesn't, shrink dice and gaps together by whatever factor makes it fit exactly.
  function totalWidthAt(sz){
    let w=0;
    groupCounts.forEach((n,i)=>{
      w += n*sz + Math.max(0,n-1)*sz*gapWithinFrac;
      if(i<groupCounts.length-1) w += sz*gapBetweenFrac;
    });
    return w;
  }
  const margin=2;               // just enough that the die's own edge/shadow isn't literally clipped
  const avail=Math.max(10, W-margin*2);
  const natural=totalWidthAt(baseSZ);
  const scale = natural>avail ? avail/natural : 1;
  const SZ = baseSZ*scale;
  const gapWithin=SZ*gapWithinFrac, gapBetween=SZ*gapBetweenFrac, half=SZ*0.5;
  const startX=margin, y0=($('shelf').offsetHeight-SZ*1.5)/2;
  const tf = scale<1 ? ' scale('+scale.toFixed(4)+')' : '';
  let x=startX;

  const committedCls = S.turn==='you' ? 'committed-you' : 'committed-sol';
  committedGroups.forEach(g=>{
    const gx0=x;
    g.els.forEach((el,j)=>{
      el.style.zIndex=Math.round(5+x);
      el.style.filter='';
      el.style.transform='translate('+x.toFixed(1)+'px,'+y0.toFixed(1)+'px)'+tf;
      setFace(el, g.faces[j]);   // committed dice always sit upright, whatever tilt they landed at in the pool
      x += SZ+gapWithin;
    });
    const gw=x-gapWithin-gx0;
    const outline=makeOutline(committedCls);
    outline.style.left=gx0+'px'; outline.style.top=y0+'px';
    outline.style.width=gw+'px'; outline.style.height=SZ+'px';
    if(showBrackets){
      const b=makeBracket('committed');
      b.style.left=gx0+'px'; b.style.top=(y0+SZ+labelPad)+'px';
      b.style.width=gw+'px'; b.style.height=(half-labelPad)+'px';
      b.textContent=fmt(g.pts);
    }
    x += gapBetween;
  });

  pendingGroups.forEach(g=>{
    const gx0=x;
    g.members.forEach(idx=>{
      const el=S.els[idx];
      el.style.zIndex=Math.round(5+x);
      el.style.transform='translate('+x.toFixed(1)+'px,'+(y0+half).toFixed(1)+'px)'+tf;
      setFace(el, S.dice[idx]);   // pending dice also straighten up once selected
      x += SZ+gapWithin;
    });
    const gw=x-gapWithin-gx0;
    const outline=makeOutline('pending');
    outline.style.left=gx0+'px'; outline.style.top=(y0+half)+'px';
    outline.style.width=gw+'px'; outline.style.height=SZ+'px';
    if(showBrackets){
      const b=makeBracket('pending');
      b.style.left=gx0+'px'; b.style.top=y0+'px';
      b.style.width=gw+'px'; b.style.height=(half-labelPad)+'px';
      b.textContent=fmt(g.pts);
    }
    x += gapBetween;
  });

  layoutReturnedStrip();
}
/* Dice that were picked up (pending) and then deselected snap into a strip along the
   very bottom of the arena, grouped together, rather than back to wherever they
   happened to land on the original throw. Fresh, never-touched dice are unaffected. */
function layoutReturnedStrip(){
  const idx=[...(S.returned||[])].filter(i=>!S.sel.has(i));
  if(!idx.length) return;
  const arena=$('arena'), W=arena.clientWidth, H=arena.clientHeight, SZ=dieSize(), PAD=6;
  const y=H-SZ-PAD*1.5;
  const avail=W-PAD*2;
  let g = idx.length>1 ? Math.min(8,(avail-idx.length*SZ)/(idx.length-1)) : 0;
  if(g < -SZ*0.35) g = -SZ*0.35;
  const totalW = idx.length*SZ + (idx.length-1)*g;
  let x = (W-totalW)/2;
  idx.forEach(i=>{
    const el=S.els[i];
    el.style.transform='translate('+x.toFixed(1)+'px,'+y.toFixed(1)+'px)';
    S.pos[i] = {x, y};
    x += SZ+g;
  });
}
async function commit(rollAgain){
  const myEpoch=gameEpoch;
  let sc, idx;
  if(!rollAgain){
    /* Banking always pays the true best achievable from every live die this roll --
       pending and still-in-pool alike -- rebuilding the selection to match so the
       shelf visually reflects exactly what got paid, regardless of what was clicked. */
    const best=bestAchievable(countsOf(S.dice));
    if(!best) return;
    sc=best.pts;
    const want=best.counts.slice();
    S.sel=new Set();
    for(let i=0;i<S.dice.length;i++){ const f=S.dice[i]-1; if(want[f]>0){ want[f]--; S.sel.add(i); } }
    idx=[...S.sel].sort((a,b)=>a-b);
  } else {
    sc=selScore(); if(sc===null) return;
    idx=[...S.sel].sort((a,b)=>a-b);
  }
  const left=S.dice.length-idx.length;
  S.tt=S.tt+sc/50;   /* the real running total for this turn -- never capped. TMAX only bounds
                         the size of the AI's probability table; every place that actually reads
                         from that table (liveOdds, the advice hint, the AI's own valAt/POL lookups)
                         already clamps for itself at the point of use, so nothing downstream needs
                         S.tt itself to be limited. */
  S.busy=true; $('ctl').innerHTML=''; $('advice').innerHTML='';
  moveToShelf(idx);
  $('ttv').textContent=fmt(S.tt*50);
  await sleep(reduced?60:430);
  if(stale(myEpoch)) return;
  S.busy=false;
  if(!rollAgain) return bank(S.turn);
  if(left===0){ clearHeld(); setExpression(S.turn,'Surprised',2000); log(moverName(S.turn)+' scored all six &mdash; <b>hot dice</b>.', S.turn==='sol'?'s':'');
    if(S.turn==='you'&&cheatMode) showCheatPicker(6); else humanRoll(6);
  }
  else{
    if(S.turn==='you'&&cheatMode) showCheatPicker(left); else humanRoll(left);
  }
}

function paintBrightness(){
  S.els.forEach((el,i)=>{ el.classList.toggle('dead', shadeInvalid && !S.vf[S.dice[i]-1]); });
}
async function solverTurn(who){
  const myEpoch=gameEpoch;
  S.busy=true;
  const persona=personaFor(who) || PERSONAS[0];   /* fall back to perfect play if somehow unset */
  let n=6,t=0,realTotal=0;
  const useDefault=oddsAvailable(), dp=S.dp, need=S.need;
  const evCap = useDefault ? (TMAX+170) : EVCAP;
  const valAt = (left,ti) => useDefault ? dp.V[left*STRIDE+Math.min(ti,evCap)]
                                         : EV.E[left*(EVCAP+1)+Math.min(ti,EVCAP)];
  for(;;){
    if(stale(myEpoch)) return;   /* game was ended out from under this turn -- stop right here */
    holdBreath(who,550);
    const faces=await throwDice(n,false);   /* the physical tumble decides the outcome */
    if(stale(myEpoch)) return;
    S.dice=faces;
    const info=rollLookup(faces); S.vf=info.vf;
    const delay=physicsTuning().highlightDelayMs;
    if(delay>0) await sleep(delay);   /* same reveal pause as a human roll */
    if(stale(myEpoch)) return;
    paintBrightness();
    await sleep(reduced?100:260);
    if(stale(myEpoch)) return;
    if(info.opts.length===0){ S.busy=false; return farkle(who); }
    let best=-1e18,pick=null;
    for(const o of info.opts){
      let v;
      if(need>0){ const r=need-t-o.pi; v=r<=0?1:G[o.left][Math.min(r,520)]; }
      else v=valAt(o.left, o.pi+t);
      if(v>best){best=v;pick=o;}
    }
    const want=pick.keep.slice(), idx=[];
    for(let i=0;i<faces.length;i++){
      const f=faces[i]-1;
      if(want[f]>0){ want[f]--; S.els[i].classList.add('sel'); idx.push(i); }
    }
    placeAll();
    await sleep(reduced?100:430);
    if(stale(myEpoch)) return;
    moveToShelf(idx);
    /* t stays capped -- it's used directly below as a table index (dp.POL[...+t]) with no
       further clamping at that read site, unlike every human-path lookup which clamps itself.
       realTotal is the actual, uncapped running total for this turn, same fix as the human
       side above -- it's what actually gets banked. */
    realTotal+=pick.pi;
    t=Math.min(t+pick.pi,TMAX); n=pick.left;
    $('ttv').textContent=fmt(realTotal*50);
    await sleep(reduced?60:430);
    if(stale(myEpoch)) return;
    liveOdds(n,t);
    let stop;
    if(need>0){
      stop = (realTotal>=need);   /* the last-round target check needs the real total, not the capped lookup one */
      /* a reckless persona can get greedy even after clinching the win, and push their luck anyway */
      if(stop && persona.aggression>0 && Math.random()<persona.aggression) stop=false;
    }else{
      stop = useDefault ? !dp.POL[n*(TMAX+1)+t] : !EV.POL[n*(EVCAP+1)+Math.min(t,EVCAP)];
      if(seatScore(who)===0 && 50*t<RULES.onBoard) stop=false;   /* not on the board yet -- keep rolling */
      /* personality: nudge away from the true-optimal call, in whichever direction this
         persona leans, at a rate matched to how far off perfect play they are */
      else if(Math.random()<Math.abs(persona.aggression)) stop = persona.aggression>0 ? false : true;
    }
    if(stop){ S.tt=realTotal; S.busy=false; return bank(who); }
    if(n===6){ clearHeld(); setExpression(who,'Surprised',2000); log(seatLabel(who)+' scored all six &mdash; <b>hot dice</b>.','s'); }
    await sleep(reduced?80:240);
  }
}

async function farkle(who){
  const myEpoch=gameEpoch;
  S.busy=true;
  setExpression(who,'Disappointed',2200);
  const lost=S.tt*50, w=moverPhrase(who), verb = w==='You' ? 'lose' : 'loses';
  log(w+' farkled, losing <b>'+fmt(lost)+'</b>.', who==='sol'?'s':'');
  setBanner('\u00a0',''); $('advice').innerHTML=''; $('ctl').innerHTML='';
  await sleep(reduced?120:420);
  if(stale(myEpoch)) return;
  showFlash('Farkle', w+' '+verb+' '+fmt(lost)+' this turn', true);
  await sleep(HOLD);
  if(stale(myEpoch)) return;
  hideFlash();
  clearHeld(); S.tt=0; S.busy=false;
  endTurn(who);
}
function bank(who){
  const pts=S.tt*50;
  if(who==='you') S.p+=pts; else S.a+=pts;
  setExpression(who, pts>=300 ? 'Excited' : 'Confident', 2000);
  render();
  log(moverName(who)+' banked <b>'+fmt(pts)+'</b> &rarr; '+fmt(seatScore(who))+'.',
      who==='sol'?'s':'');
  endTurn(who);
}
async function endTurn(who){
  const myEpoch=gameEpoch;
  S.sel.clear();
  await sleep(reduced?200:700);
  if(stale(myEpoch)) return;
  const me=seatScore(who), them=seatScore(other(who));
  if(S.need>0) return finish(me>them?who:other(who));
  if(me>=RULES.winAt){
    S.need=((me-them)/50|0)+1;
    setExpression(who,'Excited',2400);
    setExpression(other(who),'Worried',2600);
    log(moverName(who)+' passed '+fmt(RULES.winAt)+'. <b>Last round.</b>', who==='sol'?'s':'');
    showFlash('Last Round', needPhrase(other(who))+' '+fmt(S.need*50)+' in one turn');
    await sleep(HOLD);
    if(stale(myEpoch)) return;
    hideFlash();
    return proceedTo(other(who));
  }
  proceedTo(other(who));
}
function finish(winner){
  S.over=true; S.busy=false;
  applyActiveAccent(winner);
  spotlightOff('you'); spotlightOff('sol');
  setExpression(winner,'Excited',8000);
  setExpression(other(winner),'Disappointed',8000);
  $('board').classList.remove('chase');
  $('arena').querySelectorAll('.die').forEach(e=>e.remove());
  S.heldEls=[]; S.heldVals=[]; S.heldGroups=[]; clearBrackets();
  $('ttv').textContent=fmt(Math.max(S.p,S.a));
  if(oddsAvailable()) showOdds(winner==='you'?1:0,'Final'); else $('ocap').textContent='Game Over';
  $('advice').innerHTML='';
  lastMode=MODE; lastPersonaYou=personaYou; lastPersonaSol=personaSol;
  $('ctl').innerHTML='';
  celebrateWin(winner);
  if(MODE==='watch') scheduleDemoContinue(winner);
}

/* ---- Demo Mode auto-loop: the win screen holds for a while on its own, then a fresh
   round starts by itself with the winner kept in the left seat and a new random
   opponent replacing whoever just lost -- no taps needed anywhere in the cycle. ---- */
const DEMO_WIN_HOLD_MS=20000;
let demoContinueTimer=null;
function scheduleDemoContinue(winnerSeat){
  clearTimeout(demoContinueTimer);
  const winnerPersona = winnerSeat==='you' ? lastPersonaYou : lastPersonaSol;
  demoContinueTimer=setTimeout(()=>{
    if(MODE!=='watch') return;   /* user navigated away during the hold -- don't barge back in */
    $('winScreen').classList.remove('on'); stopConfetti();
    resetGameState();
    pickMode('watch', undefined, winnerPersona);
  }, DEMO_WIN_HOLD_MS);
}

/* ---- the win celebration itself: whoever actually won -- you, the opponent, either side
   of a Pass & Play match, either AI in an AI-vs-AI match -- gets the exact same treatment.
   It's a celebration of the winner, not specifically a reward for the human player. ---- */
const CONFETTI_COLORS=['var(--gold1)','var(--gold2)','var(--gold3)','var(--cyan1)','var(--cyan2)','#EAF6EC'];
function makeConfettiPiece(layer){
  const el=document.createElement('div');
  el.className='confettiPiece';
  const w=4+Math.random()*5, h=8+Math.random()*10;
  el.style.width=w+'px'; el.style.height=h+'px';
  el.style.left=(Math.random()*100)+'%';
  el.style.background=CONFETTI_COLORS[Math.floor(Math.random()*CONFETTI_COLORS.length)];
  const dur=2.6+Math.random()*2.2;
  el.style.animationDuration=dur.toFixed(2)+'s';
  el.style.setProperty('--drift',(Math.random()*150-75).toFixed(0)+'px');
  el.style.setProperty('--spin',(360+Math.random()*720).toFixed(0)+'deg');
  layer.appendChild(el);
  setTimeout(()=>el.remove(), dur*1000+50);   /* clean up after it falls so the DOM never grows unbounded */
}
let confettiTimer=null;
function startConfetti(){
  stopConfetti();
  if(reduced) return;
  const back=$('confettiBack'), front=$('confettiFront');
  /* an initial heavy burst, then a steady endless trickle -- about 9 pieces behind the
     portrait for every 1 in front of it, matching the "mostly behind, ~10% in front" ask */
  for(let i=0;i<70;i++) makeConfettiPiece(i%10===0 ? front : back);
  confettiTimer=setInterval(()=>{
    for(let i=0;i<7;i++) makeConfettiPiece(back);
    makeConfettiPiece(front);
  },420);
}
function stopConfetti(){
  if(confettiTimer){ clearInterval(confettiTimer); confettiTimer=null; }
  $('confettiBack').innerHTML=''; $('confettiFront').innerHTML='';
}
/* The 55 winner medallions intentionally contain no banner. One reusable ribbon is layered
   over every medallion so the current player name can be rendered consistently at runtime. */
const WIN_HERO_IMAGES={
'Aisha':'assets/images/img127.webp',
'Alexander':'assets/images/img128.webp',
'Amelia':'assets/images/img129.webp',
'Amina':'assets/images/img130.webp',
'Anaya':'assets/images/img131.webp',
'Andre':'assets/images/img132.webp',
'Arjun':'assets/images/img133.webp',
'Benjamin':'assets/images/img134.webp',
'Caleb':'assets/images/img135.webp',
'Camila':'assets/images/img136.webp',
'Charlotte':'assets/images/img137.webp',
'Daniel':'assets/images/img138.webp',
'Elena':'assets/images/img139.webp',
'Eli':'assets/images/img140.webp',
'Elsie':'assets/images/img141.webp',
'Emma':'assets/images/img142.webp',
'Evelyn':'assets/images/img143.webp',
'Fatima':'assets/images/img144.webp',
'Finn':'assets/images/img145.webp',
'George':'assets/images/img146.webp',
'Grace':'assets/images/img147.webp',
'Hana':'assets/images/img148.webp',
'Henry':'assets/images/img149.webp',
'Ingrid':'assets/images/img150.webp',
'Jamal':'assets/images/img151.webp',
'Kai':'assets/images/img152.webp',
'Keira':'assets/images/img153.webp',
'Kenji':'assets/images/img154.webp',
'Layla':'assets/images/img155.webp',
'Leo':'assets/images/img156.webp',
'Liam':'assets/images/img157.webp',
'Lucia':'assets/images/img158.webp',
'Malik':'assets/images/img159.webp',
'Mara':'assets/images/img160.webp',
'Marcus':'assets/images/img161.webp',
'Mateo':'assets/images/img162.webp',
'Maya':'assets/images/img163.webp',
'Mei':'assets/images/img164.webp',
'Nadia':'assets/images/img165.webp',
'Naomi':'assets/images/img166.webp',
'Nico':'assets/images/img167.webp',
'Noah':'assets/images/img168.webp',
'Olivia':'assets/images/img169.webp',
'Omar':'assets/images/img170.webp',
'Owen':'assets/images/img171.webp',
'Priya':'assets/images/img172.webp',
'Raj':'assets/images/img173.webp',
'Samuel':'assets/images/img174.webp',
'Sophia':'assets/images/img175.webp',
'Talia':'assets/images/img176.webp',
'Theo':'assets/images/img177.webp',
'Thomas':'assets/images/img178.webp',
'Valeria':'assets/images/img179.webp',
'Victor':'assets/images/img180.webp',
'Zuri':'assets/images/img181.webp'
};
const WIN_BANNER_IMAGE='assets/images/img182.webp';
function fitWinBannerText(content){
  const textNode=$('winBannerText'), textPath=$('winBannerTextPath');
  const curve=$('winBannerPath'), measurementText=$('winBannerMeasure');
  const curveCenterX=611, ribbonCenterY=145, maximumTextWidth=735;
  const measurementSize=100, smallestSupportedTextSize=18, smallCalibrationTextSize=48;
  const baselineCompensation=.34, normalWidthCharacterLimit=15, maximumSize=178;
  const largeVertical=9, largeCurve=66, smallVertical=12, smallCurve=84;
  const interpolate=(a,b,t)=>a+(b-a)*t;
  textPath.textContent=content;
  measurementText.textContent=content;
  measurementText.setAttribute('font-size',measurementSize);
  requestAnimationFrame(()=>{
    const measured=measurementText.getComputedTextLength();
    let idealSize;
    if(content.length>normalWidthCharacterLimit){
      measurementText.textContent=content.slice(0,normalWidthCharacterLimit);
      const firstFifteenWidth=measurementText.getComputedTextLength();
      idealSize=firstFifteenWidth>0?measurementSize*maximumTextWidth/firstFifteenWidth:maximumSize;
    }else idealSize=measured>0?measurementSize*maximumTextWidth/measured:maximumSize;
    const fitted=Math.max(smallestSupportedTextSize,Math.min(maximumSize,idealSize));
    textNode.setAttribute('font-size',fitted.toFixed(2));
    let horizontalScale=1;
    if(content.length>normalWidthCharacterLimit&&measured>0){
      const naturalWidth=measured*fitted/measurementSize;
      horizontalScale=Math.min(1,maximumTextWidth/naturalWidth);
    }
    const layoutWidth=maximumTextWidth/horizontalScale+20;
    const layoutLeft=curveCenterX-layoutWidth/2, layoutRight=curveCenterX+layoutWidth/2;
    if(horizontalScale<.999) textNode.setAttribute('transform',`translate(${curveCenterX} 0) scale(${horizontalScale.toFixed(5)} 1) translate(${-curveCenterX} 0)`);
    else textNode.removeAttribute('transform');
    measurementText.textContent=content;
    const range=Math.max(1,maximumSize-smallCalibrationTextSize);
    const amount=Math.max(0,Math.min(1,(fitted-smallCalibrationTextSize)/range));
    const verticalAdjustment=interpolate(smallVertical,largeVertical,amount);
    const curveDepth=interpolate(smallCurve,largeCurve,amount);
    const middleBaseline=ribbonCenterY+fitted*baselineCompensation+verticalAdjustment;
    const endpointY=middleBaseline-curveDepth/2;
    curve.setAttribute('d',`M ${layoutLeft.toFixed(2)} ${endpointY.toFixed(2)} Q ${curveCenterX} ${(endpointY+curveDepth).toFixed(2)} ${layoutRight.toFixed(2)} ${endpointY.toFixed(2)}`);
  });
}
function celebrateWin(winner){
  const persona=personaFor(winner);
  /* An uploaded photo never gets the special full-art hero treatment -- that's reserved for
     the built-in cast. Without this check, a player who uploads their own photo and happens
     to type a display name that matches one of those characters (Emma, Daniel, George...)
     would see that character's hero splash art instead of their own photo, since heroName
     falls back to the player's own name when there's no charName to use instead. Uploaded
     photos always get the circle portrait + name banner below it, no matter what name is typed. */
  const heroName=(persona && !persona.uploaded) ? (persona.charName || persona.name) : null;
  const hero=heroName ? WIN_HERO_IMAGES[heroName] : null;
  /* The human normally uses friendly "You" phrasing during play, but the winner ribbon
     honors a custom name when one has been entered. */
  const wn=(isYou(winner) ? myName : moverName(winner) || 'YOU').trim();
  const winLabel=/^you$/i.test(wn) ? 'YOU WIN!' : (wn+' WINS!').toUpperCase();
  /* Both branches now share the same wrap and the same banner graphic -- the only thing that
     changes is whether the image inside gets the circle-crop gold ring (an ordinary photo,
     no baked-in frame of its own) or renders as-is (hero art already comes fully framed). */
  $('winPortraitBox').style.display='none'; $('winRibbonWrap').style.display='none';
  $('winHeroWrap').style.display='';
  $('winHeroWrap').classList.toggle('portrait', !hero);
  $('winHeroImg').src=hero || avatarSrcFor(winner);
  $('winBannerImg').src=WIN_BANNER_IMAGE;
  fitWinBannerText(winLabel);
  const hi=Math.max(S.p,S.a), lo=Math.min(S.p,S.a);
  $('winScoreLine').innerHTML='<b>'+fmt(hi)+'</b> <span class="vs">TO</span> <b>'+fmt(lo)+'</b>';
  startConfetti();
  $('winScreen').classList.add('on');
}
$('winPlayAgainBtn').onclick=()=>{ clearTimeout(demoContinueTimer); $('winScreen').classList.remove('on'); stopConfetti(); playAgainSameMode(); };
$('winMainMenuBtn').onclick=()=>{ clearTimeout(demoContinueTimer); $('winScreen').classList.remove('on'); stopConfetti(); backToMainMenu(); };



/* ---------------- stage: one fixed layout, scaled to fill ---------------- */
function fit(){
  const cs=getComputedStyle(document.documentElement);
  const W=parseFloat(cs.getPropertyValue('--baseW')), H=parseFloat(cs.getPropertyValue('--baseH'));
  const st=document.querySelector('.stage');
  const vw=st.clientWidth||innerWidth, vh=st.clientHeight||innerHeight;
  if(!vw||!vh) return;
  const k=Math.min(vw/W, vh/H);
  /* place it by hand: a scaled element keeps its old layout box, so grid/flex
     centring clips it instead of centring what you actually see */
  const x=(vw-W*k)/2, y=(vh-H*k)/2;
  $('cab').style.transform='translate('+x.toFixed(2)+'px,'+y.toFixed(2)+'px) scale('+k.toFixed(5)+')';
}
addEventListener('resize',fit);
addEventListener('orientationchange',()=>setTimeout(fit,120));
if(window.ResizeObserver) new ResizeObserver(fit).observe(document.querySelector('.stage'));
if(document.fonts&&document.fonts.ready) document.fonts.ready.then(fit);
fit();

/* ---------------- menu ---------------- */
/* Once a real turn is underway, switching game modes or changing your avatar/name from the
   burger menu would silently corrupt the match in progress (or just look like a glitch, as
   with the avatar swapping mid-game). Both stay locked until the match actually ends -- via
   the endgame screen's own Play Again / Main Menu buttons, which reset S.turn to null again. */
function gameInProgress(){ return !!inGameSession; }
function refreshMenuLockState(){
  const locked=gameInProgress();
  ['menuNewGame','menuVsComputer','menuPassPlay','menuAiVsAi'].forEach(id=>{
    const el=$(id); el.classList.toggle('locked',locked); el.disabled=locked;
  });
  $('playLockNote').style.display=locked?'':'none';
  if(locked) closeNewGameOptions();
  ['openAvatarWheelBtn','openAvatarWheelBtnP2','awPeelBtn'].forEach(id=>{
    const el=$(id); el.classList.toggle('locked',locked); el.disabled=locked;
  });
  $('avatarLockNote').style.display=locked?'':'none';
}
/* Each of these touches a different part of the menu (rules inputs, the physics
   preview, avatar swatches, the photo row, lock state). None of them should be
   able to take the whole menu down with them -- if one throws, the rest still
   run and the menu still opens and stays usable. */
const openMenu  = ()=>{
  const steps=[refreshRuleInputs, refreshPhysicsControls, refreshAvatarColorSwatches, refreshPfpRow, refreshMenuLockState];
  for(const step of steps){
    try{ step(); }catch(e){ console.error('openMenu: '+step.name+' failed', e); }
  }
  $('menu').classList.add('on');
};
const closeMenu = ()=>{ $('menu').classList.remove('on'); closeNewGameOptions(); closeAdvancedScreen(); closeScoringRulesScreen(); };
/* ---------------- your avatar: choose any original persona or newer portrait -- */
const pfpRowEl=$('pfpRow');
/* Which profile is being edited right now: 'you' (Main Menu's avatar) or 'p2' (Pass & Play's
   second player, set from the New Game screen). Every function below that used to touch
   myProfile/myName/avatarColor directly now goes through these instead, so the exact same
   wheel, color swatches, and upload flow work for either player without duplicating any of it. */
function activeProfile(){ return avatarWheelTarget==='you' ? myProfile : p2Profile; }
function setActiveProfile(p){ if(avatarWheelTarget==='you') myProfile=p; else p2Profile=p; }
function activeSeat(){ return avatarWheelTarget==='you' ? 'you' : 'sol'; }
function activeColor(){ return avatarWheelTarget==='you' ? avatarColor : p2AvatarColor; }
function setActiveColor(c){ if(avatarWheelTarget==='you') avatarColor=c; else p2AvatarColor=c; }
function activeDisplayName(){ return avatarWheelTarget==='you' ? myName : (p2Name||'Player 2'); }
function setMyAvatar(p){
  const prof={name:activeDisplayName(),charName:p.name,color:p.color,bg:p.bg||p.color,defaultBg:p.bg||p.color,avatar:p.avatar,expr:p.expr||null};
  setActiveProfile(prof); setActiveColor(prof.bg);
  refreshPfpRow(); refreshAvatarColorSwatches(); refreshSeatAvatars();
  $('youlabel').textContent=seatLabel('you'); $('sollabel').textContent=seatLabel('sol');
  if(typeof refreshAwPreview==='function') refreshAwPreview();
}
function addAvatarThumb(p){
  const img=document.createElement('img'); img.className='pfpThumb'; img.src=p.avatar; img.alt=p.name; img.title=p.name; img.style.backgroundColor=p.bg||p.color||'#26333D'; img.onclick=()=>setMyAvatar(p); pfpRowEl.appendChild(img);
}
function buildPfpRow(){
  pfpRowEl.innerHTML=''; const none=document.createElement('div'); none.className='pfpThumb none'; none.textContent='\u2014'; none.title='No avatar';
  none.onclick=()=>{setActiveProfile(null);setActiveColor(null);refreshPfpRow();refreshAvatarColorSwatches();refreshSeatAvatars();}; pfpRowEl.appendChild(none);
  PERSONAS.forEach(p=>addAvatarThumb({name:p.name,color:p.color,bg:p.color,avatar:p.avatar,expr:p.expr})); NEW_AVATARS.forEach(addAvatarThumb);
}
buildPfpRow();
function refreshPfpRow(){ const p=activeProfile(); [...pfpRowEl.children].forEach(el=>{const isNone=el.classList.contains('none'); const matches=isNone?p===null:(p&&p.avatar===el.src); el.classList.toggle('selected',!!matches);}); }
$('pfpUploadBtn').onclick=()=>$('pfpUpload').click(); $('pfpClearBtn').onclick=()=>{setActiveProfile(null);setActiveColor(null);refreshPfpRow();refreshAvatarColorSwatches();refreshSeatAvatars();$('youlabel').textContent=seatLabel('you');$('sollabel').textContent=seatLabel('sol');if(typeof refreshAwPreview==='function')refreshAwPreview();};
$('pfpUpload').addEventListener('change',e=>{
  const files=[...e.target.files]; if(!files.length) return;
  const baseCount=uploadedPhotos.length;   /* fixed up front so each file's "Photo N" name stays correct and stable, regardless of which one's FileReader/Image decode happens to finish first */
  let done=0, firstEntry=null;
  files.forEach((file,i)=>{
    const reader=new FileReader();
    reader.onload=ev=>{ const img=new Image(); img.onload=()=>{
      const size=300,canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;
      const ctx=canvas.getContext('2d');
      const scale=Math.max(size/img.width,size/img.height),w=img.width*scale,h=img.height*scale;
      ctx.drawImage(img,(size-w)/2,(size-h)/2,w,h);
      const dataUrl=canvas.toDataURL('image/png');
      const flat={Default:dataUrl,Thinking:dataUrl,Confident:dataUrl,Excited:dataUrl,Surprised:dataUrl,Worried:dataUrl,Disappointed:dataUrl};
      const fallbackColor=activeColor()||youColor;
      const entry={name:'Photo '+(baseCount+i+1),color:fallbackColor,bg:fallbackColor,defaultBg:fallbackColor,avatar:dataUrl,expr:flat,uploaded:true};
      uploadedPhotos.push(entry);
      if(i===0) firstEntry=entry;
      done++;
      if(done===files.length){   /* one batch refresh once every file in this pick has finished decoding, not one per file */
        const applied=firstEntry||entry;   /* if the very first file somehow failed to decode, fall back to whichever did */
        setActiveProfile({name:activeDisplayName(),color:applied.color,bg:applied.bg,defaultBg:applied.defaultBg,avatar:applied.avatar,expr:applied.expr});
        refreshPfpRow();refreshAvatarColorSwatches();refreshSeatAvatars();$('youlabel').textContent=seatLabel('you');$('sollabel').textContent=seatLabel('sol');if(typeof refreshAwPreview==='function')refreshAwPreview();
        if($('awScreen').classList.contains('on')){ awMode='uploaded'; awApplyFilters(applied.name); }
      }
    }; img.src=ev.target.result; };
    reader.readAsDataURL(file);
  });
  e.target.value='';
});
/* ---------------- avatar background color choices ---------------- */
const youColorSwatchesEl=$('youColorSwatches'); let avatarColor=null;
function refreshAvatarColorSwatches(){
  youColorSwatchesEl.innerHTML=''; const options=[]; const p=activeProfile();
  if(p&&p.defaultBg) options.push({color:p.defaultBg,label:'Default'});
  YOU_SWATCHES.forEach(c=>options.push({color:c,label:c}));
  options.forEach(o=>{const s=document.createElement('div');s.className='colorSwatch';s.style.background=o.color;s.dataset.color=o.color;s.title=o.label;
    s.onclick=()=>{ setActiveColor(o.color); const cur=activeProfile(); if(cur)cur.bg=o.color; refreshAvatarColorSwatches(); applyAvatarBackground(activeSeat()); applySeatColors(); awPreviewColorOnWheel(o.color); };
    youColorSwatchesEl.appendChild(s);});
  const cp=activeProfile();
  [...youColorSwatchesEl.children].forEach(s=>s.classList.toggle('selected',s.dataset.color===(activeColor()||(cp&&cp.bg)||youColor)));
}
/* Live preview: paint every avatar currently visible in the wheel with the newly picked color,
   so the user can see how it looks on whichever character they're browsing, not just their own pick. */
function awPreviewColorOnWheel(color){ if(typeof awItemEls==='undefined') return; awItemEls.forEach(el=>{ if(el) el.style.backgroundColor=color; }); }
function refreshYouColorSwatches(){refreshAvatarColorSwatches();}
refreshAvatarColorSwatches();

/* ================= Avatar wheel picker ================= *
 * A circular "reel" of every avatar (the 10 premium personas, each with several
 * expressions, followed by the 30 single-portrait characters). Only the top half
 * of the circle pokes up above the bottom of the screen -- the circle's own centre
 * sits right on the stage's bottom edge, which is also where the hub buttons live.
 * Drag (or flick) sideways to spin it; whichever avatar lands at the top is the
 * one "Select" will use. Premium avatars flip through their other expressions on
 * their own when left alone, and once on a tap. */
const AW_FEMALE_NAMES=new Set(['Olivia','Charlotte','Grace','Amelia','Emma','Aisha','Camila','Elena','Evelyn','Fatima','Ingrid','Lucia','Mara','Nadia','Naomi','Priya','Sophia','Talia','Anaya','Elsie','Hana','Maya','Zuri','Amina','Keira','Layla','Mei','Valeria']);
const AW_CHILD_NAMES=new Set(['Anaya','Caleb','Eli','Elsie','Finn','Hana','Leo','Maya','Zuri','Amina','Arjun','Kai','Keira','Layla','Malik','Mei','Nico','Owen','Theo','Valeria']);
const AW_SENIOR_NAMES=new Set(['Evelyn','George','Lucia','Naomi','Omar']);
const AW_ALL_ITEMS = [
  ...PERSONAS.map(p=>({name:p.name,color:p.color,bg:p.color,avatar:(p.expr&&p.expr.Default)||p.avatar,expr:p.expr||null,premium:!!(p.expr)})),
  ...NEW_AVATARS.map(p=>({name:p.name,color:p.color,bg:p.bg||p.color,avatar:p.avatar,expr:null,premium:false}))
].map(it=>({...it,gender:AW_FEMALE_NAMES.has(it.name)?'female':'male',age:AW_CHILD_NAMES.has(it.name)?'children':(AW_SENIOR_NAMES.has(it.name)?'seniors':'adults')}));
const AW_PREMIUM_ITEMS=AW_ALL_ITEMS.filter(it=>it.premium), AW_STANDARD_ITEMS=AW_ALL_ITEMS.filter(it=>!it.premium);
let awMode='all', awGender='all', awAge='all';
let uploadedPhotos=[];   /* each upload becomes its own browsable entry once at least one photo exists */
let awItems=AW_ALL_ITEMS;
let AW_N=awItems.length;
let AW_STEP=360/AW_N;    // the REAL angle between neighboring avatars -- must always be exactly 360/N or their
                          // positions scatter unevenly around the circle (gaps, collisions, wrong-avatar snapping)
let AW_WINDOW=AW_STEP*2.5;   // how far (in real degrees) a neighbor can be before it's hidden -- a small
                              // multiple of the real step, so only ~1 neighbor shows on each side no matter how
                              // many total avatars are in the list
function awRecalcGeometry(){ AW_STEP=360/AW_N; AW_WINDOW=AW_STEP*2.5; }
const AW_VIS_R=190;      // fixed pixel radius used only for the visual dome shape -- independent of AW_STEP/AW_N
const AW_MIN_SCALE=0.32, AW_MAX_SCALE=2.3;
let awRotation=0, awVelocity=0, awDragging=false, awMoved=false, awDownTarget=null, awDragStartX=0, awDragStartY=0, awDragStartRotation=0,
    awLastX=0, awLastT=0, awLastVX=0, awRafId=null, awTopIndex=-1, awExprTimer1=null, awExprTimer2=null;

const awStageEl=$('awStage'), awWheelEl=$('awWheel'), awSelectBtn=$('awSelectBtn'),
      awPremiumBtn=$('awPremiumBtn'), awGenderBtn=$('awGenderBtn'), awAgeBtn=$('awAgeBtn'), awPeelNameEl=$('awPeelName');
let awItemEls=[];
function buildAwWheel(){
  awWheelEl.innerHTML=''; awItemEls=[];
  awItems.forEach((it,i)=>{
    const el=document.createElement('div'); el.className='awItem'+(it.premium?' premium':''); el.dataset.awIndex=i;
    el.style.backgroundColor=it.bg||it.color||'#26333D';
    const img=document.createElement('img'); img.src=it.avatar; img.alt=it.name; el.appendChild(img);
    awWheelEl.appendChild(el); awItemEls.push(el);
  });
}
buildAwWheel();
const awNormalize=deg=>{ deg=deg%360; if(deg>180)deg-=360; if(deg<-180)deg+=360; return deg; };

function awLayout(){
  let bestI=-1, bestAbs=999;
  for(let i=0;i<AW_N;i++){
    const theta=awNormalize(i*AW_STEP+awRotation), abs=Math.abs(theta), el=awItemEls[i];
    if(abs>AW_WINDOW){ el.style.display='none'; continue; }
    el.style.display='';
    const t=Math.min(1,abs/AW_WINDOW), ang=t*(Math.PI/2), sign=theta<0?-1:1;
    const x=AW_VIS_R*Math.sin(ang)*sign, rise=AW_VIS_R*Math.cos(ang);
    const scale=AW_MIN_SCALE+(AW_MAX_SCALE-AW_MIN_SCALE)*Math.cos(ang);
    const opacity=t>0.88 ? Math.max(0,1-(t-0.88)/0.12) : 1;
    el.style.transform='translate('+x+'px,'+(-rise)+'px) scale('+scale+')';
    el.style.zIndex=Math.round(1000-abs);
    el.style.opacity=opacity;
    if(abs<bestAbs){ bestAbs=abs; bestI=i; }
  }
  if(bestI!==awTopIndex){ const prev=awTopIndex; awTopIndex=bestI; awOnTopChanged(prev); }
}
function awOnTopChanged(prevIndex){
  awItemEls.forEach((el,i)=>el.classList.toggle('top',i===awTopIndex));
  if(prevIndex>=0 && awItemEls[prevIndex]){
    const prevIt=awItems[prevIndex], prevImg=awItemEls[prevIndex].querySelector('img');
    if(prevImg) prevImg.src=prevIt.avatar;
  }
  awStopExprCycle();
  if(awTopIndex<0) return;
  const it=awItems[awTopIndex];
  if(awPeelNameEl) awPeelNameEl.textContent=it.name;
  if(it.premium) awStartExprCycle();
}

/* ---- premium avatars: cycle through their other expressions when idle,
   or once immediately on tap, always resting back on Default in between ---- */
function awShowExpr(key){
  const it=awItems[awTopIndex]; if(!it) return;
  const img=awItemEls[awTopIndex] && awItemEls[awTopIndex].querySelector('img');
  if(img) img.src=(it.expr && it.expr[key]) || it.avatar;
}
function awStopExprCycle(){ clearTimeout(awExprTimer1); clearTimeout(awExprTimer2); awExprTimer1=awExprTimer2=null; }
function awStartExprCycle(){
  awShowExpr('Default');
  awExprTimer1=setTimeout(function loop(){
    const it=awItems[awTopIndex]; if(!it || !it.expr) return;
    const keys=Object.keys(it.expr).filter(k=>k!=='Default');
    if(keys.length){ awShowExpr(keys[Math.floor(Math.random()*keys.length)]); }
    awExprTimer2=setTimeout(()=>{ awShowExpr('Default'); awExprTimer1=setTimeout(loop,2000); },1000);
  },2000);
}

/* ---- Three cycling filters. Each button returns to All after its final choice. ---- */
function awFilterLabel(el,title,value){ el.innerHTML='<small>'+title+'</small>'+value; }
function awApplyFilters(preferredName,changedFilter){
  const prior=preferredName || (awItems[awTopIndex]&&awItems[awTopIndex].name);
  if(awMode==='uploaded'&&!uploadedPhotos.length) awMode='all';
  const source = awMode==='uploaded' ? uploadedPhotos : AW_ALL_ITEMS;
  const matches= awMode==='uploaded' ? (()=>true) : (it=>(awMode==='all'||(awMode==='premium')===it.premium)&&(awGender==='all'||it.gender===awGender)&&(awAge==='all'||it.age===awAge));
  awItems=source.filter(matches);
  if(!awItems.length){
    if(changedFilter==='type') awMode='all';
    else if(changedFilter==='gender') awGender='all';
    else if(changedFilter==='age') awAge='all';
    else{ awMode='all'; awGender='all'; awAge='all'; }
    awItems=AW_ALL_ITEMS.filter(it=>(awMode==='all'||(awMode==='premium')===it.premium)&&(awGender==='all'||it.gender===awGender)&&(awAge==='all'||it.age===awAge));
  }
  AW_N=awItems.length; awRecalcGeometry();
  awStopAnim(); awStopExprCycle();
  const startIdx=Math.max(0,awItems.findIndex(it=>it.name===prior));
  awTopIndex=-1; awRotation=-startIdx*AW_STEP;
  buildAwWheel();
  awFilterLabel(awPremiumBtn,'Type',awMode==='all'?'All':(awMode==='premium'?'Premium':(awMode==='standard'?'Standard':'Uploaded')));
  awFilterLabel(awGenderBtn,'Gender',awGender==='all'?'All':(awGender==='male'?'Male':'Female'));
  awFilterLabel(awAgeBtn,'Age',awAge==='all'?'All':(awAge==='children'?'Children':(awAge==='adults'?'Adults':'Seniors')));
  awPremiumBtn.classList.toggle('active', awMode==='premium'||awMode==='uploaded');
  awGenderBtn.classList.toggle('disabled', awMode==='uploaded');
  awAgeBtn.classList.toggle('disabled', awMode==='uploaded');
  awLayout();
}
awPremiumBtn.onclick=()=>{
  const cycle=['all','premium','standard'].concat(uploadedPhotos.length?['uploaded']:[]);
  awMode=cycle[(cycle.indexOf(awMode)+1)%cycle.length];
  awApplyFilters(null,'type');
};
awGenderBtn.onclick=()=>{ if(awMode==='uploaded')return; awGender=awGender==='all'?'male':(awGender==='male'?'female':'all'); awApplyFilters(null,'gender'); };
awAgeBtn.onclick=()=>{ if(awMode==='uploaded')return; awAge=awAge==='all'?'children':(awAge==='children'?'adults':(awAge==='adults'?'seniors':'all')); awApplyFilters(null,'age'); };

/* ---- select ---- */
let awNamePrompted={you:false,p2:false};
function setPlayerNameFromPrompt(){
  const isYouTarget=avatarWheelTarget==='you';
  const current=isYouTarget ? (myName||'You') : (p2Name||'Player 2');
  const n=prompt(isYouTarget ? 'Choose your name' : 'Choose Player 2\u2019s name', current);
  if(n&&n.trim()){
    const val=n.trim().slice(0,18);
    if(isYouTarget){ myName=val; if(myProfile) myProfile.name=myName; $('youlabel').textContent=seatLabel('you'); }
    else{ p2Name=val; if(p2Profile) p2Profile.name=p2Name; $('sollabel').textContent=seatLabel('sol'); }
    refreshAwPreview();
  }
}
awSelectBtn.onclick=()=>{
  const it=awItems[awTopIndex]; if(!it) return;
  setMyAvatar(it);
  const isYouTarget=avatarWheelTarget==='you';
  const needsName = isYouTarget ? /^you$/i.test(myName.trim()) : !p2Name;
  if(needsName && !awNamePrompted[avatarWheelTarget]){ awNamePrompted[avatarWheelTarget]=true; setPlayerNameFromPrompt(); }
  closeAvatarWheel();
};

/* ---- snapping / animation ---- */
function awStopAnim(){ if(awRafId){ cancelAnimationFrame(awRafId); awRafId=null; } }
function awAnimateRotation(target){
  awStopAnim();
  const start=awRotation, dist=target-start, dur=280, t0=performance.now();
  (function step(t){
    const p=Math.min(1,(t-t0)/dur), e=1-Math.pow(1-p,3);
    awRotation=start+dist*e; awLayout();
    awRafId = p<1 ? requestAnimationFrame(step) : null;
  })(t0);
}
function awNearestIndex(){ return (((Math.round(-awRotation/AW_STEP))%AW_N)+AW_N)%AW_N; }
const awSnapToNearest=()=>awSnapTo(awNearestIndex());
function awSnapTo(i){ awAnimateRotation(awRotation-awNormalize(i*AW_STEP+awRotation)); }
function awMomentumStep(){
  awRotation+=awVelocity*16; awVelocity*=0.88; awLayout();
  if(Math.abs(awVelocity)>0.03){ awRafId=requestAnimationFrame(awMomentumStep); }
  else{ awRafId=null; awSnapToNearest(); }
}

/* ---- drag + flick, mouse and touch ----
   Taps are detected manually (rather than relying on the browser's synthetic
   click event) because preventDefault() during a real drag suppresses that
   click entirely on touch devices -- which is also why the hub buttons are
   excluded from starting a drag at all, so their own native clicks work. */
function awPointerX(e){ return e.touches ? e.touches[0].clientX : e.clientX; }
function awPointerY(e){ return e.touches ? e.touches[0].clientY : e.clientY; }
function awPointerDown(e){
  if(e.target.closest('.awHub')||e.target.closest('.awSelectDock')) return;
  awStopAnim(); awStopExprCycle(); awDragging=true; awMoved=false;
  awDownTarget=e.target.closest('.awItem');
  const x=awPointerX(e); awDragStartX=x; awDragStartY=awPointerY(e); awLastX=x; awLastT=performance.now(); awLastVX=0;
  awDragStartRotation=awRotation;
}
function awPointerMove(e){
  if(!awDragging) return;
  const x=awPointerX(e), y=awPointerY(e), dx=x-awDragStartX;
  if(!awMoved && (Math.abs(dx)>6 || Math.abs(y-awDragStartY)>6)) awMoved=true;
  if(awMoved){
    awRotation=awDragStartRotation+dx*(180/(Math.PI*AW_VIS_R));
    const now=performance.now(), dt=now-awLastT;
    if(dt>0){ const instVX=(x-awLastX)/dt; awLastVX=awLastVX*0.6+instVX*0.4; awLastT=now; awLastX=x; }
    awLayout(); if(e.cancelable) e.preventDefault();
  }
}
function awPreviewExpr(){
  const it=awItems[awTopIndex]; if(!it || !it.premium) return;
  awStopExprCycle();
  const keys=Object.keys(it.expr).filter(k=>k!=='Default');
  if(keys.length) awShowExpr(keys[Math.floor(Math.random()*keys.length)]);
  awExprTimer2=setTimeout(()=>{ awShowExpr('Default'); awStartExprCycle(); },1000);
}
function awPointerUp(){
  if(!awDragging) return; awDragging=false;
  if(!awMoved){
    if(awDownTarget){
      const idx=+awDownTarget.dataset.awIndex;
      if(idx===awTopIndex) awPreviewExpr(); else awSnapTo(idx);
    }
    return;
  }
  awVelocity=awLastVX*(180/(Math.PI*AW_VIS_R))*16;
  if(Math.abs(awLastVX)>0.55){ awRafId=requestAnimationFrame(awMomentumStep); }
  else{ awSnapToNearest(); if(awTopIndex>=0 && awItems[awTopIndex].premium) awStartExprCycle(); }
}
awStageEl.addEventListener('mousedown',awPointerDown);
window.addEventListener('mousemove',awPointerMove);
window.addEventListener('mouseup',awPointerUp);
awStageEl.addEventListener('touchstart',awPointerDown,{passive:true});
awStageEl.addEventListener('touchmove',awPointerMove,{passive:false});
awStageEl.addEventListener('touchend',awPointerUp);

/* ---- the little previews shown back in the menus -- Main Menu's for you, New Game's for
   Player 2. Both always refresh together since either one's preview can change independently
   of which target the wheel happens to be editing right now. */
function refreshAwPreview(){
  const img=$('awPreviewImg'), nm=$('awPreviewName');
  if(img&&nm){ img.src = myProfile ? myProfile.avatar : AVATAR_PLACEHOLDER_YOU; nm.textContent = myName; }
  const img2=$('awPreviewImgP2'), nm2=$('awPreviewNameP2');
  if(img2&&nm2){ img2.src = p2Profile ? p2Profile.avatar : AVATAR_PLACEHOLDER_SOL; nm2.textContent = p2Name||'Player 2'; }
}
refreshAwPreview();

/* ---- open / close the wheel screen ---- */
function openAvatarWheel(){
  if(gameInProgress()) return;
  $('awScreen').classList.add('on');
  $('awTitle').textContent = avatarWheelTarget==='you' ? 'Choose Your Avatar' : 'Choose Player 2\u2019s Avatar';
  const p=activeProfile();
  const selected=AW_ALL_ITEMS.find(it=>p&&(it.avatar===p.avatar||(it.expr&&p.expr&&it.expr.Default===p.expr.Default)));
  awApplyFilters(selected&&selected.name);
}
function closeAvatarWheel(){ $('awScreen').classList.remove('on'); awStopAnim(); awStopExprCycle(); }
$('openAvatarWheelBtn').onclick=()=>{ avatarWheelTarget='you'; openAvatarWheel(); };
$('openAvatarWheelBtnP2').onclick=()=>{ avatarWheelTarget='p2'; openAvatarWheel(); };
$('awClose').onclick=closeAvatarWheel;
$('awPeelBtn').onclick=()=>{
  if(gameInProgress()) return;
  setPlayerNameFromPrompt();
};
$('awUploadBtn').onclick=()=>$('pfpUpload').click();
$('awNoneBtn').onclick=()=>{ $('pfpClearBtn').click(); };
$('pfpUpload').addEventListener('change',()=>setTimeout(refreshAwPreview,60));
/* ---------------- opponent picker: full-screen swipeable slides ---------------- */
let oppIndex=0, oppSlides=[];   /* oppSlides[i] = {name, persona} -- persona is null for "Random" */
const OPP_RANDOM_COLOR='#1B2A22';   /* neutral -- "Random" doesn't commit to any one persona's color */
function oppRender(){
  [...$('oppTrack').children].forEach((el,i)=>el.classList.toggle('on',i===oppIndex));
  [...$('oppDots').children].forEach((d,i)=>d.classList.toggle('on',i===oppIndex));
  $('oppPrev').disabled=oppIndex===0;
  $('oppNext').disabled=oppIndex===oppSlides.length-1;
  $('oppChoose').textContent='Choose '+oppSlides[oppIndex].name;
  const s=oppSlides[oppIndex];
  const focusedColor=s.persona?s.persona.color:OPP_RANDOM_COLOR;
  $('oppPicker').style.setProperty('--oppBg',focusedColor);
  $('oppPicker').style.backgroundColor=focusedColor;
}
const openOppPicker = ()=>{
  oppSlides=[{name:'Random',persona:null}, ...PERSONAS.map(p=>({name:p.name,persona:p}))];
  const track=$('oppTrack'), dots=$('oppDots');
  const randomPortrait=PERSONAS.find(p=>p.name==='Alexander')||PERSONAS[0];
  track.innerHTML=''; dots.innerHTML='';
  oppSlides.forEach((s,i)=>{
    const tag=s.persona ? s.persona.bio : 'You won\u2019t know who you\u2019re up against until the dice hit the table. Could be the ice-cold optimal player, could be the one who farkles out chasing one roll too many \u2014 every game, a new face across the felt.';
    const avatarHtml = s.persona && s.persona.avatar
      ? '<img class="oppPortraitLarge" src="'+(s.persona.largeAvatar||s.persona.avatar)+'" alt="'+s.name+'">'
      : '<img class="oppPortraitLarge oppRandomSilhouette" src="'+(randomPortrait.largeAvatar||randomPortrait.avatar)+'" alt="Mystery opponent silhouette">';
    const slide=document.createElement('div');
    slide.className='htpSlide oppSlide';
    const slideColor=s.persona ? s.persona.color : OPP_RANDOM_COLOR;
    slide.style.setProperty('--oppBg',slideColor);
    slide.style.background=slideColor;
    slide.innerHTML=avatarHtml
      +'<div class="oppCopy"><div class="htpHead">'+s.name+'</div>'
      +'<div class="htpText">'+tag+'</div></div>';
    track.appendChild(slide);
    const dot=document.createElement('div');
    dot.className='htpDot'+(i===0?' on':'');
    dot.onclick=()=>{ oppIndex=i; oppRender(); };
    dots.appendChild(dot);
  });
  oppIndex=0;
  oppRender();
  $('oppPicker').classList.add('on');
};
const closeOppPicker = ()=>$('oppPicker').classList.remove('on');
$('oppClose').onclick=()=>{ closeOppPicker(); openNewGameOptions(); };
$('oppPrev').onclick=()=>{ if(oppIndex>0){ oppIndex--; oppRender(); } };
$('oppNext').onclick=()=>{ if(oppIndex<oppSlides.length-1){ oppIndex++; oppRender(); } };
$('oppChoose').onclick=()=>{
  const s=oppSlides[oppIndex];
  closeOppPicker();
  closeMenu();
  pickMode('ai', s.persona||undefined);
};
/* swipe: no live drag-preview (see the How To Play carousel's comment for why),
   just a plain "swiped far enough" check once the finger lifts */
(function(){
  let dragging=false, startX=0, startY=0, dx=0, lockedAxis=null;
  const track=$('oppTrack');
  const onDown=e=>{
    dragging=true; lockedAxis=null; dx=0;
    startX=(e.touches?e.touches[0].clientX:e.clientX);
    startY=(e.touches?e.touches[0].clientY:e.clientY);
  };
  const onMove=e=>{
    if(!dragging) return;
    const x=(e.touches?e.touches[0].clientX:e.clientX);
    const y=(e.touches?e.touches[0].clientY:e.clientY);
    dx=x-startX;
    if(lockedAxis===null && (Math.abs(dx)>6 || Math.abs(y-startY)>6)){
      lockedAxis=Math.abs(dx)>Math.abs(y-startY)?'x':'y';
    }
    if(lockedAxis==='x' && e.cancelable) e.preventDefault();
  };
  const onUp=()=>{
    if(!dragging) return;
    dragging=false;
    const threshold=Math.max(40,track.clientWidth*0.18);
    if(lockedAxis==='x'){
      if(dx<-threshold && oppIndex<oppSlides.length-1) oppIndex++;
      else if(dx>threshold && oppIndex>0) oppIndex--;
      oppRender();
    }
  };
  track.addEventListener('pointerdown',onDown);
  track.addEventListener('pointermove',onMove);
  track.addEventListener('pointerup',onUp);
  track.addEventListener('pointercancel',onUp);
  /* Some embedded/local-file WebViews (a few third-party "open HTML locally" iOS
     apps among them) don't reliably keep dispatching Pointer Events after the very
     first touch gesture. Native touch events are far more universally supported,
     so they're wired in here too as a fallback -- both sets feed the same handlers,
     and onUp's own dragging-state check keeps a duplicate firing from doing
     anything twice. */
  track.addEventListener('touchstart',onDown,{passive:true});
  track.addEventListener('touchmove',onMove,{passive:false});
  track.addEventListener('touchend',onUp);
  track.addEventListener('touchcancel',onUp);
})();
/* Main Menu has no direct exit -- closeMenu() is only ever called internally, when the
   user actively navigates into a game or another screen. No close button, no backdrop-tap-to-dismiss. */

/* ---------------- splash screen ---------------- */
$('splash').onclick=()=>{
  $('splash').classList.add('hide');
  openMenu();   /* Main Menu is the real landing screen -- the board underneath is already set up */
};

/* ---------------- how-to-play: full-screen swipeable slides ----------------
   Each slide is shown/hidden with plain display:none/flex rather than laid out
   side-by-side and shifted with a CSS transform. The transform+flex-row version
   depends on flex percentage sizing and hardware compositing that some embedded
   "open this local HTML file" iOS viewers don't render correctly -- they'd only
   ever paint whichever slide happened to be on screen at load. Toggling display
   is about as basic as CSS gets, so it works even in those. */
const htpSlideEls=[...$('htpTrack').children];
const htpSlideCount=htpSlideEls.length;
let htpIndex=0;
function htpRender(){
  htpSlideEls.forEach((el,i)=>el.classList.toggle('on',i===htpIndex));
  [...$('htpDots').children].forEach((d,i)=>d.classList.toggle('on',i===htpIndex));
  $('htpPrev').disabled=htpIndex===0;
  $('htpNext').textContent=htpIndex===htpSlideCount-1?'Done':'Next';
}
for(let i=0;i<htpSlideCount;i++){
  const d=document.createElement('div');
  d.className='htpDot'+(i===0?' on':'');
  d.onclick=()=>{ htpIndex=i; htpRender(); };
  $('htpDots').appendChild(d);
}
const openHowToPlay=()=>{ htpIndex=0; htpRender(); $('howToPlay').classList.add('on'); };
const closeHowToPlay=()=>$('howToPlay').classList.remove('on');
$('htpClose').onclick=closeHowToPlay;
$('htpPrev').onclick=()=>{ if(htpIndex>0){ htpIndex--; htpRender(); } };
$('htpNext').onclick=()=>{ if(htpIndex<htpSlideCount-1){ htpIndex++; htpRender(); } else closeHowToPlay(); };
/* swipe: no live drag-preview (that needs the transform trick above), just a
   plain "swiped far enough, in this direction" check once the finger lifts */
(function(){
  let dragging=false, startX=0, startY=0, dx=0, lockedAxis=null;
  const track=$('htpTrack');
  const onDown=e=>{
    dragging=true; lockedAxis=null; dx=0;
    startX=(e.touches?e.touches[0].clientX:e.clientX);
    startY=(e.touches?e.touches[0].clientY:e.clientY);
  };
  const onMove=e=>{
    if(!dragging) return;
    const x=(e.touches?e.touches[0].clientX:e.clientX);
    const y=(e.touches?e.touches[0].clientY:e.clientY);
    dx=x-startX;
    if(lockedAxis===null && (Math.abs(dx)>6 || Math.abs(y-startY)>6)){
      lockedAxis=Math.abs(dx)>Math.abs(y-startY)?'x':'y';
    }
    if(lockedAxis==='x' && e.cancelable) e.preventDefault();
  };
  const onUp=()=>{
    if(!dragging) return;
    dragging=false;
    const threshold=Math.max(40,track.clientWidth*0.18);
    if(lockedAxis==='x'){
      if(dx<-threshold && htpIndex<htpSlideCount-1) htpIndex++;
      else if(dx>threshold && htpIndex>0) htpIndex--;
      htpRender();
    }
  };
  track.addEventListener('pointerdown',onDown);
  track.addEventListener('pointermove',onMove);
  track.addEventListener('pointerup',onUp);
  track.addEventListener('pointercancel',onUp);
  /* Same fallback as the opponent-picker carousel: native touch events alongside
     Pointer Events, since this host WebView doesn't keep dispatching pointer
     events reliably past the first swipe. */
  track.addEventListener('touchstart',onDown,{passive:true});
  track.addEventListener('touchmove',onMove,{passive:false});
  track.addEventListener('touchend',onUp);
  track.addEventListener('touchcancel',onUp);
})();

/* ---------------- main menu: play buttons ----------------
   "New Game" is the single entry point; clicking it opens its own full-screen
   page with the three mode choices, rather than expanding inline in the menu
   list, so it reads as a clear step rather than a fold-out section. */
function openNewGameOptions(){ $('newGameScreen').classList.add('on'); }
function closeNewGameOptions(){ $('newGameScreen').classList.remove('on'); }
function openAdvancedScreen(){ $('advancedScreen').classList.add('on'); }
function closeAdvancedScreen(){ $('advancedScreen').classList.remove('on'); }
function openScoringRulesScreen(){ $('scoringRulesScreen').classList.add('on'); }
function closeScoringRulesScreen(){ $('scoringRulesScreen').classList.remove('on'); }
$('mAdvanced').onclick=openAdvancedScreen;
$('advancedScreenClose').onclick=closeAdvancedScreen;
$('mScoringRules').onclick=()=>{ closeAdvancedScreen(); openScoringRulesScreen(); };
$('scoringRulesScreenClose').onclick=()=>{ closeScoringRulesScreen(); openAdvancedScreen(); };
$('menuNewGame').onclick=()=>{ if(gameInProgress())return; openNewGameOptions(); };
$('newGameScreenClose').onclick=closeNewGameOptions;
$('menuVsComputer').onclick=()=>{ if(gameInProgress())return; closeNewGameOptions(); openOppPicker(); };
$('menuPassPlay').onclick=()=>{ if(gameInProgress())return; closeNewGameOptions(); closeMenu(); pickMode('pass'); };
$('menuAiVsAi').onclick=()=>{ if(gameInProgress())return; closeNewGameOptions(); closeMenu(); pickMode('watch'); };
$('menuHowToPlay').onclick=openHowToPlay;

/* ---------------- dice physics tuning menu + live preview ----------------
   A self-contained miniature board that keeps throwing on a loop while this
   menu is open, using the exact same physics as the real game (including the
   per-die decel/magnet jitter), so a slider change is visible on the very
   next throw without having to back out and play a real turn to see it. */
let physPreviewCount=5, physPreviewGen=0;
const openPhysMenu=()=>{ refreshPhysicsControls(); $('physMenu').classList.add('on'); startPhysPreview(); };
const closePhysMenu=()=>{ $('physMenu').classList.remove('on'); stopPhysPreview(); openAdvancedScreen(); };
$('mPhysics').onclick=()=>{ closeAdvancedScreen(); openPhysMenu(); };
$('physClose').onclick=closePhysMenu;
$('physMenu').addEventListener('click',e=>{ if(e.target===$('physMenu')) closePhysMenu(); });

const physCountBtnsEl=$('physCountBtns');
for(let n=1;n<=6;n++){
  const b=document.createElement('button');
  b.className='physCountBtn'+(n===physPreviewCount?' on':'');
  b.textContent=n;
  b.addEventListener('click',()=>{
    physPreviewCount=n;
    [...physCountBtnsEl.children].forEach(c=>c.classList.toggle('on',+c.textContent===n));
    startPhysPreview();   /* restart immediately with the new count, rather than waiting out the current round */
  });
  physCountBtnsEl.appendChild(b);
}

function stopPhysPreview(){ physPreviewGen++; }

async function startPhysPreview(){
  const myGen=++physPreviewGen;
  const arena=$('physPreviewArena');
  while(myGen===physPreviewGen){
    await physPreviewRound(arena,myGen);
    if(myGen!==physPreviewGen) return;
    await new Promise(res=>setTimeout(res,1000));   /* hold the settled result for a second before throwing again */
    if(myGen!==physPreviewGen) return;
  }
}

function physPreviewRound(arena,myGen){
  return new Promise(resolve=>{
    arena.querySelectorAll('.die').forEach(e=>e.remove());
    const tuning=physicsTuning();
    const W=arena.clientWidth,H=arena.clientHeight;
    const SZ=parseFloat(getComputedStyle(arena).getPropertyValue('--die'))||dieSize();
    const cx=W/2,cy=H/2;

    const B=Array.from({length:physPreviewCount},()=>{
      const el=dieEl(1,'inpit');
      el.style.setProperty('--die',SZ+'px');
      arena.appendChild(el);
      const angle=Math.random()*Math.PI*2;
      const speed=tuning.launchSpeed*staggerMul(tuning.launchStagger);
      return {
        el,face:null,
        x:cx+rnd(-16,16)-SZ/2,y:cy+rnd(-16,16)-SZ/2,
        vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,
        q:qRandom(),settled:false,bubbleScale:PHYS_START_BUBBLE_SCALE,
        launchSpeed:speed,age:0,magnetAge:0,
        decelJitter:staggerMul(tuning.decelStagger),dragJitter:staggerMul(tuning.dragStagger),
        magnetStartJitter:staggerMul(tuning.magnetStartStagger),magnetRampJitter:staggerMul(tuning.magnetRampStagger),
        magnetForceJitter:staggerMul(tuning.magnetForceStagger),
        snapping:false,snapFrom:null,snapTo:null,snapElapsed:0,snapJitter:staggerMul(tuning.snapStagger)
      };
    });
    const place=b=>{
      b.el.style.transform=`translate(${b.x.toFixed(1)}px,${b.y.toFixed(1)}px)`;
      b.el._cube.style.transform=matToCss(qToMat(b.q));
    };
    B.forEach(place);

    let lastT=null,startT=null;
    async function finishRound(){
      for(const b of B) b.face=faceUp(qToMat(b.q));
      const faces=B.map(b=>b.face);
      const vf=rollLookup(faces).vf;
      for(const b of B){
        b.el.style.filter='';
        /* same guarantee as the real game: force it perfectly flat right here, preserving
           whatever natural twist it already had, rather than trusting the live physics to
           have already converged all the way to zero tilt. */
        b.q=qNorm(qMul(physicsAlignQuat(b.q),b.q));
        b.el._cube.style.transform=matToCss(qToMat(b.q));
      }
      const delay=tuning.highlightDelayMs;
      if(delay>0) await new Promise(res=>setTimeout(res,delay));
      if(myGen!==physPreviewGen){ resolve(); return; }   /* menu closed during the pause -- bail cleanly */
      for(const b of B) b.el.classList.toggle('dead',!vf[b.face-1]);
      resolve();
    }
    function step(t){
      if(myGen!==physPreviewGen) return;   /* menu closed mid-round -- stop quietly, no resolve needed */
      if(lastT===null){ lastT=t; startT=t; }
      const dt=Math.min((t-lastT)/1000,0.033);
      lastT=t;

      for(const b of B){
        const speed=Math.hypot(b.vx,b.vy);
        b.age+=dt;
        b.bubbleScale=physicsBubbleScale(speed,b.launchSpeed);
        const R=SZ*b.bubbleScale/2;
        const minX=R-SZ/2,maxX=W-R-SZ/2,minY=R-SZ/2,maxY=H-R-SZ/2;
        b.x+=b.vx*dt; b.y+=b.vy*dt;
        const dragT=physicsClamp(b.age/(tuning.decelRampSeconds*b.decelJitter),0,1);
        const progressiveDrag=dragT*dragT*(3-2*dragT);
        const dragPerFrame=physicsMix(PHYS_INITIAL_DRAG,tuning.fullDrag*b.dragJitter,progressiveDrag);
        const decay=Math.pow(1-dragPerFrame,dt*60);
        b.vx*=decay; b.vy*=decay;
        if(b.x<minX){ b.x=minX; b.vx=-b.vx*PHYS_RESTITUTION; }
        if(b.x>maxX){ b.x=maxX; b.vx=-b.vx*PHYS_RESTITUTION; }
        if(b.y<minY){ b.y=minY; b.vy=-b.vy*PHYS_RESTITUTION; }
        if(b.y>maxY){ b.y=maxY; b.vy=-b.vy*PHYS_RESTITUTION; }

        const speedNow=Math.hypot(b.vx,b.vy);
        if(b.snapping){
          b.snapElapsed+=dt;
          const dur=Math.max(0.01,tuning.snapSeconds*b.snapJitter);
          const u=Math.min(1,b.snapElapsed/dur);
          const eu=1-Math.pow(1-u,3);
          b.q=qSlerp(b.snapFrom,b.snapTo,eu);
          b.vx=0; b.vy=0;
          b.settled=u>=1;
          b.bubbleScale=physicsBubbleScale(0,b.launchSpeed);   /* stays at its normal near-rest size -- the group-level check below is what actually removes collision, only once EVERY die is settled */
        }else if(speedNow<PHYS_SNAP_TRIGGER_SPEED){
          b.snapping=true;
          b.snapFrom=b.q;
          b.snapTo=qNorm(qMul(physicsAlignQuat(b.q),b.q));
          b.snapElapsed=0;
          b.vx=0; b.vy=0;
          b.settled=false;
          b.bubbleScale=physicsBubbleScale(0,b.launchSpeed);
        }else{
          const {wn,angle}=physicsTiltOf(b.q);
          const magnetStartSpeed=tuning.magnetStartSpeed*b.magnetStartJitter;
          const magnetRampSeconds=tuning.magnetRampSeconds*b.magnetRampJitter;
          if(speedNow<=magnetStartSpeed) b.magnetAge+=dt; else b.magnetAge=Math.max(0,b.magnetAge-dt*2);
          const magnetT=physicsClamp(b.magnetAge/magnetRampSeconds,0,1);
          const magnetStrength=magnetT*magnetT*(3-2*magnetT);
          if(magnetStrength>0&&angle>1e-4){
            b.vx+=-wn[0]*tuning.magnetForce*b.magnetForceJitter*angle*magnetStrength*dt;
            b.vy+=-wn[1]*tuning.magnetForce*b.magnetForceJitter*angle*magnetStrength*dt;
            const extraDecay=1-Math.min(0.99,magnetStrength*tuning.magnetDragPerSecond*dt);
            b.vx*=extraDecay; b.vy*=extraDecay;
          }
          b.settled=false;
        }
      }

      /* same rule as the real game: collision only disappears for everyone once the whole
         group has actually finished settling, not the instant each one individually does */
      const allSettledThisFrame=B.every(d=>d.settled);

      for(let i=0;i<B.length;i++){
        for(let j=i+1;j<B.length;j++){
          if(allSettledThisFrame) continue;
          const a=B[i],b=B[j];
          let dx=b.x-a.x,dy=b.y-a.y,dist=Math.hypot(dx,dy);
          if(dist<0.0001){ dx=Math.random()-0.5; dy=Math.random()-0.5; dist=Math.hypot(dx,dy)||0.0001; }
          const minDist=SZ*(a.bubbleScale+b.bubbleScale)/2;
          if(dist>=minDist) continue;
          const nx=dx/dist,ny=dy/dist;
          const massA=a.settled?PHYS_SETTLED_MASS:1,massB=b.settled?PHYS_SETTLED_MASS:1;
          const invA=1/massA,invB=1/massB,invSum=invA+invB;
          const overlap=minDist-dist;
          a.x-=nx*overlap*(invA/invSum); a.y-=ny*overlap*(invA/invSum);
          b.x+=nx*overlap*(invB/invSum); b.y+=ny*overlap*(invB/invSum);
          const rA=SZ*a.bubbleScale/2,rB=SZ*b.bubbleScale/2;
          a.x=physicsClamp(a.x,rA-SZ/2,W-rA-SZ/2); a.y=physicsClamp(a.y,rA-SZ/2,H-rA-SZ/2);
          b.x=physicsClamp(b.x,rB-SZ/2,W-rB-SZ/2); b.y=physicsClamp(b.y,rB-SZ/2,H-rB-SZ/2);
          const rvx=b.vx-a.vx,rvy=b.vy-a.vy;
          const velAlongNormal=rvx*nx+rvy*ny;
          if(velAlongNormal<0){
            const impulse=-(1+PHYS_RESTITUTION)*velAlongNormal/invSum;
            a.vx-=impulse*invA*nx; a.vy-=impulse*invA*ny;
            b.vx+=impulse*invB*nx; b.vy+=impulse*invB*ny;
            /* only a genuine impact (real closing velocity) should knock either one out of
               a snap in progress -- a passive overlap between two things already sitting
               still isn't a "hit", and interrupting on that alone is what let two settling
               dice reset each other forever without ever finishing */
            a.settled=false; b.settled=false; a.snapping=false; b.snapping=false;
          }
        }
      }

      for(const b of B){
        const speed=Math.hypot(b.vx,b.vy);
        if(speed>0.02){
          const omega=speed/PHYS_ROLL_RADIUS;
          const dq=qFromAxisAngle(-b.vy,b.vx,0,omega*dt);
          b.q=qNorm(qMul(dq,b.q));
        }
        place(b);
      }

      const elapsed=(t-startT)/1000;
      const ready=B.every(b=>Math.hypot(b.vx,b.vy)<PHYS_SETTLED_SPEED_EPS&&physicsTiltOf(b.q).angle<PHYS_READY_TILT_EPS);
      const readyMaxSeconds=Math.min(12,Math.max(6,5+tuning.decelRampSeconds+tuning.magnetRampSeconds+tuning.snapSeconds));
      if(ready||elapsed>=readyMaxSeconds){ finishRound(); return; }
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  });
}

/* Each of these four settings has two switches on screen -- one in the main menu, one in
   the in-game menu -- since both should be changeable whether or not a game is running.
   Clicking either one flips the shared underlying value and updates both switches to match. */
function syncSw(id,on){ const el=$(id); if(el) el.className='sw'+(on?' on':''); }
$('swHints').onclick=$('swHintsGame').onclick=()=>{
  hints=!hints;
  syncSw('swHints',hints); syncSw('swHintsGame',hints);
  if(S&&S.els.length&&!S.busy) paint();
};
$('swStats').onclick=$('swStatsGame').onclick=()=>{
  stats=!stats;
  syncSw('swStats',stats); syncSw('swStatsGame',stats);
  $('board').className='board'+(stats?'':' nostats');
  if(S&&S.els.length&&!S.busy) paint();
};
$('swAutoGroup').onclick=$('swAutoGroupGame').onclick=()=>{
  groupMode = groupMode==='auto' ? 'manual' : 'auto';
  syncSw('swAutoGroup',groupMode==='auto'); syncSw('swAutoGroupGame',groupMode==='auto');
  if(S&&S.els.length&&!S.busy){ S.sel.clear(); paint(); }
};
$('swBrackets').onclick=$('swBracketsGame').onclick=()=>{
  showBrackets=!showBrackets;
  syncSw('swBrackets',showBrackets); syncSw('swBracketsGame',showBrackets);
  if(S&&S.els.length&&!S.busy) paint();
};
$('swShadeInvalidGame').onclick=()=>{
  shadeInvalid=!shadeInvalid;
  syncSw('swShadeInvalidGame',shadeInvalid);
  if(S&&S.els.length&&!S.busy) paintBrightness();
};
$('swCheatGame').onclick=()=>{ cheatMode=!cheatMode; syncSw('swCheatGame',cheatMode);
  if(awaitingRollOffRedraw){ awaitingRollOffRedraw(); }
  else{ maybeShowRollControl(); }
};

/* ---------------- in-game menu ----------------
   Clicking the burger during a live game opens a short, focused card instead of the full
   main menu (whose mode/rules/avatar controls are locked and unusable mid-game anyway).
   The only way out of a game is the explicit, confirmed End Game action below. */
function closeEndGameConfirm(){ $('menuEndGame').style.display=''; $('endGameConfirm').style.display='none'; }
function openInGameMenu(){
  syncSw('swStatsGame',stats); syncSw('swHintsGame',hints);
  syncSw('swAutoGroupGame',groupMode==='auto'); syncSw('swBracketsGame',showBrackets);
  syncSw('swShadeInvalidGame',shadeInvalid);
  closeEndGameConfirm();
  $('igmBackdrop').classList.add('on');
  $('inGameMenu').classList.add('on');
}
function closeInGameMenu(){ $('igmBackdrop').classList.remove('on'); $('inGameMenu').classList.remove('on'); }
$('igmClose').onclick=closeInGameMenu;
$('igmBackdrop').onclick=closeInGameMenu;
$('menuHowToPlayGame').onclick=openHowToPlay;
$('menuEndGame').onclick=()=>{ $('menuEndGame').style.display='none'; $('endGameConfirm').style.display=''; };
$('endGameNo').onclick=closeEndGameConfirm;
$('endGameYes').onclick=()=>{
  closeEndGameConfirm();
  closeInGameMenu();
  backToMainMenu();   /* resetGameState() (inside chooseMode) bumps gameEpoch, so any in-flight
                          roll or AI turn still finishing up quietly stops touching the board */
};
$('burger').onclick=()=>{ gameInProgress() ? openInGameMenu() : openMenu(); };

function refreshPhysicsControls(){
  const controls=[
    ['physLaunch','launch'],
    ['physDecelRamp','decelRampMs'],
    ['physFullDrag','fullDragTenths'],
    ['physMagnetStart','magnetStart'],
    ['physMagnetRamp','magnetRampMs'],
    ['physMagnetForce','magnetForce'],
    ['physSnapMs','snapMs'],
    ['physHighlightDelay','highlightDelayMs']
  ];
  const staggerControls=[
    ['physLaunchStagger','launchStagger'],
    ['physDecelStagger','decelStagger'],
    ['physDragStagger','dragStagger'],
    ['physMagnetStartStagger','magnetStartStagger'],
    ['physMagnetRampStagger','magnetRampStagger'],
    ['physMagnetForceStagger','magnetForceStagger'],
    ['physSnapStagger','snapStagger']
  ];
  for(const [id,key] of [...controls,...staggerControls]){
    const input=$(id);
    PHYS_CONTROL[key]=+input.value;
    const pct=(+input.value-+input.min)/(+input.max-+input.min)*100;
    input.style.setProperty('--pct',pct.toFixed(2)+'%');
  }
  const tuning=physicsTuning();

  $('physLaunchVal').textContent=fmt(PHYS_CONTROL.launch);
  $('physDecelRampVal').textContent=tuning.decelRampSeconds.toFixed(2)+' s';
  $('physFullDragVal').textContent=(tuning.fullDrag*100).toFixed(1)+'%';
  $('physMagnetStartVal').textContent=fmt(PHYS_CONTROL.magnetStart)+' px/s';
  $('physMagnetRampVal').textContent=tuning.magnetRampSeconds.toFixed(2)+' s';
  $('physMagnetForceVal').textContent=fmt(PHYS_CONTROL.magnetForce);
  $('physSnapMsVal').textContent=tuning.snapSeconds.toFixed(2)+' s';
  $('physHighlightDelayVal').textContent=(PHYS_CONTROL.highlightDelayMs/1000).toFixed(2)+' s';
  for(const [id,key] of staggerControls){
    $(id+'Val').textContent='\u00b1'+PHYS_CONTROL[key]+'%';
  }

  const details={
    physLaunch:'Each die\u2019s own launch speed varies by its stagger amount. The starting collision field is exactly 15% of die width.',
    physDecelRamp:'Natural drag rises progressively from '+(PHYS_INITIAL_DRAG*100).toFixed(1)+'% to '+
      (tuning.fullDrag*100).toFixed(1)+'% per frame over '+tuning.decelRampSeconds.toFixed(2)+' seconds (before that die\u2019s own stagger is applied).',
    physFullDrag:'Maximum natural speed loss after the progressive deceleration has fully developed, before that die\u2019s own stagger is applied.',
    physMagnetStart:'Magnetic correction and extra drag begin at or below '+fmt(PHYS_CONTROL.magnetStart)+' px/s, before that die\u2019s own stagger is applied.',
    physMagnetRamp:'The magnetic field builds from zero to full over '+tuning.magnetRampSeconds.toFixed(2)+' seconds, before that die\u2019s own stagger is applied.',
    physMagnetForce:'Full correction force '+fmt(PHYS_CONTROL.magnetForce)+' \u00b7 about '+
      (tuning.magnetDragPerSecond/60*100).toFixed(1)+'% extra drag per frame, before that die\u2019s own stagger is applied.',
    physSnapMs:'Once travel speed drops below '+PHYS_SNAP_TRIGGER_SPEED+' px/s, the die stops wiggling and cleanly '+
      'rotates the rest of the way flat over '+tuning.snapSeconds.toFixed(2)+' seconds, before that die\u2019s own stagger is applied.',
    physHighlightDelay:'How long after every die has settled before the game reveals which ones are valid to keep.'
  };
  for(const [id] of controls){
    $(id+'Detail').textContent=details[id];
    $(id).setAttribute('aria-valuetext',details[id]);
  }
  refreshPhysExportBox();
}

/* ---------------- export / import physics settings ---------------- */
function refreshPhysExportBox(){
  const box=$('physExportBox');
  if(document.activeElement!==box) box.value=JSON.stringify(PHYS_CONTROL,null,2);
}
$('physCopyBtn').onclick=async()=>{
  refreshPhysExportBox();
  const box=$('physExportBox');
  box.focus(); box.select();
  let copied=false;
  try{
    if(navigator.clipboard&&navigator.clipboard.writeText){
      await navigator.clipboard.writeText(box.value);
      copied=true;
    }
  }catch(e){ /* fall through to the manual-select fallback below */ }
  if(!copied){
    try{ copied=document.execCommand('copy'); }catch(e){}
  }
  $('physExportNote').textContent=copied
    ? 'Copied to clipboard.'
    : 'Couldn\u2019t reach the clipboard automatically \u2014 the text above is already selected, so Ctrl/Cmd+C will copy it.';
};
$('physApplyBtn').onclick=()=>{
  let parsed;
  try{ parsed=JSON.parse($('physExportBox').value); }
  catch(e){ $('physExportNote').textContent='That doesn\u2019t look like valid settings text \u2014 nothing changed.'; return; }
  const allKeys=Object.keys(PHYS_DEFAULTS);
  let applied=0;
  for(const k of allKeys){
    if(typeof parsed[k]==='number'&&isFinite(parsed[k])){ PHYS_CONTROL[k]=parsed[k]; applied++; }
  }
  if(applied===0){ $('physExportNote').textContent='Didn\u2019t recognize any settings in that text \u2014 nothing changed.'; return; }
  syncPhysicsInputsFromControl();
  refreshPhysicsControls();
  startPhysPreview();
  $('physExportNote').textContent='Applied '+applied+' setting'+(applied===1?'':'s')+'.';
};
$('physResetBtn').onclick=()=>{
  Object.assign(PHYS_CONTROL,PHYS_DEFAULTS);
  syncPhysicsInputsFromControl();
  refreshPhysicsControls();
  startPhysPreview();
  $('physExportNote').textContent='Restored the default physics settings.';
};
function syncPhysicsInputsFromControl(){
  const map={
    physLaunch:'launch', physDecelRamp:'decelRampMs', physFullDrag:'fullDragTenths',
    physMagnetStart:'magnetStart', physMagnetRamp:'magnetRampMs', physMagnetForce:'magnetForce',
    physSnapMs:'snapMs', physHighlightDelay:'highlightDelayMs',
    physLaunchStagger:'launchStagger', physDecelStagger:'decelStagger', physDragStagger:'dragStagger',
    physMagnetStartStagger:'magnetStartStagger', physMagnetRampStagger:'magnetRampStagger',
    physMagnetForceStagger:'magnetForceStagger', physSnapStagger:'snapStagger'
  };
  for(const id in map) $(id).value=PHYS_CONTROL[map[id]];
}
let physDebounceTimer=null;
for(const id of ['physLaunch','physDecelRamp','physFullDrag','physMagnetStart','physMagnetRamp','physMagnetForce','physSnapMs','physHighlightDelay',
                  'physLaunchStagger','physDecelStagger','physDragStagger','physMagnetStartStagger',
                  'physMagnetRampStagger','physMagnetForceStagger','physSnapStagger']){
  $(id).addEventListener('input',()=>{
    refreshPhysicsControls();
    /* wait until the slider actually stops moving before restarting the preview --
       restarting on every single 'input' tick would just cut the throw off mid-drag */
    clearTimeout(physDebounceTimer);
    physDebounceTimer=setTimeout(()=>{
      if($('physMenu').classList.contains('on')) startPhysPreview();
    },350);
  });
}
refreshPhysicsControls();

/* ---------------- rules editor ---------------- */
function getPath(o,path){ return path.split('.').reduce((a,k)=>a[k],o); }
function setPath(o,path,v){ const ks=path.split('.'); let t=o; for(let i=0;i<ks.length-1;i++) t=t[ks[i]]; t[ks[ks.length-1]]=v; }
/* Keeps the derived numbers in step with the mode buttons below -- doubling recomputes
   every face's 4/5/6 columns from its own (editable) 3-of-a-kind value; flatUniform copies
   the same three numbers onto every face regardless of what its 3-of-a-kind is worth; the
   ones-mode and four-plus-pair mode don't need any recomputation here since ones3Mode only
   ever sets noak.1.3 directly (see the ones3 buttons), and fourPlusPairPts computes its
   formula live, at scoring time, rather than needing a stored number kept in sync. */
function applyRuleModes(rules){
  if(rules.noakMode==='doubling'){
    for(let f=1;f<=6;f++){
      const base=rules.noak[f][3];
      rules.noak[f][4]=base*2; rules.noak[f][5]=base*4; rules.noak[f][6]=base*8;
    }
  }else if(rules.noakMode==='flatUniform'){
    for(let f=1;f<=6;f++){
      rules.noak[f][4]=rules.noakFlat4; rules.noak[f][5]=rules.noakFlat5; rules.noak[f][6]=rules.noakFlat6;
    }
  }
  /* Applied AFTER the general rule above, as an override -- ones keeps its own escalating
     4/5/6 (the classic default) regardless of what every other face just got set to, rather
     than this only being reachable by switching every face over to Doubling at once. */
  if(rules.ones456Escalate){
    const base=rules.noak[1][3];
    rules.noak[1][4]=base*2; rules.noak[1][5]=base*4; rules.noak[1][6]=base*8;
  }
}
function refreshRuleInputs(){
  applyRuleModes(PENDING_RULES);
  document.querySelectorAll('.redit').forEach(inp=>{ inp.value=getPath(PENDING_RULES,inp.dataset.path); });
  document.querySelectorAll('.modebtn').forEach(btn=>{
    const isOn = btn.dataset.group==='ones3Mode'
      ? PENDING_RULES.noak[1][3] === (btn.dataset.value==='alt' ? 300 : 1000)
      : PENDING_RULES[btn.dataset.group]===btn.dataset.value;
    btn.classList.toggle('on', isOn);
  });
  $('swOnesEscalate').className='sw'+(PENDING_RULES.ones456Escalate?' on':'');
  const noakDerived = PENDING_RULES.noakMode!=='custom';   /* either flatUniform or doubling */
  document.querySelectorAll('[data-path^="noak."]').forEach(inp=>{
    const [,face,col]=inp.dataset.path.split('.');
    const isOnesEscalated = +face===1 && PENDING_RULES.ones456Escalate;
    inp.disabled = (+col>3) && (noakDerived || isOnesEscalated);
  });
  $('noakFlatRow').style.display = PENDING_RULES.noakMode==='flatUniform' ? '' : 'none';
  const formula=PENDING_RULES.fourPlusPairMode==='formula';
  document.querySelector('[data-path="fourPlusPair"]').disabled=formula;
  $('fppBonusRow').style.display=formula?'':'none';
  updateRuleNote();
}
function updateRuleNote(){
  const isDef=JSON.stringify(PENDING_RULES)===JSON.stringify(DEFAULT_RULES);
  $('rnote').innerHTML = isDef
    ? 'Changes apply on your next game. Values snap to the nearest 50.'
    : '<b>Custom rules staged.</b> Your next game uses a computer opponent that maximizes expected points \u2014 win odds and hints aren\u2019t available under custom rules.';
}
document.querySelectorAll('.redit').forEach(inp=>{
  inp.addEventListener('change',()=>{
    let v=Math.round((parseFloat(inp.value)||0)/50)*50;
    v = inp.dataset.path==='winAt' ? Math.max(500,v) : Math.max(0,v);
    setPath(PENDING_RULES, inp.dataset.path, v);
    inp.value=v;
    refreshRuleInputs();
  });
});
document.querySelectorAll('.modebtn').forEach(btn=>{
  btn.onclick=()=>{
    PENDING_RULES[btn.dataset.group]=btn.dataset.value;
    if(btn.dataset.group==='ones3Mode'){
      PENDING_RULES.noak[1][3] = btn.dataset.value==='alt' ? 300 : 1000;
    }
    refreshRuleInputs();
  };
});
$('swOnesEscalate').onclick=()=>{
  PENDING_RULES.ones456Escalate=!PENDING_RULES.ones456Escalate;
  refreshRuleInputs();
};
$('rReset').onclick=()=>{ PENDING_RULES=cloneRules(DEFAULT_RULES); refreshRuleInputs(); };
$('presetClassic').onclick=()=>{ PENDING_RULES=cloneRules(RULE_PRESETS.classic); refreshRuleInputs(); };
$('presetQuick').onclick=()=>{ PENDING_RULES=cloneRules(RULE_PRESETS.quick); refreshRuleInputs(); };
$('presetHighStakes').onclick=()=>{ PENDING_RULES=cloneRules(RULE_PRESETS.highStakes); refreshRuleInputs(); };

/* -- test hooks, harmless in production, used to verify game logic deterministically -- */
window.__dbg = {
  getS: () => S,
  computeGroups, bestAchievable, countsOf, groupScore,
  forceDice: (vals) => {
    S.dice = vals.slice();
    const info = rollLookup(S.dice); S.vf = info.vf;
    S.els.forEach(el=>el.remove());
    S.els = vals.map(f => { const el = dieEl(f, 'inpit ok'); $('arena').appendChild(el); return el; });
    S.pos = vals.map((_,i)=>({x:20+i*60,y:400}));
    S.els.forEach((el,i)=>{ setFace(el, S.dice[i], 0); el.onclick=()=>toggle(i); });
    paint();
  },
  getSelFaces: () => [...S.sel].map(i=>S.dice[i]),
  getGroupMode: () => groupMode,
  setGroupMode: (m) => { groupMode=m; },
  commitSelection: () => { moveToShelf([...window.__dbg.getS().sel]); },
};
newGame();
