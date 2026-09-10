import { Chess } from "https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm";

const ENGINE_URL = "https://unpkg.com/stockfish@18.0.8/bin/stockfish-18-single.js";
const DEPTH = 18;
let engine = null, ready = false, busy = false, lastSignature = "";
let engineResolve = null, latestScore = null, latestMate = null, readyWaiters = [];

const $ = id => document.getElementById(id);
const classes = {
  "Missed Win": { icon: "−", class: "missed-win" }, "Miss": { icon: "×", class: "miss" },
  "Mistake": { icon: "?", class: "mistake" }, "Interesting": { icon: "!?", class: "interesting" },
  "Inaccuracy": { icon: "?!", class: "inaccuracy" }, "Book": { icon: "📚", class: "book" },
  "Good": { icon: "✓", class: "good" }, "Excellent": { icon: "👍", class: "excellent" },
  "Best": { icon: "⭐", class: "best" }, "Great": { icon: "!", class: "great" },
  "Brilliant": { icon: "!!", class: "brilliant" }, "Blunder": { icon: "??", class: "blunder" }
};

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function resolveReady(ok) {
  const waiters = readyWaiters; readyWaiters = [];
  waiters.forEach(resolve => resolve(ok));
}

function initEngine() {
  if (engine) return;
  try {
    engine = new Worker(ENGINE_URL);
    engine.onmessage = event => handleEngineMessage(event.data);
    engine.onerror = event => {
      console.warn("Stockfish review engine error", event);
      ready = false; busy = false;
      if (engineResolve) { const resolve = engineResolve; engineResolve = null; resolve(null); }
      resolveReady(false);
      try { engine?.terminate(); } catch {}
      engine = null;
    };
    engine.postMessage("uci");
  } catch (error) {
    console.warn("Could not start Stockfish", error); engine = null; resolveReady(false);
  }
}

function parseScore(tokens) {
  for (let i = 0; i < tokens.length - 2; i++) {
    if (tokens[i] === "score" && tokens[i + 1] === "cp") {
      const value = Number(tokens[i + 2]); if (Number.isFinite(value)) return { score: value, mate: null };
    }
    if (tokens[i] === "score" && tokens[i + 1] === "mate") {
      const value = Number(tokens[i + 2]); if (Number.isFinite(value)) return { score: null, mate: value };
    }
  }
  return null;
}

function handleEngineMessage(line) {
  if (typeof line !== "string") return;
  const text = line.trim(); if (!text) return;
  if (text === "uciok") {
    engine?.postMessage("setoption name Threads value 1");
    engine?.postMessage("setoption name Hash value 64");
    engine?.postMessage("isready"); return;
  }
  if (text.startsWith("info ")) {
    const parsed = parseScore(text.split(/\s+/));
    if (parsed) { latestScore = parsed.score; latestMate = parsed.mate; }
    return;
  }
  if (text === "readyok") { ready = true; resolveReady(true); return; }
  if (text.startsWith("bestmove ")) {
    const tokens = text.split(/\s+/);
    const best = tokens[1] && tokens[1] !== "(none)" ? tokens[1] : null;
    const resolve = engineResolve; engineResolve = null; busy = false;
    if (resolve) resolve({ best, score: latestScore, mate: latestMate });
  }
}

async function ensureEngine() {
  initEngine();
  if (ready) return true;
  return new Promise(resolve => {
    readyWaiters.push(resolve);
    setTimeout(() => {
      const i = readyWaiters.indexOf(resolve);
      if (i !== -1) { readyWaiters.splice(i, 1); resolve(false); }
    }, 12000);
  });
}

async function search(fen) {
  if (!(await ensureEngine())) return null;
  while (busy) await wait(20);
  busy = true; latestScore = null; latestMate = null;
  return new Promise(resolve => {
    engineResolve = resolve;
    engine.postMessage("ucinewgame");
    engine.postMessage("isready");
    const start = () => {
      if (!engine || !busy) return;
      if (ready) { engine.postMessage(`position fen ${fen}`); engine.postMessage(`go depth ${DEPTH}`); }
      else setTimeout(start, 20);
    };
    start();
  });
}

function getMoveSans() { return [...document.querySelectorAll("#moves .move-san")].map(x => x.textContent.trim()).filter(Boolean); }

function replay(sans) {
  const chess = new Chess(), before = [];
  for (const san of sans) {
    const fen = chess.fen(); let move;
    try { move = chess.move(san); } catch { return null; }
    before.push({ fen, move, san });
  }
  return { game: chess, before };
}

function cpScore(result, mover) {
  if (!result) return null;
  if (result.mate !== null && result.mate !== undefined) {
    const n = Math.abs(result.mate), score = result.mate > 0 ? 100000 - n * 1000 : -100000 + n * 1000;
    return mover === "w" ? score : -score;
  }
  if (result.score === null || result.score === undefined) return null;
  return mover === "w" ? result.score : -result.score;
}

function expectedPoints(cp) { return cp == null ? .5 : 1 / (1 + Math.exp(-cp / 360)); }

function material(chess, color) {
  const values = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 }; let score = 0;
  for (const row of chess.board()) for (const piece of row) if (piece) score += (piece.color === color ? 1 : -1) * values[piece.type];
  return score;
}

function commonBook(sans) {
  const p = sans.join(" ");
  const prefixes = ["e4 e5", "e4 c5", "e4 e6", "e4 c6", "e4 d5", "d4 d5", "d4 Nf6", "d4 f5", "c4 e5", "c4 Nf6", "Nf3 d5", "Nf3 Nf6", "e4 e5 Nf3 Nc6", "e4 e5 Nf3 Nf6", "e4 c5 Nf3 d6", "e4 c5 Nf3 Nc6", "d4 Nf6 c4 g6", "d4 d5 c4 e6", "c4 e5 Nc3 Nf6"];
  return prefixes.some(x => p === x || p.startsWith(x + " ")) && sans.length <= 12;
}

function classify(best, played, epLoss, isBest, sacrifice, sans) {
  if (commonBook(sans)) return "Book";
  const loss = Math.max(0, best - played);
  if (isBest && sacrifice && played > -150 && best < 150) return "Brilliant";
  if (best >= 300 && played < 100) return epLoss >= .20 ? "Missed Win" : "Miss";
  if (isBest && loss <= 5) return "Best";
  if (isBest && loss <= 20) return "Excellent";
  if (isBest && loss > 80) return "Great";
  if (sacrifice && loss <= 80) return "Interesting";
  if (loss <= 20 || epLoss < .02) return "Excellent";
  if (loss <= 50 || epLoss < .05) return "Good";
  if (loss <= 100 || epLoss < .10) return "Inaccuracy";
  if (loss <= 200 || epLoss < .20) return "Mistake";
  return "Blunder";
}

async function refreshCurrentEvaluation() {
  if (busy) return;
  const board = $("board");
  if (!board) return;
  const chess = new Chess();
  const sans = getMoveSans();
  if (sans.length) {
    const replayed = replay(sans); if (!replayed) return;
    chess.load(replayed.game.fen());
  }
  const result = await search(chess.fen());
  const cp = cpScore(result, chess.turn());
  if (cp !== null) updateEngineEval(cp);
}

async function analyzeLatest() {
  const sans = getMoveSans();
  if (!sans.length) {
    clearReview();
    await refreshCurrentEvaluation();
    return;
  }
  const signature = sans.join("|");
  if (signature === lastSignature) return;
  const data = replay(sans); if (!data) return;
  const index = sans.length - 1, pre = new Chess();
  if (!pre.load(data.before[index].fen)) return;
  const played = data.before[index].move, post = new Chess();
  if (!post.load(data.before[index].fen)) return;
  try { post.move(sans[index]); } catch { return; }
  const mover = pre.turn(); lastSignature = signature;
  const beforeEval = await search(pre.fen()); if (!beforeEval) return;
  const afterEval = await search(post.fen()); if (!afterEval) return;
  const best = cpScore(beforeEval, mover), playedScore = cpScore(afterEval, mover);
  if (best === null || playedScore === null) return;
  const loss = Math.max(0, best - playedScore);
  const epLoss = Math.max(0, expectedPoints(best) - expectedPoints(playedScore));
  const bestUci = beforeEval.best, playedUci = played.from + played.to + (played.promotion || "");
  const isBest = bestUci === playedUci;
  const sacrifice = material(post, mover) < material(pre, mover) - 100;
  const label = classify(best, playedScore, epLoss, isBest, sacrifice, sans);
  const info = classes[label] || classes.Good;
  placeReviewBadge(played.to, info, label);
  updateEngineEval(playedScore);
  updateReviewList(label);
}

function updateEngineEval(cp) {
  const pawns = cp / 100, clamped = Math.max(-5, Math.min(5, pawns)), pct = ((clamped + 5) / 10) * 100;
  const fill = $("evalFill"), marker = $("evalMarker"), info = $("evalInfo");
  if (fill) fill.style.height = `${pct}%`;
  if (marker) marker.style.top = `${100 - pct}%`;
  if (info) info.textContent = `SF18 ${pawns >= 0 ? "+" : ""}${pawns.toFixed(2)}`;
}

function placeReviewBadge(square, info, label) {
  document.querySelectorAll(".review-square-badge").forEach(x => x.remove());
  const squareElement = document.querySelector(`#board [data-square="${square}"]`); if (!squareElement) return;
  const badge = document.createElement("span");
  badge.className = `review-square-badge ${info.class}`;
  badge.innerHTML = `<span class="review-icon">${info.icon}</span><span class="review-word">${label}</span>`;
  badge.title = label; squareElement.appendChild(badge);
}

function updateReviewList(label) {
  document.querySelectorAll("#moves .move-badge").forEach(x => x.remove());
  const rows = document.querySelectorAll("#moves .move-row"), row = rows[rows.length - 1];
  if (row) row.dataset.classification = label;
}

function clearReview() {
  document.querySelectorAll(".review-square-badge").forEach(x => x.remove());
  document.querySelectorAll("#moves .move-badge").forEach(x => x.remove());
  lastSignature = "";
}

let analysisTimer = null;
const observer = new MutationObserver(() => {
  const signature = getMoveSans().join("|");
  if (signature !== lastSignature) { clearTimeout(analysisTimer); analysisTimer = setTimeout(analyzeLatest, 180); }
});

function boot() {
  const board = $("board"), moves = $("moves"); if (!board || !moves) return;
  observer.observe(board, { childList: true, subtree: true, characterData: true });
  observer.observe(moves, { childList: true, subtree: true, characterData: true });
  initEngine();
  setTimeout(analyzeLatest, 900);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();
window.addEventListener("beforeunload", () => { try { engine?.terminate(); } catch {} });
