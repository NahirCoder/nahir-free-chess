import { Chess } from "https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm";

const game = new Chess();
const boardEl = document.getElementById('board');
const boardWrap = document.querySelector('.board-wrap');
const home = document.getElementById('home');
const gameScreen = document.getElementById('game');
const turnText = document.getElementById('turnText');
const statusEl = document.getElementById('status');
const messageEl = document.getElementById('message');
const movesEl = document.getElementById('moves');
const resultModal = document.getElementById('resultModal');
const resultTitle = document.getElementById('resultTitle');
const resultReason = document.getElementById('resultReason');
const resultIcon = document.getElementById('resultIcon');
let selected = null;
let orientation = 'w';
let modalShown = false;
let flipping = false;
let flipTimer = null;
const files=['a','b','c','d','e','f','g','h'];
const glyph={p:['♙','♟'],n:['♘','♞'],b:['♗','♝'],r:['♖','♜'],q:['♕','♛'],k:['♔','♚']};

function start(){
  game.reset(); selected=null; orientation='w'; modalShown=false; flipping=false;
  clearTimeout(flipTimer); boardWrap.classList.remove('flipping');
  boardWrap.querySelectorAll('.dust-particle').forEach(p=>p.remove());
  resultModal.classList.add('hidden'); home.classList.add('hidden'); gameScreen.classList.remove('hidden'); render();
}

function gameResult(){
  if(game.isCheckmate()) return {title:`${game.turn()==='w'?'Black':'White'} wins`,reason:'by checkmate',icon:game.turn()==='w'?'♚':'♔'};
  if(game.isStalemate()) return {title:'Draw',reason:'by stalemate',icon:'½'};
  if(game.isThreefoldRepetition()) return {title:'Draw',reason:'by threefold repetition',icon:'½'};
  if(game.isDrawByFiftyMoves()) return {title:'Draw',reason:'by the 50-move rule',icon:'½'};
  if(game.isInsufficientMaterial()) return {title:'Draw',reason:'by insufficient material',icon:'½'};
  return null;
}

function showResult(result){
  if(!result || modalShown) return;
  modalShown=true; resultTitle.textContent=result.title; resultReason.textContent=result.reason; resultIcon.textContent=result.icon;
  resultModal.classList.remove('hidden');
}

function makeDust(){
  boardWrap.querySelectorAll('.dust-particle').forEach(p=>p.remove());
  const edges=[['top',8],['top',19],['top',33],['top',51],['top',70],['top',88],['bottom',6],['bottom',23],['bottom',43],['bottom',63],['bottom',82],['bottom',96],['left',13],['left',31],['left',54],['left',76],['right',17],['right',39],['right',62],['right',84]];
  edges.forEach(([edge,pos],i)=>{
    const p=document.createElement('i'); p.className='dust-particle'; p.style[edge]=`${pos}%`;
    p.style.setProperty('--dx',`${edge==='left'?-(8+(i%4)*6):edge==='right'?(8+(i%4)*6):(i%2?6:-6)}px`);
    p.style.setProperty('--dy',`${edge==='top'?-(5+(i%3)*4):edge==='bottom'?(5+(i%3)*4):(i%2?5:-5)}px`);
    p.style.setProperty('--delay',`${.58+(i%5)*.016}s`); p.style.setProperty('--size',`${2+(i%3)}px`); boardWrap.appendChild(p);
  });
}

function animateFlip(){
  clearTimeout(flipTimer); boardWrap.classList.remove('flipping'); void boardWrap.offsetWidth; makeDust(); boardWrap.classList.add('flipping');
  flipTimer=setTimeout(()=>{flipping=false;boardWrap.classList.remove('flipping');boardWrap.querySelectorAll('.dust-particle').forEach(p=>p.remove());document.getElementById('resign').disabled=!!gameResult()},950);
}

function render(playFlip=false){
  boardEl.innerHTML='';
  // White's perspective starts with rank 1 at the bottom. After a move, the board
  // turns to the next player's perspective, keeping that player's home rank at bottom.
  const ranks=orientation==='w'?[8,7,6,5,4,3,2,1]:[1,2,3,4,5,6,7,8];
  const fs=orientation==='w'?files:[...files].reverse();
  const legal=selected?game.moves({square:selected,verbose:true}):[];
  for(const rank of ranks) for(const file of fs){
    const sq=file+rank, piece=game.get(sq);
    const b=document.createElement('button');
    b.className='square '+(((files.indexOf(file)+rank)%2)?'dark':'light'); b.dataset.square=sq;
    if(sq===selected)b.classList.add('selected');
    const lm=legal.find(m=>m.to===sq); if(lm)b.classList.add(lm.captured?'capture':'legal');
    // Coordinates identify every square, e.g. a3 and f8, while remaining subtle.
    const coord=document.createElement('span'); coord.className='coord'; coord.textContent=sq; b.appendChild(coord);
    if(piece){const span=document.createElement('span');span.className='piece '+(piece.color==='w'?'white-piece':'black-piece');span.textContent=glyph[piece.type][piece.color==='w'?0:1];b.appendChild(span)}
    b.addEventListener('pointerdown',e=>{e.preventDefault();handleSquare(sq)}); boardEl.appendChild(b);
  }
  if(game.inCheck()){
    let kingSq=null;
    for(const rank of ranks){for(const file of fs){const q=file+rank,p=game.get(q);if(p&&p.type==='k'&&p.color===game.turn()){kingSq=q;break}}if(kingSq)break}
    if(kingSq) boardEl.querySelector(`[data-square="${kingSq}"]`)?.classList.add('check');
  }
  const turn=game.turn()==='w'?'White':'Black', result=gameResult();
  turnText.textContent=result?'Game over':`${turn} to move`;
  statusEl.textContent=result?`${result.title} ${result.reason}`:game.inCheck()?`${turn} is in check`:`${turn} to move`;
  statusEl.className='status'+(result?' game-over':'');
  messageEl.textContent=result?'The game is finished. Start a new game to play again.':'Select a piece to see its legal moves.';
  document.getElementById('resign').disabled=!!result || flipping;
  renderMoves();
  if(playFlip){flipping=true;animateFlip()}
  showResult(result);
}

function handleSquare(sq){
  if(game.isGameOver()||flipping)return;
  const piece=game.get(sq);
  if(selected){
    const move=game.moves({square:selected,verbose:true}).find(m=>m.to===sq);
    if(move){makeMove(selected,sq,move);return}
    if(piece&&piece.color===game.turn()){selected=sq;render();return}
    selected=null;render();return;
  }
  if(piece&&piece.color===game.turn()){selected=sq;render()}
}

function makeMove(from,to,move){
  let promotion;
  if(move.promotion){const answer=(prompt('Promote to: queen, rook, bishop, or knight','queen')||'queen').toLowerCase().trim();promotion=({queen:'q',rook:'r',bishop:'b',knight:'n'})[answer]||'q'}
  try{game.move({from,to,promotion});orientation=game.turn()==='w'?'w':'b';selected=null;render(true)}catch(e){selected=null;render()}
}

function resign(){
  if(game.isGameOver()||flipping)return;
  const resigning=game.turn()==='w'?'White':'Black', winner=resigning==='White'?'Black':'White';
  modalShown=true; resultTitle.textContent=`${winner} wins`; resultReason.textContent=`by resignation (${resigning} resigned)`; resultIcon.textContent=winner==='White'?'♔':'♚';
  turnText.textContent='Game over'; statusEl.textContent=`${winner} wins by resignation`; statusEl.className='status game-over'; messageEl.textContent='The game is finished. Start a new game to play again.'; document.getElementById('resign').disabled=true; resultModal.classList.remove('hidden');
}

function renderMoves(){
  movesEl.innerHTML=''; const sans=game.history();
  for(let i=0;i<sans.length;i+=2){const li=document.createElement('li');li.textContent=`${i/2+1}. ${sans[i]}${sans[i+1]?'  '+sans[i+1]:''}`;movesEl.appendChild(li)}
}

document.getElementById('newGame').addEventListener('click',start);
document.getElementById('restart').addEventListener('click',start);
document.getElementById('modalNewGame').addEventListener('click',start);
document.getElementById('resign').addEventListener('click',resign);
