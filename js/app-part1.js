// ---- Farkle engine (JS port) ----
// ---- editable scoring rules ----
const DEFAULT_RULES = {
  single1:100, single5:50,
  threePair:1500, twoTrip:2500, straight:1500, fourPlusPair:1500,
  onBoard:500, winAt:10000,
  /* These four control HOW the numbers above and below get used, not what the numbers
     themselves are -- see fourPlusPairPts and applyRuleModes. ones3Mode picks which of
     noak.1.3's two documented values (1000 standard, or 300 as in the Pocket Farkel
     variant) is active; noakMode, when set to 'doubling', overrides the manual 4/5/6
     columns with each face's 3-of-a-kind value doubled, quadrupled, and 8x'd (another
     documented variant) instead of them being independently editable; fourPlusPairMode,
     when set to 'formula', scores 4-of-a-kind-plus-pair as that specific roll's own
     4-of-a-kind value plus fourPlusPairBonus, rather than the flat fourPlusPair number
     above applying the same regardless of which face made the four. */
  ones3Mode:'standard', noakMode:'custom', fourPlusPairMode:'flat', fourPlusPairBonus:500,
  noakFlat4:1000, noakFlat5:2000, noakFlat6:4000, ones456Escalate:true,
  noak:{
    1:{3:1000,4:2000,5:4000,6:8000},
    2:{3:200, 4:1000,5:2000,6:3000},
    3:{3:300, 4:1000,5:2000,6:3000},
    4:{3:400, 4:1000,5:2000,6:3000},
    5:{3:500, 4:1000,5:2000,6:3000},
    6:{3:600, 4:1000,5:2000,6:3000},
  }
};
/* Ready-made scoring spreads for the "Quick Presets" row in the Advanced screen,
   so changing house rules doesn't mean hand-editing thirty fields one at a time.
   These are common house-rule flavors rather than one official standard --
   Farkle scoring varies a lot table to table. */
const RULE_PRESETS = {
  classic: DEFAULT_RULES,
  quick: {
    single1:100, single5:50,
    threePair:1500, twoTrip:2500, straight:1500, fourPlusPair:1500,
    onBoard:300, winAt:5000,
    ones3Mode:'standard', noakMode:'custom', fourPlusPairMode:'flat', fourPlusPairBonus:500,
  noakFlat4:1000, noakFlat5:2000, noakFlat6:4000, ones456Escalate:true,
    noak:{
      1:{3:1000,4:2000,5:4000,6:8000},
      2:{3:200, 4:1000,5:2000,6:3000},
      3:{3:300, 4:1000,5:2000,6:3000},
      4:{3:400, 4:1000,5:2000,6:3000},
      5:{3:500, 4:1000,5:2000,6:3000},
      6:{3:600, 4:1000,5:2000,6:3000},
    }
  },
  highStakes: {
    single1:100, single5:50,
    threePair:2500, twoTrip:4000, straight:2500, fourPlusPair:2500,
    onBoard:1000, winAt:15000,
    ones3Mode:'standard', noakMode:'custom', fourPlusPairMode:'flat', fourPlusPairBonus:500,
  noakFlat4:1000, noakFlat5:2000, noakFlat6:4000, ones456Escalate:true,
    noak:{
      1:{3:1500,4:3000,5:6000,6:12000},
      2:{3:300, 4:1500,5:3000,6:4500},
      3:{3:450, 4:1500,5:3000,6:4500},
      4:{3:600, 4:1500,5:3000,6:4500},
      5:{3:750, 4:1500,5:3000,6:4500},
      6:{3:900, 4:1500,5:3000,6:4500},
    }
  }
};
function cloneRules(r){ return JSON.parse(JSON.stringify(r)); }
let RULES = cloneRules(DEFAULT_RULES);
function isDefaultRules(){ return JSON.stringify(RULES)===JSON.stringify(DEFAULT_RULES); }

function groupScore(v, c){
  if(c===0) return 0;
  let best = -1;
  if(c>=3 && RULES.noak[v][c]>0) best = Math.max(best, RULES.noak[v][c]);
  const single = v===1 ? RULES.single1 : v===5 ? RULES.single5 : 0;
  if(single>0){
    best = Math.max(best, c*single);
    if(c>3 && RULES.noak[v][3]>0) best = Math.max(best, RULES.noak[v][3] + (c-3)*single);
  }
  return best < 0 ? null : best;
}
/* 4-of-a-kind + pair's points depend on which face the 4-of-a-kind is, only when
   fourPlusPairMode is 'formula' -- that specific roll's own 4-of-a-kind value (already
   reflecting noakMode, doubling included) plus the configured bonus, rather than one flat
   number applying the same regardless of which face made the four. Returns null when the
   pattern isn't present or scores nothing. */
function fourPlusPairPts(counts){
  const fourFace = counts.findIndex(c=>c===4);
  if(fourFace<0 || !counts.some(c=>c===2)) return null;
  if(RULES.fourPlusPairMode==='formula'){
    const base = groupScore(fourFace+1,4);
    if(base==null) return null;
    const pts = base + (RULES.fourPlusPairBonus||0);
    return pts>0 ? pts : null;
  }
  return RULES.fourPlusPair>0 ? RULES.fourPlusPair : null;
}

// counts = array of 6 (index 0 => face 1). Score using ALL dice; null if some die can't score.
function scoreAll(counts){
  const k = counts.reduce((a,b)=>a+b,0);
  let base = 0, ok = true;
  for(let i=0;i<6;i++){
    const g = groupScore(i+1, counts[i]);
    if(g===null){ ok=false; break; }
    base += g;
  }
  let best = ok ? base : null;
  if(k===6){
    const sp = [];
    if(counts.every(c=>c===1) && RULES.straight>0) sp.push(RULES.straight);
    if(counts.filter(c=>c===2).length===3 && RULES.threePair>0) sp.push(RULES.threePair);
    if(counts.filter(c=>c===3).length===2 && RULES.twoTrip>0) sp.push(RULES.twoTrip);
    if(counts.some(c=>c===4) && counts.some(c=>c===2)){ const fpp=fourPlusPairPts(counts); if(fpp) sp.push(fpp); }
    for(const s of sp) if(best===null || s>best) best = s;
  }
  return best;
}

// Breakdown of counts into discrete visual/scoring GROUPS (not just a total). Per-face
// groups are evaluated directly; the all-six compound bonuses are only considered when
// exactly 6 dice are present, and only win if they score higher than the per-face total.
// Anything that can't score at all (e.g. a bare pair of 2s) comes back in `dead`.
function computeGroups(counts){
  const k = counts.reduce((a,b)=>a+b,0);
  const faceGroups = [];
  let perFaceTotal = 0;
  const dead = [];
  for(let i=0;i<6;i++){
    if(counts[i]===0) continue;
    const g = groupScore(i+1, counts[i]);
    if(g===null){ dead.push(i+1); continue; }
    /* Below three of a kind, a 1 or a 5 is never "a group" -- each die scores on its
       own and stays its own separate unit. Three or more (or an all-six compound
       below) really are one combined thing. */
    const face=i+1;
    if((face===1||face===5) && counts[i]<3){
      const single = face===1 ? RULES.single1 : RULES.single5;
      for(let n=0;n<counts[i];n++) faceGroups.push({kind:'face', face, count:1, pts:single});
    } else {
      faceGroups.push({kind:'face', face, count:counts[i], pts:g});
    }
    perFaceTotal += g;
  }
  let compound=null;
  if(k===6){
    const sp=[];
    if(counts.every(c=>c===1) && RULES.straight>0) sp.push({kind:'straight',label:'Straight',pts:RULES.straight});
    if(counts.filter(c=>c===2).length===3 && RULES.threePair>0) sp.push({kind:'threePair',label:'3 Pairs',pts:RULES.threePair});
    if(counts.filter(c=>c===3).length===2 && RULES.twoTrip>0) sp.push({kind:'twoTrip',label:'2 Triplets',pts:RULES.twoTrip});
    if(counts.some(c=>c===4) && counts.some(c=>c===2)){ const fpp=fourPlusPairPts(counts); if(fpp) sp.push({kind:'fourPlusPair',label:'4-of-a-kind + Pair',pts:fpp}); }
    for(const s of sp) if(!compound || s.pts>compound.pts) compound=s;
  }
  /* compound is returned even when it's NOT the auto-picked interpretation below, so a
     click on a die that only scores as part of it (e.g. a pair sitting beside a 4-of-a-kind
     worth more on its own) can still fall back to it instead of being silently ignored --
     see toggle(). Taking the compound uses every one of these six dice at once, which is
     exactly what triggers hot dice; skipping it here would quietly take that choice away
     any time the leftover per-face score happens to be worth more. */
  if(compound && compound.pts > perFaceTotal){
    return { groups:[{kind:compound.kind, label:compound.label, allSix:true, pts:compound.pts}], dead:[], compound };
  }
  return { groups: faceGroups, dead, compound };
}
/* For a set of dice that's already been decided -- pending in the current selection, or
   already locked into this commit -- rather than one still being chosen. computeGroups on
   its own always prefers whichever reading scores more, which is exactly right while a
   player is choosing what to select (see toggle()), but wrong here: if the auto-preferred
   reading leaves some of these already-selected dice as "dead" while the compound reading
   would account for every one of them, the compound is the only one that actually explains
   this exact set, and using the higher-scoring-but-partial one would just silently drop
   dice from the visual layout instead. */
function groupsForExactSet(counts){
  const result=computeGroups(counts);
  if(result.dead.length && result.compound){
    return { groups:[{kind:result.compound.kind, label:result.compound.label, allSix:true, pts:result.compound.pts}], dead:[] };
  }
  return result;
}

// True best achievable score from an arbitrary set of dice, searching every legal
// non-empty subset (not just "does this exact set score") -- this is what Bank uses,
// since banking must never leave points on the table just because of what's clicked.
function bestAchievable(counts){
  const {best, bestKeep} = keepOptions(counts);
  let maxScore=-1, maxLeft=null;
  for(const [left,sc] of best) if(sc>maxScore){ maxScore=sc; maxLeft=left; }
  return maxLeft===null ? null : {pts:maxScore, counts:bestKeep.get(maxLeft)};
}

// best points for each possible dice-left value, over all valid non-empty keeps
function keepOptions(counts){
  const n = counts.reduce((a,b)=>a+b,0);
  const best = new Map(); const bestKeep = new Map(); const vf=[false,false,false,false,false,false];
  const sub = [0,0,0,0,0,0];
  (function rec(i){
    if(i===6){
      const ks = sub.reduce((a,b)=>a+b,0);
      if(ks===0) return;
      const sc = scoreAll(sub);
      if(sc===null) return;
      const left = n-ks;
      for(let j=0;j<6;j++) if(sub[j]>0) vf[j]=true;
      if(!best.has(left) || sc > best.get(left)){ best.set(left, sc); bestKeep.set(left, sub.slice()); }
      return;
    }
    for(let c=0;c<=counts[i];c++){ sub[i]=c; rec(i+1); }
    sub[i]=0;
  })(0);
  return {best, bestKeep, vf};
}

function fact(n){ let r=1; for(let i=2;i<=n;i++) r*=i; return r; }

// Build roll tables. ROLLS[n] = [{w, opts:[{left,pts}]}]; CODE maps counts-code -> roll object
// Rebuildable, since editable rules change the points (and therefore the keep options) baked into it.
const ROLLS = [null,[],[],[],[],[],[]];
const CODE = new Map();
function buildRolls(){
  for(let n=1;n<=6;n++) ROLLS[n]=[];
  CODE.clear();
  for(let n=1;n<=6;n++){
    const total = Math.pow(6,n);
    const counts = [0,0,0,0,0,0];
    (function rec(i, rem){
      if(i===5){
        counts[5]=rem;
        let w = fact(n);
        for(const c of counts) w /= fact(c);
        const _k = keepOptions(counts); const om = _k.best, om2 = _k.bestKeep;
        const opts = [...om.entries()].sort((a,b)=>a[0]-b[0])
                      .map(([left,pts])=>({left: left===0?6:left, pi: pts/50, keep: om2.get(left)}));
        const obj = {w: w/total, opts, vf:_k.vf};
        ROLLS[n].push(obj);
        let code=0,p=1; for(let j=0;j<6;j++){ code += counts[j]*p; p*=7; }
        CODE.set(code, obj);
        return;
      }
      for(let c=0;c<=rem;c++){ counts[i]=c; rec(i+1, rem-c); }
      counts[i]=0;
    })(0,n);
  }
}

// ---- endgame DP: G[n][r] = P(gain >= 50r this turn, n dice) ----
const RMAX = 520;
const G = [];
for(let n=0;n<7;n++) G.push(new Float64Array(RMAX+1));
function buildG(){
  for(let n=0;n<7;n++){ G[n].fill(0); G[n][0]=1; }
  for(let r=1;r<=RMAX;r++){
    for(let n=1;n<=6;n++){
      let q=0;
      for(const roll of ROLLS[n]){
        let best=0;
        for(const o of roll.opts){
          const v = (o.pi>=r) ? 1 : G[o.left][r-o.pi];
          if(v>best) best=v;
        }
        q += roll.w*best;
      }
      G[n][r]=q;
    }
    G[0][r]=G[6][r];
  }
}

// ---- score-blind, rules-agnostic "maximize expected points" policy.
// Used as the computer opponent whenever the scoring rules are non-default,
// since the exact win-probability solver below is only valid for DEFAULT_RULES. ----
const EVCAP = 140;                         // turn-total headroom, in 50-point units (7,000 pts)
let EV = null;                             // {E:Float64Array, POL:Uint8Array}
function buildEV(){
  const E = new Float64Array(7*(EVCAP+1)), POL = new Uint8Array(7*(EVCAP+1));
  for(let ti=EVCAP; ti>=0; ti--){
    const bankv = 50*ti;
    for(let n=1;n<=6;n++){
      let q=0;
      for(const roll of ROLLS[n]){
        let best=0;
        for(const o of roll.opts){
          const nt=Math.min(ti+o.pi, EVCAP);
          const v=E[o.left*(EVCAP+1)+nt];
          if(v>best) best=v;
        }
        q += roll.w*best;
      }
      const better = q>bankv;
      E[n*(EVCAP+1)+ti]=better?q:bankv;
      POL[n*(EVCAP+1)+ti]=better?1:0;
    }
    E[0*(EVCAP+1)+ti]=E[6*(EVCAP+1)+ti];
    POL[0*(EVCAP+1)+ti]=POL[6*(EVCAP+1)+ti];
  }
  EV = {E,POL};
}

function rebuildTables(){ buildRolls(); buildG(); buildEV(); }
function setRules(newRules){ RULES = cloneRules(newRules); rebuildTables(); }
rebuildTables();

// ---- game constants ----
const WIN = 10000, NS = 191, TMAX = 100, TE = TMAX+170, STRIDE = TE+1;
const scoreOf = i => i===0 ? 0 : 450+50*i;
const idxOf   = s => s===0 ? 0 : (s-450)/50;

let W = null;
function setW(arr){ W = arr; }              // Float32Array length NS*NS, W[a*NS+b]
const Wv = (a,b) => W[a*NS+b];

function endgameWin(s, b){
  let need = ((s-b)/50|0)+1;
  if(need>RMAX) return 1;
  if(need<1) need=1;
  return 1 - G[6][need];
}

// Solve one turn for the player at score-index ai facing bi.
function turnDP(ai, bi){
  const a = scoreOf(ai), b = scoreOf(bi);
  const fark = 1 - Wv(bi, ai);
  const hv = new Float64Array(TE+1);
  for(let ti=0;ti<=TE;ti++){
    const s = a+50*ti;
    if(ti===0){ hv[ti]=-1; continue; }
    if(a===0 && 50*ti<500){ hv[ti]=-1; continue; }
    hv[ti] = (s>=WIN) ? endgameWin(s,b) : 1 - Wv(bi, (s-450)/50);
  }
  const V = new Float64Array(7*STRIDE);
  const POL = new Uint8Array(7*(TMAX+1));
  for(let n=0;n<7;n++) for(let ti=TMAX+1;ti<=TE;ti++) V[n*STRIDE+ti]=hv[ti];
  for(let ti=TMAX;ti>=0;ti--){
    const bankv = hv[ti];
    for(let n=1;n<=6;n++){
      let q=0;
      for(const roll of ROLLS[n]){
        let best;
        if(roll.opts.length===0) best = fark;
        else{
          best = -1e18;
          for(const o of roll.opts){
            const v = V[o.left*STRIDE + o.pi + ti];
            if(v>best) best=v;
          }
        }
        q += roll.w*best;
      }
      const rollBetter = q > bankv;
      V[n*STRIDE+ti] = rollBetter ? q : bankv;
      POL[n*(TMAX+1)+ti] = rollBetter ? 1 : 0;
    }
    V[0*STRIDE+ti] = V[6*STRIDE+ti];
    POL[0*(TMAX+1)+ti] = POL[6*(TMAX+1)+ti];
  }
  return {V, POL, hv, a, b};
}

function rollLookup(faces){
  const c=[0,0,0,0,0,0];
  for(const f of faces) c[f-1]++;
  let code=0,p=1; for(let j=0;j<6;j++){ code+=c[j]*p; p*=7; }
  return CODE.get(code);
}
