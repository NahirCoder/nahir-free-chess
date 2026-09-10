import { Chess } from "https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm";

const ENGINE_URL="https://unpkg.com/stockfish@18.0.8/bin/stockfish-18-lite-single.js";
const DEPTH=18;
let engine=null,ready=false,busy=false,queued=null,lastSignature="",latestKey="";
const $=id=>document.getElementById(id);
const files=["a","b","c","d","e","f","g","h"];
const glyphToPiece={"♙":"P","♟":"p","♘":"N","♞":"n","♗":"B","♝":"b","♖":"R","♜":"r","♕":"Q","♛":"q","♔":"K","♚":"k"};
const classes={
  "Missed Win":{icon:"−",class:"missed-win"},"Miss":{icon:"×",class:"miss"},"Mistake":{icon:"?",class:"mistake"},"Interesting":{icon:"!?",class:"interesting"},"Inaccuracy":{icon:"?!",class:"inaccuracy"},"Book":{icon:"📚",class:"book"},"Good":{icon:"✓",class:"good"},"Excellent":{icon:"👍",class:"excellent"},"Best":{icon:"⭐",class:"best"},"Great":{icon:"!",class:"great"},"Brilliant":{icon:"!!",class:"brilliant"},"Blunder":{icon:"??",class:"blunder"}
};
function wait(ms){return new Promise(r=>setTimeout(r,ms))}
function initEngine(){if(engine)return;try{engine=new Worker(ENGINE_URL);engine.onmessage=e=>handleEngine(e.data);engine.onerror=e=>{console.warn("Stockfish review engine error",e);ready=false;busy=false;engine=null};engine.postMessage("uci")}catch(e){console.warn("Could not start Stockfish",e)}}
let engineResolve=null,engineLines=[];
function handleEngine(line){if(typeof line!=="string")return;if(line==="uciok"){engine.postMessage("setoption name Threads value 1");engine.postMessage("isready");return}if(line==="readyok"){ready=true;return}if(line.startsWith("info ")){engineLines.push(line);return}if(line.startsWith("bestmove ")){const parts=line.trim().split(/\s+/);const best=parts[1]||null;let score=null,mate=null;for(let i=0;i<parts.length-1;i++){if(parts[i]==="score"&&parts[i+1]==="cp")score=Number(parts[i+2]);if(parts[i]==="score"&&parts[i+1]==="mate")mate=Number(parts[i+2])}const r=engineResolve;engineResolve=null;busy=false;if(r)r({best,score,mate})}}
async function ensureEngine(){initEngine();for(let i=0;i<80&&!ready;i++)await wait(100);return ready}
function search(fen){return new Promise(async resolve=>{if(!(await ensureEngine()))return resolve(null);if(busy){queued={fen,resolve};return}busy=true;engineResolve=resolve;engineLines=[];engine.postMessage("ucinewgame");engine.postMessage("isready");const waitReady=()=>{if(ready){engine.postMessage(`position fen ${fen}`);engine.postMessage(`go depth ${DEPTH}`)}else setTimeout(waitReady,20)};waitReady()})}
function getMoveSans(){return [...document.querySelectorAll("#moves .move-san")].map(x=>x.textContent.trim()).filter(Boolean)}
function replay(sans,count=sans.length){const c=new Chess();const before=[];for(let i=0;i<count;i++){const fen=c.fen(),san=sans[i];let mv;try{mv=c.move(san)}catch{return null}before.push({fen,move:mv,san});}return {game:c,before}}
function cpScore(result,mover){if(!result)return null;if(result.mate!==null&&result.mate!==undefined){const n=Math.abs(result.mate);return result.mate>0?(100000-n*1000):(-100000+n*1000)}if(result.score===null||result.score===undefined)return null;return mover==="w"?result.score:-result.score}
function ep(v){if(v===null)return .5;return 1/(1+Math.exp(-v/360))}
function material(c,color){const vals={p:100,n:320,b:330,r:500,q:900,k:0};let s=0;for(const row of c.board())for(const p of row)if(p)s+=(p.color===color?1:-1)*vals[p.type];return s}
function commonBook(sans){const p=sans.join(" ");const prefixes=["e4 e5","e4 c5","e4 e6","e4 c6","e4 d5","d4 d5","d4 Nf6","d4 f5","c4 e5","c4 Nf6","Nf3 d5","Nf3 Nf6","e4 e5 Nf3 Nc6","e4 e5 Nf3 Nf6","e4 c5 Nf3 d6","e4 c5 Nf3 Nc6","d4 Nf6 c4 g6","d4 d5 c4 e6","c4 e5 Nc3 Nf6"];return prefixes.some(x=>p===x||p.startsWith(x+" "))&&sans.length<=12}
async function analyzeLatest(){
 const sans=getMoveSans();if(!sans.length)return clearReview();const sig=sans.join("|");if(sig===lastSignature)return;lastSignature=sig;
 const data=replay(sans);if(!data)return;const idx=sans.length-1,pre=new Chess();pre.load(data.before[idx].fen);const played=data.before[idx].move;const post=new Chess();post.load(data.before[idx].fen);try{post.move(sans[idx])}catch{return}
 const mover=pre.turn();const [beforeEval,afterEval]=await Promise.all([search(pre.fen()),search(post.fen())]);
 const best=cpScore(beforeEval,mover),playedScore=cpScore(afterEval,mover);if(best===null||playedScore===null)return;
 const loss=Math.max(0,best-playedScore),beforeEP=ep(best),afterEP=ep(playedScore),epLoss=Math.max(0,beforeEP-afterEP);
 const bestUci=beforeEval.best;const playedUci=played.from+played.to+(played.promotion||"");const isBest=bestUci===playedUci;
 const sacrifice=material(post,mover)<material(pre,mover)-100;
 let label;
 if(commonBook(sans)){label="Book"}
 else if(isBest&&sacrifice&&playedScore>-150&&best<150){label="Brilliant"}
 else if(isBest&&loss===0&&best-playedScore<15){label="Best"}
 else if(isBest&&loss<=20){label="Excellent"}
 else if(isBest){label="Best"}
 else if(best>=300&&playedScore<100){label=epLoss>=.20?"Missed Win":"Miss"}
 else if(sacrifice&&loss<=80){label="Interesting"}
 else if(loss<=20||epLoss<.02){label="Excellent"}
 else if(loss<=50||epLoss<.05){label="Good"}
 else if(loss<=100||epLoss<.10){label="Inaccuracy"}
 else if(loss<=200||epLoss<.20){label="Mistake"}
 else label="Blunder";
 if(label!=="Brilliant"&&isBest&&best-playedScore>80)label="Great";
 if(bestUci===playedUci&&label!=="Book"&&label!=="Brilliant")label=loss<=5?"Best":label;
 const info=classes[label]||classes.Good;placeReviewBadge(played.to,info,label);updateEngineEval(playedScore);updateReviewList(label,info);
 latestKey=`${sig}:${label}`;
}
function updateEngineEval(cp){const pawns=cp/100,clamped=Math.max(-5,Math.min(5,pawns)),pct=(clamped+5)/10*100;const fill=$("evalFill"),marker=$("evalMarker"),info=$("evalInfo");if(fill)fill.style.height=`${100-pct}%`;if(marker)marker.style.top=`${pct}%`;if(info)info.textContent=`SF18 ${pawns>=0?"+":""}${pawns.toFixed(2)}`}
function placeReviewBadge(square,info,label){document.querySelectorAll(".review-square-badge").forEach(x=>x.remove());const el=document.querySelector(`#board [data-square="${square}"]`);if(!el)return;const b=document.createElement("span");b.className=`review-square-badge ${info.class}`;b.innerHTML=`<span class="review-icon">${info.icon}</span><span class="review-word">${label}</span>`;b.title=label;el.appendChild(b)}
function updateReviewList(label,info){document.querySelectorAll("#moves .move-badge").forEach(x=>x.remove());const rows=[...document.querySelectorAll("#moves .move-row")];const row=rows.at(-1);if(row)row.dataset.classification=label}
function clearReview(){document.querySelectorAll(".review-square-badge").forEach(x=>x.remove());document.querySelectorAll("#moves .move-badge").forEach(x=>x.remove());lastSignature=""}
function refresh(){clearReview();const sans=getMoveSans();if(sans.length)setTimeout(analyzeLatest,80)}
const observer=new MutationObserver(()=>{const sans=getMoveSans();const sig=sans.join("|");if(sig!==lastSignature){lastSignature=sig;setTimeout(analyzeLatest,100)}});
function boot(){initEngine();const board=$("board"),moves=$("moves");if(!board||!moves)return;observer.observe(board,{childList:true,subtree:true});observer.observe(moves,{childList:true,subtree:true,characterData:true});const old=window.history.length;setTimeout(refresh,500)}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
window.addEventListener("beforeunload",()=>{try{engine?.terminate()}catch{}});
