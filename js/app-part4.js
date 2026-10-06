/* Dice Battle uses the original throwDice() physics directly. The board is separate, but the
   die is born in the real #arena, tumbles there, settles, and is then parked in the slot. */
(function(){
  const K={you:[[],[],[]],ai:[[],[],[]],rolled:null,busy:false,turn:'you',over:false,dbl:{you:[false,false,false],ai:[false,false,false]}};
  let MODE='single'; // 'single' = AI opponent (auto-plays); 'multi' = a second person taps their own board/button
  const $k=id=>document.getElementById(id);
  const sleepK=ms=>new Promise(r=>setTimeout(r,ms));
  function score(b){let s=0;for(const c of b){const m={};for(const f of c)m[f]=(m[f]||0)+1;for(const f in m)s+=Number(f)*m[f]*m[f]}return s}
  function colScore(col){const m={};for(const f of col)m[f]=(m[f]||0)+1;let s=0;for(const f in m)s+=Number(f)*m[f]*m[f];return s}
  function full(b){return b.every(c=>c.length===3)}
  function removeMatches(board,col,face){board[col]=board[col].filter(f=>f!==face)}
  function floatNum(cell,text,cls){if(!cell)return;const span=document.createElement('div');span.className='kbFloat '+cls;span.textContent=text;cell.appendChild(span);setTimeout(()=>span.remove(),950)}
  function impactFlash(cell){if(!cell)return;const fl=document.createElement('div');fl.className='kbImpactFlash';cell.appendChild(fl);setTimeout(()=>fl.remove(),420)}
  const GAP=6; // px -- must match the .kbBoard3 CSS gap
  let origViewport=null;
  const MOVE_MS=220;

  // CELLS holds the (permanent) button elements for each board square, split per side now that
  // opponent and you each have their own separate 3x3 board. SLOT holds whichever die SPRITE
  // currently occupies that square, or null -- every rolled die is one physical element, born
  // once in the real tumble physics and kept for its whole life: it's re-parented and glided to
  // wherever it needs to go next, and is only ever actually destroyed if it gets matched out.
  const CELLS={you:[[null,null,null],[null,null,null],[null,null,null]],ai:[[null,null,null],[null,null,null],[null,null,null]]};
  const SLOT={you:[[null,null,null],[null,null,null],[null,null,null]],ai:[[null,null,null],[null,null,null],[null,null,null]]};

  // Smoothly glides the live physics die (same element, never swapped) to a new spot within its
  // CURRENT parent, via one continuous CSS transition -- and always waits slightly longer than
  // the transition itself so the die is fully arrived before anything else touches it.
  function glide(el,x,y,dur,sc){sc=sc||1;return new Promise(res=>{if(!el)return res();el.style.transition=dur?`transform ${dur}ms cubic-bezier(.3,.9,.35,1)`:'none';void el.offsetWidth;el.style.transform=`translate(${x.toFixed(1)}px,${y.toFixed(1)}px) scale(${sc},${sc})`;setTimeout(res,dur?dur+20:0)})}
  // Re-parents a sprite into a new container WITHOUT any visible jump (it's given a transform
  // that keeps it in the exact same on-screen pixel spot, just now measured against its new
  // parent), then glides it on to the real target within that new parent. This is what lets a
  // die move between the tray and either board -- three separate containers -- without needing
  // them to share one coordinate system.
  function moveSprite(sprite,toParent,x,y,dur,sc){const before=sprite.getBoundingClientRect();toParent.appendChild(sprite);const pr=toParent.getBoundingClientRect();sprite.style.transition='none';sprite.style.position='absolute';sprite.style.transform=`translate(${(before.left-pr.left).toFixed(1)}px,${(before.top-pr.top).toFixed(1)}px) scale(1,1)`;void sprite.offsetWidth;return glide(sprite,x,y,dur,sc)}
  // A board3's cells are always equal squares, so once we know the board's own width we can work
  // out any cell's centre with plain arithmetic (3 columns, 2 gaps).
  function board3Size(boardEl){return(boardEl.clientWidth-GAP*2)/3}
  function board3CellXY(boardEl,c,r,dieSize){const s=board3Size(boardEl);return{x:c*(s+GAP)+s/2-dieSize/2,y:r*(s+GAP)+s/2-dieSize/2}}
  function trayXY(dieSize){const tray=$k('kbDieTray');return{x:(tray.clientWidth-dieSize)/2,y:(tray.clientHeight-dieSize)/2}}
  // Keeps the (separate, physics-only) tumble arena visually lined up with the lane column --
  // recomputed on open and on resize, so it always matches the current layout.
  function alignArenaToDieLane(){const lane=document.querySelector('.kbLane'),ar=$k('arena');if(!lane||!ar)return;const lr=lane.getBoundingClientRect();const parent=ar.offsetParent||document.body,pr=parent.getBoundingClientRect();ar.style.left=(lr.left-pr.left)+'px';ar.style.top=(lr.top-pr.top)+'px';ar.style.width=lr.width+'px';ar.style.height=lr.height+'px'}
  // Parks a die sprite as a normal, at-rest board die: once it's an actual child of its .kbCell,
  // the "!important" cell rules take over its position (no transform needed), so as long as it
  // was already visually sitting there (the glide already put it there) nothing appears to move.
  function settleSprite(sprite,side,col,row){sprite.classList.remove('held','inpit');sprite.style.transition='';sprite.style.transform='';sprite.style.position='';sprite.style.zIndex='';sprite.style.pointerEvents='';CELLS[side][col][row].appendChild(sprite);SLOT[side][col][row]=sprite}
  // Pulls an already-resting sprite back into free-floating mode (without moving it visually)
  // and glides it to a different cell on the SAME board -- used only to smoothly re-settle a
  // surviving die that has to shift down a slot because a die below it got matched out.
  function repositionSprite(sprite,side,col,row){const board=$k(side==='ai'?'kbAiBoard3':'kbYouBoard3');const{x,y}=board3CellXY(board,col,row,sprite.offsetWidth);moveSprite(sprite,board,x,y,reduced?0:MOVE_MS).then(()=>settleSprite(sprite,side,col,row))}
  // The only place a die sprite actually gets destroyed: called once its shatter animation has
  // had time to play out.
  function destroySlot(side,col,row,delay){const cell=CELLS[side][col][row];const sp=SLOT[side][col][row];SLOT[side][col][row]=null;setTimeout(()=>{if(sp)sp.remove();if(cell)cell.classList.remove('kbShatter')},delay)}
  function clearBoard(){for(const side of['you','ai'])for(let c=0;c<3;c++)for(let r=0;r<3;r++){const sp=SLOT[side][c][r];if(sp)sp.remove();SLOT[side][c][r]=null}}
  function buildBoard(){
    for(const side of['ai','you']){
      const board=$k(side==='ai'?'kbAiBoard3':'kbYouBoard3');
      board.querySelectorAll('.kbCell').forEach(e=>e.remove());
      for(let c=0;c<3;c++)for(let r=0;r<3;r++){
        const cell=document.createElement('button');cell.type='button';cell.className='kbCell';
        cell.style.gridColumn=String(c+1);cell.style.gridRow=String(r+1);
        cell.addEventListener('click',()=>{if(side==='you'||MODE==='multi')placeDie(side,c)});
        board.appendChild(cell);CELLS[side][c][r]=cell;SLOT[side][c][r]=null;
      }
    }
  }
  // render() only ever touches CELL styling (double-glow / dimmed-empty classes), the score
  // text, the status line, and which end of the lane the tray sits at -- it never creates,
  // removes, or reflows a die sprite, so calling it freely never disturbs what's already
  // resting on either board.
  function render(){
    for(const side of['you','ai']){const b=K[side];
      for(let c=0;c<3;c++){const counts={};b[c].forEach(f=>counts[f]=(counts[f]||0)+1);const isDbl=Object.values(counts).some(n=>n>=2);const firstTime=isDbl&&!K.dbl[side][c];K.dbl[side][c]=isDbl;
        for(let r=0;r<3;r++){const cell=CELLS[side][c][r];
          if(r<b[c].length){cell.classList.remove('disabled');const sp=SLOT[side][c][r];if(sp){sp.classList.remove('kbDoubleBling','kbDoubleSteady');if(counts[b[c][r]]>=2)sp.classList.add(firstTime?'kbDoubleBling':'kbDoubleSteady')}}
          else{cell.classList.toggle('disabled',!(side==='you'||MODE==='multi')||K.turn!==side||K.busy||K.rolled==null||K.over)}}}}
    const ys=score(K.you),as=score(K.ai);
    $k('kbYouScore').textContent=ys;$k('kbAiScore').textContent=as;
    $k('kbYouScore').classList.toggle('kbTurnOn',K.turn==='you'&&!K.over);
    $k('kbAiScore').classList.toggle('kbTurnOn',K.turn==='ai'&&!K.over);
    updateScoreOrientation();
    $k('kbRoll').disabled=K.busy||K.turn!=='you'||K.rolled!=null||K.over;
    $k('kbAiRoll').disabled=!(MODE==='multi')||K.busy||K.turn!=='ai'||K.rolled!=null||K.over;
    $k('kbStatus').textContent=K.over?'GAME OVER':MODE==='multi'?(K.rolled==null?'ROLL THE DIE':'CHOOSE A COLUMN'):(K.turn==='you'?(K.rolled==null?'ROLL THE DIE':'CHOOSE A COLUMN'):'OPPONENT TURN');
    const tray=$k('kbDieTray');
    tray.classList.toggle('pos-ai',K.turn==='ai');
    tray.classList.toggle('pos-you',K.turn==='you');
  }
  function chooseAI(face){let best=0,bs=-1e9;for(let c=0;c<3;c++){if(K.ai[c].length>=3)continue;let own=K.ai[c].filter(f=>f===face).length,kill=K.you[c].filter(f=>f===face).length;let v=own*face*5+kill*face*3+Math.random();if(v>bs){bs=v;best=c}}return best}
  // The logo + score row flip together as one group, but never by smoothly rotating -- that read
  // as an unwanted spinning animation. Instead: fade the group out, snap it straight to the new
  // orientation while it's invisible, then fade back in. Only runs when the orientation actually
  // needs to change, so it doesn't refade on every render() call.
  function updateScoreOrientation(){
    const grp=$k('kbDividerRow');
    const wantFlipped=MODE==='multi'&&K.turn==='ai';
    if(grp.classList.contains('kbFlipped')===wantFlipped)return;
    if(reduced){grp.classList.toggle('kbFlipped',wantFlipped);return}
    grp.style.opacity='0';
    setTimeout(()=>{
      grp.classList.toggle('kbFlipped',wantFlipped);
      void grp.offsetWidth;
      grp.style.opacity='1';
    },250);
  }

  // Rolls the real physics die (same tumble/settle engine the main game uses) and glides the
  // settled sprite into the shared tray, which itself just slides to whichever end of the lane
  // matches whose turn it is.
  async function roll(side){
    if(K.busy||K.rolled!=null||K.over||K.turn!==side)return;
    K.busy=true;render();
    S.busy=true;S.n=1;S.dice=[];S.sel.clear();S.els=[];S.heldEls=[];S.heldVals=[];S.heldGroups=[];
    const faces=await throwDice(1,false,[side==='you'?'kbDie':'kbAiDie'],false);
    const face=faces[0],el=S.els[0];
    if(!el){K.busy=false;S.busy=false;render();return}
    K.rolled=face;
    el.classList.add('held');el.style.zIndex=75;el.style.pointerEvents='none';
    setFace(el,face,0);
    const{x,y}=trayXY(el.offsetWidth);
    await moveSprite(el,$k('kbDieTray'),x,y,reduced?0:MOVE_MS);
    K.busy=false;S.busy=false;render();
  }
  // Resolves everything a placed die does to the OPPOSING column before the data model changes:
  // glides the live sprite onto each match in turn, then (once the model updates) destroys
  // exactly those sprites and smoothly drops any surviving, differently-valued sprites down to
  // fill the gap -- nothing else in that column is ever touched.
  async function resolveHits(el,f,attackSide,col){
    const targetSide=attackSide==='you'?'ai':'you';
    const targetBoard=$k(targetSide==='ai'?'kbAiBoard3':'kbYouBoard3');
    const oldArr=K[targetSide][col].slice();
    if(el){
      const hitRows=[];oldArr.forEach((v,r)=>{if(v===f)hitRows.push(r)});
      for(const r of hitRows){
        const cell=CELLS[targetSide][col][r];if(!cell)continue;
        const{x,y}=board3CellXY(targetBoard,col,r,el.offsetWidth);
        await moveSprite(el,targetBoard,x,y,reduced?0:MOVE_MS);
        cell.classList.add('kbShatter');impactFlash(cell);
        if(!reduced)await sleepK(50);
      }
    }
    const doomedRows=[];oldArr.forEach((v,r)=>{if(v===f)doomedRows.push(r)});
    if(doomedRows.length){
      const lost=f*doomedRows.length*doomedRows.length;
      floatNum(CELLS[targetSide][col][doomedRows[doomedRows.length-1]],`-${lost}`,'minus');
      doomedRows.forEach(r=>destroySlot(targetSide,col,r,reduced?0:370));
    }
    removeMatches(K[targetSide],col,f);
    const survivorOldRows=[];oldArr.forEach((v,r)=>{if(v!==f)survivorOldRows.push(r)});
    survivorOldRows.forEach((oldRow,i)=>{if(oldRow===i)return;const sp=SLOT[targetSide][col][oldRow];SLOT[targetSide][col][oldRow]=null;if(sp)repositionSprite(sp,targetSide,col,i)});
  }
  async function placeDie(side,col){
    if(K.busy||K.rolled==null||K.over||K.turn!==side||K[side][col].length>=3)return;
    K.busy=true;const f=K.rolled;
    const el=S.els[0];
    await resolveHits(el,f,side,col);
    if(el){
      const board=$k(side==='ai'?'kbAiBoard3':'kbYouBoard3');
      const{x,y}=board3CellXY(board,col,K[side][col].length,el.offsetWidth);
      await moveSprite(el,board,x,y,reduced?0:MOVE_MS);
    }
    const oldOwn=colScore(K[side][col]);
    K[side][col].push(f);
    const gained=colScore(K[side][col])-oldOwn;
    const myRow=K[side][col].length-1;
    K.rolled=null;K.busy=false;
    if(el)settleSprite(el,side,col,myRow);
    if(full(K[side])){end();return}
    K.turn=side==='you'?'ai':'you';
    render();
    floatNum(CELLS[side][col][myRow],`+${gained}`,'plus');
    if(side==='you'&&MODE==='single'){await sleepK(220);aiTurn()}
  }
  // Single-player stand-in for the second board: rolls and picks a column on its own, using the
  // exact same roll()/placeDie() the human uses -- this whole layout was built for two people to
  // eventually pass the phone between them, so the AI is just standing in for that second player.
  async function aiTurn(){
    if(K.over)return;
    K.turn='ai';render();await sleepK(350);
    await roll('ai');
    if(K.over||K.rolled==null)return;
    const col=chooseAI(K.rolled);
    await placeDie('ai',col);
  }
  function end(){K.over=true;K.busy=false;const ys=score(K.you),as=score(K.ai);$k('kbEndTitle').textContent=ys>as?'YOU WIN':ys<as?'OPPONENT WINS':'DRAW';$k('kbEndScore').textContent=`${ys} — ${as}`;$k('kbEnd').hidden=false;render()}
  function reset(){K.you=[[],[],[]];K.ai=[[],[],[]];K.rolled=null;K.busy=false;K.turn='you';K.over=false;K.dbl={you:[false,false,false],ai:[false,false,false]};clearBoard();$k('kbDieTray').innerHTML='';$k('kbEnd').hidden=true;if(S&&S.els)S.els.forEach(e=>e.remove());S.els=[];render()}
  function lockZoom(){const m=document.querySelector('meta[name="viewport"]');if(!m)return;origViewport=m.getAttribute('content');m.setAttribute('content',origViewport+', maximum-scale=1, user-scalable=no')}
  function unlockZoom(){const m=document.querySelector('meta[name="viewport"]');if(m&&origViewport!=null)m.setAttribute('content',origViewport);origViewport=null}
  function onResize(){if(document.body.classList.contains('kb-active'))alignArenaToDieLane()}
  function open(){closeMenu();document.body.classList.add('kb-active');$k('kbMode').classList.add('on');lockZoom();buildBoard();reset();requestAnimationFrame(alignArenaToDieLane);window.addEventListener('resize',onResize)}
  function close(){document.body.classList.remove('kb-active');$k('kbMode').classList.remove('on');unlockZoom();window.removeEventListener('resize',onResize);if(S&&S.els)S.els.forEach(e=>e.remove());S.els=[];if(typeof backToMainMenu==='function')backToMainMenu()}
  $k('menuKnuckle').onclick=()=>{if(gameInProgress())return;closeMenu();$k('kbModeScreen').classList.add('on')};
  $k('kbModeScreenClose').onclick=()=>{$k('kbModeScreen').classList.remove('on')};
  $k('kbModeSingleBtn').onclick=()=>{MODE='single';$k('kbModeScreen').classList.remove('on');open()};
  $k('kbModeMultiBtn').onclick=()=>{MODE='multi';$k('kbModeScreen').classList.remove('on');open()};
  const kbCloseBtn=$k('kbClose');if(kbCloseBtn)kbCloseBtn.onclick=close;$k('kbAgain').onclick=reset;$k('kbRoll').onclick=()=>roll('you');$k('kbAiRoll').onclick=()=>{if(MODE==='multi')roll('ai')};
})();
