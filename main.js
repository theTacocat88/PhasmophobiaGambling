import { initializeApp }       from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged }
                               from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, onSnapshot, getDocs, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getDatabase, ref, set, remove, onValue, onDisconnect
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey:            "AIzaSyBG_SmVUSe93HDNErImoTBkPXGJPc3DBF0",
  authDomain:        "phasmophobiagambling.firebaseapp.com",
  projectId:         "phasmophobiagambling",
  storageBucket:     "phasmophobiagambling.firebasestorage.app",
  messagingSenderId: "150402636149",
  appId:             "1:150402636149:web:c0a7521370e21804935b3c",
  databaseURL:       "https://phasmophobiagambling-default-rtdb.firebaseio.com/"
};
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);
const rtdb = getDatabase(app);

// ─── State ────────────────────────────────────────────────────────────────────
let currentUid       = null;
let currentLobbyCode = null;
let isAdmin          = false;
let currencyLabel    = "Points";
let currentPlayers   = {};
let unsubLobby       = null;
let unsubBets        = null;
let unsubPresence    = null;
let lastPayoutRound  = -1;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function $(id) { return document.getElementById(id); }

function setPointsDisplay(pts) {
  $("points-display").textContent = `${currencyLabel}: ${pts}`;
}

function resetBettingUI() {
  ["bet-1","bet-2","bet-3"].forEach(id => { const e=$(id); if(e) e.value=0; });
  ["pick-1","pick-2","pick-3"].forEach(id => { const e=$(id); if(e) e.value=""; });
  const err = $("bet-error"); if(err) err.textContent = "";
  document.querySelectorAll(".wheel").forEach(el => { el.innerHTML="<p>?</p>"; });
  const mb = $("my-bets-display");
  if(mb) mb.innerHTML = `<p class="my-bets-empty">No bets placed yet.</p>`;
}

function cleanupListeners() {
  if (unsubLobby)    { unsubLobby();    unsubLobby    = null; }
  if (unsubBets)     { unsubBets();     unsubBets     = null; }
  if (unsubPresence) { unsubPresence(); unsubPresence = null; }
}

// ─── ONE-TIME button wiring at module load ────────────────────────────────────
// All click handlers are attached ONCE here. Each handler checks state at
// call time (currentUid, currentLobbyCode, isAdmin) and bails out if not ready.
// No cloning, no re-wiring, no lost listeners.

$("settings-toggle").addEventListener("click", () => {
  $("settings-panel").classList.toggle("hidden");
});

$("settings-name-save").addEventListener("click", async () => {
  const msg = $("settings-msg");
  try {
    const n = $("settings-name-input").value.trim();
    if (!n) { msg.textContent = "Enter a name."; return; }
    await updateDoc(doc(db,"users",currentUid), { username: n });
    if (currentLobbyCode)
      await updateDoc(doc(db,"lobbies",currentLobbyCode), { [`players.${currentUid}`]: n });
    msg.textContent = "Saved!";
    setTimeout(() => { msg.textContent=""; }, 2000);
  } catch(e) { msg.textContent = "Error: "+e.message; }
});

$("currency-select").addEventListener("change", async () => {
  try {
    currencyLabel = $("currency-select").value;
    await updateDoc(doc(db,"users",currentUid), { currencyPref: currencyLabel });
    const snap = await getDoc(doc(db,"users",currentUid));
    if (snap.exists()) setPointsDisplay(snap.data().points ?? 0);
  } catch(e) { console.error(e); }
});

$("reset-account-btn").addEventListener("click", async () => {
  const msg = $("settings-msg");
  try {
    if (!confirm("Reset to 300? Cannot be undone.")) return;
    await updateDoc(doc(db,"users",currentUid), { points: 300 });
    setPointsDisplay(300);
    msg.textContent = "Reset.";
    setTimeout(() => { msg.textContent=""; }, 2000);
  } catch(e) { msg.textContent = "Error: "+e.message; }
});

$("create-lobby-btn").addEventListener("click", async () => {
  const err  = $("landing-error");
  const name = $("display-name-input").value.trim();
  err.textContent = "";
  if (!name)       { err.textContent = "Enter a display name."; return; }
  if (!currentUid) { err.textContent = "Still signing in — try again."; return; }
  try {
    let code;
    for (let i = 0; i < 10; i++) {
      const c = String(Math.floor(1000 + Math.random() * 9000));
      if (!(await getDoc(doc(db,"lobbies",c))).exists()) { code = c; break; }
    }
    if (!code) { err.textContent = "Could not generate a code."; return; }
    await setDoc(doc(db,"lobbies",code), {
      adminUid: currentUid, round: 1, phase: "betting",
      results: null, payouts: null, players: { [currentUid]: name }
    });
    const uSnap = await getDoc(doc(db,"users",currentUid));
    if (uSnap.exists() && !uSnap.data().username) {
      await updateDoc(doc(db,"users",currentUid), { username: name });
      $("settings-name-input").value = name;
    }
    enterLobby(code);
  } catch(e) { err.textContent = "Error: "+e.message; console.error(e); }
});

$("join-lobby-btn").addEventListener("click", async () => {
  const err  = $("landing-error");
  const name = $("display-name-input").value.trim();
  const code = $("join-code-input").value.trim();
  err.textContent = "";
  if (!name)       { err.textContent = "Enter a display name."; return; }
  if (!code)       { err.textContent = "Enter a lobby code."; return; }
  if (!currentUid) { err.textContent = "Still signing in — try again."; return; }
  try {
    const snap = await getDoc(doc(db,"lobbies",code));
    if (!snap.exists()) { err.textContent = "Lobby not found."; return; }
    await updateDoc(doc(db,"lobbies",code), { [`players.${currentUid}`]: name });
    const uSnap = await getDoc(doc(db,"users",currentUid));
    if (uSnap.exists() && !uSnap.data().username) {
      await updateDoc(doc(db,"users",currentUid), { username: name });
      $("settings-name-input").value = name;
    }
    enterLobby(code);
  } catch(e) { err.textContent = "Error: "+e.message; console.error(e); }
});

$("leave-lobby-btn").addEventListener("click", () => doLeave(false));

$("place-bets-btn").addEventListener("click", async () => {
  const errEl = $("bet-error");
  errEl.textContent = "";
  try {
    if (!currentUid)       { errEl.textContent = "Not signed in yet."; return; }
    if (!currentLobbyCode) { errEl.textContent = "Not in a lobby."; return; }

    const amounts = [
      Math.max(0, parseInt($("bet-1").value) || 0),
      Math.max(0, parseInt($("bet-2").value) || 0),
      Math.max(0, parseInt($("bet-3").value) || 0),
    ];
    const picks = [ $("pick-1").value, $("pick-2").value, $("pick-3").value ];
    const total = amounts[0] + amounts[1] + amounts[2];

    if (total === 0) { errEl.textContent = "Enter at least one bet amount."; return; }
    for (let i = 0; i < 3; i++) {
      if (amounts[i] > 0 && !picks[i]) {
        errEl.textContent = `Choose a pick for Wheel ${i+1}, or set its bet to 0.`;
        return;
      }
    }

    const userSnap = await getDoc(doc(db,"users",currentUid));
    if (!userSnap.exists()) { errEl.textContent = "User account not found."; return; }
    const pts = userSnap.data().points ?? 0;
    if (total > pts) {
      errEl.textContent = `Not enough ${currencyLabel}. You have ${pts}, bet is ${total}.`;
      return;
    }

    await updateDoc(doc(db,"users",currentUid), { points: pts - total });
    setPointsDisplay(pts - total);

    await setDoc(doc(db,"lobbies",currentLobbyCode,"bets",currentUid), {
      wheel1: { pick: picks[0], amount: amounts[0] },
      wheel2: { pick: picks[1], amount: amounts[1] },
      wheel3: { pick: picks[2], amount: amounts[2] },
    });

    const msg = $("bets-placed-msg");
    if (msg) { msg.classList.remove("hidden"); setTimeout(() => msg.classList.add("hidden"), 2500); }

  } catch(e) { errEl.textContent = "Error: "+e.message; console.error("placeBets:", e); }
});

$("spin-btn").addEventListener("click", async () => {
  try {
    if (!isAdmin || !currentLobbyCode) return;
    await updateDoc(doc(db,"lobbies",currentLobbyCode), { phase: "results" });
  } catch(e) { console.error("fixBets:", e); alert("Error: "+e.message); }
});

$("payout-btn").addEventListener("click", async () => {
  const errEl = $("payout-error");
  errEl.textContent = "";
  try {
    if (!isAdmin || !currentLobbyCode) return;
    const o1 = $("outcome-1").value;
    const o2 = $("outcome-2").value;
    const o3 = $("outcome-3").value;
    if (!o1||!o2||!o3) { errEl.textContent = "Select an outcome for all three wheels."; return; }

    const results  = { wheel1: o1, wheel2: o2, wheel3: o3 };
    const betsSnap = await getDocs(collection(db,"lobbies",currentLobbyCode,"bets"));
    const payoutRecord = calculatePayouts(betsSnap, results);

    // Delete all bet docs
    const batch = writeBatch(db);
    betsSnap.forEach(b => batch.delete(b.ref));
    await batch.commit();

    const lobbySnap = await getDoc(doc(db,"lobbies",currentLobbyCode));
    if (!lobbySnap.exists()) return;

    // Write payout_done — each client's snapshot fires, each applies their own payout
    await updateDoc(doc(db,"lobbies",currentLobbyCode), {
      phase: "payout_done",
      results,
      payouts: payoutRecord,
      round:   lobbySnap.data().round,
    });

    $("outcome-1").value = "";
    $("outcome-2").value = "";
    $("outcome-3").value = "";

  } catch(e) { errEl.textContent = "Error: "+e.message; console.error("payout:", e); }
});

$("popup-close-btn").addEventListener("click", async () => {
  $("payout-popup").classList.add("hidden");
  resetBettingUI();
  try {
    if (!isAdmin || !currentLobbyCode) return;
    const snap = await getDoc(doc(db,"lobbies",currentLobbyCode));
    if (snap.exists() && snap.data().phase === "payout_done") {
      await updateDoc(doc(db,"lobbies",currentLobbyCode), {
        phase: "betting", results: null, payouts: null,
        round: snap.data().round + 1,
      });
    }
  } catch(e) { console.error("popupClose:", e); }
});

// ─── Auth ────────────────────────────────────────────────────────────────────
signInAnonymously(auth).catch(e => alert("Auth failed: "+e.message));

onAuthStateChanged(auth, async user => {
  if (!user) return;
  currentUid = user.uid;
  try {
    const snap = await getDoc(doc(db,"users",currentUid));
    if (!snap.exists()) {
      await setDoc(doc(db,"users",currentUid), { points:300, username:"", currencyPref:"Points" });
      currencyLabel = "Points";
      setPointsDisplay(300);
    } else {
      const d = snap.data();
      currencyLabel = d.currencyPref || "Points";
      setPointsDisplay(d.points ?? 300);
      if (d.username) $("settings-name-input").value = d.username;
    }
    $("currency-select").value = currencyLabel;
    $("user-settings-card").classList.remove("hidden");
  } catch(e) { alert("Startup error: "+e.message); }
});

// ─── Leave ────────────────────────────────────────────────────────────────────
async function doLeave(wasKicked) {
  if (!currentLobbyCode) return;
  const code = currentLobbyCode;
  cleanupListeners();
  currentLobbyCode = null;
  isAdmin = false;
  lastPayoutRound = -1;
  try { await remove(ref(rtdb,`presence/${code}/${currentUid}`)); } catch(_) {}
  try { await removePlayerFromLobby(currentUid, code); } catch(_) {}
  $("screen-lobby").classList.add("hidden");
  $("screen-landing").classList.remove("hidden");
  resetBettingUI();
  if (wasKicked) {
    const err = $("landing-error");
    err.style.color = "#e06c6c";
    err.textContent = "You were kicked from the lobby.";
  }
}

async function removePlayerFromLobby(uid, code) {
  const lobbyRef  = doc(db,"lobbies",code);
  const lobbySnap = await getDoc(lobbyRef);
  if (!lobbySnap.exists()) return;
  const data    = lobbySnap.data();
  const players = { ...data.players };
  delete players[uid];
  try { await deleteDoc(doc(db,"lobbies",code,"bets",uid)); } catch(_) {}
  if (Object.keys(players).length === 0) {
    const betsSnap = await getDocs(collection(db,"lobbies",code,"bets"));
    const batch = writeBatch(db);
    betsSnap.forEach(b => batch.delete(b.ref));
    batch.delete(lobbyRef);
    await batch.commit();
  } else {
    let newAdmin = data.adminUid;
    if (uid === data.adminUid) newAdmin = Object.keys(players)[0];
    await updateDoc(lobbyRef, { players, adminUid: newAdmin });
  }
}

// ─── Enter lobby ──────────────────────────────────────────────────────────────
function enterLobby(code) {
  currentLobbyCode = code;
  lastPayoutRound  = -1;
  $("screen-landing").classList.add("hidden");
  $("screen-lobby").classList.remove("hidden");
  $("lobby-code-display").textContent = `Lobby: ${code}`;

  setupPresence(code);

  if (unsubLobby) unsubLobby();
  unsubLobby = onSnapshot(
    doc(db,"lobbies",code),
    snap => {
      if (!snap.exists()) {
        cleanupListeners(); currentLobbyCode=null; isAdmin=false;
        $("screen-lobby").classList.add("hidden");
        $("screen-landing").classList.remove("hidden");
        resetBettingUI();
        return;
      }
      handleLobbyUpdate(snap.data());
    },
    e => console.error("lobby snapshot:", e)
  );

  if (unsubBets) unsubBets();
  unsubBets = onSnapshot(
    collection(db,"lobbies",code,"bets"),
    snap => {
      let pool = 0;
      let myBets = null;
      snap.forEach(b => {
        const d = b.data();
        pool += (d.wheel1?.amount||0) + (d.wheel2?.amount||0) + (d.wheel3?.amount||0);
        if (b.id === currentUid) myBets = d;
      });
      $("prize-pool-display").textContent = `Prize Pool: ${pool}`;
      renderMyBets(myBets);
    },
    e => console.error("bets snapshot:", e)
  );
}

// ─── RTDB Presence ────────────────────────────────────────────────────────────
function setupPresence(code) {
  const myRef = ref(rtdb,`presence/${code}/${currentUid}`);
  set(myRef, { online: true });
  onDisconnect(myRef).remove();
  if (unsubPresence) unsubPresence();
  unsubPresence = onValue(
    ref(rtdb,`presence/${code}`),
    async snapshot => {
      if (!currentLobbyCode || currentLobbyCode !== code) return;
      try {
        const lobbySnap = await getDoc(doc(db,"lobbies",code));
        if (!lobbySnap.exists()) return;
        const inLobby = lobbySnap.data().players || {};
        const online  = snapshot.val() || {};
        for (const uid of Object.keys(inLobby)) {
          if (!online[uid] && uid !== currentUid)
            await removePlayerFromLobby(uid, code);
        }
      } catch(e) { console.error("presence watcher:", e); }
    }
  );
}

// ─── Lobby update handler ─────────────────────────────────────────────────────
function handleLobbyUpdate(data) {
  $("lobby-round-display").textContent = `Round ${data.round}`;
  isAdmin = data.adminUid === currentUid;

  $("spin-btn").style.display        = isAdmin ? "inline-block" : "none";
  $("place-bets-btn").style.display  = "inline-block";

  currentPlayers = data.players || {};
  if (currentLobbyCode && !currentPlayers[currentUid]) { doLeave(true); return; }

  // Rebuild player list
  const list = $("players-list");
  list.innerHTML = "";
  for (const [uid, name] of Object.entries(currentPlayers)) {
    const tag = document.createElement("div");
    tag.className = "player-tag" + (uid === data.adminUid ? " player-admin" : "");
    const span = document.createElement("span");
    span.textContent = name + (uid === data.adminUid ? " ★" : "");
    tag.appendChild(span);
    if (isAdmin && uid !== currentUid) {
      const kb = document.createElement("button");
      kb.className = "kick-btn"; kb.textContent = "✕"; kb.title = `Kick ${name}`;
      kb.addEventListener("click", async () => {
        if (!confirm(`Kick ${name}?`)) return;
        try { await kickPlayer(uid); } catch(e) { console.error("kick:", e); }
      });
      tag.appendChild(kb);
    }
    list.appendChild(tag);
  }

  rebuildDeathsDropdown(currentPlayers);

  if (data.phase === "betting") {
    $("phase-betting").classList.remove("hidden");
    $("phase-results").classList.add("hidden");

  } else if (data.phase === "results") {
    $("phase-betting").classList.add("hidden");
    $("phase-results").classList.remove("hidden");
    if (isAdmin) {
      $("tbd-msg").classList.add("hidden");
      $("admin-outcome-section").classList.remove("hidden");
      rebuildOutcome3Dropdown(currentPlayers);
    } else {
      $("tbd-msg").classList.remove("hidden");
      $("admin-outcome-section").classList.add("hidden");
    }

  } else if (data.phase === "payout_done") {
    if (data.round !== lastPayoutRound) {
      lastPayoutRound = data.round;
      applyMyPayoutAndShowPopup(data);
    }
  }
}

// ─── Each client applies their own payout ────────────────────────────────────
async function applyMyPayoutAndShowPopup(data) {
  try {
    const myAmount = (data.payouts || {})[currentUid] || 0;
    if (myAmount > 0) {
      const snap = await getDoc(doc(db,"users",currentUid));
      if (snap.exists()) {
        const newPts = snap.data().points + Math.floor(myAmount);
        await updateDoc(doc(db,"users",currentUid), { points: newPts });
        setPointsDisplay(newPts);
      }
    }
    showPayoutPopup(data);
  } catch(e) { console.error("applyMyPayout:", e); showPayoutPopup(data); }
}

// ─── Kick ─────────────────────────────────────────────────────────────────────
async function kickPlayer(uid) {
  if (!isAdmin || !currentLobbyCode) return;
  const snap = await getDoc(doc(db,"lobbies",currentLobbyCode));
  if (!snap.exists()) return;
  const players = { ...snap.data().players };
  delete players[uid];
  await updateDoc(doc(db,"lobbies",currentLobbyCode), { players });
  try { await deleteDoc(doc(db,"lobbies",currentLobbyCode,"bets",uid)); } catch(_) {}
  try { await remove(ref(rtdb,`presence/${currentLobbyCode}/${uid}`)); } catch(_) {}
}

// ─── Deaths dropdowns ─────────────────────────────────────────────────────────
function buildDeathOptions(selId, placeholder, players) {
  const sel = $(selId);
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = `<option value="">${placeholder}</option><option value="None Dead">None Dead</option>`;
  for (const name of Object.values(players)) {
    const o = document.createElement("option");
    o.value = o.textContent = name;
    sel.appendChild(o);
  }
  const o = document.createElement("option");
  o.value = o.textContent = "All Dead";
  sel.appendChild(o);
  if ([...sel.options].some(o => o.value === cur)) sel.value = cur;
}
function rebuildDeathsDropdown(p)   { buildDeathOptions("pick-3",    "— Pick —",   p); }
function rebuildOutcome3Dropdown(p) { buildDeathOptions("outcome-3", "— Select —", p); }

// ─── My bets display ──────────────────────────────────────────────────────────
function renderMyBets(bets) {
  const mb = $("my-bets-display");
  if (!mb) return;
  if (!bets) { mb.innerHTML = `<p class="my-bets-empty">No bets placed yet.</p>`; return; }
  const labels = ["Win / Lose","Ghost Type","Deaths"];
  const rows = ["wheel1","wheel2","wheel3"].map((k,i) => {
    const b = bets[k];
    if (!b || b.amount === 0) return null;
    return `<div class="my-bet-row">
      <span class="my-bet-label">${labels[i]}</span>
      <span class="my-bet-pick">${b.pick||"—"}</span>
      <span class="my-bet-amount">${b.amount} ${currencyLabel}</span>
    </div>`;
  }).filter(Boolean);
  mb.innerHTML = rows.length ? rows.join("") : `<p class="my-bets-empty">No bets placed yet.</p>`;
}

// ─── Payout math ──────────────────────────────────────────────────────────────
function calculatePayouts(betsSnap, results) {
  let totalPool = 0;
  const allBets = {};
  betsSnap.forEach(b => {
    const d = b.data();
    allBets[b.id] = d;
    totalPool += (d.wheel1?.amount||0) + (d.wheel2?.amount||0) + (d.wheel3?.amount||0);
  });
  const winStakes = {}; let totalWin = 0;
  for (const [uid, bets] of Object.entries(allBets)) {
    let stake = 0;
    for (const key of ["wheel1","wheel2","wheel3"]) {
      const b = bets[key];
      if (b && b.amount > 0 && b.pick && b.pick === results[key]) stake += b.amount;
    }
    if (stake > 0) { winStakes[uid] = stake; totalWin += stake; }
  }
  if (totalWin === 0) return {};
  const losingPool = totalPool - totalWin;
  const payouts = {};
  for (const [uid, stake] of Object.entries(winStakes)) {
    payouts[uid] = Math.floor(stake + (stake / totalWin) * losingPool);
  }
  return payouts;
}

// ─── Payout popup ─────────────────────────────────────────────────────────────
function showPayoutPopup(data) {
  const results = data.results || {};
  const payouts = data.payouts || {};
  const players = data.players || {};

  $("popup-results-display").innerHTML =
    ["wheel1","wheel2","wheel3"].map((k,i) =>
      `<div class="popup-result-row">
        <span class="popup-result-label">${["Win / Lose","Ghost Type","Deaths"][i]}</span>
        <span class="popup-result-value">${results[k]||"—"}</span>
      </div>`
    ).join("");

  $("popup-payouts-display").innerHTML =
    Object.keys(payouts).length === 0
      ? `<p style="color:#aaa;text-align:center;">No winners this round.</p>`
      : Object.entries(payouts).map(([uid,amt]) =>
          `<div class="popup-payout-row">
            <span>${players[uid]||"Player"}</span>
            <span class="payout-amount">+${amt} ${currencyLabel}</span>
          </div>`
        ).join("");

  const myAmt = payouts[currentUid] || 0;
  const msg   = $("popup-your-payout");
  msg.textContent = myAmt > 0 ? `You won ${myAmt} ${currencyLabel}!` : "Better luck next round.";
  msg.style.color = myAmt > 0 ? "#7fd67f" : "#aaa";

  $("payout-popup").classList.remove("hidden");
}
