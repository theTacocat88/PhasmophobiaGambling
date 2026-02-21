import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc,
  collection, onSnapshot, getDocs, writeBatch, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ─────────────────────────────────────────────
//  Firebase init
// ─────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyBG_SmVUSe93HDNErImoTBkPXGJPc3DBF0",
  authDomain: "phasmophobiagambling.firebaseapp.com",
  projectId: "phasmophobiagambling",
  storageBucket: "phasmophobiagambling.firebasestorage.app",
  messagingSenderId: "150402636149",
  appId: "1:150402636149:web:c0a7521370e21804935b3c"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ─────────────────────────────────────────────
//  Wheel options
// ─────────────────────────────────────────────
const OPTIONS = {
  wheel1: ["Win", "Lose"],
  wheel2: [
    "Banshee","Dayan","Deogen","Demon","Gallu","Goryo","Hantu",
    "Jinn","Mare","Moroi","Myling","Obake","Obambo","Oni","Onryo",
    "Phantom","Poltergeist","Raiju","Revenant","Shade","Spirit",
    "Thaye","The Mimic","The Twins","Wraith","Yokai","Yurei"
  ],
  wheel3: ["No Deaths", "tacocat", "sambone42", "All Dead"]
};

// ─────────────────────────────────────────────
//  State
// ─────────────────────────────────────────────
let currentUid       = null;
let currentLobbyCode = null;
let isAdmin          = false;
let unsubLobby       = null;   // real-time listener for lobby doc
let unsubBets        = null;   // real-time listener for bets collection

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
const playersList       = document.getElementById("players-list");

const phaseBetting  = document.getElementById("phase-betting");
const phaseResults  = document.getElementById("phase-results");
const resultsDisplay = document.getElementById("results-display");
const payoutSection = document.getElementById("payout-section");
const payoutPreview = document.getElementById("payout-preview");
const payoutBtn     = document.getElementById("payout-btn");

const betError = document.getElementById("bet-error");
const spinBtn  = document.getElementById("spin-btn");

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

// ─────────────────────────────────────────────
//  Auth
// ─────────────────────────────────────────────
signInAnonymously(auth).catch(err => console.error("Auth error:", err));

onAuthStateChanged(auth, async user => {
  if (!user) return;
  currentUid = user.uid;

  // Ensure user doc exists
  const userRef  = doc(db, "users", currentUid);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) {
    await setDoc(userRef, { points: 300, displayName: "" });
  }
  updatePointsDisplay(userSnap.exists() ? userSnap.data().points : 300);
});

createLobbyBtn.addEventListener("click", async () => {
  const name = displayNameInput.value.trim();
  if (!name) { landingError.textContent = "Enter a display name first."; return; }
  if (!currentUid) { landingError.textContent = "Still signing in, try again."; return; }

  landingError.textContent = "";

  let code;
  let attempts = 0;
  do {
    code = String(Math.floor(1000 + Math.random() * 9000));
    const snap = await getDoc(doc(db, "lobbies", code));
    if (!snap.exists()) break;
    attempts++;
  } while (attempts < 10);

  const lobbyRef = doc(db, "lobbies", code);
  await setDoc(lobbyRef, {
    adminUid:  currentUid,
    round:     1,
    phase:     "betting",
    prizePool: 0,
    results:   { wheel1: null, wheel2: null, wheel3: null },
    players:   { [currentUid]: name }
  });

  await updateDoc(doc(db, "users", currentUid), { displayName: name });

  enterLobby(code, true);
});

joinLobbyBtn.addEventListener("click", async () => {
  const name = displayNameInput.value.trim();
  const code = joinCodeInput.value.trim();
  if (!name) { landingError.textContent = "Enter a display name first."; return; }
  if (!code) { landingError.textContent = "Enter a lobby code."; return; }
  if (!currentUid) { landingError.textContent = "Still signing in, try again."; return; }

  landingError.textContent = "";

  const lobbyRef  = doc(db, "lobbies", code);
  const lobbySnap = await getDoc(lobbyRef);

  if (!lobbySnap.exists()) {
    landingError.textContent = "Lobby not found.";
    return;
  }

  await updateDoc(lobbyRef, {
    [`players.${currentUid}`]: name
  });

  await updateDoc(doc(db, "users", currentUid), { displayName: name });

  enterLobby(code, false);
});

function enterLobby(code, admin) {
  currentLobbyCode = code;
  isAdmin          = admin;

  screenLanding.classList.add("hidden");
  screenLobby.classList.remove("hidden");

  lobbyCodeDisplay.textContent  = `Lobby: ${code}`;

  spinBtn.style.display = isAdmin ? "inline-block" : "none";

  if (unsubLobby) unsubLobby();
  unsubLobby = onSnapshot(doc(db, "lobbies", code), snap => {
    if (!snap.exists()) return;
    handleLobbyUpdate(snap.data());
  });

  if (unsubBets) unsubBets();
  const betsCol = collection(db, "lobbies", code, "bets");
  unsubBets = onSnapshot(betsCol, snap => {
    let pool = 0;
    snap.forEach(betDoc => {
      const d = betDoc.data();
      pool += (d.wheel1?.amount || 0) + (d.wheel2?.amount || 0) + (d.wheel3?.amount || 0);
    });
    prizePoolDisplay.textContent = `Prize Pool: ${pool}`;
  });

  betInputs.forEach((input, i) => input.addEventListener("change", () => saveBets(i)));
  pickSelects.forEach((sel, i) => sel.addEventListener("change", () => saveBets(i)));

  spinBtn.addEventListener("click", () => handleSpin());
  payoutBtn.addEventListener("click", () => handlePayout());
}

function handleLobbyUpdate(data) {
  lobbyRoundDisplay.textContent = `Round ${data.round}`;

  playersList.innerHTML = "";
  for (const [uid, name] of Object.entries(data.players || {})) {
    const tag = document.createElement("span");
    tag.className = "player-tag";
    if (uid === data.adminUid) tag.classList.add("player-admin");
    tag.textContent = name + (uid === data.adminUid ? " ★" : "");
    playersList.appendChild(tag);
  }

  if (data.phase === "betting") {
    phaseBetting.classList.remove("hidden");
    phaseResults.classList.add("hidden");

    wheelEls.forEach(el => el.innerHTML = "<p>?</p>");

  } else if (data.phase === "results") {
    phaseBetting.classList.add("hidden");
    phaseResults.classList.remove("hidden");

    const r = data.results;
    const keys = ["wheel1", "wheel2", "wheel3"];
    const labels = ["Win / Lose", "Ghost Type", "Deaths"];
    resultsDisplay.innerHTML = keys.map((k, i) =>
      `<div class="result-item"><span class="result-label">${labels[i]}</span><span class="result-value">${r[k]}</span></div>`
    ).join("");

    keys.forEach((k, i) => {
      wheelEls[i].innerHTML = `<p>${r[k]}</p>`;
    });

    if (isAdmin) {
      payoutSection.classList.remove("hidden");
      buildPayoutPreview(data);
    } else {
      payoutSection.classList.add("hidden");
    }
  }
}

async function saveBets() {
  if (!currentLobbyCode || !currentUid) return;

  const betData = {
    wheel1: { pick: pickSelects[0].value, amount: Math.max(0, parseInt(betInputs[0].value) || 0) },
    wheel2: { pick: pickSelects[1].value, amount: Math.max(0, parseInt(betInputs[1].value) || 0) },
    wheel3: { pick: pickSelects[2].value, amount: Math.max(0, parseInt(betInputs[2].value) || 0) },
  };

  const betRef = doc(db, "lobbies", currentLobbyCode, "bets", currentUid);
  await setDoc(betRef, betData);
}

async function handleSpin() {
  if (!isAdmin) return;
  betError.textContent = "";

  const bets = betInputs.map(i => parseInt(i.value) || 0);
  const totalBet = bets.reduce((a, b) => a + b, 0);

  const userSnap = await getDoc(doc(db, "users", currentUid));
  const currentPoints = userSnap.data().points;

  if (totalBet > 0) {
    for (let i = 0; i < 3; i++) {
      if (bets[i] > 0 && !pickSelects[i].value) {
        betError.textContent = `Pick an option for wheel ${i + 1} or set its bet to 0.`;
        return;
      }
    }
    if (totalBet > currentPoints) {
      betError.textContent = `Not enough points. You have ${currentPoints} but bet ${totalBet}.`;
      return;
    }
    await updateDoc(doc(db, "users", currentUid), { points: currentPoints - totalBet });
    updatePointsDisplay(currentPoints - totalBet);
    await saveBets();
  }

  const results = {
    wheel1: OPTIONS.wheel1[Math.floor(Math.random() * OPTIONS.wheel1.length)],
    wheel2: OPTIONS.wheel2[Math.floor(Math.random() * OPTIONS.wheel2.length)],
    wheel3: OPTIONS.wheel3[Math.floor(Math.random() * OPTIONS.wheel3.length)],
  };

  await updateDoc(doc(db, "lobbies", currentLobbyCode), {
    phase: "results",
    results
  });
}

async function buildPayoutPreview(lobbyData) {
  const betsSnap = await getDocs(collection(db, "lobbies", currentLobbyCode, "bets"));
  const results  = lobbyData.results;

  const { payouts, totalPool } = calculatePayouts(betsSnap, results, lobbyData.players);

  if (Object.keys(payouts).length === 0) {
    payoutPreview.textContent = "No winners this round. All points discarded.";
    return;
  }

  const lines = Object.entries(payouts).map(([uid, amount]) => {
    const name = lobbyData.players[uid] || uid;
    return `${name}: +${Math.floor(amount)} pts`;
  });
  payoutPreview.innerHTML = `<strong>Payouts:</strong><br>${lines.join("<br>")}`;
}

function calculatePayouts(betsSnap, results, players) {
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

async function handlePayout() {
  if (!isAdmin) return;

  const lobbySnap = await getDoc(doc(db, "lobbies", currentLobbyCode));
  if (!lobbySnap.exists()) return;
  const lobbyData = lobbySnap.data();

  const betsSnap = await getDocs(collection(db, "lobbies", currentLobbyCode, "bets"));
  const { payouts } = calculatePayouts(betsSnap, lobbyData.results, lobbyData.players);

  const batch = writeBatch(db);

  for (const [uid, amount] of Object.entries(payouts)) {
    const userRef  = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const newPoints = userSnap.data().points + Math.floor(amount);
      batch.update(userRef, { points: newPoints });
      if (uid === currentUid) updatePointsDisplay(newPoints);
    }
  }

  betsSnap.forEach(betDoc => {
    batch.delete(betDoc.ref);
  });

  await batch.commit();

  await updateDoc(doc(db, "lobbies", currentLobbyCode), {
    round:     lobbyData.round + 1,
    phase:     "betting",
    prizePool: 0,
    results:   { wheel1: null, wheel2: null, wheel3: null }
  });

  betInputs.forEach(i => { i.value = 0; });
  pickSelects.forEach(s => { s.value = ""; });
  betError.textContent = "";
}

function updatePointsDisplay(points) {
  pointsDisplay.textContent = `Points: ${points}`;
}
