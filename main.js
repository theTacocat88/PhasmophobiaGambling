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

// ─────────────────────────────────────────────
//  Firebase
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
//  State
// ─────────────────────────────────────────────
let currentUid       = null;
let currentLobbyCode = null;
let isAdmin          = false;
let currencyLabel    = "Points";
let currentPlayers   = {};
let unsubLobby       = null;
let unsubBets        = null;
let rtdbPresenceRef  = null;
let unsubPresence    = null; // RTDB onValue unsub

// ─────────────────────────────────────────────
//  DOM
// ─────────────────────────────────────────────
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
const fixBetsBtn    = document.getElementById("spin-btn");
const waitingMsg    = document.getElementById("waiting-msg");
const betError      = document.getElementById("bet-error");
const myBetsDisplay = document.getElementById("my-bets-display");

const betInputs = [
  document.getElementById("bet-1"),
  document.getElementById("bet-2"),
  document.getElementById("bet-3"),
];
const pickSelects = [
  document.getElementById("pick-1"),
  document.getElementById("pick-2"),
  document.getElementById("pick-3"),
];
const wheelEls = [
  document.getElementById("wheel1"),
  document.getElementById("wheel2"),
  document.getElementById("wheel3"),
];

const phaseResults        = document.getElementById("phase-results");
const tbdMsg              = document.getElementById("tbd-msg");
const adminOutcomeSection = document.getElementById("admin-outcome-section");
const outcomeSelects = [
  document.getElementById("outcome-1"),
  document.getElementById("outcome-2"),
  document.getElementById("outcome-3"),
];
const payoutError = document.getElementById("payout-error");
const payoutBtn   = document.getElementById("payout-btn");

const payoutPopup         = document.getElementById("payout-popup");
const popupResultsDisplay = document.getElementById("popup-results-display");
const popupPayoutsDisplay = document.getElementById("popup-payouts-display");
const popupYourPayout     = document.getElementById("popup-your-payout");
const popupCloseBtn       = document.getElementById("popup-close-btn");

const userSettingsCard  = document.getElementById("user-settings-card");
const settingsToggle    = document.getElementById("settings-toggle");
const settingsPanel     = document.getElementById("settings-panel");
const settingsNameInput = document.getElementById("settings-name-input");
const settingsNameSave  = document.getElementById("settings-name-save");
const currencySelect    = document.getElementById("currency-select");
const resetAccountBtn   = document.getElementById("reset-account-btn");
const settingsMsg       = document.getElementById("settings-msg");

// ─────────────────────────────────────────────
//  Auth
// ─────────────────────────────────────────────
signInAnonymously(auth).catch(err => console.error("Auth error:", err));

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

// ─────────────────────────────────────────────
//  Settings
// ─────────────────────────────────────────────
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
  if (!confirm("Reset to 300? This cannot be undone.")) return;
  await updateDoc(doc(db, "users", currentUid), { points: 300 });
  updatePointsDisplay(300);
  settingsMsg.textContent = "Reset.";
  setTimeout(() => { settingsMsg.textContent = ""; }, 2000);
});

// ─────────────────────────────────────────────
//  Landing
// ─────────────────────────────────────────────
createLobbyBtn.addEventListener("click", async () => {
  const name = displayNameInput.value.trim();
  if (!name)       { landingError.textContent = "Enter a display name first."; return; }
  if (!currentUid) { landingError.textContent = "Still signing in, try again."; return; }
  landingError.textContent = "";

  let code;
  for (let i = 0; i < 10; i++) {
    const c = String(Math.floor(1000 + Math.random() * 9000));
    const s = await getDoc(doc(db, "lobbies", c));
    if (!s.exists()) { code = c; break; }
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

// ─────────────────────────────────────────────
//  Leave
// ─────────────────────────────────────────────
leaveLobbyBtn.addEventListener("click", () => doLeave(false));

async function doLeave(wasKicked) {
  if (!currentLobbyCode) return;
  const code = currentLobbyCode;

  // Stop listeners FIRST so we don't react to our own removal
  cleanupListeners();
  currentLobbyCode = null;
  isAdmin = false;

  // Clean up RTDB presence manually before calling removePlayer
  // (cleanupListeners nulls rtdbPresenceRef so we pass the ref directly)
  const myPresRef = ref(rtdb, `presence/${code}/${currentUid}`);
  await remove(myPresRef).catch(() => {});

  await removePlayerFromLobby(currentUid, code);

  screenLobby.classList.add("hidden");
  screenLanding.classList.remove("hidden");
  resetBettingUI();

  if (wasKicked) {
    landingError.textContent = "You were kicked from the lobby.";
    landingError.style.color = "#e06c6c";
  }
}

// ─────────────────────────────────────────────
//  Remove player from lobby (Firestore + lobby deletion if last)
// ─────────────────────────────────────────────
async function removePlayerFromLobby(uid, code) {
  const lobbyRef  = doc(db, "lobbies", code);
  const lobbySnap = await getDoc(lobbyRef);
  if (!lobbySnap.exists()) return;

  const data    = lobbySnap.data();
  const players = { ...data.players };
  delete players[uid];

  // Always delete this player's bets
  await deleteDoc(doc(db, "lobbies", code, "bets", uid)).catch(() => {});

  if (Object.keys(players).length === 0) {
    // Last player — delete entire lobby
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

// ─────────────────────────────────────────────
//  Enter lobby
// ─────────────────────────────────────────────
function enterLobby(code) {
  currentLobbyCode = code;

  screenLanding.classList.add("hidden");
  screenLobby.classList.remove("hidden");
  lobbyCodeDisplay.textContent = `Lobby: ${code}`;

  // Wire buttons ONCE using named handlers — safe to call on re-enter
  // because addEventListener with the same named function is deduped by the browser
  // BUT to be safe we clone-replace the buttons to clear any old listeners
  replaceButton(fixBetsBtn,  handleFixBets);
  replaceButton(payoutBtn,   handlePayout);
  replaceButton(popupCloseBtn, handlePopupClose);
  replaceButton(leaveLobbyBtn, () => doLeave(false));

  betInputs.forEach(input => {
    const fresh = input.cloneNode(true);
    input.parentNode.replaceChild(fresh, input);
    betInputs[betInputs.indexOf(input)] = fresh;
    fresh.addEventListener("change", saveBets);
  });
  pickSelects.forEach(sel => {
    sel.addEventListener("change", saveBets);
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

// Replace a button element to wipe all old event listeners, then attach one new one
function replaceButton(btn, handler) {
  if (!btn) return;
  const fresh = btn.cloneNode(true);
  btn.parentNode.replaceChild(fresh, btn);
  fresh.addEventListener("click", handler);
  // Update the reference in the outer scope by re-querying by id
  const id = fresh.id;
  if (id === "spin-btn")         { /* fixBetsBtn ref is stale but cloneNode keeps id */ }
  // Return the fresh node so callers can optionally use it
  return fresh;
}

// ─────────────────────────────────────────────
//  RTDB Presence
// ─────────────────────────────────────────────
function setupPresence(code) {
  rtdbPresenceRef = ref(rtdb, `presence/${code}/${currentUid}`);
  set(rtdbPresenceRef, { online: true });
  onDisconnect(rtdbPresenceRef).remove();

  // Watch everyone's presence in this lobby
  if (unsubPresence) unsubPresence();
  const lobbyPresRef = ref(rtdb, `presence/${code}`);
  // onValue returns an unsubscribe function
  unsubPresence = onValue(lobbyPresRef, async snapshot => {
    if (!currentLobbyCode || currentLobbyCode !== code) return;

    const lobbySnap = await getDoc(doc(db, "lobbies", code));
    if (!lobbySnap.exists()) return;

    const firestorePlayers = lobbySnap.data().players || {};
    const online           = snapshot.val() || {};

    for (const uid of Object.keys(firestorePlayers)) {
      if (!online[uid] && uid !== currentUid) {
        // This player is in Firestore but gone from RTDB — disconnect them
        await removePlayerFromLobby(uid, code);
      }
    }
  });
}

// ─────────────────────────────────────────────
//  Lobby update handler
// ─────────────────────────────────────────────
function handleLobbyUpdate(data) {
  lobbyRoundDisplay.textContent = `Round ${data.round}`;

  isAdmin = data.adminUid === currentUid;

  // Show/hide Fix Bets button by re-querying (cloneNode may have replaced the ref)
  const fb = document.getElementById("spin-btn");
  if (fb) fb.style.display = isAdmin ? "inline-block" : "none";
  waitingMsg.classList.toggle("hidden", isAdmin);

  // Check if we were kicked (our uid gone from players map)
  currentPlayers = data.players || {};
  if (currentLobbyCode && !currentPlayers[currentUid]) {
    doLeave(true);
    return;
  }

  // Rebuild player tags
  playersList.innerHTML = "";
  for (const [uid, name] of Object.entries(currentPlayers)) {
    const tag = document.createElement("div");
    tag.className = "player-tag" + (uid === data.adminUid ? " player-admin" : "");

    const nameSpan = document.createElement("span");
    nameSpan.textContent = name + (uid === data.adminUid ? " ★" : "");
    tag.appendChild(nameSpan);

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
    // Don't hide popup here — let the close button handle it

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
    // Show popup — both admin and non-admin
    showPayoutPopup(data);
  }
}

// ─────────────────────────────────────────────
//  Kick
// ─────────────────────────────────────────────
async function kickPlayer(uid) {
  if (!isAdmin || !currentLobbyCode) return;
  const lobbyRef  = doc(db, "lobbies", currentLobbyCode);
  const lobbySnap = await getDoc(lobbyRef);
  if (!lobbySnap.exists()) return;

  const players = { ...lobbySnap.data().players };
  delete players[uid];
  await updateDoc(lobbyRef, { players });
  await deleteDoc(doc(db, "lobbies", currentLobbyCode, "bets", uid)).catch(() => {});
  // Remove their RTDB presence to prevent presence watcher re-adding them
  await remove(ref(rtdb, `presence/${currentLobbyCode}/${uid}`)).catch(() => {});
}

// ─────────────────────────────────────────────
//  Deaths dropdowns
// ─────────────────────────────────────────────
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

function rebuildDeathsDropdown(players) {
  buildDeathOptions(pickSelects[2], "— Pick —", players, pickSelects[2].value);
}
function rebuildOutcome3Dropdown(players) {
  buildDeathOptions(outcomeSelects[2], "— Select —", players, outcomeSelects[2].value);
}

// ─────────────────────────────────────────────
//  My Bets display
// ─────────────────────────────────────────────
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
  myBetsDisplay.innerHTML = rows.length ? rows.join("") : `<p class="my-bets-empty">No bets placed yet.</p>`;
}

// ─────────────────────────────────────────────
//  Save bets
// ─────────────────────────────────────────────
async function saveBets() {
  if (!currentLobbyCode || !currentUid) return;
  // Re-query inputs in case they were replaced by cloneNode
  const b1 = document.getElementById("bet-1");
  const b2 = document.getElementById("bet-2");
  const b3 = document.getElementById("bet-3");
  const p1 = document.getElementById("pick-1");
  const p2 = document.getElementById("pick-2");
  const p3 = document.getElementById("pick-3");
  const betData = {
    wheel1: { pick: p1.value, amount: Math.max(0, parseInt(b1.value) || 0) },
    wheel2: { pick: p2.value, amount: Math.max(0, parseInt(b2.value) || 0) },
    wheel3: { pick: p3.value, amount: Math.max(0, parseInt(b3.value) || 0) },
  };
  await setDoc(doc(db, "lobbies", currentLobbyCode, "bets", currentUid), betData);
}

// ─────────────────────────────────────────────
//  Fix Bets (admin locks bets, moves to results phase)
// ─────────────────────────────────────────────
async function handleFixBets() {
  if (!isAdmin) return;
  const errEl = document.getElementById("bet-error");
  if (errEl) errEl.textContent = "";

  const b1 = parseInt(document.getElementById("bet-1").value) || 0;
  const b2 = parseInt(document.getElementById("bet-2").value) || 0;
  const b3 = parseInt(document.getElementById("bet-3").value) || 0;
  const totalBet = b1 + b2 + b3;
  const bets = [b1, b2, b3];

  if (totalBet > 0) {
    const picks = [
      document.getElementById("pick-1").value,
      document.getElementById("pick-2").value,
      document.getElementById("pick-3").value,
    ];
    for (let i = 0; i < 3; i++) {
      if (bets[i] > 0 && !picks[i]) {
        if (errEl) errEl.textContent = `Pick an option for Wheel ${i + 1} or set its bet to 0.`;
        return;
      }
    }
    const userSnap = await getDoc(doc(db, "users", currentUid));
    const pts = userSnap.data().points;
    if (totalBet > pts) {
      if (errEl) errEl.textContent = `Not enough ${currencyLabel}. You have ${pts} but bet ${totalBet}.`;
      return;
    }
    await updateDoc(doc(db, "users", currentUid), { points: pts - totalBet });
    updatePointsDisplay(pts - totalBet);
    await saveBets();
  }

  await updateDoc(doc(db, "lobbies", currentLobbyCode), { phase: "results" });
}

// ─────────────────────────────────────────────
//  Payout — admin confirms outcomes, distributes points
// ─────────────────────────────────────────────
async function handlePayout() {
  if (!isAdmin) return;

  const errEl = document.getElementById("payout-error");
  if (errEl) errEl.textContent = "";

  const o1 = document.getElementById("outcome-1").value;
  const o2 = document.getElementById("outcome-2").value;
  const o3 = document.getElementById("outcome-3").value;

  if (!o1 || !o2 || !o3) {
    if (errEl) errEl.textContent = "Select an outcome for all three wheels.";
    return;
  }

  const results = { wheel1: o1, wheel2: o2, wheel3: o3 };

  // 1. Fetch all bets
  const betsSnap = await getDocs(collection(db, "lobbies", currentLobbyCode, "bets"));

  // 2. Calculate payouts
  const { payouts } = calculatePayouts(betsSnap, results);

  // 3. Read all user point balances before touching anything
  const userUpdates = []; // { uid, ref, newPts }
  const payoutRecord = {}; // { uid: flooredAmount } — written to Firestore for popup display

  for (const [uid, amount] of Object.entries(payouts)) {
    const uRef  = doc(db, "users", uid);
    const uSnap = await getDoc(uRef);
    if (uSnap.exists()) {
      const newPts = uSnap.data().points + Math.floor(amount);
      userUpdates.push({ uid, ref: uRef, newPts });
    }
    payoutRecord[uid] = Math.floor(amount);
  }

  // 4. Build and commit one atomic batch:
  //    - update each winner's point total
  //    - delete all bet documents
  const batch = writeBatch(db);
  for (const { ref: r, newPts } of userUpdates) {
    batch.update(r, { points: newPts });
  }
  betsSnap.forEach(b => batch.delete(b.ref));
  await batch.commit();

  // Update own display immediately
  const myUpdate = userUpdates.find(u => u.uid === currentUid);
  if (myUpdate) updatePointsDisplay(myUpdate.newPts);

  // 5. Get current round number
  const lobbySnap  = await getDoc(doc(db, "lobbies", currentLobbyCode));
  if (!lobbySnap.exists()) return;
  const roundNow = lobbySnap.data().round;

  // 6. Write payout_done to Firestore — this triggers the popup on ALL clients.
  //    Do NOT reset the lobby here. The reset happens when the popup is closed.
  await updateDoc(doc(db, "lobbies", currentLobbyCode), {
    phase:   "payout_done",
    results,
    payouts: payoutRecord,
    round:   roundNow   // keep round the same; increment happens on close
  });

  // Reset outcome selectors for next round
  document.getElementById("outcome-1").value = "";
  document.getElementById("outcome-2").value = "";
  document.getElementById("outcome-3").value = "";
}

// ─────────────────────────────────────────────
//  Payout math
//  Winners receive their stake back + proportional share of losers' money.
//  Bigger bettors earn more. Solo winner gets stake back with no bonus (no losers).
// ─────────────────────────────────────────────
function calculatePayouts(betsSnap, results) {
  let totalPool = 0;
  const allBets = {};

  betsSnap.forEach(betDoc => {
    const d = betDoc.data();
    allBets[betDoc.id] = d;
    totalPool += (d.wheel1?.amount || 0) + (d.wheel2?.amount || 0) + (d.wheel3?.amount || 0);
  });

  const winningStakes = {};
  let totalWinningStake = 0;

  for (const [uid, bets] of Object.entries(allBets)) {
    let stake = 0;
    for (const key of ["wheel1", "wheel2", "wheel3"]) {
      const b = bets[key];
      if (b && b.amount > 0 && b.pick && b.pick === results[key]) stake += b.amount;
    }
    if (stake > 0) { winningStakes[uid] = stake; totalWinningStake += stake; }
  }

  if (totalWinningStake === 0) return { payouts: {}, totalPool };

  const losingPool = totalPool - totalWinningStake;
  const payouts = {};
  for (const [uid, stake] of Object.entries(winningStakes)) {
    payouts[uid] = stake + (stake / totalWinningStake) * losingPool;
  }
  return { payouts, totalPool };
}

// ─────────────────────────────────────────────
//  Payout popup — shown on ALL clients when phase === "payout_done"
// ─────────────────────────────────────────────
function showPayoutPopup(data) {
  const results = data.results || {};
  const payouts = data.payouts || {};
  const players = data.players || {};

  const labels = ["Win / Lose", "Ghost Type", "Deaths"];
  const keys   = ["wheel1", "wheel2", "wheel3"];

  popupResultsDisplay.innerHTML = keys.map((k, i) =>
    `<div class="popup-result-row">
      <span class="popup-result-label">${labels[i]}</span>
      <span class="popup-result-value">${results[k] || "—"}</span>
    </div>`
  ).join("");

  if (Object.keys(payouts).length === 0) {
    popupPayoutsDisplay.innerHTML = `<p style="color:#aaa;text-align:center;">No winners this round.</p>`;
  } else {
    popupPayoutsDisplay.innerHTML = Object.entries(payouts).map(([uid, amt]) =>
      `<div class="popup-payout-row">
        <span>${players[uid] || "Player"}</span>
        <span class="payout-amount">+${amt} ${currencyLabel}</span>
      </div>`
    ).join("");
  }

  if (payouts[currentUid] != null && payouts[currentUid] > 0) {
    popupYourPayout.textContent = `You won ${payouts[currentUid]} ${currencyLabel}!`;
    popupYourPayout.style.color = "#7fd67f";
  } else {
    popupYourPayout.textContent = "Better luck next round.";
    popupYourPayout.style.color = "#aaa";
  }

  payoutPopup.classList.remove("hidden");
  // Lobby reset is deferred to handlePopupClose so all clients see the popup first
}

// Called when Close is clicked on the payout popup
async function handlePopupClose() {
  payoutPopup.classList.add("hidden");
  resetBettingUI();

  // Only the admin resets the lobby phase (once is enough — all clients react via listener)
  if (isAdmin && currentLobbyCode) {
    const lobbyRef  = doc(db, "lobbies", currentLobbyCode);
    const lobbySnap = await getDoc(lobbyRef);
    if (lobbySnap.exists() && lobbySnap.data().phase === "payout_done") {
      await updateDoc(lobbyRef, {
        phase:   "betting",
        results: null,
        payouts: null,
        round:   lobbySnap.data().round + 1
      });
    }
  }
}

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────
function updatePointsDisplay(pts) {
  pointsDisplay.textContent = `${currencyLabel}: ${pts}`;
}

function resetBettingUI() {
  ["bet-1","bet-2","bet-3"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = 0;
  });
  ["pick-1","pick-2","pick-3"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  const errEl = document.getElementById("bet-error");
  if (errEl) errEl.textContent = "";
  wheelEls.forEach(el => { el.innerHTML = "<p>?</p>"; });
  if (myBetsDisplay) myBetsDisplay.innerHTML = `<p class="my-bets-empty">No bets placed yet.</p>`;
}

function cleanupListeners() {
  if (unsubLobby)    { unsubLobby();    unsubLobby    = null; }
  if (unsubBets)     { unsubBets();     unsubBets     = null; }
  if (unsubPresence) { unsubPresence(); unsubPresence = null; }
  rtdbPresenceRef = null;
}
