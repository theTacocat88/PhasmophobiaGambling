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

// ── State ──────────────────────────────────────
let currentUid       = null;
let currentLobbyCode = null;
let isAdmin          = false;
let currencyLabel    = "Points";
let currentPlayers   = {};
let unsubLobby       = null;
let unsubBets        = null;
let unsubPresence    = null;

// ── DOM ────────────────────────────────────────
const screenLanding  = document.getElementById("screen-landing");
const screenLobby    = document.getElementById("screen-lobby");

const displayNameInput = document.getElementById("display-name-input");
const createLobbyBtn   = document.getElementById("create-lobby-btn");
const joinCodeInput    = document.getElementById("join-code-input");
const joinLobbyBtn     = document.getElementById("join-lobby-btn");
const landingError     = document.getElementById("landing-error");

const lobbyCodeDisplay  = document.getElementById("lobby-code-display");
const lobbyRoundDisplay = document.getElementById("lobby-round-display");
const pointsDisplay     = document.getElementById("points-display");
const prizePoolDisplay  = document.getElementById("prize-pool-display");
const leaveLobbyBtn     = document.getElementById("leave-lobby-btn");
const playersList       = document.getElementById("players-list");

const phaseBetting  = document.getElementById("phase-betting");
const betError      = document.getElementById("bet-error");
const myBetsDisplay = document.getElementById("my-bets-display");

const phaseResults        = document.getElementById("phase-results");
const tbdMsg              = document.getElementById("tbd-msg");
const adminOutcomeSection = document.getElementById("admin-outcome-section");
const payoutError         = document.getElementById("payout-error");

const payoutPopup         = document.getElementById("payout-popup");
const popupResultsDisplay = document.getElementById("popup-results-display");
const popupPayoutsDisplay = document.getElementById("popup-payouts-display");
const popupYourPayout     = document.getElementById("popup-your-payout");

const settingsToggle    = document.getElementById("settings-toggle");
const settingsPanel     = document.getElementById("settings-panel");
const settingsNameInput = document.getElementById("settings-name-input");
const settingsNameSave  = document.getElementById("settings-name-save");
const currencySelect    = document.getElementById("currency-select");
const resetAccountBtn   = document.getElementById("reset-account-btn");
const settingsMsg       = document.getElementById("settings-msg");
const userSettingsCard  = document.getElementById("user-settings-card");

// ── Auth ───────────────────────────────────────
signInAnonymously(auth).catch(console.error);

onAuthStateChanged(auth, async user => {
  if (!user) return;
  currentUid = user.uid;
  const userRef  = doc(db, "users", currentUid);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) {
    await setDoc(userRef, { points: 300, username: "", currencyPref: "Points" });
    currencyLabel = "Points";
    updatePointsDisplay(300);
  } else {
    const d = userSnap.data();
    currencyLabel = d.currencyPref || "Points";
    updatePointsDisplay(d.points ?? 300);
    if (d.username) settingsNameInput.value = d.username;
  }
  currencySelect.value = currencyLabel;
  userSettingsCard.classList.remove("hidden");
});

// ── Settings ───────────────────────────────────
settingsToggle.addEventListener("click", () => settingsPanel.classList.toggle("hidden"));

settingsNameSave.addEventListener("click", async () => {
  const n = settingsNameInput.value.trim();
  if (!n) { settingsMsg.textContent = "Enter a name."; return; }
  await updateDoc(doc(db, "users", currentUid), { username: n });
  if (currentLobbyCode)
    await updateDoc(doc(db, "lobbies", currentLobbyCode), { [`players.${currentUid}`]: n });
  settingsMsg.textContent = "Saved!";
  setTimeout(() => { settingsMsg.textContent = ""; }, 2000);
});

currencySelect.addEventListener("change", async () => {
  currencyLabel = currencySelect.value;
  await updateDoc(doc(db, "users", currentUid), { currencyPref: currencyLabel });
  const snap = await getDoc(doc(db, "users", currentUid));
  if (snap.exists()) updatePointsDisplay(snap.data().points ?? 0);
});

resetAccountBtn.addEventListener("click", async () => {
  if (!confirm("Reset to 300? Cannot be undone.")) return;
  await updateDoc(doc(db, "users", currentUid), { points: 300 });
  updatePointsDisplay(300);
  settingsMsg.textContent = "Reset.";
  setTimeout(() => { settingsMsg.textContent = ""; }, 2000);
});

// ── Landing ────────────────────────────────────
createLobbyBtn.addEventListener("click", async () => {
  const name = displayNameInput.value.trim();
  if (!name)       { landingError.textContent = "Enter a display name first."; return; }
  if (!currentUid) { landingError.textContent = "Still signing in, try again."; return; }
  landingError.textContent = "";

  let code;
  for (let i = 0; i < 10; i++) {
    const c = String(Math.floor(1000 + Math.random() * 9000));
    if (!(await getDoc(doc(db, "lobbies", c))).exists()) { code = c; break; }
  }
  if (!code) { landingError.textContent = "Could not generate a code, try again."; return; }

  await setDoc(doc(db, "lobbies", code), {
    adminUid: currentUid,
    round:    1,
    phase:    "betting",
    results:  null,
    payouts:  null,
    players:  { [currentUid]: name }
  });
  enterLobby(code);
});

joinLobbyBtn.addEventListener("click", async () => {
  const name = displayNameInput.value.trim();
  const code = joinCodeInput.value.trim();
  if (!name)       { landingError.textContent = "Enter a display name first."; return; }
  if (!code)       { landingError.textContent = "Enter a lobby code."; return; }
  if (!currentUid) { landingError.textContent = "Still signing in, try again."; return; }
  landingError.textContent = "";
  const snap = await getDoc(doc(db, "lobbies", code));
  if (!snap.exists()) { landingError.textContent = "Lobby not found."; return; }
  await updateDoc(doc(db, "lobbies", code), { [`players.${currentUid}`]: name });
  enterLobby(code);
});

// ── Leave ──────────────────────────────────────
leaveLobbyBtn.addEventListener("click", () => doLeave(false));

async function doLeave(wasKicked) {
  if (!currentLobbyCode) return;
  const code = currentLobbyCode;
  cleanupListeners();
  currentLobbyCode = null;
  isAdmin = false;
  // Remove own RTDB presence
  await remove(ref(rtdb, `presence/${code}/${currentUid}`)).catch(() => {});
  await removePlayerFromLobby(currentUid, code);
  screenLobby.classList.add("hidden");
  screenLanding.classList.remove("hidden");
  resetBettingUI();
  if (wasKicked) {
    landingError.textContent = "You were kicked from the lobby.";
    landingError.style.color = "#e06c6c";
  }
}

// ── Remove player from lobby (handles last-player lobby deletion) ──
async function removePlayerFromLobby(uid, code) {
  const lobbyRef  = doc(db, "lobbies", code);
  const lobbySnap = await getDoc(lobbyRef);
  if (!lobbySnap.exists()) return;

  const data    = lobbySnap.data();
  const players = { ...data.players };
  delete players[uid];

  await deleteDoc(doc(db, "lobbies", code, "bets", uid)).catch(() => {});

  if (Object.keys(players).length === 0) {
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

// ── Enter lobby ────────────────────────────────
function enterLobby(code) {
  currentLobbyCode = code;
  screenLanding.classList.add("hidden");
  screenLobby.classList.remove("hidden");
  lobbyCodeDisplay.textContent = `Lobby: ${code}`;

  // Wire all buttons fresh (clone to remove stale listeners)
  rewire("place-bets-btn", handlePlaceBets);
  rewire("spin-btn",       handleFixBets);
  rewire("payout-btn",     handlePayout);
  rewire("popup-close-btn", handlePopupClose);
  rewire("leave-lobby-btn", () => doLeave(false));

  // Wire bet inputs fresh
  ["bet-1","bet-2","bet-3","pick-1","pick-2","pick-3"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const fresh = el.cloneNode(true);
    el.parentNode.replaceChild(fresh, el);
    fresh.addEventListener("change", saveBets);
  });

  setupPresence(code);

  if (unsubLobby) unsubLobby();
  unsubLobby = onSnapshot(doc(db, "lobbies", code), snap => {
    if (!snap.exists()) {
      cleanupListeners();
      currentLobbyCode = null;
      isAdmin = false;
      screenLobby.classList.add("hidden");
      screenLanding.classList.remove("hidden");
      resetBettingUI();
      return;
    }
    handleLobbyUpdate(snap.data());
  });

  if (unsubBets) unsubBets();
  unsubBets = onSnapshot(collection(db, "lobbies", code, "bets"), snap => {
    let pool = 0;
    let myBets = null;
    snap.forEach(b => {
      const d = b.data();
      pool += (d.wheel1?.amount || 0) + (d.wheel2?.amount || 0) + (d.wheel3?.amount || 0);
      if (b.id === currentUid) myBets = d;
    });
    prizePoolDisplay.textContent = `Prize Pool: ${pool}`;
    renderMyBets(myBets);
  });
}

function rewire(id, handler) {
  const el = document.getElementById(id);
  if (!el) return;
  const fresh = el.cloneNode(true);
  el.parentNode.replaceChild(fresh, el);
  fresh.addEventListener("click", handler);
}

// ── RTDB Presence ──────────────────────────────
function setupPresence(code) {
  const myRef = ref(rtdb, `presence/${code}/${currentUid}`);
  set(myRef, { online: true });
  onDisconnect(myRef).remove();

  if (unsubPresence) unsubPresence();
  unsubPresence = onValue(ref(rtdb, `presence/${code}`), async snapshot => {
    if (!currentLobbyCode || currentLobbyCode !== code) return;
    const lobbySnap = await getDoc(doc(db, "lobbies", code));
    if (!lobbySnap.exists()) return;
    const inLobby = lobbySnap.data().players || {};
    const online  = snapshot.val() || {};
    for (const uid of Object.keys(inLobby)) {
      if (!online[uid] && uid !== currentUid) {
        await removePlayerFromLobby(uid, code);
      }
    }
  });
}

// ── Lobby update ───────────────────────────────
function handleLobbyUpdate(data) {
  lobbyRoundDisplay.textContent = `Round ${data.round}`;
  isAdmin = data.adminUid === currentUid;

  // Fix Bets only for admin, Place Bets for everyone
  const fixBtn   = document.getElementById("spin-btn");
  const placeBtn = document.getElementById("place-bets-btn");
  if (fixBtn)   fixBtn.style.display   = isAdmin ? "inline-block" : "none";
  if (placeBtn) placeBtn.style.display = "inline-block";

  currentPlayers = data.players || {};

  // Kicked check
  if (currentLobbyCode && !currentPlayers[currentUid]) {
    doLeave(true);
    return;
  }

  // Player list
  playersList.innerHTML = "";
  for (const [uid, name] of Object.entries(currentPlayers)) {
    const tag = document.createElement("div");
    tag.className = "player-tag" + (uid === data.adminUid ? " player-admin" : "");
    const span = document.createElement("span");
    span.textContent = name + (uid === data.adminUid ? " ★" : "");
    tag.appendChild(span);
    if (isAdmin && uid !== currentUid) {
      const kb = document.createElement("button");
      kb.className   = "kick-btn";
      kb.textContent = "✕";
      kb.title       = `Kick ${name}`;
      kb.addEventListener("click", async () => {
        if (!confirm(`Kick ${name}?`)) return;
        await kickPlayer(uid);
      });
      tag.appendChild(kb);
    }
    playersList.appendChild(tag);
  }

  rebuildDeathsDropdown(currentPlayers);

  if (data.phase === "betting") {
    phaseBetting.classList.remove("hidden");
    phaseResults.classList.add("hidden");

  } else if (data.phase === "results") {
    phaseBetting.classList.add("hidden");
    phaseResults.classList.remove("hidden");
    if (isAdmin) {
      tbdMsg.classList.add("hidden");
      adminOutcomeSection.classList.remove("hidden");
      rebuildOutcome3Dropdown(currentPlayers);
    } else {
      tbdMsg.classList.remove("hidden");
      adminOutcomeSection.classList.add("hidden");
    }

  } else if (data.phase === "payout_done") {
    showPayoutPopup(data);
  }
}

// ── Kick ───────────────────────────────────────
async function kickPlayer(uid) {
  if (!isAdmin || !currentLobbyCode) return;
  const lobbyRef  = doc(db, "lobbies", currentLobbyCode);
  const lobbySnap = await getDoc(lobbyRef);
  if (!lobbySnap.exists()) return;
  const players = { ...lobbySnap.data().players };
  delete players[uid];
  await updateDoc(lobbyRef, { players });
  await deleteDoc(doc(db, "lobbies", currentLobbyCode, "bets", uid)).catch(() => {});
  await remove(ref(rtdb, `presence/${currentLobbyCode}/${uid}`)).catch(() => {});
}

// ── Deaths dropdowns ───────────────────────────
function buildDeathOptions(sel, placeholder, players, current) {
  sel.innerHTML = `<option value="">${placeholder}</option><option value="None Dead">None Dead</option>`;
  for (const name of Object.values(players)) {
    const o = document.createElement("option");
    o.value = o.textContent = name;
    sel.appendChild(o);
  }
  const o = document.createElement("option");
  o.value = o.textContent = "All Dead";
  sel.appendChild(o);
  if ([...sel.options].some(o => o.value === current)) sel.value = current;
}
function rebuildDeathsDropdown(p)  {
  const s = document.getElementById("pick-3");
  if (s) buildDeathOptions(s, "— Pick —",   p, s.value);
}
function rebuildOutcome3Dropdown(p) {
  const s = document.getElementById("outcome-3");
  if (s) buildDeathOptions(s, "— Select —", p, s.value);
}

// ── My bets display ────────────────────────────
function renderMyBets(bets) {
  if (!myBetsDisplay) return;
  if (!bets) { myBetsDisplay.innerHTML = `<p class="my-bets-empty">No bets placed yet.</p>`; return; }
  const labels = ["Win / Lose", "Ghost Type", "Deaths"];
  const keys   = ["wheel1", "wheel2", "wheel3"];
  const rows   = keys.map((k, i) => {
    const b = bets[k];
    if (!b || b.amount === 0) return null;
    return `<div class="my-bet-row">
      <span class="my-bet-label">${labels[i]}</span>
      <span class="my-bet-pick">${b.pick || "—"}</span>
      <span class="my-bet-amount">${b.amount} ${currencyLabel}</span>
    </div>`;
  }).filter(Boolean);
  myBetsDisplay.innerHTML = rows.length
    ? rows.join("")
    : `<p class="my-bets-empty">No bets placed yet.</p>`;
}

// ── Save bets to Firestore (no point deduction — just records picks/amounts) ──
async function saveBets() {
  if (!currentLobbyCode || !currentUid) return;
  const betData = {
    wheel1: { pick: gv("pick-1"), amount: Math.max(0, parseInt(gv("bet-1")) || 0) },
    wheel2: { pick: gv("pick-2"), amount: Math.max(0, parseInt(gv("bet-2")) || 0) },
    wheel3: { pick: gv("pick-3"), amount: Math.max(0, parseInt(gv("bet-3")) || 0) },
  };
  await setDoc(doc(db, "lobbies", currentLobbyCode, "bets", currentUid), betData);
}

// ── Place Bets — deducts points for ANY player (including admin) ──────────────
//    This is the button that actually costs points.
async function handlePlaceBets() {
  const errEl = document.getElementById("bet-error");
  if (errEl) errEl.textContent = "";

  const amounts = [
    Math.max(0, parseInt(gv("bet-1")) || 0),
    Math.max(0, parseInt(gv("bet-2")) || 0),
    Math.max(0, parseInt(gv("bet-3")) || 0),
  ];
  const picks = [gv("pick-1"), gv("pick-2"), gv("pick-3")];
  const total = amounts.reduce((a, b) => a + b, 0);

  if (total === 0) {
    if (errEl) errEl.textContent = "Enter at least one bet amount.";
    return;
  }

  // Validate: every non-zero bet needs a pick
  for (let i = 0; i < 3; i++) {
    if (amounts[i] > 0 && !picks[i]) {
      if (errEl) errEl.textContent = `Choose a pick for Wheel ${i + 1} or set its bet to 0.`;
      return;
    }
  }

  // Check points
  const userSnap = await getDoc(doc(db, "users", currentUid));
  const pts = userSnap.data().points;
  if (total > pts) {
    if (errEl) errEl.textContent = `Not enough ${currencyLabel}. You have ${pts}, bet is ${total}.`;
    return;
  }

  // Deduct points
  const newPts = pts - total;
  await updateDoc(doc(db, "users", currentUid), { points: newPts });
  updatePointsDisplay(newPts);

  // Write bet to Firestore
  await setDoc(doc(db, "lobbies", currentLobbyCode, "bets", currentUid), {
    wheel1: { pick: picks[0], amount: amounts[0] },
    wheel2: { pick: picks[1], amount: amounts[1] },
    wheel3: { pick: picks[2], amount: amounts[2] },
  });

  // Visual confirmation
  const msg = document.getElementById("bets-placed-msg");
  if (msg) { msg.classList.remove("hidden"); setTimeout(() => msg.classList.add("hidden"), 2500); }
}

// ── Fix Bets — admin only, just moves phase to "results" ──────────────────────
//    Points already deducted when each player clicked Place Bets.
async function handleFixBets() {
  if (!isAdmin) return;
  await updateDoc(doc(db, "lobbies", currentLobbyCode), { phase: "results" });
}

// ── Payout ─────────────────────────────────────
async function handlePayout() {
  if (!isAdmin) return;
  const errEl = document.getElementById("payout-error");
  if (errEl) errEl.textContent = "";

  const o1 = gv("outcome-1");
  const o2 = gv("outcome-2");
  const o3 = gv("outcome-3");
  if (!o1 || !o2 || !o3) {
    if (errEl) errEl.textContent = "Select an outcome for all three wheels.";
    return;
  }

  const results  = { wheel1: o1, wheel2: o2, wheel3: o3 };
  const betsSnap = await getDocs(collection(db, "lobbies", currentLobbyCode, "bets"));
  const { payouts } = calculatePayouts(betsSnap, results);

  // Read all winner balances first, then batch-write everything
  const updates = [];
  const payoutRecord = {};

  for (const [uid, amount] of Object.entries(payouts)) {
    const uSnap = await getDoc(doc(db, "users", uid));
    if (uSnap.exists()) {
      updates.push({ uid, ref: doc(db, "users", uid), newPts: uSnap.data().points + Math.floor(amount) });
    }
    payoutRecord[uid] = Math.floor(amount);
  }

  const batch = writeBatch(db);
  updates.forEach(({ ref: r, newPts }) => batch.update(r, { points: newPts }));
  betsSnap.forEach(b => batch.delete(b.ref));
  await batch.commit();

  // Update own display
  const mine = updates.find(u => u.uid === currentUid);
  if (mine) updatePointsDisplay(mine.newPts);

  const lobbySnap = await getDoc(doc(db, "lobbies", currentLobbyCode));
  if (!lobbySnap.exists()) return;

  await updateDoc(doc(db, "lobbies", currentLobbyCode), {
    phase:   "payout_done",
    results,
    payouts: payoutRecord,
    round:   lobbySnap.data().round,
  });

  // Reset outcome dropdowns
  ["outcome-1","outcome-2","outcome-3"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
}

// ── Payout math ────────────────────────────────
// Winners get their stake back + proportional share of losers' money.
function calculatePayouts(betsSnap, results) {
  let totalPool = 0;
  const allBets = {};
  betsSnap.forEach(b => {
    const d = b.data();
    allBets[b.id] = d;
    totalPool += (d.wheel1?.amount || 0) + (d.wheel2?.amount || 0) + (d.wheel3?.amount || 0);
  });

  const winStakes = {};
  let totalWin = 0;
  for (const [uid, bets] of Object.entries(allBets)) {
    let stake = 0;
    for (const key of ["wheel1","wheel2","wheel3"]) {
      const b = bets[key];
      if (b && b.amount > 0 && b.pick && b.pick === results[key]) stake += b.amount;
    }
    if (stake > 0) { winStakes[uid] = stake; totalWin += stake; }
  }

  if (totalWin === 0) return { payouts: {} };

  const losingPool = totalPool - totalWin;
  const payouts = {};
  for (const [uid, stake] of Object.entries(winStakes)) {
    payouts[uid] = stake + (stake / totalWin) * losingPool;
  }
  return { payouts };
}

// ── Payout popup ───────────────────────────────
function showPayoutPopup(data) {
  const results = data.results || {};
  const payouts = data.payouts || {};
  const players = data.players || {};

  popupResultsDisplay.innerHTML = ["wheel1","wheel2","wheel3"].map((k, i) =>
    `<div class="popup-result-row">
      <span class="popup-result-label">${["Win / Lose","Ghost Type","Deaths"][i]}</span>
      <span class="popup-result-value">${results[k] || "—"}</span>
    </div>`
  ).join("");

  popupPayoutsDisplay.innerHTML = Object.keys(payouts).length === 0
    ? `<p style="color:#aaa;text-align:center;">No winners this round.</p>`
    : Object.entries(payouts).map(([uid, amt]) =>
        `<div class="popup-payout-row">
          <span>${players[uid] || "Player"}</span>
          <span class="payout-amount">+${amt} ${currencyLabel}</span>
        </div>`
      ).join("");

  const myAmt = payouts[currentUid];
  popupYourPayout.textContent = myAmt > 0
    ? `You won ${myAmt} ${currencyLabel}!`
    : "Better luck next round.";
  popupYourPayout.style.color = myAmt > 0 ? "#7fd67f" : "#aaa";

  payoutPopup.classList.remove("hidden");
}

async function handlePopupClose() {
  payoutPopup.classList.add("hidden");
  resetBettingUI();
  if (!isAdmin || !currentLobbyCode) return;
  const lobbyRef  = doc(db, "lobbies", currentLobbyCode);
  const lobbySnap = await getDoc(lobbyRef);
  if (lobbySnap.exists() && lobbySnap.data().phase === "payout_done") {
    await updateDoc(lobbyRef, {
      phase:   "betting",
      results: null,
      payouts: null,
      round:   lobbySnap.data().round + 1,
    });
  }
}

// ── Helpers ────────────────────────────────────
function gv(id) {
  const el = document.getElementById(id);
  return el ? el.value : "";
}
function updatePointsDisplay(pts) {
  pointsDisplay.textContent = `${currencyLabel}: ${pts}`;
}
function resetBettingUI() {
  ["bet-1","bet-2","bet-3"].forEach(id => { const e = document.getElementById(id); if (e) e.value = 0; });
  ["pick-1","pick-2","pick-3"].forEach(id => { const e = document.getElementById(id); if (e) e.value = ""; });
  const err = document.getElementById("bet-error");
  if (err) err.textContent = "";
  document.querySelectorAll(".wheel").forEach(el => { el.innerHTML = "<p>?</p>"; });
  if (myBetsDisplay) myBetsDisplay.innerHTML = `<p class="my-bets-empty">No bets placed yet.</p>`;
}
function cleanupListeners() {
  if (unsubLobby)    { unsubLobby();    unsubLobby    = null; }
  if (unsubBets)     { unsubBets();     unsubBets     = null; }
  if (unsubPresence) { unsubPresence(); unsubPresence = null; }
}
