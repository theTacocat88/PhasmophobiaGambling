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

// ─── State ───────────────────────────────────────────────────────────────────
let currentUid       = null;
let currentLobbyCode = null;
let isAdmin          = false;
let currencyLabel    = "Points";
let currentPlayers   = {};
let unsubLobby       = null;
let unsubBets        = null;
let unsubPresence    = null;
let lastPayoutRound  = -1; // prevents applying the same payout twice

// ─── Auth ────────────────────────────────────────────────────────────────────
signInAnonymously(auth).catch(e => alert("Auth failed: " + e.message));

onAuthStateChanged(auth, async user => {
  if (!user) return;
  currentUid = user.uid;
  try {
    const snap = await getDoc(doc(db, "users", currentUid));
    if (!snap.exists()) {
      await setDoc(doc(db, "users", currentUid), {
        points: 300, username: "", currencyPref: "Points"
      });
      currencyLabel = "Points";
      setPointsDisplay(300);
    } else {
      const d = snap.data();
      currencyLabel = d.currencyPref || "Points";
      setPointsDisplay(d.points ?? 300);
      // Populate settings username field if one is saved
      if (d.username) {
        document.getElementById("settings-name-input").value = d.username;
      }
    }
    document.getElementById("currency-select").value = currencyLabel;
    document.getElementById("user-settings-card").classList.remove("hidden");
  } catch(e) { alert("Startup error: " + e.message); }
});

// ─── Settings panel ───────────────────────────────────────────────────────────
document.getElementById("settings-toggle").addEventListener("click", () => {
  document.getElementById("settings-panel").classList.toggle("hidden");
});

document.getElementById("settings-name-save").addEventListener("click", async () => {
  const msg = document.getElementById("settings-msg");
  try {
    const n = document.getElementById("settings-name-input").value.trim();
    if (!n) { msg.textContent = "Enter a name."; return; }
    await updateDoc(doc(db, "users", currentUid), { username: n });
    if (currentLobbyCode)
      await updateDoc(doc(db, "lobbies", currentLobbyCode), { [`players.${currentUid}`]: n });
    msg.textContent = "Saved!";
    setTimeout(() => { msg.textContent = ""; }, 2000);
    // Hide the "set username" prompt if it was showing
    const prompt = document.getElementById("username-prompt");
    if (prompt) prompt.classList.add("hidden");
  } catch(e) { msg.textContent = "Error: " + e.message; }
});

document.getElementById("currency-select").addEventListener("change", async () => {
  try {
    currencyLabel = document.getElementById("currency-select").value;
    await updateDoc(doc(db, "users", currentUid), { currencyPref: currencyLabel });
    const snap = await getDoc(doc(db, "users", currentUid));
    if (snap.exists()) setPointsDisplay(snap.data().points ?? 0);
  } catch(e) { console.error(e); }
});

document.getElementById("reset-account-btn").addEventListener("click", async () => {
  const msg = document.getElementById("settings-msg");
  try {
    if (!confirm("Reset to 300? Cannot be undone.")) return;
    await updateDoc(doc(db, "users", currentUid), { points: 300 });
    setPointsDisplay(300);
    msg.textContent = "Reset.";
    setTimeout(() => { msg.textContent = ""; }, 2000);
  } catch(e) { msg.textContent = "Error: " + e.message; }
});

// ─── Landing ─────────────────────────────────────────────────────────────────
document.getElementById("create-lobby-btn").addEventListener("click", async () => {
  const err  = document.getElementById("landing-error");
  const name = document.getElementById("display-name-input").value.trim();
  err.textContent = "";
  if (!name)       { err.textContent = "Enter a display name."; return; }
  if (!currentUid) { err.textContent = "Still signing in, try again."; return; }
  try {
    let code;
    for (let i = 0; i < 10; i++) {
      const c = String(Math.floor(1000 + Math.random() * 9000));
      if (!(await getDoc(doc(db, "lobbies", c))).exists()) { code = c; break; }
    }
    if (!code) { err.textContent = "Could not generate a code, try again."; return; }
    await setDoc(doc(db, "lobbies", code), {
      adminUid: currentUid, round: 1, phase: "betting",
      results: null, payouts: null, players: { [currentUid]: name }
    });
    // Save the lobby display name as their username if they don't have one yet
    const uSnap = await getDoc(doc(db, "users", currentUid));
    if (uSnap.exists() && !uSnap.data().username) {
      await updateDoc(doc(db, "users", currentUid), { username: name });
      document.getElementById("settings-name-input").value = name;
    }
    enterLobby(code);
  } catch(e) { err.textContent = "Error: " + e.message; console.error(e); }
});

document.getElementById("join-lobby-btn").addEventListener("click", async () => {
  const err  = document.getElementById("landing-error");
  const name = document.getElementById("display-name-input").value.trim();
  const code = document.getElementById("join-code-input").value.trim();
  err.textContent = "";
  if (!name)       { err.textContent = "Enter a display name."; return; }
  if (!code)       { err.textContent = "Enter a lobby code."; return; }
  if (!currentUid) { err.textContent = "Still signing in, try again."; return; }
  try {
    const snap = await getDoc(doc(db, "lobbies", code));
    if (!snap.exists()) { err.textContent = "Lobby not found."; return; }
    await updateDoc(doc(db, "lobbies", code), { [`players.${currentUid}`]: name });
    // Save display name as username if they don't have one
    const uSnap = await getDoc(doc(db, "users", currentUid));
    if (uSnap.exists() && !uSnap.data().username) {
      await updateDoc(doc(db, "users", currentUid), { username: name });
      document.getElementById("settings-name-input").value = name;
    }
    enterLobby(code);
  } catch(e) { err.textContent = "Error: " + e.message; console.error(e); }
});

// ─── Leave ────────────────────────────────────────────────────────────────────
document.getElementById("leave-lobby-btn").addEventListener("click", () => doLeave(false));

async function doLeave(wasKicked) {
  if (!currentLobbyCode) return;
  const code = currentLobbyCode;
  // Null out state before any async work so re-entrant calls are ignored
  cleanupListeners();
  currentLobbyCode = null;
  isAdmin = false;
  lastPayoutRound = -1;
  try { await remove(ref(rtdb, `presence/${code}/${currentUid}`)); } catch(_) {}
  try { await removePlayerFromLobby(currentUid, code); } catch(_) {}
  document.getElementById("screen-lobby").classList.add("hidden");
  document.getElementById("screen-landing").classList.remove("hidden");
  resetBettingUI();
  if (wasKicked) {
    const err = document.getElementById("landing-error");
    err.style.color = "#e06c6c";
    err.textContent = "You were kicked from the lobby.";
  }
}

async function removePlayerFromLobby(uid, code) {
  const lobbyRef  = doc(db, "lobbies", code);
  const lobbySnap = await getDoc(lobbyRef);
  if (!lobbySnap.exists()) return;
  const data    = lobbySnap.data();
  const players = { ...data.players };
  delete players[uid];
  try { await deleteDoc(doc(db, "lobbies", code, "bets", uid)); } catch(_) {}
  if (Object.keys(players).length === 0) {
    // Last player — delete the whole lobby
    const betsSnap = await getDocs(collection(db, "lobbies", code, "bets"));
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
  document.getElementById("screen-landing").classList.add("hidden");
  document.getElementById("screen-lobby").classList.remove("hidden");
  document.getElementById("lobby-code-display").textContent = `Lobby: ${code}`;

  // Wire every interactive button by cloning to strip old listeners
  wireBtn("place-bets-btn", handlePlaceBets);
  wireBtn("spin-btn",       handleFixBets);
  wireBtn("payout-btn",     handlePayout);
  wireBtn("popup-close-btn", handlePopupClose);
  wireBtn("leave-lobby-btn", () => doLeave(false));

  // Wire bet inputs — clone to strip old listeners, then re-attach change handler
  ["bet-1","bet-2","bet-3","pick-1","pick-2","pick-3"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const fresh = el.cloneNode(true);
    el.parentNode.replaceChild(fresh, el);
    // No auto-save on change — bets only commit when Place Bets is clicked
  });

  setupPresence(code);

  if (unsubLobby) unsubLobby();
  unsubLobby = onSnapshot(
    doc(db, "lobbies", code),
    snap => {
      if (!snap.exists()) {
        cleanupListeners(); currentLobbyCode = null; isAdmin = false;
        document.getElementById("screen-lobby").classList.add("hidden");
        document.getElementById("screen-landing").classList.remove("hidden");
        resetBettingUI();
        return;
      }
      handleLobbyUpdate(snap.data());
    },
    e => console.error("lobby snapshot error:", e)
  );

  if (unsubBets) unsubBets();
  unsubBets = onSnapshot(
    collection(db, "lobbies", code, "bets"),
    snap => {
      let pool = 0;
      snap.forEach(b => {
        const d = b.data();
        pool += (d.wheel1?.amount || 0) + (d.wheel2?.amount || 0) + (d.wheel3?.amount || 0);
      });
      document.getElementById("prize-pool-display").textContent = `Prize Pool: ${pool}`;
    },
    e => console.error("bets snapshot error:", e)
  );
}

// Clone a button by id to wipe all old listeners, attach one new click handler
function wireBtn(id, fn) {
  const el = document.getElementById(id);
  if (!el) return;
  const clone = el.cloneNode(true);
  el.parentNode.replaceChild(clone, el);
  clone.addEventListener("click", fn);
}

// ─── RTDB Presence ────────────────────────────────────────────────────────────
function setupPresence(code) {
  const myRef = ref(rtdb, `presence/${code}/${currentUid}`);
  set(myRef, { online: true });
  onDisconnect(myRef).remove();
  if (unsubPresence) unsubPresence();
  unsubPresence = onValue(
    ref(rtdb, `presence/${code}`),
    async snapshot => {
      if (!currentLobbyCode || currentLobbyCode !== code) return;
      try {
        const lobbySnap = await getDoc(doc(db, "lobbies", code));
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
  document.getElementById("lobby-round-display").textContent = `Round ${data.round}`;
  isAdmin = data.adminUid === currentUid;

  // Show Fix Bets only for admin; Place Bets for everyone
  const fixBtn   = document.getElementById("spin-btn");
  const placeBtn = document.getElementById("place-bets-btn");
  if (fixBtn)   fixBtn.style.display   = isAdmin ? "inline-block" : "none";
  if (placeBtn) placeBtn.style.display = "inline-block";

  currentPlayers = data.players || {};

  // Kicked check
  if (currentLobbyCode && !currentPlayers[currentUid]) { doLeave(true); return; }

  // Rebuild player list
  const playersList = document.getElementById("players-list");
  playersList.innerHTML = "";
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
    playersList.appendChild(tag);
  }

  rebuildDeathsDropdown(currentPlayers);

  const phaseBetting = document.getElementById("phase-betting");
  const phaseResults = document.getElementById("phase-results");

  if (data.phase === "betting") {
    phaseBetting.classList.remove("hidden");
    phaseResults.classList.add("hidden");

  } else if (data.phase === "results") {
    phaseBetting.classList.add("hidden");
    phaseResults.classList.remove("hidden");
    const tbd = document.getElementById("tbd-msg");
    const adm = document.getElementById("admin-outcome-section");
    if (isAdmin) {
      tbd.classList.add("hidden");
      adm.classList.remove("hidden");
      rebuildOutcome3Dropdown(currentPlayers);
    } else {
      tbd.classList.remove("hidden");
      adm.classList.add("hidden");
    }

  } else if (data.phase === "payout_done") {
    // Guard: only apply payout once per round number
    if (data.round !== lastPayoutRound) {
      lastPayoutRound = data.round;
      applyMyPayoutAndShowPopup(data);
    }
  }
}

// ─── Each client applies their own payout ─────────────────────────────────────
// The admin wrote payouts: { uid: amount } into the lobby doc.
// Each client reads only their own user doc (which their own rules allow)
// and adds their winnings. No cross-user reads needed.
async function applyMyPayoutAndShowPopup(data) {
  try {
    const myAmount = (data.payouts || {})[currentUid] || 0;
    if (myAmount > 0) {
      const snap = await getDoc(doc(db, "users", currentUid));
      if (snap.exists()) {
        const newPts = snap.data().points + Math.floor(myAmount);
        await updateDoc(doc(db, "users", currentUid), { points: newPts });
        setPointsDisplay(newPts);
      }
    }
    showPayoutPopup(data);
  } catch(e) {
    console.error("applyMyPayout error:", e);
    showPayoutPopup(data); // still show popup even if update failed
  }
}

// ─── Kick ─────────────────────────────────────────────────────────────────────
async function kickPlayer(uid) {
  if (!isAdmin || !currentLobbyCode) return;
  const snap = await getDoc(doc(db, "lobbies", currentLobbyCode));
  if (!snap.exists()) return;
  const players = { ...snap.data().players };
  delete players[uid];
  await updateDoc(doc(db, "lobbies", currentLobbyCode), { players });
  try { await deleteDoc(doc(db, "lobbies", currentLobbyCode, "bets", uid)); } catch(_) {}
  try { await remove(ref(rtdb, `presence/${currentLobbyCode}/${uid}`)); } catch(_) {}
}

// ─── Deaths dropdowns ─────────────────────────────────────────────────────────
function buildDeathOptions(selId, placeholder, players) {
  const sel = document.getElementById(selId);
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

// ─── Place Bets ───────────────────────────────────────────────────────────────
async function handlePlaceBets() {
  const errEl = document.getElementById("bet-error");
  errEl.textContent = "";
  try {
    if (!currentUid)       { errEl.textContent = "Not signed in yet."; return; }
    if (!currentLobbyCode) { errEl.textContent = "Not in a lobby."; return; }

    const amounts = [
      Math.max(0, parseInt(document.getElementById("bet-1").value) || 0),
      Math.max(0, parseInt(document.getElementById("bet-2").value) || 0),
      Math.max(0, parseInt(document.getElementById("bet-3").value) || 0),
    ];
    const picks = [
      document.getElementById("pick-1").value,
      document.getElementById("pick-2").value,
      document.getElementById("pick-3").value,
    ];
    const total = amounts[0] + amounts[1] + amounts[2];

    if (total === 0) { errEl.textContent = "Enter at least one bet amount."; return; }
    for (let i = 0; i < 3; i++) {
      if (amounts[i] > 0 && !picks[i]) {
        errEl.textContent = `Choose a pick for Wheel ${i + 1}, or set its bet to 0.`;
        return;
      }
    }

    const userSnap = await getDoc(doc(db, "users", currentUid));
    if (!userSnap.exists()) { errEl.textContent = "User account not found."; return; }
    const pts = userSnap.data().points ?? 0;
    if (total > pts) {
      errEl.textContent = `Not enough ${currencyLabel}. You have ${pts}, bet is ${total}.`;
      return;
    }

    // Deduct points first
    await updateDoc(doc(db, "users", currentUid), { points: pts - total });
    setPointsDisplay(pts - total);

    // Write bet to Firestore
    await setDoc(doc(db, "lobbies", currentLobbyCode, "bets", currentUid), {
      wheel1: { pick: picks[0], amount: amounts[0] },
      wheel2: { pick: picks[1], amount: amounts[1] },
      wheel3: { pick: picks[2], amount: amounts[2] },
    });

    // Visual confirmation
    const msg = document.getElementById("bets-placed-msg");
    if (msg) { msg.classList.remove("hidden"); setTimeout(() => msg.classList.add("hidden"), 2500); }

  } catch(e) {
    errEl.textContent = "Error placing bets: " + e.message;
    console.error("handlePlaceBets:", e);
  }
}

// ─── Fix Bets (admin only) ────────────────────────────────────────────────────
async function handleFixBets() {
  try {
    if (!isAdmin || !currentLobbyCode) return;
    await updateDoc(doc(db, "lobbies", currentLobbyCode), { phase: "results" });
  } catch(e) { console.error("handleFixBets:", e); alert("Error: " + e.message); }
}

// ─── Confirm & Payout (admin only) ────────────────────────────────────────────
// The admin ONLY writes payout amounts into the lobby doc.
// Each client's onSnapshot then calls applyMyPayoutAndShowPopup()
// which reads and updates only that client's own user doc.
// This avoids all cross-user Firestore reads.
async function handlePayout() {
  const errEl = document.getElementById("payout-error");
  errEl.textContent = "";
  try {
    if (!isAdmin || !currentLobbyCode) return;

    const o1 = document.getElementById("outcome-1").value;
    const o2 = document.getElementById("outcome-2").value;
    const o3 = document.getElementById("outcome-3").value;
    if (!o1 || !o2 || !o3) { errEl.textContent = "Select an outcome for all three wheels."; return; }

    const results  = { wheel1: o1, wheel2: o2, wheel3: o3 };

    // Fetch all bets
    const betsSnap = await getDocs(collection(db, "lobbies", currentLobbyCode, "bets"));

    // Calculate who wins what
    const payoutRecord = calculatePayouts(betsSnap, results); // { uid: amount }

    // Delete all bet docs in one batch
    const batch = writeBatch(db);
    betsSnap.forEach(b => batch.delete(b.ref));
    await batch.commit();

    // Get current round
    const lobbySnap = await getDoc(doc(db, "lobbies", currentLobbyCode));
    if (!lobbySnap.exists()) return;
    const round = lobbySnap.data().round;

    // Write payout_done — every client's onSnapshot fires and each applies their own payout
    await updateDoc(doc(db, "lobbies", currentLobbyCode), {
      phase:   "payout_done",
      results,
      payouts: payoutRecord,
      round,
    });

    document.getElementById("outcome-1").value = "";
    document.getElementById("outcome-2").value = "";
    document.getElementById("outcome-3").value = "";

  } catch(e) {
    errEl.textContent = "Error: " + e.message;
    console.error("handlePayout:", e);
  }
}

// ─── Payout math ──────────────────────────────────────────────────────────────
function calculatePayouts(betsSnap, results) {
  let totalPool = 0;
  const allBets = {};
  betsSnap.forEach(b => {
    const d = b.data();
    allBets[b.id] = d;
    totalPool += (d.wheel1?.amount || 0) + (d.wheel2?.amount || 0) + (d.wheel3?.amount || 0);
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

  document.getElementById("popup-results-display").innerHTML =
    ["wheel1","wheel2","wheel3"].map((k, i) =>
      `<div class="popup-result-row">
        <span class="popup-result-label">${["Win / Lose","Ghost Type","Deaths"][i]}</span>
        <span class="popup-result-value">${results[k] || "—"}</span>
      </div>`
    ).join("");

  document.getElementById("popup-payouts-display").innerHTML =
    Object.keys(payouts).length === 0
      ? `<p style="color:#aaa;text-align:center;">No winners this round.</p>`
      : Object.entries(payouts).map(([uid, amt]) =>
          `<div class="popup-payout-row">
            <span>${players[uid] || "Player"}</span>
            <span class="payout-amount">+${amt} ${currencyLabel}</span>
          </div>`
        ).join("");

  const myAmt = payouts[currentUid] || 0;
  const msg   = document.getElementById("popup-your-payout");
  msg.textContent = myAmt > 0 ? `You won ${myAmt} ${currencyLabel}!` : "Better luck next round.";
  msg.style.color = myAmt > 0 ? "#7fd67f" : "#aaa";

  document.getElementById("payout-popup").classList.remove("hidden");
}

// ─── Close popup — admin advances to next round ───────────────────────────────
async function handlePopupClose() {
  document.getElementById("payout-popup").classList.add("hidden");
  resetBettingUI();
  try {
    if (!isAdmin || !currentLobbyCode) return;
    const lobbySnap = await getDoc(doc(db, "lobbies", currentLobbyCode));
    if (lobbySnap.exists() && lobbySnap.data().phase === "payout_done") {
      await updateDoc(doc(db, "lobbies", currentLobbyCode), {
        phase: "betting", results: null, payouts: null,
        round: lobbySnap.data().round + 1,
      });
    }
  } catch(e) { console.error("handlePopupClose:", e); }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function setPointsDisplay(pts) {
  document.getElementById("points-display").textContent = `${currencyLabel}: ${pts}`;
}

function resetBettingUI() {
  ["bet-1","bet-2","bet-3"].forEach(id => {
    const e = document.getElementById(id); if (e) e.value = 0;
  });
  ["pick-1","pick-2","pick-3"].forEach(id => {
    const e = document.getElementById(id); if (e) e.value = "";
  });
  const err = document.getElementById("bet-error");
  if (err) err.textContent = "";
  document.querySelectorAll(".wheel").forEach(el => { el.innerHTML = "<p>?</p>"; });
}

function cleanupListeners() {
  if (unsubLobby)    { unsubLobby();    unsubLobby    = null; }
  if (unsubBets)     { unsubBets();     unsubBets     = null; }
  if (unsubPresence) { unsubPresence(); unsubPresence = null; }
}
