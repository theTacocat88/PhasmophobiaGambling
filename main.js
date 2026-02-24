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

// ─── Wheel definitions ────────────────────────────────────────────────────────
// "deaths" options are built dynamically from player names — options: null means dynamic.
const WHEEL_DEFS = {
  winlose:      { label: "Win / Lose",    options: ["Win", "Lose", "Partial Win"] },
  ghosttype:    { label: "Ghost Type",    options: ["Banshee","Dayan","Deogen","Demon","Gallu","Goryo","Hantu","Jinn","Mare","Moroi","Myling","Obake","Obambo","Oni","Onryo","Phantom","Poltergeist","Raiju","Revenant","Shade","Spirit","Thaye","The Mimic","The Twins","Wraith","Yokai","Yurei"] },
  deaths:       { label: "Deaths",        options: null }, // dynamic: player names
  perfectrun:   { label: "Perfect Run",   options: ["Yes", "No"] },
  ghostspeed:   { label: "Ghost Speed",   options: ["Slow", "Medium", "Fast", "Variable"] },
  cursedobject: { label: "Cursed Object", options: ["Music Box","Ouija Board","Summoning Circle","Voodoo Doll","Monkey's Paw","Tarot Cards","Haunted Mirror","None"] },
};

const WHEEL_KEYS = ["wheel1", "wheel2", "wheel3"];

// ─── State ────────────────────────────────────────────────────────────────────
let currentUid       = null;
let currentLobbyCode = null;
let isAdmin          = false;
let currencyLabel    = "Points";
let currentPlayers   = {};
let activeWheels     = ["winlose", "ghosttype", "deaths"]; // default, overwritten by lobby doc
let unsubLobby       = null;
let unsubBets        = null;
let unsubPresence    = null;
let lastPayoutRound  = -1;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function $(id) { return document.getElementById(id); }

function setPointsDisplay(pts) {
  $("points-display").textContent = `${currencyLabel}: ${pts}`;
}

function cleanupListeners() {
  if (unsubLobby)    { unsubLobby();    unsubLobby    = null; }
  if (unsubBets)     { unsubBets();     unsubBets     = null; }
  if (unsubPresence) { unsubPresence(); unsubPresence = null; }
}

// Build the options for a pick-select given a wheel type key and current players
function getWheelOptions(typeKey, players) {
  const def = WHEEL_DEFS[typeKey];
  if (!def) return [];
  if (def.options !== null) return def.options;
  // Deaths: dynamic
  const names = Object.values(players);
  return ["None Dead", ...names, "All Dead"];
}

// ─── Render betting cards ─────────────────────────────────────────────────────
// Called whenever activeWheels or currentPlayers changes.
// Rebuilds #main (the three wheel cards) dynamically.
function renderBettingCards() {
  const main = $("main");
  main.innerHTML = "";

  activeWheels.forEach((typeKey, i) => {
    const slotKey = WHEEL_KEYS[i]; // "wheel1", "wheel2", "wheel3"
    const def     = WHEEL_DEFS[typeKey] || { label: "Unknown", options: [] };
    const options = getWheelOptions(typeKey, currentPlayers);

    const card = document.createElement("div");
    card.className = "wheel-card";
    card.innerHTML = `
      <p class="wheel-label">${def.label}</p>
      <div class="wheel" id="wheel${i+1}"><p>?</p></div>
      <select class="pick-select" id="pick-${i+1}">
        <option value="">— Pick —</option>
        ${options.map(o => `<option value="${o}">${o}</option>`).join("")}
      </select>
      <input class="bet-input" id="bet-${i+1}" type="number" placeholder="Bet..." min="0" value="0" />
    `;
    main.appendChild(card);
  });

  // Fill unused wheel slots with empty placeholders so IDs always exist
  for (let i = activeWheels.length; i < 3; i++) {
    const card = document.createElement("div");
    card.className = "wheel-card wheel-card-empty";
    card.innerHTML = `<p class="wheel-label" style="color:#555;">— Not used —</p>`;
    main.appendChild(card);
    // Create hidden dummy inputs so bet logic doesn't crash on getElementById
    const dummy = document.createElement("input");
    dummy.type = "hidden"; dummy.id = `bet-${i+1}`; dummy.value = "0";
    card.appendChild(dummy);
    const dummyPick = document.createElement("input");
    dummyPick.type = "hidden"; dummyPick.id = `pick-${i+1}`; dummyPick.value = "";
    card.appendChild(dummyPick);
  }
}

// ─── Render outcome selectors (admin results phase) ───────────────────────────
function renderOutcomeSelectors() {
  const container = $("outcome-selectors");
  container.innerHTML = "";

  activeWheels.forEach((typeKey, i) => {
    const def     = WHEEL_DEFS[typeKey] || { label: "Unknown", options: [] };
    const options = getWheelOptions(typeKey, currentPlayers);

    const row = document.createElement("div");
    row.className = "outcome-row";
    row.innerHTML = `
      <span class="outcome-label">${def.label}</span>
      <select class="outcome-select" id="outcome-${i+1}">
        <option value="">— Select —</option>
        ${options.map(o => `<option value="${o}">${o}</option>`).join("")}
      </select>
    `;
    container.appendChild(row);
  });

  // Dummy hidden selects for unused wheels so payout logic doesn't crash
  for (let i = activeWheels.length; i < 3; i++) {
    const dummy = document.createElement("select");
    dummy.id    = `outcome-${i+1}`;
    dummy.style.display = "none";
    // Give it a non-empty value so the "select all three" check passes for unused slots
    dummy.innerHTML = `<option value="N/A" selected>N/A</option>`;
    container.appendChild(dummy);
  }
}

// ─── Render wheel config panel (admin only) ───────────────────────────────────
function renderWheelConfig() {
  const panel = $("wheel-config-panel");
  if (!panel) return;
  panel.innerHTML = "";

  for (let i = 0; i < 3; i++) {
    const row = document.createElement("div");
    row.className = "wheel-config-row";

    const label = document.createElement("span");
    label.textContent = `Wheel ${i+1}`;
    label.className = "wheel-config-label";
    row.appendChild(label);

    const sel = document.createElement("select");
    sel.id        = `wheel-type-${i+1}`;
    sel.className = "wheel-type-select";

    // First option: "— None —" (only for wheels 2 and 3)
    if (i > 0) {
      const none = document.createElement("option");
      none.value = ""; none.textContent = "— None —";
      sel.appendChild(none);
    }

    Object.entries(WHEEL_DEFS).forEach(([key, def]) => {
      const opt = document.createElement("option");
      opt.value       = key;
      opt.textContent = def.label;
      sel.appendChild(opt);
    });

    sel.value = activeWheels[i] || "";
    sel.addEventListener("change", onWheelConfigChange);
    row.appendChild(sel);
    panel.appendChild(row);
  }
}

async function onWheelConfigChange() {
  if (!isAdmin || !currentLobbyCode) return;

  const w1 = $("wheel-type-1").value;
  const w2 = $("wheel-type-2") ? $("wheel-type-2").value : "";
  const w3 = $("wheel-type-3") ? $("wheel-type-3").value : "";

  if (!w1) {
    // Wheel 1 must always be set
    $("wheel-type-1").value = activeWheels[0] || Object.keys(WHEEL_DEFS)[0];
    return;
  }

  const wheels = [w1, w2, w3].filter(Boolean);

  // Check for duplicates
  if (new Set(wheels).size !== wheels.length) {
    $("wheel-config-error").textContent = "Each wheel must be a different type.";
    // Revert UI to current activeWheels
    renderWheelConfig();
    return;
  }
  $("wheel-config-error").textContent = "";

  try {
    await updateDoc(doc(db, "lobbies", currentLobbyCode), { wheels });
  } catch(e) { console.error("wheel config save:", e); }
}

// ─── Reset betting UI ─────────────────────────────────────────────────────────
function resetBettingUI() {
  for (let i = 1; i <= 3; i++) {
    const b = $(`bet-${i}`);   if (b) b.value = "0";
    const p = $(`pick-${i}`);  if (p) p.value = "";
  }
  const err = $("bet-error"); if (err) err.textContent = "";
  document.querySelectorAll(".wheel").forEach(el => { el.innerHTML = "<p>?</p>"; });
  const mb = $("my-bets-display");
  if (mb) mb.innerHTML = `<p class="my-bets-empty">No bets placed yet.</p>`;
}

// ─── ONE-TIME event wiring ────────────────────────────────────────────────────

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
    setTimeout(() => { msg.textContent = ""; }, 2000);
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
    setTimeout(() => { msg.textContent = ""; }, 2000);
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

    const defaultWheels = ["winlose", "ghosttype", "deaths"];
    await setDoc(doc(db,"lobbies",code), {
      adminUid: currentUid, round: 1, phase: "betting",
      results: null, payouts: null,
      players: { [currentUid]: name },
      wheels:  defaultWheels,
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

    const amounts = [];
    const picks   = [];
    for (let i = 1; i <= 3; i++) {
      amounts.push(Math.max(0, parseInt($(`bet-${i}`).value) || 0));
      picks.push($(`pick-${i}`).value);
    }
    const total = amounts.reduce((a,b) => a+b, 0);

    if (total === 0) { errEl.textContent = "Enter at least one bet amount."; return; }

    // Only validate wheels that are actually active
    for (let i = 0; i < activeWheels.length; i++) {
      if (amounts[i] > 0 && !picks[i]) {
        errEl.textContent = `Choose a pick for "${WHEEL_DEFS[activeWheels[i]].label}", or set its bet to 0.`;
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

    const outcomes = [];
    for (let i = 1; i <= 3; i++) {
      outcomes.push($(`outcome-${i}`) ? $(`outcome-${i}`).value : "N/A");
    }

    // Only require outcomes for active wheels
    for (let i = 0; i < activeWheels.length; i++) {
      if (!outcomes[i]) {
        errEl.textContent = `Select an outcome for "${WHEEL_DEFS[activeWheels[i]].label}".`;
        return;
      }
    }

    const results  = { wheel1: outcomes[0], wheel2: outcomes[1], wheel3: outcomes[2] };
    const betsSnap = await getDocs(collection(db,"lobbies",currentLobbyCode,"bets"));
    const payoutRecord = calculatePayouts(betsSnap, results);

    const batch = writeBatch(db);
    betsSnap.forEach(b => batch.delete(b.ref));
    await batch.commit();

    const lobbySnap = await getDoc(doc(db,"lobbies",currentLobbyCode));
    if (!lobbySnap.exists()) return;

    await updateDoc(doc(db,"lobbies",currentLobbyCode), {
      phase: "payout_done",
      results,
      payouts: payoutRecord,
      round:   lobbySnap.data().round,
    });

    for (let i = 1; i <= 3; i++) {
      const el = $(`outcome-${i}`); if (el) el.value = "";
    }

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

  $("spin-btn").style.display       = isAdmin ? "inline-block" : "none";
  $("place-bets-btn").style.display = "inline-block";

  // Update wheel config from lobby doc
  const newWheels = data.wheels || ["winlose", "ghosttype", "deaths"];
  const wheelsChanged = JSON.stringify(newWheels) !== JSON.stringify(activeWheels);
  activeWheels = newWheels;

  currentPlayers = data.players || {};
  if (currentLobbyCode && !currentPlayers[currentUid]) { doLeave(true); return; }

  // Player list
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

  if (data.phase === "betting") {
    $("phase-betting").classList.remove("hidden");
    $("phase-results").classList.add("hidden");

    // Show/hide wheel config panel (admin only, betting phase only)
    const cfgSection = $("wheel-config-section");
    if (cfgSection) cfgSection.classList.toggle("hidden", !isAdmin);

    // Rebuild betting cards whenever wheels or players change
    renderBettingCards();
    if (isAdmin) renderWheelConfig();

  } else if (data.phase === "results") {
    $("phase-betting").classList.add("hidden");
    $("phase-results").classList.remove("hidden");
    if (isAdmin) {
      $("tbd-msg").classList.add("hidden");
      $("admin-outcome-section").classList.remove("hidden");
      renderOutcomeSelectors();
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

// ─── Apply own payout ─────────────────────────────────────────────────────────
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

// ─── My bets display ──────────────────────────────────────────────────────────
function renderMyBets(bets) {
  const mb = $("my-bets-display");
  if (!mb) return;
  if (!bets) { mb.innerHTML = `<p class="my-bets-empty">No bets placed yet.</p>`; return; }

  const rows = WHEEL_KEYS.map((k, i) => {
    const b       = bets[k];
    const typeKey = activeWheels[i];
    if (!b || b.amount === 0 || !typeKey) return null;
    const label = WHEEL_DEFS[typeKey]?.label || `Wheel ${i+1}`;
    return `<div class="my-bet-row">
      <span class="my-bet-label">${label}</span>
      <span class="my-bet-pick">${b.pick || "—"}</span>
      <span class="my-bet-amount">${b.amount} ${currencyLabel}</span>
    </div>`;
  }).filter(Boolean);

  mb.innerHTML = rows.length
    ? rows.join("")
    : `<p class="my-bets-empty">No bets placed yet.</p>`;
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
    WHEEL_KEYS.forEach((k, i) => {
      const b = bets[k];
      // Only score wheels that were active this round
      if (i >= activeWheels.length) return;
      if (b && b.amount > 0 && b.pick && b.pick === results[k]) stake += b.amount;
    });
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
  const wheels  = data.wheels  || activeWheels;

  $("popup-results-display").innerHTML = WHEEL_KEYS.map((k, i) => {
    const typeKey = wheels[i];
    if (!typeKey) return "";
    const label = WHEEL_DEFS[typeKey]?.label || `Wheel ${i+1}`;
    return `<div class="popup-result-row">
      <span class="popup-result-label">${label}</span>
      <span class="popup-result-value">${results[k] || "—"}</span>
    </div>`;
  }).join("");

  $("popup-payouts-display").innerHTML =
    Object.keys(payouts).length === 0
      ? `<p style="color:#aaa;text-align:center;">No winners this round.</p>`
      : Object.entries(payouts).map(([uid,amt]) =>
          `<div class="popup-payout-row">
            <span>${players[uid] || "Player"}</span>
            <span class="payout-amount">+${amt} ${currencyLabel}</span>
          </div>`
        ).join("");

  const myAmt = payouts[currentUid] || 0;
  const msg   = $("popup-your-payout");
  msg.textContent = myAmt > 0 ? `You won ${myAmt} ${currencyLabel}!` : "Better luck next round.";
  msg.style.color = myAmt > 0 ? "#7fd67f" : "#aaa";

  $("payout-popup").classList.remove("hidden");
}
