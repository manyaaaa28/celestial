/**
 * GasGuard Smart Keeper  v2.0
 * ────────────────────────────
 * Predictive execution: finds the lowest gas price within your deadline window.
 *
 * Algorithm:
 *   urgency = how much of the time window has been used (0→1)
 *   threshold_percentile = lerp(10th, 60th, urgency)
 *     → Early: only execute if gas is in bottom 10% of 48h history
 *     → Late:  relaxes to bottom 60% as deadline approaches
 *   Safety net: if < 2h left → execute at any price ≤ hard cap
 *   Hard cap: absolute ceiling stored in contract — never exceed it
 *
 * Bootstrap (< 20 readings): uses minimum seen so far as threshold.
 */

require('dotenv').config();
const { ethers } = require('ethers');
const fs   = require('fs');
const path = require('path');

// ─── ANSI colours ─────────────────────────────────────────────────────────
const C = {
  reset:'\x1b[0m', bold:'\x1b[1m', dim:'\x1b[2m',
  red:'\x1b[31m', green:'\x1b[32m', yellow:'\x1b[33m',
  blue:'\x1b[34m', cyan:'\x1b[36m',
};
const bold   = s => `${C.bold}${s}${C.reset}`;
const dim    = s => `${C.dim}${s}${C.reset}`;
const green  = s => `${C.green}${s}${C.reset}`;
const red    = s => `${C.red}${s}${C.reset}`;
const yellow = s => `${C.yellow}${s}${C.reset}`;
const cyan   = s => `${C.cyan}${s}${C.reset}`;
const blue   = s => `${C.blue}${s}${C.reset}`;

function ts()             { return dim(`[${new Date().toLocaleTimeString()}]`); }
function log(icon, msg)   { console.log(`${ts()} ${icon}  ${msg}`); }
function logSection(t)    { console.log(`\n${C.bold}${C.cyan}── ${t} ${'─'.repeat(Math.max(0,44-t.length))}${C.reset}`); }

// ─── HELPERS ──────────────────────────────────────────────────────────────
function shortAddr(a)   { return `${a.slice(0,6)}…${a.slice(-4)}`; }
function gweiStr(wei)   { return `${(Number(wei)/1e9).toFixed(4)} Gwei`; }
function ethStr(wei)    { return `${parseFloat(ethers.formatEther(wei)).toFixed(4)} ETH`; }
function lerp(a,b,t)    { return a + (b-a) * Math.max(0, Math.min(1, t)); }

function timeLeft(exp) {
  const s = exp - Math.floor(Date.now()/1000);
  if (s<=0) return red('EXPIRED');
  if (s<3600)  return yellow(`${Math.round(s/60)}m`);
  if (s<86400) return yellow(`${Math.round(s/3600)}h ${Math.round((s%3600)/60)}m`);
  return `${Math.round(s/86400)}d ${Math.round((s%86400)/3600)}h`;
}

function urgencyBar(u, w=20) {
  const f = Math.round(u * w);
  const col = u < 0.5 ? C.green : u < 0.8 ? C.yellow : C.red;
  return col+'█'.repeat(f)+C.dim+'░'.repeat(w-f)+C.reset;
}

function getPercentile(sorted, p) {
  if (!sorted.length) return null;
  const i = Math.min(Math.floor((p/100)*sorted.length), sorted.length-1);
  return sorted[Math.max(0, i)];
}

// ─── CONFIG ───────────────────────────────────────────────────────────────
const IS_SEPOLIA       = !!process.env.SEPOLIA_RPC_URL;
const RPC_URL          = process.env.SEPOLIA_RPC_URL || 'http://127.0.0.1:8545';
const PRIVATE_KEY      = process.env.PRIVATE_KEY;
const NETWORK_NAME     = IS_SEPOLIA ? 'Sepolia Testnet' : 'Hardhat Local';
const POLL_INTERVAL    = Number(process.env.POLL_INTERVAL_SECONDS || 30) * 1000;
const MAX_HISTORY      = 5760;   // 48 h × 120 readings/h
const BOOTSTRAP_MIN    = 20;     // min readings before percentile is meaningful
const SAFETY_NET_SECS  = 2*3600; // 2 h before deadline → execute regardless

let CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
if (!CONTRACT_ADDRESS) {
  const p = path.join(__dirname, '..', 'deployed.json');
  if (fs.existsSync(p)) {
    try { CONTRACT_ADDRESS = JSON.parse(fs.readFileSync(p,'utf8')).address; } catch {}
  }
}
if (!CONTRACT_ADDRESS) CONTRACT_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3';

// ─── PERSISTENCE ──────────────────────────────────────────────────────────
const HISTORY_PATH  = path.join(__dirname, '..', 'gas_history.json');
const TX_STATE_PATH = path.join(__dirname, '..', 'tx_state.json');

// Gas history — array of BigInt (wei)
let gasHistory = [];
let gasSorted  = [];

function loadHistory() {
  if (!fs.existsSync(HISTORY_PATH)) return;
  try {
    const raw = JSON.parse(fs.readFileSync(HISTORY_PATH,'utf8'));
    gasHistory = (raw.readings||[]).map(v => BigInt(v));
    rebuildSorted();
    log('📂', `Loaded ${gasHistory.length} gas readings from history`);
  } catch {}
}
function saveHistory() {
  try {
    fs.writeFileSync(HISTORY_PATH, JSON.stringify({
      updated: new Date().toISOString(),
      count:   gasHistory.length,
      readings: gasHistory.map(v => v.toString()),
    }));
  } catch {}
}
function addReading(gas) {
  gasHistory.push(gas);
  if (gasHistory.length > MAX_HISTORY) gasHistory.shift();
  rebuildSorted();
}
function rebuildSorted() {
  gasSorted = [...gasHistory].sort((a,b) => a < b ? -1 : a > b ? 1 : 0);
}

// TX state — tracks firstSeen time per tx id
let txState = {};

function loadTxState() {
  if (!fs.existsSync(TX_STATE_PATH)) return;
  try { txState = JSON.parse(fs.readFileSync(TX_STATE_PATH,'utf8')); } catch {}
}
function saveTxState() {
  try { fs.writeFileSync(TX_STATE_PATH, JSON.stringify(txState, null, 2)); } catch {}
}

// ─── STRATEGY: Local Minimum Detection ────────────────────────────────────
// We fire when:
//   1. Current gas is at or below the min of the last N readings (we caught a dip)
//   2. AND the previous reading was lower than the one before it (gas was falling)
//   3. AND now gas is rising or flat (the trough has passed)
// Safety net: if < 2h to deadline → fire regardless

const LOCAL_WIN   = 6;   // look back 6 readings (3 min) to detect a local dip
const GLOBAL_WIN  = 240; // look back 240 readings (2h) for a global reference

function isLocalMinimum(currentGas) {
  if (gasHistory.length < 3) return false; // not enough data yet

  const recent = gasHistory.slice(-LOCAL_WIN);
  const localMin = recent.reduce((a, b) => a < b ? a : b);

  // Current gas is at or below the recent minimum (we're at the bottom of a dip)
  const atOrBelowLocalMin = currentGas <= localMin;

  // Check if the previous reading was lower than the one before it (was falling)
  const last  = gasHistory[gasHistory.length - 1];
  const prev  = gasHistory[gasHistory.length - 2];
  const wasFalling = prev !== undefined && last <= prev;

  // Now rising or flat (trough has passed — ideal moment to catch was just now)
  const nowRising = prev !== undefined && currentGas >= last;

  // Also: if gas is below the global average → it's a genuinely cheap moment
  const globalSlice  = gasHistory.slice(-GLOBAL_WIN);
  const globalAvg    = globalSlice.reduce((a, b) => a + b, 0n) / BigInt(globalSlice.length);
  const belowAverage = currentGas < globalAvg;

  // Fire if: (at a local trough AND below global average) OR (at dip and was falling then rising)
  return (atOrBelowLocalMin && belowAverage) || (wasFalling && nowRising && atOrBelowLocalMin);
}

function getDecision(txIdStr, expiry, currentGas) {
  const now       = Math.floor(Date.now() / 1000);
  const remaining = expiry - now;
  const firstSeen = txState[txIdStr]?.firstSeen ?? (expiry - 172800);
  const total     = Math.max(expiry - firstSeen, 1);
  const urgency   = Math.max(0, Math.min(1, 1 - (remaining / total)));
  const isCrit    = remaining < SAFETY_NET_SECS;

  if (isCrit) {
    return { execute: true, reason: '⚠️  Safety net — < 2h to deadline', urgency, isCrit };
  }

  if (gasHistory.length < 3) {
    return { execute: false, reason: 'Building gas price history…', urgency, isCrit };
  }

  const atDip = isLocalMinimum(currentGas);

  return {
    execute: atDip,
    reason:  atDip ? '✅ Gas is at a local low — perfect moment!' : 'Watching for a gas price dip…',
    urgency,
    isCrit,
  };
}


// ─── ABI ──────────────────────────────────────────────────────────────────
const ABI = [
  'function txCounter() view returns (uint256)',
  'function getTransaction(uint256 txId) view returns (tuple(address payable recipient, uint256 amount, uint256 maxGasPrice, uint256 expiry, address owner, bool executed, bool cancelled))',
  'function executeTransaction(uint256 txId)',
];

// ─── STATS ────────────────────────────────────────────────────────────────
const stats = { rounds: 0, executed: 0, failed: 0 };

// ─── MAIN ─────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n' + C.bold + C.cyan + [
    '╔══════════════════════════════════════════════════╗',
    '║   🤖  GasGuard Smart Keeper  v2.0  🧠            ║',
    '║   Finds the best gas price within your window    ║',
    '╚══════════════════════════════════════════════════╝',
  ].join('\n') + C.reset);

  console.log(`  ${dim('Network :')}  ${yellow(NETWORK_NAME)}`);
  console.log(`  ${dim('Contract:')}  ${cyan(CONTRACT_ADDRESS)}`);
  console.log(`  ${dim('Strategy:')}  predict lowest gas in your deadline window`);
  console.log(`  ${dim('Polling :')}  every ${POLL_INTERVAL/1000}s\n`);

  loadHistory();
  loadTxState();

  const provider = new ethers.JsonRpcProvider(RPC_URL);

  try {
    const net = await provider.getNetwork();
    log('🌐', `Connected → chain ${cyan('#'+net.chainId.toString())}`);
  } catch (err) {
    log('💥', red(`Cannot connect: ${err.message}`));
    process.exit(1);
  }

  let signer = null;
  if (PRIVATE_KEY) {
    signer = new ethers.Wallet(PRIVATE_KEY, provider);
    const bal = await provider.getBalance(signer.address);
    log('🔑', `Wallet: ${cyan(shortAddr(signer.address))}  balance: ${green(ethStr(bal))}`);
    if (bal === 0n) log('⚠️ ', yellow('Balance is 0 — cannot pay gas for execution!'));
  } else {
    try {
      const accounts = await provider.send('eth_accounts', []);
      if (accounts.length > 0) {
        signer = await provider.getSigner(accounts[0]);
        log('🔓', `Hardhat signer: ${cyan(shortAddr(accounts[0]))}`);
      }
    } catch {}
  }

  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer || provider);

  try {
    await contract.txCounter();
    log('📄', `Contract OK: ${cyan(shortAddr(CONTRACT_ADDRESS))}\n`);
  } catch {
    log('💥', red(`Contract not found at ${CONTRACT_ADDRESS}`));
    log('💡', `Run: ${cyan('npm run deploy:sepolia')}`);
    process.exit(1);
  }

  // ── Tick ──────────────────────────────────────────────────────────────
  const tick = async () => {
    stats.rounds++;
    logSection(`Round #${stats.rounds}`);

    try {
      const feeData  = await provider.getFeeData();
      const gasPrice = feeData.gasPrice ?? feeData.maxFeePerGas ?? 0n;

      addReading(gasPrice);
      saveHistory();

      // Gas stats line
      const n = gasHistory.length;
      const minSeen = gasSorted[0];
      const maxSeen = gasSorted[gasSorted.length - 1];
      if (n >= 3) {
        log('⛽', `${yellow(gweiStr(gasPrice))}  │  min: ${green(gweiStr(minSeen))}  max: ${red(gweiStr(maxSeen))}  [${dim(n+' readings')}]`);
      } else {
        log('⛽', `${yellow(gweiStr(gasPrice))}  ${dim('collecting data…')}`);
      }

      const total = Number(await contract.txCounter());
      if (total === 0) {
        log('😴', dim('No scheduled transactions yet. Schedule one to start tracking.'));
        printSummary(); return;
      }
      log('📋', `Scanning ${blue(total.toString())} transaction${total!==1?'s':''}…`);

      let roundExecuted = 0, roundPending = 0;

      for (let id = 0; id < total; id++) {
        const tx  = await contract.getTransaction(id);
        const now = BigInt(Math.floor(Date.now()/1000));

        if (tx.executed || tx.cancelled || tx.expiry < now) continue;
        roundPending++;

        const sid = id.toString();

        // Register new tx
        if (!txState[sid]) {
          txState[sid] = { firstSeen: Math.floor(Date.now()/1000), expiry: Number(tx.expiry) };
          saveTxState();
          log('👁️ ', `New TX #${id} detected — tracking for best execution moment`);
        }

        const { execute, reason, urgency, isCrit } =
          getDecision(sid, Number(tx.expiry), gasPrice);

        const belowHardCap = gasPrice <= tx.maxGasPrice;
        const shouldExecute = execute && belowHardCap;

        const line = [
          `TX ${blue('#'+id)}`,
          `${ethStr(tx.amount)} → ${cyan(shortAddr(tx.recipient))}`,
          `gas now: ${yellow(gweiStr(gasPrice))}`,
          urgencyBar(urgency) + ` ${(urgency*100).toFixed(0)}% of window used`,
          `[${timeLeft(Number(tx.expiry))}]`,
        ].join('  ');

        if (shouldExecute) {
          log('🚀', `${line}\n         ${reason} → EXECUTING`);
          if (!signer) { log('⚠️ ', yellow('No signer set.')); continue; }
          try {
            const execTx  = await contract.executeTransaction(id);
            log('⏳', `Submitted: ${dim(execTx.hash.slice(0,22)+'…')}`);
            const receipt = await execTx.wait();
            log('✅', bold(green(`TX #${id} DONE — ${ethStr(tx.amount)} sent to ${shortAddr(tx.recipient)}  (block #${receipt.blockNumber})`)));
            stats.executed++;
            roundExecuted++;
            delete txState[sid];
            saveTxState();
          } catch (err) {
            log('❌', `TX #${id}: ${red(err.reason || err.message)}`);
            stats.failed++;
          }
        } else {
          const waitReason = execute && !belowHardCap
            ? red(`dip found but gas still above this tx's hard cap (${gweiStr(tx.maxGasPrice)})`)
            : dim(reason);
          log('⏳', `${line}\n         ⏸  ${waitReason}`);

        }
      }

      if (roundPending === 0) log('💤', dim('All transactions resolved.'));
      else log('📊', `${green(roundExecuted+' executed')}  ${dim((roundPending-roundExecuted)+' waiting')}`);

    } catch (err) {
      log('💥', red(`Keeper error: ${err.message}`));
    }

    printSummary();
    console.log(dim(`   Next in ${POLL_INTERVAL/1000}s…  Ctrl+C to stop`));
  };

  function printSummary() {
    const minSeen = gasHistory.length >= 3 ? gweiStr(gasSorted[0]) : '—';
    console.log(
      dim('   Session: ') +
      green(stats.executed+' executed') + '  ' +
      red(stats.failed+' failed') + '  ' +
      dim(`${stats.rounds} rounds  |  lowest seen: ${minSeen}`)
    );
  }



  await tick();
  setInterval(tick, POLL_INTERVAL);
}

process.on('SIGINT', () => {
  console.log(`\n\n${C.yellow}${C.bold}Keeper stopped.${C.reset}  `
    + green(`${stats.executed} executed`) + ` in ${stats.rounds} rounds.\n`);
  process.exit(0);
});

main().catch(err => { console.error(red('Fatal: '+err.message)); process.exit(1); });
