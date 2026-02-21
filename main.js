import { initializeApp }            from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged }
                                      from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, onSnapshot, getDocs, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getDatabase, ref, onValue, set, remove, onDisconnect, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey:            "AIzaSyBG_SmVUSe93HDNErImoTBkPXGJPc3DBF0",
  authDomain:        "phasmophobiagambling.firebaseapp.com",
  projectId:         "phasmophobiagambling",
  storageBucket:     "phasmophobiagambling.firebasestorage.app",
  messagingSenderId: "150402636149",
  appId:             "1:150402636149:web:c0a7521370e21804935b3c",
  databaseURL: "https://phasmophobiagambling-default-rtdb.firebaseio.com/"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);
const rtdb = getDatabase(app);

const CURRENCY_OPTIONS = ["Points", "Ghosties", "EMF Readings", "Fingerprints"];
const GHOST_LIST = [
  "Banshee","Dayan","Deogen","Demon","Gallu","Goryo","Hantu",
  "Jinn","Mare","Moroi","Myling","Obake","Obambo","Oni","Onryo",
  "Phantom","Poltergeist","Raiju","Revenant","Shade","Spirit",
  "Thaye","The Mimic","The Twins","Wraith","Yokai","Yurei"
];

let currentUid       = null;
let currentLobbyCode = null;
let isAdmin          = false;
let currencyLabel    = "Points";
let currentPlayers   = {};
let unsubLobby       = null;
let unsubBets        = null;
let presenceRef      = null;

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

const playersList = document.getElementById("players-list");

const phaseBetting = document.getElementById("phase-betting");
const spinBtn      = document.getElementById("spin-btn");
const waitingMsg   = document.getElementById("waiting-msg");
const betError     = document.getElementById("bet-error");

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

const phaseResults         = document.getElementById("phase-results");
const tbdMsg               = document.getElementById("tbd-msg");
const adminOutcomeSection  = document.getElementById("admin-outcome-section");
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

signInAnonymously(auth).catch(err => console.error("Auth error:", err));

onAuthStateChanged(auth, async user => {
  if (!user) return;
  currentUid = user.uid;

  const userRef  = doc(db, "users", currentUid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    await setDoc(userRef, { points: 300, displayName: "", currencyPref: "Points" });
    currencyLabel = "Points";
    updatePointsDisplay(300);
  } else {
    const data = userSnap.data();
    currencyLabel = data.currencyPref || "Points";
    updatePointsDisplay(data.points ?? 300);
    if (data.displayName) displayNameInput.value = data.displayName;
  }

  currencySelect.value = currencyLabel;

  userSettingsCard.classList.remove("hidden");
});

settingsToggle.addEventListener("click", () => {
  settingsPanel.classList.toggle("hidden");
});

settingsNameSave.addEventListener("click", async () => {
  const newName = settingsNameInput.value.trim();
  if (!newName) { settingsMsg.textContent = "Enter a name."; return; }

  await updateDoc(doc(db, "users", currentUid), { displayName: newName });

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

createLobbyBtn.addEventListener("click", async () => {
  const name = displayNameInput.value.trim();
  if (!name) { landingError.textContent = "Enter a display name first."; return; }
  if (!currentUid) { landingError.textContent = "Still signing in, try again."; return; }
  landingError.textContent = "";

  let code, attempts = 0;
  do {
    code = String(Math.floor(1000 + Math.random() * 9000));
    const snap = await getDoc(doc(db, "lobbies", code));
    if (!snap.exists()) break;
  } while (++attempts < 10);

  await setDoc(doc(db, "lobbies", code), {
    adminUid:  currentUid,
    round:     1,
    phase:     "betting",
    results:   null,
    payouts:   null,
    players:   { [currentUid]: name }
  });

  await updateDoc(doc(db, "users", currentUid), { displayName: name });

  enterLobby(code, true, name);
});

joinLobbyBtn.addEventListener("click", async () => {
  const name = displayNameInput.value.trim();
  const code = joinCodeInput.value.trim();
  if (!name) { landingError.textContent = "Enter a display name first."; return; }
  if (!code) { landingError.textContent = "Enter a lobby code."; return; }
  if (!currentUid) { landingError.textContent = "Still signing in, try again."; return; }
  landingError.textContent = "";

  const lobbySnap = await getDoc(doc(db, "lobbies", code));
  if (!lobbySnap.exists()) { landingError.textContent = "Lobby not found."; return; }

  await updateDoc(doc(db, "lobbies", code), { [`players.${currentUid}`]: name });
  await updateDoc(doc(db, "users", currentUid), { displayName: name });

  enterLobby(code, false, name);
});

leaveLobbyBtn.addEventListener("click", () => leaveLobby());

async function leaveLobby() {
  if (!currentLobbyCode) return;
  await removePlayerFromLobby(currentUid, currentLobbyCode);
  cleanupLobbyListeners();
  currentLobbyCode = null;
  isAdmin = false;
  screenLobby.classList.add("hidden");
  screenLanding.classList.remove("hidden");
  resetBettingUI();
}

async function removePlayerFromLobby(uid, code) {
  const lobbyRef  = doc(db, "lobbies", code);
  const lobbySnap = await getDoc(lobbyRef);
  if (!lobbySnap.exists()) return;

  const data    = lobbySnap.data();
  const players = { ...data.players };
  delete players[uid];

  const betRef = doc(db, "lobbies", code, "bets", uid);
  await deleteDoc(betRef).catch(() => {});

  if (Object.keys(players).length === 0) {
    const betsSnap = await getDocs(collection(db, "lobbies", code, "bets"));
    const batch = writeBatch(db);
    betsSnap.forEach(b => batch.delete(b.ref));
    batch.delete(lobbyRef);
    await batch.commit();
  } else {
    let newAdminUid = data.adminUid;
    if (uid === data.adminUid) {
      newAdminUid = Object.keys(players)[0];
    }
    await updateDoc(lobbyRef, { players, adminUid: newAdminUid });
  }

  if (presenceRef) await remove(presenceRef).catch(() => {});
}

function enterLobby(code, admin, displayName) {
  currentLobbyCode = code;
  isAdmin          = admin;

  screenLanding.classList.add("hidden");
  screenLobby.classList.remove("hidden");

  lobbyCodeDisplay.textContent = `Lobby: ${code}`;

  spinBtn.style.display   = isAdmin ? "inline-block" : "none";
  waitingMsg.classList.toggle("hidden", isAdmin);

  setupPresence(code);

  if (unsubLobby) unsubLobby();
  unsubLobby = onSnapshot(doc(db, "lobbies", code), snap => {
    if (!snap.exists()) {
      cleanupLobbyListeners();
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
    snap.forEach(b => {
      const d = b.data();
      pool += (d.wheel1?.amount || 0) + (d.wheel2?.amount || 0) + (d.wheel3?.amount || 0);
    });
    prizePoolDisplay.textContent = `Prize Pool: ${pool}`;
  });

  betInputs.forEach(input => input.addEventListener("change", saveBets));
  pickSelects.forEach(sel  => sel.addEventListener("change", saveBets));
  spinBtn.addEventListener("click", handleSpin);
  payoutBtn.addEventListener("click", handlePayout);
  popupCloseBtn.addEventListener("click", () => {
    payoutPopup.classList.add("hidden");
  });
}

function setupPresence(code) {
  presenceRef = ref(rtdb, `presence/${code}/${currentUid}`);

  set(presenceRef, { online: true, ts: serverTimestamp() });

  onDisconnect(presenceRef).remove();

  const lobbyPresenceRef = ref(rtdb, `presence/${code}`);
  onValue(lobbyPresenceRef, async snapshot => {
    if (!snapshot.exists() && currentLobbyCode === code) {
      // All presence gone — the lobby should be cleaned up
      // (the last player to disconnect already removed the lobby via onDisconnect writing to Firestore)
      // This handles the edge case where network drops before explicit leave
    }
  });

  // When this client disconnects, remove them from Firestore lobby too
  // We do this by using a RTDB onDisconnect + a polling presence check approach:
  // Simpler: watch our OWN presence node. If it disappears unexpectedly (re-renders), re-register.
}

function handleLobbyUpdate(data) {
  lobbyRoundDisplay.textContent = `Round ${data.round}`;

  isAdmin = data.adminUid === currentUid;
  spinBtn.style.display = isAdmin ? "inline-block" : "none";
  waitingMsg.classList.toggle("hidden", isAdmin);

  currentPlayers = data.players || {};
  playersList.innerHTML = "";
  for (const [uid, name] of Object.entries(currentPlayers)) {
    const tag = document.createElement("span");
    tag.className = "player-tag" + (uid === data.adminUid ? " player-admin" : "");
    tag.textContent = name + (uid === data.adminUid ? " ★" : "");
    playersList.appendChild(tag);
  }

  rebuildDeathsDropdown(currentPlayers);

  if (data.phase === "betting") {
    phaseBetting.classList.remove("hidden");
    phaseResults.classList.add("hidden");
    payoutPopup.classList.add("hidden");
    wheelEls.forEach(el => el.innerHTML = "<p>?</p>");

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

function rebuildDeathsDropdown(players) {
  const sel = pickSelects[2];
  const current = sel.value;
  sel.innerHTML = `<option value="">— Pick —</option>
    <option value="None Dead">None Dead</option>`;
  for (const name of Object.values(players)) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    sel.appendChild(opt);
  }
  const allDead = document.createElement("option");
  allDead.value = "All Dead";
  allDead.textContent = "All Dead";
  sel.appendChild(allDead);
  if ([...sel.options].some(o => o.value === current)) sel.value = current;
}

function rebuildOutcome3Dropdown(players) {
  const sel = outcomeSelects[2];
  const current = sel.value;
  sel.innerHTML = `<option value="">— Select —</option>
    <option value="None Dead">None Dead</option>`;
  for (const name of Object.values(players)) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    sel.appendChild(opt);
  }
  const allDead = document.createElement("option");
  allDead.value = "All Dead";
  allDead.textContent = "All Dead";
  sel.appendChild(allDead);
  if ([...sel.options].some(o => o.value === current)) sel.value = current;
}

async function saveBets() {
  if (!currentLobbyCode || !currentUid) return;
  const betData = {
    wheel1: { pick: pickSelects[0].value, amount: Math.max(0, parseInt(betInputs[0].value) || 0) },
    wheel2: { pick: pickSelects[1].value, amount: Math.max(0, parseInt(betInputs[1].value) || 0) },
    wheel3: { pick: pickSelects[2].value, amount: Math.max(0, parseInt(betInputs[2].value) || 0) },
  };
  await setDoc(doc(db, "lobbies", currentLobbyCode, "bets", currentUid), betData);
}

async function handleSpin() {
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

async function handlePayout() {
  if (!isAdmin) return;
  payoutError.textContent = "";

  const outcomes = outcomeSelects.map(s => s.value);
  if (outcomes.some(o => !o)) {
    payoutError.textContent = "Select an outcome for all three wheels.";
    return;
  }

  const results = { wheel1: outcomes[0], wheel2: outcomes[1], wheel3: outcomes[2] };

  const betsSnap = await getDocs(collection(db, "lobbies", currentLobbyCode, "bets"));
  const { payouts, totalPool } = calculatePayouts(betsSnap, results);

  const batch = writeBatch(db);
  const payoutNames = {};

  for (const [uid, amount] of Object.entries(payouts)) {
    const userRef  = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const newPts = userSnap.data().points + Math.floor(amount);
      batch.update(userRef, { points: newPts });
      if (uid === currentUid) updatePointsDisplay(newPts);
    }
    payoutNames[uid] = Math.floor(amount);
  }

  betsSnap.forEach(b => batch.delete(b.ref));

  await batch.commit();

  await updateDoc(doc(db, "lobbies", currentLobbyCode), {
    phase:   "payout_done",
    results,
    payouts: payoutNames,
    round:   (await getDoc(doc(db, "lobbies", currentLobbyCode))).data().round
  });
}

function showPayoutPopup(data) {
  const results  = data.results  || {};
  const payouts  = data.payouts  || {};
  const players  = data.players  || {};

  const labels = ["Win / Lose", "Ghost Type", "Deaths"];
  const keys   = ["wheel1", "wheel2", "wheel3"];
  popupResultsDisplay.innerHTML = keys.map((k, i) =>
    `<div class="popup-result-row">
       <span class="popup-result-label">${labels[i]}</span>
       <span class="popup-result-value">${results[k] || "—"}</span>
     </div>`
  ).join("");

  if (Object.keys(payouts).length === 0) {
    popupPayoutsDisplay.innerHTML = `<p style="color:#aaa; text-align:center;">No winners this round.</p>`;
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

  const payouts = {};
  for (const [uid, stake] of Object.entries(winningStakes)) {
    payouts[uid] = (stake / totalWinningStake) * totalPool;
  }

  return { payouts, totalPool };
}

function updatePointsDisplay(pts) {
  pointsDisplay.textContent = `${currencyLabel}: ${pts}`;
}

function resetBettingUI() {
  betInputs.forEach(i => { i.value = 0; });
  pickSelects.forEach(s => { s.value = ""; });
  betError.textContent = "";
  wheelEls.forEach(el => el.innerHTML = "<p>?</p>");
}

function cleanupLobbyListeners() {
  if (unsubLobby) { unsubLobby(); unsubLobby = null; }
  if (unsubBets)  { unsubBets();  unsubBets  = null; }
  if (presenceRef) { remove(presenceRef).catch(() => {}); presenceRef = null; }
}
