import { Chess } from "https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://fspaqeqyvbdyazlcslml.supabase.co";
const SUPABASE_KEY = "sb_publishable_hr-NF1cJdAPvbB9DRYvSXA_tLPs4ngK";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const game = new Chess();
const boardEl = document.getElementById('board');
const home = document.getElementById('home');
const online = document.getElementById('online');
const gameScreen = document.getElementById('game');
const turnText = document.getElementById('turnText');
const movesEl = document.getElementById('moves');
const resultModal = document.getElementById('resultModal');
const resultTitle = document.getElementById('resultTitle');
const resultReason = document.getElementById('resultReason');
const resultIcon = document.getElementById('resultIcon');
const onlineStatus = document.getElementById('onlineStatus');
const joinBox = document.getElementById('joinBox');
const createdBox = document.getElementById('createdBox');
const gameCodeInput = document.getElementById('gameCode');
const createdCode = document.getElementById('createdCode');
const waitingText = document.getElementById('waitingText');
const onlineBanner = document.getElementById('onlineBanner');
const onlineGameInfo = document.getElementById('onlineGameInfo');
const onlineConnection = document.getElementById('onlineConnection');

let selected = null;
let modalShown = false;
let onlineGame = null;
let onlineColor = null;
let onlineMoves = [];
let realtimeChannel = null;
let promotionResolver = null;
let playerId = localStorage.getItem('nahir_chess_player_id');

if (!playerId) {
  playerId = crypto.randomUUID();
  localStorage.setItem('nahir_chess_player_id', playerId);
}

const files = ['a','b','c','d','e','f','g','h'];
const glyph = {p:['♙','♟'],n:['♘','♞'],b:['♗','♝'],r:['♖','♜'],q:['♕','♛'],k:['♔','♚']};

function setScreen(screen) {
  [home, online, gameScreen].forEach(el => el.classList.add('hidden'));
  screen.classList.remove('hidden');
}

function start() {
  leaveOnlineGame();
  game.reset();
  selected = null;
  modalShown = false;
  resultModal.classList.add('hidden');
  turnText.textContent = 'Chess';
  document.getElementById('resign').disabled = false;
  onlineBanner.classList.add('hidden');
  setScreen(gameScreen);
  render();
}

function openOnline() {
  setScreen(online);
  onlineStatus.textContent = '';
  joinBox.classList.add('hidden');
  createdBox.classList.add('hidden');
}

function gameResult() {
  if (game.isCheckmate()) return {title:`${game.turn()==='w'?'Black':'White'} wins`,reason:'by checkmate',icon:game.turn()==='w'?'♚':'♔'};
  if (game.isStalemate()) return {title:'Draw',reason:'by stalemate',icon:'½'};
  if (game.isThreefoldRepetition()) return {title:'Draw',reason:'by threefold repetition',icon:'½'};
  if (game.isDrawByFiftyMoves()) return {title:'Draw',reason:'by the 50-move rule',icon:'½'};
  if (game.isInsufficientMaterial()) return {title:'Draw',reason:'by insufficient material',icon:'½'};
  return null;
}

function showResult(r) {
  if (!r || modalShown) return;
  modalShown = true;
  resultTitle.textContent = r.title;
  resultReason.textContent = r.reason;
  resultIcon.textContent = r.icon;
  resultModal.classList.remove('hidden');
}

function renderBoard() {
  boardEl.innerHTML = '';
  const ranks = onlineColor === 'black' ? [1,2,3,4,5,6,7,8] : [8,7,6,5,4,3,2,1];
  const boardFiles = onlineColor === 'black' ? [...files].reverse() : files;
  const legal = selected && !game.isGameOver() ? game.moves({square:selected,verbose:true}) : [];

  for (const rank of ranks) {
    for (const file of boardFiles) {
      const sq = file + rank;
      const piece = game.get(sq);
      const b = document.createElement('button');
      b.className = 'square ' + (((files.indexOf(file)+rank)%2)?'dark':'light');
      b.dataset.square = sq;
      if (sq === selected) b.classList.add('selected');
      const lm = legal.find(m => m.to === sq);
      if (lm) b.classList.add(lm.captured ? 'capture' : 'legal');

      const coord = document.createElement('span');
      coord.className = 'coord';
      coord.textContent = sq;
      b.appendChild(coord);

      if (piece) {
        const span = document.createElement('span');
        span.className = 'piece ' + (piece.color === 'w' ? 'white-piece' : 'black-piece');
        span.textContent = glyph[piece.type][piece.color === 'w' ? 0 : 1];
        b.appendChild(span);
      }

      b.addEventListener('pointerdown', e => { e.preventDefault(); handleSquare(sq); });
      boardEl.appendChild(b);
    }
  }

  if (game.inCheck()) {
    let kingSq = null;
    for (const rank of ranks) {
      for (const file of boardFiles) {
        const q = file + rank, p = game.get(q);
        if (p && p.type === 'k' && p.color === game.turn()) { kingSq = q; break; }
      }
      if (kingSq) break;
    }
    if (kingSq) boardEl.querySelector(`[data-square="${kingSq}"]`)?.classList.add('check');
  }
}

function render() {
  renderBoard();
  renderMoves();
  const result = gameResult();
  showResult(result);
  if (onlineGame) {
    turnText.textContent = game.isGameOver() ? 'Game over' : (game.turn() === (onlineColor === 'white' ? 'w' : 'b') ? 'Your turn' : "Opponent's turn");
  }
}

function handleSquare(sq) {
  if (game.isGameOver()) return;
  if (onlineGame && game.turn() !== (onlineColor === 'white' ? 'w' : 'b')) return;

  const piece = game.get(sq);
  if (selected) {
    const move = game.moves({square:selected,verbose:true}).find(m => m.to === sq);
    if (move) { makeMove(selected, sq, move); return; }
    if (piece && piece.color === game.turn()) { selected = sq; render(); return; }
    selected = null;
    render();
    return;
  }
  if (piece && piece.color === game.turn()) { selected = sq; render(); }
}

function choosePromotion(color) {
  return new Promise(resolve => {
    promotionResolver = resolve;
    const existing = document.getElementById('promotionModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'promotionModal';
    modal.className = 'promotion-modal';
    modal.innerHTML = `
      <div class="promotion-card" role="dialog" aria-modal="true" aria-label="Choose promotion piece">
        <div class="promotion-title">Promote pawn</div>
        <div class="promotion-subtitle">Choose a piece</div>
        <div class="promotion-options">
          <button type="button" data-piece="q" aria-label="Queen"><span>${color === 'w' ? '♕' : '♛'}</span><small>Queen</small></button>
          <button type="button" data-piece="r" aria-label="Rook"><span>${color === 'w' ? '♖' : '♜'}</span><small>Rook</small></button>
          <button type="button" data-piece="b" aria-label="Bishop"><span>${color === 'w' ? '♗' : '♝'}</span><small>Bishop</small></button>
          <button type="button" data-piece="n" aria-label="Knight"><span>${color === 'w' ? '♘' : '♞'}</span><small>Knight</small></button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    modal.querySelectorAll('[data-piece]').forEach(button => {
      button.addEventListener('click', () => finishPromotion(button.dataset.piece));
    });
  });
}

function finishPromotion(piece) {
  const resolver = promotionResolver;
  promotionResolver = null;
  document.getElementById('promotionModal')?.remove();
  if (resolver) resolver(piece);
}

async function makeMove(from, to, move) {
  let promotion;
  if (move.promotion) promotion = await choosePromotion(game.turn());

  const beforeFen = game.fen();
  let played;
  try {
    played = game.move({from,to,promotion});
  } catch (e) {
    selected = null;
    render();
    return;
  }

  selected = null;

  if (!onlineGame) {
    render();
    return;
  }

  const moveNumber = onlineMoves.length + 1;
  const newFen = game.fen();
  const nextTurn = game.turn();
  const finished = game.isGameOver();
  const winner = finished && game.isCheckmate() ? (nextTurn === 'w' ? 'black' : 'white') : (finished ? 'draw' : null);
  const reason = finished ? getOnlineResultReason() : null;

  const { error: moveError } = await supabase.from('moves').insert({
    game_id: onlineGame.id,
    move_number: moveNumber,
    player: onlineColor,
    from_square: from,
    to_square: to,
    promotion: promotion || null,
    san: played.san,
    fen: newFen
  });

  if (moveError) {
    try { game.load(beforeFen); } catch {}
    alert('Could not send the move. Please check your internet connection.');
    render();
    return;
  }

  const { error: gameError } = await supabase.from('games').update({
    fen: newFen,
    turn: nextTurn,
    status: finished ? 'finished' : 'playing',
    winner,
    result_reason: reason
  }).eq('id', onlineGame.id);

  if (gameError) alert('The move was played locally but could not be synchronized.');
  render();
}

function getOnlineResultReason() {
  if (game.isCheckmate()) return 'by checkmate';
  if (game.isStalemate()) return 'by stalemate';
  if (game.isThreefoldRepetition()) return 'by threefold repetition';
  if (game.isDrawByFiftyMoves()) return 'by the 50-move rule';
  if (game.isInsufficientMaterial()) return 'by insufficient material';
  return 'by draw';
}

function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i=0; i<6; i++) code += chars[Math.floor(Math.random()*chars.length)];
  return code;
}

async function makeOnlineGame() {
  leaveOnlineGame();
  joinBox.classList.add('hidden');
  createdBox.classList.remove('hidden');
  onlineStatus.textContent = 'Creating game...';
  waitingText.textContent = 'Waiting for opponent...';

  let code = '';
  let row = null;
  for (let attempt=0; attempt<5; attempt++) {
    code = randomCode();
    const { data, error } = await supabase.from('games').insert({code, white_player:playerId, status:'waiting'}).select().single();
    if (!error) { row = data; break; }
    if (!String(error.message || '').toLowerCase().includes('duplicate')) throw error;
  }

  if (!row) {
    onlineStatus.textContent = 'Could not create a unique game code. Try again.';
    createdBox.classList.add('hidden');
    return;
  }

  onlineGame = row;
  onlineColor = 'white';
  createdCode.textContent = row.code;
  onlineStatus.textContent = 'Game created.';
  subscribeToGame(row.id);
}

async function joinOnlineGame() {
  const code = gameCodeInput.value.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    onlineStatus.textContent = 'Enter a valid 6-character game code.';
    return;
  }

  leaveOnlineGame();
  onlineStatus.textContent = 'Checking game...';

  const { data: row, error } = await supabase.from('games').select('*').eq('code', code).maybeSingle();
  if (error) { onlineStatus.textContent = 'Could not connect to the game server.'; return; }
  if (!row) { onlineStatus.textContent = 'Game code not found.'; return; }
  if (row.status !== 'waiting' || row.black_player) { onlineStatus.textContent = 'That game is already full or finished.'; return; }
  if (row.white_player === playerId) { onlineStatus.textContent = 'You cannot join your own game.'; return; }

  const { data: updated, error: updateError } = await supabase.from('games').update({black_player:playerId,status:'playing'}).eq('id',row.id).eq('status','waiting').is('black_player',null).select().single();
  if (updateError || !updated) { onlineStatus.textContent = 'Someone else just joined this game. Try another code.'; return; }

  onlineGame = updated;
  onlineColor = 'black';
  onlineStatus.textContent = 'Game joined!';
  await loadOnlineMoves(updated.id);
  enterOnlineGame();
  subscribeToGame(updated.id);
}

async function loadOnlineMoves(gameId) {
  const { data } = await supabase.from('moves').select('*').eq('game_id',gameId).order('move_number',{ascending:true});
  onlineMoves = data || [];
}

function subscribeToGame(gameId) {
  if (realtimeChannel) supabase.removeChannel(realtimeChannel);
  realtimeChannel = supabase.channel(`chess-game-${gameId}`)
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'games',filter:`id=eq.${gameId}`},payload => handleGameUpdate(payload.new))
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'moves',filter:`game_id=eq.${gameId}`},payload => handleMoveUpdate(payload.new))
    .subscribe(status => {
      if (status === 'SUBSCRIBED') onlineConnection.textContent = 'Online';
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') onlineConnection.textContent = 'Connection problem';
    });
}

async function handleGameUpdate(row) {
  if (!onlineGame || row.id !== onlineGame.id) return;
  onlineGame = {...onlineGame,...row};
  if (row.status === 'playing' && !gameScreen.classList.contains('hidden')) {
    try { game.load(row.fen); } catch {}
    render();
  } else if (row.status === 'playing' && onlineColor === 'white') {
    await loadOnlineMoves(row.id);
    enterOnlineGame();
  }
  if (row.status === 'finished' && !gameScreen.classList.contains('hidden')) render();
}

function handleMoveUpdate(move) {
  if (!onlineGame || move.game_id !== onlineGame.id) return;
  if (!onlineMoves.some(m => m.id === move.id)) onlineMoves.push(move);
  onlineMoves.sort((a,b) => a.move_number-b.move_number);
  renderMoves();
}

async function enterOnlineGame() {
  selected = null;
  modalShown = false;
  resultModal.classList.add('hidden');
  document.getElementById('resign').disabled = false;
  onlineBanner.classList.remove('hidden');
  onlineGameInfo.textContent = `Game ${onlineGame.code} • ${onlineColor === 'white' ? 'White' : 'Black'}`;
  onlineConnection.textContent = 'Connecting...';
  try { game.load(onlineGame.fen); } catch { game.reset(); }
  setScreen(gameScreen);
  render();
}

function renderMoves() {
  movesEl.innerHTML = '';
  if (onlineGame) {
    for (let i=0; i<onlineMoves.length; i+=2) {
      const li = document.createElement('li');
      const white = onlineMoves[i]?.san || '';
      const black = onlineMoves[i+1]?.san || '';
      li.textContent = `${Math.floor(i/2)+1}. ${white}${black ? '  '+black : ''}`;
      movesEl.appendChild(li);
    }
    return;
  }
  const sans = game.history();
  for (let i=0; i<sans.length; i+=2) {
    const li = document.createElement('li');
    li.textContent = `${i/2+1}. ${sans[i]}${sans[i+1] ? '  '+sans[i+1] : ''}`;
    movesEl.appendChild(li);
  }
}

async function resign() {
  if (game.isGameOver()) return;
  if (onlineGame) {
    const winner = onlineColor === 'white' ? 'black' : 'white';
    const { error } = await supabase.from('games').update({status:'finished',winner,result_reason:`by resignation (${onlineColor === 'white' ? 'White' : 'Black'} resigned)`}).eq('id',onlineGame.id);
    if (error) alert('Could not send resignation.');
    return;
  }
  const resigning = game.turn()==='w'?'White':'Black';
  const winner = resigning==='White'?'Black':'White';
  modalShown=true;
  resultTitle.textContent=`${winner} wins`;
  resultReason.textContent=`by resignation (${resigning} resigned)`;
  resultIcon.textContent=winner==='White'?'♔':'♚';
  turnText.textContent='Game over';
  document.getElementById('resign').disabled=true;
  resultModal.classList.remove('hidden');
}

function leaveOnlineGame() {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
  onlineGame = null;
  onlineColor = null;
  onlineMoves = [];
  document.getElementById('promotionModal')?.remove();
  promotionResolver = null;
}

document.getElementById('newGame').addEventListener('click',start);
document.getElementById('onlineGame').addEventListener('click',openOnline);
document.getElementById('onlineBack').addEventListener('click',() => { leaveOnlineGame(); setScreen(home); });
document.getElementById('makeGame').addEventListener('click',async () => { try { await makeOnlineGame(); } catch(e) { console.error(e); onlineStatus.textContent='Could not create game. Check your Supabase setup.'; createdBox.classList.add('hidden'); } });
document.getElementById('joinGame').addEventListener('click',() => { joinBox.classList.remove('hidden'); createdBox.classList.add('hidden'); onlineStatus.textContent=''; gameCodeInput.focus(); });
document.getElementById('confirmJoin').addEventListener('click',async () => { try { await joinOnlineGame(); } catch(e) { console.error(e); onlineStatus.textContent='Could not join game. Check your Supabase setup.'; } });
document.getElementById('copyCode').addEventListener('click',async () => { try { await navigator.clipboard.writeText(createdCode.textContent); waitingText.textContent='Code copied! Waiting for opponent...'; } catch { waitingText.textContent='Copy failed. Share the code manually.'; } });
gameCodeInput.addEventListener('input',e => { e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6); });
gameCodeInput.addEventListener('keydown',e => { if(e.key==='Enter') document.getElementById('confirmJoin').click(); });
