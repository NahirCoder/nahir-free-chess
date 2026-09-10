import { Chess } from "https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL="https://fspaqeqyvbdyazlcslml.supabase.co";
const SUPABASE_KEY="sb_publishable_hr-NF1cJdAPvbB9DRYvSXA_tLPs4ngK";
const supabase=createClient(SUPABASE_URL,SUPABASE_KEY);
const game=new Chess();
const $=id=>document.getElementById(id);
const boardEl=$('board'),home=$('home'),online=$('online'),gameScreen=$('game'),turnText=$('turnText'),movesEl=$('moves'),resultModal=$('resultModal'),resultTitle=$('resultTitle'),resultReason=$('resultReason'),resultIcon=$('resultIcon'),onlineStatus=$('onlineStatus'),joinBox=$('joinBox'),createdBox=$('createdBox'),gameCodeInput=$('gameCode'),createdCode=$('createdCode'),waitingText=$('waitingText'),onlineBanner=$('onlineBanner'),onlineGameInfo=$('onlineGameInfo'),onlineConnection=$('onlineConnection'),evalFill=$('evalFill'),evalMarker=$('evalMarker'),evalInfo=$('evalInfo'),materialInfo=$('materialInfo');

let selected=null,modalShown=false,onlineMatch=null,onlineColor=null,onlineMoves=[],realtimeChannel=null,promotionResolver=null,gameMode='pass',botElo=800,botColor='black',botThinking=false,resignationResult=null;
let playerId=localStorage.getItem('nahir_chess_player_id');
if(!playerId){playerId=crypto.randomUUID();localStorage.setItem('nahir_chess_player_id',playerId)}

const files=['a','b','c','d','e','f','g','h'];
const glyph={p:['♙','♟'],n:['♘','♞'],b:['♗','♝'],r:['♖','♜'],q:['♕','♛'],k:['♔','♚']};
const pieceValue={p:1,n:3.2,b:3.3,r:5,q:9,k:0};

function setScreen(s){[home,online,gameScreen].forEach(x=>x.classList.add('hidden'));s.classList.remove('hidden')}
function gameResult(){if(resignationResult)return resignationResult;if(game.isCheckmate())return{title:`${game.turn()==='w'?'Black':'White'} wins`,reason:'by checkmate',icon:game.turn()==='w'?'♚':'♔'};if(game.isStalemate())return{title:'Draw',reason:'by stalemate',icon:'½'};if(game.isThreefoldRepetition())return{title:'Draw',reason:'by threefold repetition',icon:'½'};if(game.isDrawByFiftyMoves())return{title:'Draw',reason:'by the 50-move rule',icon:'½'};if(game.isInsufficientMaterial())return{title:'Draw',reason:'by insufficient material',icon:'½'};return null}
function showResult(r){if(!r||modalShown)return;modalShown=true;resultTitle.textContent=r.title;resultReason.textContent=r.reason;resultIcon.textContent=r.icon;resultModal.classList.remove('hidden');if(!onlineMatch)persistLocalGame()}
function playerBotColor(){return botColor==='white'?'black':'white'}

function evaluate(ch){const v={p:100,n:320,b:330,r:500,q:900,k:20000};return [...ch.board()].reduce((s,row)=>s+row.reduce((a,p)=>a+(p?(p.color==='w'?1:-1)*v[p.type]:0),0),0)}
function evaluationPawns(ch){return evaluate(ch)/100}
function materialBalance(ch){return [...ch.board()].reduce((s,row)=>s+row.reduce((a,p)=>a+(p?(p.color==='w'?1:-1)*pieceValue[p.type]:0),0),0)}
function formatEval(v){const n=Math.max(-5,Math.min(5,v));return `${n>=0?'+':''}${n.toFixed(1)}`}
function formatMaterial(v){const n=Math.round(Math.abs(v)*10)/10;if(n<0.1)return'Material equal';return`${v>0?'White':'Black'} +${n.toFixed(1)} material`}
function updateAnalysis(ch){const ev=evaluationPawns(ch);const clamped=Math.max(-5,Math.min(5,ev));const pct=((clamped+5)/10)*100;if(evalFill){evalFill.style.height=`${100-pct}%`;evalMarker.style.top=`${pct}%`}if(evalInfo)evalInfo.textContent=`Eval ${formatEval(ev)}`;if(materialInfo)materialInfo.textContent=formatMaterial(materialBalance(ch))}

function replayHistory(items){const c=new Chess();for(const item of items){const san=typeof item==='string'?item:item.san;if(!san)continue;try{c.move(san)}catch{break}}return c}
function analysisItems(){return onlineMatch?onlineMoves:game.history().map((san)=>({san}));}
function classifyMove(items,index){
  const before=replayHistory(items.slice(0,index));
  const san=items[index]?.san;
  if(!san)return{icon:'•',label:'Good',cpl:0};
  const mover=before.turn();
  let played;
  try{played=before.move(san)}catch{return{icon:'•',label:'Good',cpl:0}}
  if(played.san&&before.isCheckmate())return{icon:'!!',label:'Brilliant',cpl:0};
  const playedScore=evaluate(before);
  const test=new Chess();
  try{test.load(before.fen())}catch{return{icon:'•',label:'Good',cpl:0}}
  const candidates=test.moves({verbose:true});
  let best=mover==='w'?-Infinity:Infinity;
  for(const m of candidates){try{test.move(m);const score=evaluate(test);best=mover==='w'?Math.max(best,score):Math.min(best,score);test.undo()}catch{}}
  if(!Number.isFinite(best))return{icon:'•',label:'Good',cpl:0};
  const cpl=mover==='w'?best-playedScore:playedScore-best;
  if(cpl<=5)return{icon:'!',label:'Excellent',cpl};
  if(cpl<=25)return{icon:'✓',label:'Good',cpl};
  if(cpl<=70)return{icon:'?!',label:'Inaccuracy',cpl};
  if(cpl<=180)return{icon:'?',label:'Mistake',cpl};
  return{icon:'??',label:'Blunder',cpl};
}

function renderBoard(){
  boardEl.innerHTML='';
  const perspective=onlineMatch?onlineColor:(gameMode==='bot'?playerBotColor():'white');
  const ranks=perspective==='black'?[1,2,3,4,5,6,7,8]:[8,7,6,5,4,3,2,1];
  const bf=perspective==='black'?[...files].reverse():files;
  const legal=selected&&!game.isGameOver()&&!resignationResult?game.moves({square:selected,verbose:true}):[];
  for(const rank of ranks)for(const file of bf){
    const sq=file+rank,p=game.get(sq),b=document.createElement('button');
    b.className='square '+(((files.indexOf(file)+rank)%2)?'dark':'light');b.dataset.square=sq;
    if(sq===selected)b.classList.add('selected');
    const lm=legal.find(m=>m.to===sq);if(lm)b.classList.add(lm.captured?'capture':'legal');
    const c=document.createElement('span');c.className='coord';c.textContent=sq;b.appendChild(c);
    if(p){const sp=document.createElement('span');sp.className='piece '+(p.color==='w'?'white-piece':'black-piece');sp.textContent=glyph[p.type][p.color==='w'?0:1];b.appendChild(sp)}
    b.addEventListener('pointerdown',e=>{e.preventDefault();handleSquare(sq)});boardEl.appendChild(b)
  }
  if(game.inCheck()){
    let k=null;for(const r of ranks){for(const f of bf){const q=f+r,p=game.get(q);if(p&&p.type==='k'&&p.color===game.turn()){k=q;break}}if(k)break}
    if(k)boardEl.querySelector(`[data-square="${k}"]`)?.classList.add('check')
  }
}

function render(){
  renderBoard();renderMoves();updateAnalysis(game);showResult(gameResult());
  if(onlineMatch)turnText.textContent=game.isGameOver()||resignationResult?'Game over':(game.turn()===(onlineColor==='white'?'w':'b')?'Your turn':"Opponent's turn");
  else if(gameMode==='bot')turnText.textContent=game.isGameOver()||resignationResult?'Game over':(game.turn()===(botColor==='white'?'w':'b')?'Bot thinking...':'Your turn');
  else turnText.textContent=game.isGameOver()||resignationResult?'Game over':`${game.turn()==='w'?'White':'Black'}'s turn`
}
function handleSquare(sq){
  if(game.isGameOver()||botThinking||resignationResult)return;
  if(onlineMatch&&game.turn()!==(onlineColor==='white'?'w':'b'))return;
  if(gameMode==='bot'&&game.turn()===(botColor==='white'?'w':'b'))return;
  const p=game.get(sq);
  if(selected){const m=game.moves({square:selected,verbose:true}).find(x=>x.to===sq);if(m){makeMove(selected,sq,m);return}if(p&&p.color===game.turn()){selected=sq;render();return}selected=null;render();return}
  if(p&&p.color===game.turn()){selected=sq;render()}
}
function choosePromotion(color){return new Promise(resolve=>{promotionResolver=resolve;$('promotionModal')?.remove();const m=document.createElement('div');m.id='promotionModal';m.className='promotion-modal';m.innerHTML=`<div class="promotion-card"><div class="promotion-title">Promote pawn</div><div class="promotion-subtitle">Choose a piece</div><div class="promotion-options"><button data-piece="q"><span>${color==='w'?'♕':'♛'}</span><small>Queen</small></button><button data-piece="r"><span>${color==='w'?'♖':'♜'}</span><small>Rook</small></button><button data-piece="b"><span>${color==='w'?'♗':'♝'}</span><small>Bishop</small></button><button data-piece="n"><span>${color==='w'?'♘':'♞'}</span><small>Knight</small></button></div></div>`;document.body.appendChild(m);m.querySelectorAll('[data-piece]').forEach(b=>b.onclick=()=>finishPromotion(b.dataset.piece))})}
function finishPromotion(p){const r=promotionResolver;promotionResolver=null;$('promotionModal')?.remove();if(r)r(p)}

async function makeMove(from,to,m){
  let promotion;if(m.promotion)promotion=await choosePromotion(game.turn());
  const before=game.fen();let played;try{played=game.move({from,to,promotion})}catch{selected=null;render();return}
  selected=null;
  if(!onlineMatch){persistLocalGame();render();if(gameMode==='bot'&&game.turn()===(botColor==='white'?'w':'b')&&!game.isGameOver())setTimeout(botMove,2000);return}
  const n=onlineMoves.length+1,fen=game.fen(),finished=game.isGameOver(),winner=finished&&game.isCheckmate()?(game.turn()==='w'?'black':'white'):(finished?'draw':null);
  const{error:me}=await supabase.from('moves').insert({game_id:onlineMatch.id,move_number:n,player:onlineColor,from_square:from,to_square:to,promotion:promotion||null,san:played.san,fen});
  if(me){try{game.load(before)}catch{}alert('Could not send the move. Please check your internet connection.');render();return}
  onlineMoves.push({move_number:n,player:onlineColor,from_square:from,to_square:to,promotion:promotion||null,san:played.san,fen});
  const{error:ge}=await supabase.from('games').update({fen,turn:game.turn(),status:finished?'finished':'playing',winner,result_reason:finished?getOnlineResultReason():null}).eq('id',onlineMatch.id);
  if(ge)alert('The move was played locally but could not be synchronized.');
  render();if(finished)setTimeout(cleanupOnlineGame,5000)
}
function getOnlineResultReason(){if(game.isCheckmate())return'by checkmate';if(game.isStalemate())return'by stalemate';if(game.isThreefoldRepetition())return'by threefold repetition';if(game.isDrawByFiftyMoves())return'by the 50-move rule';if(game.isInsufficientMaterial())return'by insufficient material';return'by draw'}
function randomCode(){const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let s='';for(let i=0;i<6;i++)s+=c[Math.floor(Math.random()*c.length)];return s}
function saveKey(){return gameMode==='bot'?'nahir_chess_bot_game':'nahir_chess_pass_game'}
function persistLocalGame(){if(!onlineMatch)localStorage.setItem(saveKey(),JSON.stringify({fen:game.fen(),botElo,botColor,gameMode,updatedAt:Date.now()}))}
function hasSaved(mode){const r=localStorage.getItem(mode==='bot'?'nahir_chess_bot_game':'nahir_chess_pass_game');if(!r)return false;try{return!!JSON.parse(r).fen}catch{return false}}
function restore(mode){const r=localStorage.getItem(mode==='bot'?'nahir_chess_bot_game':'nahir_chess_pass_game');if(!r)return false;try{const s=JSON.parse(r);game.load(s.fen);if(mode==='bot'){if(s.botElo)botElo=s.botElo;if(s.botColor)botColor=s.botColor}return true}catch{return false}}
function newLocal(mode){gameMode=mode;game.reset();selected=null;resignationResult=null;modalShown=false;resultModal.classList.add('hidden');enterLocal()}
function continueLocal(mode){gameMode=mode;selected=null;resignationResult=null;modalShown=false;resultModal.classList.add('hidden');if(!restore(mode))game.reset();enterLocal()}
function enterLocal(){leaveOnline();resignationResult=null;onlineBanner.classList.add('hidden');$('resign').disabled=false;setScreen(gameScreen);render();if(gameMode==='bot'&&game.turn()===(botColor==='white'?'w':'b')&&!game.isGameOver())setTimeout(botMove,2000)}

function showMode(mode){
  $('modeModal')?.remove();const m=document.createElement('div');m.id='modeModal';m.className='mode-modal';const bot=mode==='bot',cont=bot?hasSaved('bot'):mode==='pass'?hasSaved('pass'):!!localStorage.getItem('nahir_chess_online_game_id');
  m.innerHTML=`<div class="mode-card"><button class="mode-close">×</button><div class="mode-title">${bot?'Play with a Bot':mode==='pass'?'2 Player Game':'Play Online'}</div>${bot?`<div class="bot-elo-row"><span>Bot strength</span><strong id="botEloValue">${botElo} Elo</strong></div><input id="botEloSlider" class="elo-slider" type="range" min="50" max="3200" step="50" value="${botElo}"><div class="elo-scale"><span>50</span><span>3200</span></div><div class="bot-color-actions"><button id="botWhite" class="secondary-button">Play as White</button><button id="botBlack" class="secondary-button">Play as Black</button><button id="botRandom" class="secondary-button">Play Random</button></div>`:''}<div class="mode-actions"><button id="modeNew" class="primary-button"><span>New Game</span><b>+</b></button>${cont?'<button id="modeContinue" class="secondary-button"><span>Continue Game</span><b>→</b></button>':''}</div></div>`;
  document.body.appendChild(m);m.querySelector('.mode-close').onclick=()=>m.remove();
  if(bot){const s=$('botEloSlider'),v=$('botEloValue');s.oninput=()=>{botElo=+s.value;v.textContent=`${botElo} Elo`};$('botWhite').onclick=()=>{botColor='black';m.querySelectorAll('.bot-color-actions button').forEach(b=>b.classList.remove('selected'));$('botWhite').classList.add('selected')};$('botBlack').onclick=()=>{botColor='white';m.querySelectorAll('.bot-color-actions button').forEach(b=>b.classList.remove('selected'));$('botBlack').classList.add('selected')};$('botRandom').onclick=()=>{botColor=Math.random()<.5?'white':'black';m.querySelectorAll('.bot-color-actions button').forEach(b=>b.classList.remove('selected'));$('botRandom').classList.add('selected')}}
  $('modeNew').onclick=()=>{m.remove();if(mode==='online')openOnline();else newLocal(mode)};
  $('modeContinue')?.addEventListener('click',async()=>{m.remove();if(mode==='online')await continueOnline();else continueLocal(mode)})
}
function openOnline(){setScreen(online);onlineStatus.textContent='';joinBox.classList.add('hidden');createdBox.classList.add('hidden')}
async function makeOnline(){leaveOnline();joinBox.classList.add('hidden');createdBox.classList.remove('hidden');onlineStatus.textContent='Creating game...';waitingText.textContent='Waiting for opponent...';let row=null;for(let i=0;i<5;i++){const code=randomCode(),r=await supabase.from('games').insert({code,white_player:playerId,status:'waiting'}).select().single();if(!r.error){row=r.data;break}if(!String(r.error.message||'').toLowerCase().includes('duplicate'))throw r.error}if(!row){onlineStatus.textContent='Could not create a game. Try again.';createdBox.classList.add('hidden');return}onlineMatch=row;onlineColor='white';createdCode.textContent=row.code;onlineStatus.textContent='Game created.';localStorage.setItem('nahir_chess_online_game_id',row.id);subscribe(row.id)}
async function joinOnline(){const code=gameCodeInput.value.trim().toUpperCase();if(!/^[A-Z0-9]{6}$/.test(code)){onlineStatus.textContent='Enter a valid 6-character game code.';return}leaveOnline();onlineStatus.textContent='Checking game...';const{data:row,error}=await supabase.from('games').select('*').eq('code',code).maybeSingle();if(error){onlineStatus.textContent='Could not connect to the game server.';return}if(!row){onlineStatus.textContent='Game code not found.';return}if(row.status!=='waiting'||row.black_player){onlineStatus.textContent='That game is already full or finished.';return}if(row.white_player===playerId){onlineStatus.textContent='You cannot join your own game.';return}const used=`USED-${row.id.slice(0,8)}`,r=await supabase.from('games').update({black_player:playerId,status:'playing',code:used}).eq('id',row.id).eq('status','waiting').is('black_player',null).select().single();if(r.error||!r.data){onlineStatus.textContent='Someone else just joined this game. Try another code.';return}onlineMatch=r.data;onlineColor='black';onlineStatus.textContent='Game joined!';localStorage.setItem('nahir_chess_online_game_id',r.data.id);await loadMoves(r.data.id);enterOnline();subscribe(r.data.id)}
async function continueOnline(){const id=localStorage.getItem('nahir_chess_online_game_id');if(!id){openOnline();return}const{data,error}=await supabase.from('games').select('*').eq('id',id).maybeSingle();if(error||!data){localStorage.removeItem('nahir_chess_online_game_id');openOnline();return}onlineMatch=data;onlineColor=data.white_player===playerId?'white':data.black_player===playerId?'black':null;if(!onlineColor){localStorage.removeItem('nahir_chess_online_game_id');openOnline();return}await loadMoves(id);enterOnline();subscribe(id)}
async function loadMoves(id){const{data}=await supabase.from('moves').select('*').eq('game_id',id).order('move_number',{ascending:true});onlineMoves=data||[]}
function subscribe(id){if(realtimeChannel)supabase.removeChannel(realtimeChannel);realtimeChannel=supabase.channel(`chess-game-${id}`).on('postgres_changes',{event:'UPDATE',schema:'public',table:'games',filter:`id=eq.${id}`},p=>gameUpdate(p.new)).on('postgres_changes',{event:'INSERT',schema:'public',table:'moves',filter:`game_id=eq.${id}`},p=>moveUpdate(p.new)).subscribe(s=>{if(s==='SUBSCRIBED')onlineConnection.textContent='';else if(s==='CHANNEL_ERROR'||s==='TIMED_OUT')onlineConnection.textContent=''})}
async function gameUpdate(row){if(!onlineMatch||row.id!==onlineMatch.id)return;onlineMatch={...onlineMatch,...row};if(row.status==='playing'&&!gameScreen.classList.contains('hidden')){try{game.load(row.fen)}catch{}render()}else if(row.status==='playing'&&onlineColor==='white'){await loadMoves(row.id);enterOnline()}if(row.status==='finished'&&!gameScreen.classList.contains('hidden')){if(row.result_reason==='by resignation'&&row.winner){const winnerName=row.winner==='white'?'White':'Black';const resignedName=row.winner==='white'?'Black':'White';resignationResult={title:`${winnerName} wins`,reason:`by resignation (${resignedName} resigned)`,icon:row.winner==='white'?'♔':'♚'};$('resign').disabled=true}render()}}
function moveUpdate(move){if(!onlineMatch||move.game_id!==onlineMatch.id)return;if(!onlineMoves.some(x=>x.id===move.id)){onlineMoves.push(move);onlineMoves.sort((a,b)=>a.move_number-b.move_number)}try{game.load(move.fen)}catch{}render()}
function enterOnline(){selected=null;modalShown=false;resignationResult=null;resultModal.classList.add('hidden');$('resign').disabled=false;onlineBanner.classList.remove('hidden');onlineGameInfo.textContent=`Game ${onlineMatch.code?.startsWith('USED-')?'online':onlineMatch.code} • ${onlineColor==='white'?'White':'Black'}`;onlineConnection.textContent='';try{game.load(onlineMatch.fen)}catch{game.reset()}setScreen(gameScreen);render()}

function renderMoves(){
  movesEl.innerHTML='';
  const list=analysisItems();
  for(let i=0;i<list.length;i+=2){
    const li=document.createElement('li');li.className='move-row';
    const number=document.createElement('span');number.className='move-number';number.textContent=`${Math.floor(i/2)+1}.`;
    const white=document.createElement('span');white.className='move-san';white.textContent=list[i]?.san||'';
    const black=document.createElement('span');black.className='move-san';black.textContent=list[i+1]?.san||'';
    li.append(number,white,black);
    const lastIndex=list.length-1;
    if(lastIndex===i||lastIndex===i+1){const a=classifyMove(list,lastIndex);const badge=document.createElement('span');badge.className=`move-badge ${a.icon==='??'?'blunder':a.icon==='?'?'mistake':a.icon==='?!'?'inaccuracy':a.icon==='!!'?'brilliant':''}`;badge.textContent=a.icon;badge.title=a.label;badge.setAttribute('aria-label',a.label);li.appendChild(badge)}
    movesEl.appendChild(li)
  }
}

function cleanupOnlineGame(){if(!onlineMatch)return;const id=onlineMatch.id;supabase.from('moves').delete().eq('game_id',id).then(()=>supabase.from('games').delete().eq('id',id));localStorage.removeItem('nahir_chess_online_game_id')}
function leaveOnline(){if(realtimeChannel){supabase.removeChannel(realtimeChannel);realtimeChannel=null}onlineMatch=null;onlineColor=null;onlineMoves=[];$('promotionModal')?.remove();promotionResolver=null}
function returnHome(){leaveOnline();selected=null;resignationResult=null;resultModal.classList.add('hidden');onlineBanner.classList.add('hidden');setScreen(home)}

function depth(){return botElo<700?1:2}
function minimax(ch,d,maximizing){if(d===0||ch.isGameOver())return evaluate(ch);const moves=ch.moves({verbose:true});let best=maximizing?-Infinity:Infinity;for(const m of moves){ch.move(m);const val=minimax(ch,d-1,!maximizing);ch.undo();best=maximizing?Math.max(best,val):Math.min(best,val)}return best}
function chooseBot(){const moves=game.moves({verbose:true});if(!moves.length)return null;const botSide=botColor==='white'?'w':'b';const maximizing=botSide==='w';const d=depth();let scored=moves.map(m=>{game.move(m);const score=minimax(game,d-1,!maximizing);game.undo();return{m,score}});scored.sort((a,b)=>maximizing?b.score-a.score:a.score-b.score);const blunderRate=Math.max(0,Math.min(.3,(900-botElo)/2800));if(Math.random()<blunderRate&&scored.length>1)return scored[Math.floor(Math.random()*scored.length)].m;return scored[0].m}
function botMove(){if(botThinking||gameMode!=='bot'||game.isGameOver()||resignationResult||game.turn()!==(botColor==='white'?'w':'b'))return;botThinking=true;const m=chooseBot();if(m){try{game.move(m)}catch{}selected=null;persistLocalGame();render()}botThinking=false}
function showInitial(){setScreen(home)}

$('playOnline').onclick=()=>showMode('online');
$('passNPlay').onclick=()=>showMode('pass');
$('playBot').onclick=()=>showMode('bot');
$('onlineBack').onclick=()=>{leaveOnline();setScreen(home)};
$('makeGame').onclick=makeOnline;
$('joinGame').onclick=()=>{joinBox.classList.toggle('hidden');createdBox.classList.add('hidden');onlineStatus.textContent=''};
$('confirmJoin').onclick=joinOnline;
$('copyCode').onclick=async()=>{try{await navigator.clipboard.writeText(createdCode.textContent);onlineStatus.textContent='Code copied.'}catch{onlineStatus.textContent='Copy failed.'}};
$('gameCode').oninput=e=>{e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6)};
$('returnHome').onclick=returnHome;
$('restart').onclick=()=>showMode(gameMode);
$('resign').onclick=async()=>{if(game.isGameOver()||resignationResult)return;if(onlineMatch){const winner=onlineColor==='white'?'black':'white',resigned=onlineColor==='white'?'White':'Black';resignationResult={title:`${winner==='white'?'White':'Black'} wins`,reason:`by resignation (${resigned} resigned)`,icon:winner==='white'?'♔':'♚'};$('resign').disabled=true;const{error}=await supabase.from('games').update({status:'finished',winner,result_reason:'by resignation'}).eq('id',onlineMatch.id);if(error)alert('Could not record the resignation. Please check your internet connection.');render();setTimeout(cleanupOnlineGame,5000)}else{const resigned=game.turn(),winner=resigned==='w'?'Black':'White';resignationResult=gameMode==='bot'?{title:'Bot wins',reason:'by resignation (player resigned)',icon:'♞'}:{title:`${winner} wins`,reason:`by resignation (${resigned==='w'?'White':'Black'} resigned)`,icon:resigned==='w'?'♟':'♔'};$('resign').disabled=true;selected=null;render()}};
$('returnHomeResult').onclick=returnHome;
$('modalNewGame').onclick=()=>{resultModal.classList.add('hidden');modalShown=false;resignationResult=null;showMode(gameMode)};
showInitial();
