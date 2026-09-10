import { Chess } from "https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm";

const ENGINE_URL = "https://unpkg.com/stockfish@18.0.8/bin/stockfish-18-single.js";
const DEPTH = 18;
let engine = null;
let ready = false;
let busy = false;
let lastSignature = "";
let engineResolve = null;
let latestScore = null;
let latestMate = null;
let readyWaiters = [];

const $ = id => document.getElementById(id);

const classes = {
  "Missed Win": { icon: "−", class: "missed-win" },
  "Miss": { icon: "×", class: "miss" },
  "Mistake": { icon: "?", class: "mistake" },
  "Interesting": { icon: "!?", class: "interesting" },
  "Inaccuracy": { icon: "?!", class: "inaccuracy" },
  "Book": { icon: "📚", class: "book" },
  "Good": { icon: "✓", class: "good" },
  "Excellent": { icon: "👍", class: "excellent" },
  "Best": { icon: "⭐", class: "best" },
  "Great": { icon: "!", class: "great" },
  "Brilliant": { icon: "!!", class: "brilliant" },
  "Blunder": { icon: "??", class: "blunder" }
};

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function resolveReady() {
  const waiters = readyWaiters;
  readyWaiters = [];
  waiters.forEach(resolve => resolve(true));
}

function rejectReady() {
  const waiters = readyWaiters;
  readyWaiters = [];
  waiters.forEach(resolve => resolve(false));
}

function initEngine() {
  if (engine) return;
  try {
    engine = new Worker(ENGINE_URL);
    engine.onmessage = event => handleEngineMessage(event.data);
    engine.onerror = event => {
      console.warn("Stockfish review engine error", event);
      ready = false;
      busy = false;
      if (engineResolve) {
        const resolve = engineResolve;
        engineResolve = null;
        resolve(null);
      }
      rejectReady();
      try { engine?.terminate(); } catch {}
      engine = null;
    };
    engine.postMessage("uci");
  } catch (error) {
    console.warn("Could not start Stockfish", error);
    engine = null;
    rejectReady();
  }
}

function parseScore(tokens) {
  for (let i = 0; i < tokens.length - 2; i++) {
    if (tokens[i] === "score" && tokens[i + 1] === "cp") {
      const value = Number(tokens[i + 2]);
      if (Number.isFinite(value)) return { score: value, mate: null };
    }
    if (tokens[i] === "score" && tokens[i + 1] === "mate") {
      const value = Number(tokens[i + 2]);
      if (Number.isFinite(value)) return { score: null, mate: value };
    }
  }
  return null;
}

function handleEngineMessage(line) {
  if (typeof line !== "string") return;
  const text = line.trim();
  if (!text) return;

  if (text === "uciok") {
    engine?.postMessage("setoption name Threads value 1");
    engine?.postMessage("setoption name Hash value 64");
    engine?.postMessage("isready");
    return;
  }

  if (text.startsWith("info ")) {
    const parsed = parseScore(text.split(/\s+/));
    if (parsed) {
      latestScore = parsed.score;
      latestMate = parsed.mate;
    }
    return;
  }

  if (text === "readyok") {
    ready = true;
    resolveReady();
    return;
  }

  if (text.startsWith("bestmove ")) {
    const tokens = text.split(/\s+/);
    const best = tokens[1] && tokens[1] !== "(none)" ? tokens[1] : null;
    const resolve = engineResolve;
    engineResolve = null;
    busy = false;
    if (resolve) resolve({ best, score: latestScore, mate: latestMate });
  }
}

async function ensureEngine() {
  initEngine();
  if (ready) return true;
  return new Promise(resolve => {
    readyWaiters.push(resolve);
    setTimeout(() => {
      const index = readyWaiters.indexOf(resolve);
      if (index !== -1) {
        readyWaiters.splice(index, 1);
        resolve(false);
      }
    }, 12000);
  });
}

async function search(fen) {
  if (!(await ensureEngine())) return null;
  while (busy) await wait(20);

  busy = true;
  latestScore = null;
  latestMate = null;

  return new Promise(resolve => {
    engineResolve = resolve;
    engine.postMessage("ucinewgame");
    engine.postMessage("isready");

    const start = () => {
      if (!engine || !busy) return;
      if (ready) {
        engine.postMessage(`position fen ${fen}`);
        engine.postMessage(`go depth ${DEPTH}`);
      } else {
        setTimeout(start, 20);
      }
    };
    start();
  });
}

function getMoveSans() {
  return [...document.querySelectorAll("#moves .move-san")]
    .map(element => element.textContent.trim())
    .filter(Boolean);
}

function replay(sans) {
  const chess = new Chess();
  const before = [];
  for (const san of sans) {
    const fen = chess.fen();
    let move;
    try {
      move = chess.move(san);
    } catch {
      return null;
    }
    before.push({ fen, move, san });
  }
  return { game: chess, before };
}

function cpScore(result, mover) {
  if (!result) return null;
  if (result.mate !== null && result.mate !== undefined) {
    const n = Math.abs(result.mate);
    const score = result.mate > 0 ? 100000 - n * 1000 : -100000 + n * 1000;
    return mover === "w" ? score : -score;
  }
  if (result.score === null || result.score === undefined) return null;
  return mover === "w" ? result.score : -result.score;
}

function expectedPoints(cp) {
  if (cp === null || cp === undefined) return 0.5;
  return 1 / (1 + Math.exp(-cp / 360));
}

function material(chess, color) {
  const values = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
  let score = 0;
  for (const row of chess.board()) {
    for (const piece of row) {
      if (piece) score += (piece.color === color ? 1 : -1) * values[piece.type];
    }
  }
  return score;
}

function commonBook(sans) {
  const position = sans.join(" ");
  const prefixes = [
    "e4 e5", "e4 c5", "e4 e6", "e4 c6", "e4 d5",
    "d4 d5", "d4 Nf6", "d4 f5", "c4 e5", "c4 Nf6",
    "Nf3 d5", "Nf3 Nf6", "e4 e5 Nf3 Nc6", "e4 e5 Nf3 Nf6",
    "e4 c5 Nf3 d6", "e4 c5 Nf3 Nc6", "d4 Nf6 c4 g6",
    "d4 d5 c4 e6", "c4 e5 Nc3 Nf6"
  ];
  return prefixes.some(prefix => position === prefix || position.startsWith(prefix + " ")) && sans.length <= 12;
}

function classify(best, played, epLoss, isBest, sacrifice, sans) {
  if (commonBook(sans)) return "Book";

  const loss = Math.max(0, best - played);

  if (isBest && sacrifice && played > -150 && best < 150) return "Brilliant";
  if (best >= 300 && played < 100) return epLoss >= 0.20 ? "Missed Win" : "Miss";
  if (isBest && loss <= 5) return "Best";
  if (isBest && loss <= 20) return "Excellent";
  if (isBest && loss > 80) return "Great";
  if (sacrifice && loss <= 80) return "Interesting";
  if (loss <= 20 || epLoss < 0.02) return "Excellent";
  if (loss <= 50 || epLoss < 0.05) return "Good";
  if (loss <= 100 || epLoss < 0.10) return "Inaccuracy";
  if (loss <= 200 || epLoss < 0.20) return "Mistake";
  return "Blunder";
}

async function analyzeLatest() {
  const sans = getMoveSans();
  if (!sans.length) {
    clearReview();
    return;
  }

  const signature = sans.join("|");
  if (signature === lastSignature) return;

  const data = replay(sans);
  if (!data) return;

  const index = sans.length - 1;
  const pre = new Chess();
  if (!pre.load(data.before[index].fen)) return;

  const played = data.before[index].move;
  const post = new Chess();
  if (!post.load(data.before[index].fen)) return;
  try {
    post.move(sans[index]);
  } catch {
    return;
  }

  const mover = pre.turn();
  lastSignature = signature;

  const beforeEval = await search(pre.fen());
  if (!beforeEval) return;
  const afterEval = await search(post.fen());
  if (!afterEval) return;

  const best = cpScore(beforeEval, mover);
  const playedScore = cpScore(afterEval, mover);
  if (best === null || playedScore === null) return;

  const loss = Math.max(0, best - playedScore);
  const beforeEP = expectedPoints(best);
  const afterEP = expectedPoints(playedScore);
  const epLoss = Math.max(0, beforeEP - afterEP);
  const bestUci = beforeEval.best;
  const playedUci = played.from + played.to + (played.promotion || "");
  const isBest = bestUci === playedUci;
  const sacrifice = material(post, mover) < material(pre, mover) - 100;
  const label = classify(best, playedScore, epLoss, isBest, sacrifice, sans);
  const info = classes[label] || classes.Good;

  placeReviewBadge(played.to, info, label);
  updateEngineEval(playedScore);
  updateReviewList(label);
}

function updateEngineEval(cp) {
  const pawns = cp / 100;
  const clamped = Math.max(-5, Math.min(5, pawns));
  const pct = ((clamped + 5) / 10) * 100;
  const fill = $("evalFill");
  const marker = $("evalMarker");
  const info = $("evalInfo");

  if (fill) fill.style.height = `${100 - pct}%`;
  if (marker) marker.style.top = `${pct}%`;
  if (info) info.textContent = `SF18 ${pawns >= 0 ? "+" : ""}${pawns.toFixed(2)}`;
}

function placeReviewBadge(square, info, label) {
  document.querySelectorAll(".review-square-badge").forEach(element => element.remove());
  const squareElement = document.querySelector(`#board [data-square="${square}"]`);
  if (!squareElement) return;

  const badge = document.createElement("span");
  badge.className = `review-square-badge ${info.class}`;
  badge.innerHTML = `<span class="review-icon">${info.icon}</span><span class="review-word">${label}</span>`;
  badge.title = label;
  squareElement.appendChild(badge);
}

function updateReviewList(label) {
  document.querySelectorAll("#moves .move-badge").forEach(element => element.remove());
  const rows = document.querySelectorAll("#moves .move-row");
  const row = rows[rows.length - 1];
  if (row) row.dataset.classification = label;
}

function clearReview() {
  document.querySelectorAll(".review-square-badge").forEach(element => element.remove());
  document.querySelectorAll("#moves .move-badge").forEach(element => element.remove());
  lastSignature = "";
}

let analysisTimer = null;
const observer = new MutationObserver(() => {
  const signature = getMoveSans().join("|");
  if (signature !== lastSignature) {
    clearTimeout(analysisTimer);
    analysisTimer = setTimeout(analyzeLatest, 180);
  }
});

function boot() {
  const board = $("board");
  const moves = $("moves");
  if (!board || !moves) return;

  observer.observe(board, { childList: true, subtree: true, characterData: true });
  observer.observe(moves, { childList: true, subtree: true, characterData: true });

  initEngine();
  setTimeout(analyzeLatest, 900);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}

window.addEventListener("beforeunload", () => {
  try { engine?.terminate(); } catch {}
});
