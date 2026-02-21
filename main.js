import { initializeApp }            from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged }
                                      from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, onSnapshot, getDocs, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getDatabase, ref, set, remove, onValue, onDisconnect, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// ─────────────────────────────────────────────
//  Firebase init
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
let currentPlayers   = {};   // { uid: name }
let unsubLobby       = null;
let unsubBets        = null;
let presenceRef      = null;
let presenceWatcher  = null; // unsub for presence onValue

// ─────────────────────────────────────────────
//  DOM refs
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

const phaseBetting = document.getElementById("phase-betting");
const fixBetsBtn   = document.getElementById("spin-btn");       // renamed in HTML
const waitingMsg   = document.getElementById("waiting-msg");
const betError     = document.getElementById("bet-error");
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
    const data = userSnap.data();
    currencyLabel = data.currencyPref || "Points";
    updatePointsDisplay(data.points ?? 300);
    if (data.username) settingsNameInput.value = data.username;
  }

  currencySelect.value = currencyLabel;
  userSettingsCard.classList.remove("hidden");
});

// ─────────────────────────────────────────────
//  Settings
// ─────────────────────────────────────────────
settingsToggle.addEventListener("click", () => settingsPanel.classList.toggle("hidden"));

settingsNameSave.addEventListener("click", async () => {
  const newName = settingsNameInput.value.trim();
  if (!newName) { settingsMsg.textContent = "Enter a name."; return; }
  await updateDoc(doc(db, "users", currentUid), { username: newName });
  if (currentLobbyCode) {
    await updateDoc(doc(db, "lobbies", currentLobbyCode), {
      [`players.${currentUid}`]: newName
    });
  }
  settingsMsg.textContent = "Saved!";
  setTimeout(() => settingsMsg.textContent = "", 2000);
});

currencySelect.addEventListener("change", async () => {
  currencyLabel = currencySelect.value;
  await updateDoc(doc(db, "users", currentUid), { currencyPref: currencyLabel });
  const snap = await getDoc(doc(db, "users", currentUid));
  if (snap.exists()) updatePointsDisplay(snap.data().points ?? 0);
});

resetAccountBtn.addEventListener("click", async () => {
  if (!confirm("Reset your account to 300 points? This cannot be undone.")) return;
  await updateDoc(doc(db, "users", currentUid), { points: 300 });
  updatePointsDisplay(300);
  settingsMsg.textContent = "Account reset.";
  setTimeout(() => settingsMsg.textContent = "", 2000);
});

// ─────────────────────────────────────────────
//  Landing: Create
// ─────────────────────────────────────────────
createLobbyBtn.addEventListener("click", async () => {
  const name = displayNameInput.value.trim();
  if (!name)        { landingError.textContent = "Enter a display name first."; return; }
  if (!currentUid)  { landingError.textContent = "Still signing in, try again."; return; }
  landingError.textContent = "";

  let code;
  for (let i = 0; i < 10; i++) {
    const candidate = String(Math.floor(1000 + Math.random() * 9000));
    const snap = await getDoc(doc(db, "lobbies", candidate));
    if (!snap.exists()) { code = candidate; break; }
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

  enterLobby(code, true);
});

// ─────────────────────────────────────────────
//  Landing: Join
// ─────────────────────────────────────────────
joinLobbyBtn.addEventListener("click", async () => {
  const name = displayNameInput.value.trim();
  const code = joinCodeInput.value.trim();
  if (!name)       { landingError.textContent = "Enter a display name first."; return; }
  if (!code)       { landingError.textContent = "Enter a lobby code."; return; }
  if (!currentUid) { landingError.textContent = "Still signing in, try again."; return; }
  landingError.textContent = "";

  const lobbySnap = await getDoc(doc(db, "lobbies", code));
  if (!lobbySnap.exists()) { landingError.textContent = "Lobby not found."; return; }

  await updateDoc(doc(db, "lobbies", code), { [`players.${currentUid}`]: name });
  enterLobby(code, false);
});

// ─────────────────────────────────────────────
//  Leave lobby
// ─────────────────────────────────────────────
leaveLobbyBtn.addEventListener("click", () => leaveLobby(false));

async function leaveLobby(kicked = false) {
  if (!currentLobbyCode) return;
  const code = currentLobbyCode;

  cleanupLobbyListeners();
  currentLobbyCode = null;
  isAdmin = false;

  await removePlayerFromLobby(currentUid, code);

  screenLobby.classList.add("hidden");
  screenLanding.classList.remove("hidden");
  resetBettingUI();

  if (kicked) {
    landingError.textContent = "You were kicked from the lobby.";
    landingError.style.color = "#e06c6c";
  }
}

async function removePlayerFromLobby(uid, code) {
  const lobbyRef  = doc(db, "lobbies", code);
  const lobbySnap = await getDoc(lobbyRef);
  if (!lobbySnap.exists()) return;

  const data    = lobbySnap.data();
  const players = { ...data.players };
  delete players[uid];

  // Delete their bets
  await deleteDoc(doc(db, "lobbies", code, "bets", uid)).catch(() => {});

  if (Object.keys(players).length === 0) {
    // Last player — delete lobby and all subcollections
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

  // Remove RTDB presence
  if (presenceRef) {
    await remove(presenceRef).catch(() => {});
    presenceRef = null;
  }
}

// ─────────────────────────────────────────────
//  Enter lobby
// ─────────────────────────────────────────────
function enterLobby(code, admin) {
  currentLobbyCode = code;
  isAdmin          = admin;

  screenLanding.classList.add("hidden");
  screenLobby.classList.remove("hidden");
  lobbyCodeDisplay.textContent = `Lobby: ${code}`;

  setupPresence(code);

  // Firestore lobby listener
  if (unsubLobby) unsubLobby();
  unsubLobby = onSnapshot(doc(db, "lobbies", code), snap => {
    if (!snap.exists()) {
      // Lobby deleted — boot everyone to landing
      cleanupLobbyListeners();
      currentLobbyCode = null;
      isAdmin = false;
      screenLobby.classList.add("hidden");
      screenLanding.classList.remove("hidden");
      resetBettingUI();
      return;
    }
    handleLobbyUpdate(snap.data());
  });

  // Bets listener — prize pool + own bets display
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

  // Wire bet/pick inputs
  betInputs.forEach(input => input.addEventListener("change", saveBets));
  pickSelects.forEach(sel   => sel.addEventListener("change",  saveBets));

  // Buttons — use named functions so we can remove them if needed
  fixBetsBtn.addEventListener("click", handleFixBets);
  payoutBtn.addEventListener("click", handlePayout);
  popupCloseBtn.addEventListener("click", () => payoutPopup.classList.add("hidden"));
}

// ─────────────────────────────────────────────
//  RTDB Presence — handles tab-close disconnect
// ─────────────────────────────────────────────
function setupPresence(code) {
  presenceRef = ref(rtdb, `presence/${code}/${currentUid}`);

  // Write own presence
  set(presenceRef, { online: true });

  // When this client disconnects (tab close, network drop), remove RTDB node
  onDisconnect(presenceRef).remove();

  // Watch ALL players' presence in this lobby
  // When any player's node disappears and they're still in the Firestore players map,
  // remove them from the lobby. This fires on every client but removePlayerFromLobby
  // is idempotent so running it multiple times is fine.
  if (presenceWatcher) presenceWatcher();
  const lobbyPresRef = ref(rtdb, `presence/${code}`);
  presenceWatcher = onValue(lobbyPresRef, async snapshot => {
    if (!currentLobbyCode) return;

    const lobbySnap = await getDoc(doc(db, "lobbies", code));
    if (!lobbySnap.exists()) return;

    const firestorePlayers = lobbySnap.data().players || {};
    const onlinePlayers    = snapshot.val() || {};

    // For each player in Firestore, if they have no RTDB presence, remove them
    for (const uid of Object.keys(firestorePlayers)) {
      if (!onlinePlayers[uid]) {
        // Don't remove ourselves — we handle our own leave explicitly
        if (uid !== currentUid) {
          await removePlayerFromLobby(uid, code);
        }
      }
    }
  });
}

// ─────────────────────────────────────────────
//  Lobby real-time update handler
// ─────────────────────────────────────────────
function handleLobbyUpdate(data) {
  lobbyRoundDisplay.textContent = `Round ${data.round}`;

  // Re-evaluate admin status in case it transferred
  isAdmin = data.adminUid === currentUid;
  fixBetsBtn.style.display  = isAdmin ? "inline-block" : "none";
  waitingMsg.classList.toggle("hidden", isAdmin);

  // Rebuild players list
  currentPlayers = data.players || {};
  playersList.innerHTML = "";

  // Check if we were kicked
  if (!currentPlayers[currentUid] && currentLobbyCode) {
    leaveLobby(true);
    return;
  }

  for (const [uid, name] of Object.entries(currentPlayers)) {
    const tag = document.createElement("div");
    tag.className = "player-tag" + (uid === data.adminUid ? " player-admin" : "");

    const nameSpan = document.createElement("span");
    nameSpan.textContent = name + (uid === data.adminUid ? " ★" : "");
    tag.appendChild(nameSpan);

    // Kick button — only admin sees it, not on themselves
    if (isAdmin && uid !== currentUid) {
      const kickBtn = document.createElement("button");
      kickBtn.className   = "kick-btn";
      kickBtn.textContent = "✕";
      kickBtn.title       = `Kick ${name}`;
      kickBtn.addEventListener("click", async () => {
        if (!confirm(`Kick ${name}?`)) return;
        await kickPlayer(uid, code => code);
      });
      tag.appendChild(kickBtn);
    }

    playersList.appendChild(tag);
  }

  rebuildDeathsDropdown(currentPlayers);

  if (data.phase === "betting") {
    phaseBetting.classList.remove("hidden");
    phaseResults.classList.add("hidden");
    payoutPopup.classList.add("hidden");

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

// ─────────────────────────────────────────────
//  Kick player (admin only)
// ─────────────────────────────────────────────
async function kickPlayer(uid) {
  if (!isAdmin || !currentLobbyCode) return;

  // Remove from Firestore lobby players map and delete their bets
  const lobbyRef  = doc(db, "lobbies", currentLobbyCode);
  const lobbySnap = await getDoc(lobbyRef);
  if (!lobbySnap.exists()) return;

  const players = { ...lobbySnap.data().players };
  delete players[uid];
  await updateDoc(lobbyRef, { players });
  await deleteDoc(doc(db, "lobbies", currentLobbyCode, "bets", uid)).catch(() => {});

  // Remove their RTDB presence so the presence watcher doesn't re-add them
  await remove(ref(rtdb, `presence/${currentLobbyCode}/${uid}`)).catch(() => {});
}

// ─────────────────────────────────────────────
//  Deaths dropdowns
// ─────────────────────────────────────────────
function rebuildDeathsDropdown(players) {
  const sel     = pickSelects[2];
  const current = sel.value;
  sel.innerHTML = `<option value="">— Pick —</option><option value="None Dead">None Dead</option>`;
  for (const name of Object.values(players)) {
    const opt = document.createElement("option");
    opt.value = opt.textContent = name;
    sel.appendChild(opt);
  }
  const opt = document.createElement("option");
  opt.value = opt.textContent = "All Dead";
  sel.appendChild(opt);
  if ([...sel.options].some(o => o.value === current)) sel.value = current;
}

function rebuildOutcome3Dropdown(players) {
  const sel     = outcomeSelects[2];
  const current = sel.value;
  sel.innerHTML = `<option value="">— Select —</option><option value="None Dead">None Dead</option>`;
  for (const name of Object.values(players)) {
    const opt = document.createElement("option");
    opt.value = opt.textContent = name;
    sel.appendChild(opt);
  }
  const opt = document.createElement("option");
  opt.value = opt.textContent = "All Dead";
  sel.appendChild(opt);
  if ([...sel.options].some(o => o.value === current)) sel.value = current;
}

// ─────────────────────────────────────────────
//  My bets summary
// ─────────────────────────────────────────────
function renderMyBets(bets) {
  if (!myBetsDisplay) return;
  if (!bets) {
    myBetsDisplay.innerHTML = `<p class="my-bets-empty">No bets placed yet.</p>`;
    return;
  }
  const labels = ["Win / Lose", "Ghost Type", "Deaths"];
  const keys   = ["wheel1", "wheel2", "wheel3"];
  const rows = keys.map((k, i) => {
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

// ─────────────────────────────────────────────
//  Save bets to Firestore
// ─────────────────────────────────────────────
async function saveBets() {
  if (!currentLobbyCode || !currentUid) return;
  const betData = {
    wheel1: { pick: pickSelects[0].value, amount: Math.max(0, parseInt(betInputs[0].value) || 0) },
    wheel2: { pick: pickSelects[1].value, amount: Math.max(0, parseInt(betInputs[1].value) || 0) },
    wheel3: { pick: pickSelects[2].value, amount: Math.max(0, parseInt(betInputs[2].value) || 0) },
  };
  await setDoc(doc(db, "lobbies", currentLobbyCode, "bets", currentUid), betData);
}

// ─────────────────────────────────────────────
//  Fix Bets (was "Spin") — admin locks in bets and moves to results phase
// ─────────────────────────────────────────────
async function handleFixBets() {
  if (!isAdmin) return;
  betError.textContent = "";

  const bets     = betInputs.map(i => parseInt(i.value) || 0);
  const totalBet = bets.reduce((a, b) => a + b, 0);

  if (totalBet > 0) {
    for (let i = 0; i < 3; i++) {
      if (bets[i] > 0 && !pickSelects[i].value) {
        betError.textContent = `Pick an option for Wheel ${i + 1} or set its bet to 0.`;
        return;
      }
    }
    const userSnap = await getDoc(doc(db, "users", currentUid));
    const pts = userSnap.data().points;
    if (totalBet > pts) {
      betError.textContent = `Not enough ${currencyLabel}. You have ${pts} but bet ${totalBet}.`;
      return;
    }
    await updateDoc(doc(db, "users", currentUid), { points: pts - totalBet });
    updatePointsDisplay(pts - totalBet);
    await saveBets();
  }

  await updateDoc(doc(db, "lobbies", currentLobbyCode), { phase: "results" });
}

// ─────────────────────────────────────────────
//  Payout — admin confirms real outcomes
// ─────────────────────────────────────────────
async function handlePayout() {
  if (!isAdmin) return;
  payoutError.textContent = "";

  const outcomes = outcomeSelects.map(s => s.value);
  if (outcomes.some(o => !o)) {
    payoutError.textContent = "Select an outcome for all three wheels.";
    return;
  }

  const results  = { wheel1: outcomes[0], wheel2: outcomes[1], wheel3: outcomes[2] };
  const betsSnap = await getDocs(collection(db, "lobbies", currentLobbyCode, "bets"));
  const { payouts } = calculatePayouts(betsSnap, results);

  // ── Collect all user reads FIRST, then build + commit batch ──
  const userUpdates = []; // [{ ref, newPoints }]
  const payoutNames = {};

  for (const [uid, amount] of Object.entries(payouts)) {
    const userRef  = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const newPts = userSnap.data().points + Math.floor(amount);
      userUpdates.push({ ref: userRef, newPts });
      if (uid === currentUid) updatePointsDisplay(newPts);
    }
    payoutNames[uid] = Math.floor(amount);
  }

  // Build batch with all writes and bet deletions
  const batch = writeBatch(db);
  for (const { ref: r, newPts } of userUpdates) {
    batch.update(r, { points: newPts });
  }
  betsSnap.forEach(b => batch.delete(b.ref));
  await batch.commit();

  // Get current round before updating
  const lobbySnap = await getDoc(doc(db, "lobbies", currentLobbyCode));
  const currentRound = lobbySnap.exists() ? lobbySnap.data().round : 1;

  // Write payout_done — triggers popup on all clients
  await updateDoc(doc(db, "lobbies", currentLobbyCode), {
    phase:   "payout_done",
    results,
    payouts: payoutNames,
    round:   currentRound
  });
}

// ─────────────────────────────────────────────
//  Payout math
//
//  Formula: winners share the LOSING pool proportionally by winning stake.
//  This guarantees every winner always profits (gets stake back + a share of losers' money).
//  If everyone wins, they all just get their bets back (no losers to take from).
// ─────────────────────────────────────────────
function calculatePayouts(betsSnap, results) {
  let totalPool = 0;
  const allBets = {};

  betsSnap.forEach(betDoc => {
    const d = betDoc.data();
    allBets[betDoc.id] = d;
    totalPool += (d.wheel1?.amount || 0) + (d.wheel2?.amount || 0) + (d.wheel3?.amount || 0);
  });

  // Each player's total winning stake (sum of bets they got right)
  const winningStakes = {};
  let totalWinningStake = 0;

  for (const [uid, bets] of Object.entries(allBets)) {
    let stake = 0;
    for (const key of ["wheel1", "wheel2", "wheel3"]) {
      const b = bets[key];
      if (b && b.amount > 0 && b.pick && b.pick === results[key]) {
        stake += b.amount;
      }
    }
    if (stake > 0) {
      winningStakes[uid] = stake;
      totalWinningStake += stake;
    }
  }

  if (totalWinningStake === 0) return { payouts: {}, totalPool };

  // Losing pool = all bets that were NOT winning stakes
  const losingPool = totalPool - totalWinningStake;

  // Each winner gets:
  //   their own stake back  +  their proportional share of the losing pool
  const payouts = {};
  for (const [uid, stake] of Object.entries(winningStakes)) {
    const bonusShare = totalWinningStake > 0 ? (stake / totalWinningStake) * losingPool : 0;
    payouts[uid] = stake + bonusShare;
  }

  return { payouts, totalPool };
}

// ─────────────────────────────────────────────
//  Payout popup — shown on ALL clients via Firestore phase change
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

  if (payouts[currentUid]) {
    popupYourPayout.textContent = `You won ${payouts[currentUid]} ${currencyLabel}!`;
    popupYourPayout.style.color = "#7fd67f";
  } else {
    popupYourPayout.textContent = "Better luck next round.";
    popupYourPayout.style.color = "#aaa";
  }

  payoutPopup.classList.remove("hidden");

  // Admin advances to next round
  if (isAdmin) {
    const lobbyRef = doc(db, "lobbies", currentLobbyCode);
    getDoc(lobbyRef).then(snap => {
      if (snap.exists()) {
        updateDoc(lobbyRef, {
          phase:   "betting",
          results: null,
          payouts: null,
          round:   snap.data().round + 1
        });
      }
    });
    outcomeSelects.forEach(s => s.value = "");
    payoutError.textContent = "";
  }

  resetBettingUI();
}

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────
function updatePointsDisplay(pts) {
  pointsDisplay.textContent = `${currencyLabel}: ${pts}`;
}

function resetBettingUI() {
  betInputs.forEach(i  => { i.value = 0; });
  pickSelects.forEach(s => { s.value = ""; });
  betError.textContent = "";
  wheelEls.forEach(el => el.innerHTML = "<p>?</p>");
  if (myBetsDisplay) myBetsDisplay.innerHTML = `<p class="my-bets-empty">No bets placed yet.</p>`;
}

function cleanupLobbyListeners() {
  if (unsubLobby)      { unsubLobby();      unsubLobby      = null; }
  if (unsubBets)       { unsubBets();       unsubBets       = null; }
  if (presenceWatcher) { presenceWatcher(); presenceWatcher = null; }
  if (presenceRef)     { remove(presenceRef).catch(() => {}); presenceRef = null; }
}
