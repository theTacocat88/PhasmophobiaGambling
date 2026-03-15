import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, deleteUser } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, onSnapshot, getDocs, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getDatabase, ref, set, remove, onValue, onDisconnect } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey:"AIzaSyBG_SmVUSe93HDNErImoTBkPXGJPc3DBF0",authDomain:"phasmophobiagambling.firebaseapp.com",
  projectId:"phasmophobiagambling",storageBucket:"phasmophobiagambling.firebasestorage.app",
  messagingSenderId:"150402636149",appId:"1:150402636149:web:c0a7521370e21804935b3c",
  databaseURL:"https://phasmophobiagambling-default-rtdb.firebaseio.com/"
};
const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app),rtdb=getDatabase(app);

const GHOST_TELL={
  Banshee:    `Tells:
  - Can only be female (model/name)
  - 33% chance for 1/20 unique screams through parabolic microphone/sound recorder
  Ex.: Placeholder
  - Hunts based off of target's sanity
  - Will only pursue target during hunt (if target inside)
  - Target loses 15% sanity if they touch ghost during event instead of 10%
  Abilities:
  - 66% chance to stalk/roam to target w/o EMF reading (except between floors, or if target outside)
  More Sanity Info:
  - If target's sanity is 50% or lower even if outside - can hunt as early as 87% av. sanity, or as low as 12%`,
  Dayan:      `Tells:
  - Can only be female (model/name)
  - Hunt speed/sanity threshold determined by player movement near the ghost
  More Sanity Info:
  - Threshold 65% when walking w/in 10m, 45% when standing still when w/in 10m, 50% otherwise
  More Speed Info:
  - 2.25m/s if walking w/in 10m, 1.2m/s if standing still w/in 10m, 1.7m/s if all are >10m away from the ghost
  - Has LOS when >10m, and when within 10m LOS builds up but is not applied`,
  Deogen:     `Tells:
  - 33% chance for heavy breathing through spirit box when <1m from the ghost (sound: Placeholder)
  - Very fast until within 3m of the player
  - More visible during hunts (shorter blinks)
  Abilities:
  - You cannot hide from a Deogen, but can easily run due to it's hunt speed
  More Speed Info:
  - 3m/s when >3m from the player, when w/in 3m, drops to 0.4m/s
  More Evidence Info:
  - Guaranteed spirit box on difficulties with 1 or more evidence`,
  Demon:      ``,
  Gallu:      ``,
  Goryo:      ``,
  Hantu:      ``,
  Jinn:       ``,
  Mare:       ``,
  Moroi:      ``,
  Myling:     ``,
  Obake:      ``,
  Obambo:     ``,
  Oni:        ``,
  Onryo:      ``,
  Phantom:    ``,
  Poltergeist:``,
  Raiju:      ``,
  Revenant:   ``,
  Shade:      ``,
  Spirit:     ``,
  Thaye:      ``,
  "The Mimic":``,
  "The Twins": ``,
  Wraith:     ``,
  Yokai:      ``,
  Yurei:      ``
};
const GHOST_HUNT_SANITY={
  Banshee:    {min:12,start:50,max:87,note:"Checks target's sanity only"},
  Dayan:      {start:50},
  Deogen:     {start:40},
  Demon:      {start:70,note:"Can hunt regardless of sanity on ability"},
  Gallu:      {start:50},
  Goryo:      {start:50},
  Hantu:      {start:50},
  Jinn:       {start:50},
  Mare:       {min:40,start:50,max:60,note:"60% lights off · 40% lights on"},
  Moroi:      {start:50},
  Myling:     {start:50},
  Obake:      {start:50},
  Obambo:     {start:50},
  Oni:        {start:50},
  Onryo:      {min:40,start:60,note:"60% base · 40% near flame · hunts regardless on 3rd flame"},
  Phantom:    {start:50},
  Poltergeist:{start:50},
  Raiju:      {start:50,max:65,note:"65% near active electronics"},
  Revenant:   {start:50},
  Shade:      {start:35,note:"Cannot hunt if a player is in its room"},
  Spirit:     {start:50},
  Thaye:      {min:15,start:75,note:"75% young · -6% per age · 15% old"},
  "The Mimic":{start:50,note:"Inherits mimicked ghost's threshold"},
  "The Twins": {start:50},
  Wraith:     {start:50},
  Yokai:      {start:50,max:80,note:"80% if voice chat nearby"},
  Yurei:      {start:50}
};

const GHOST_SPEEDS={
  Banshee:    {type:"Constant",speeds:{"1.7m/s":"Constant"},los:true},
  Dayan:      {type:"Variable",speeds:{"1.2m/s":"Unmoving player","1.7m/s":"No player within 10m","2.25m/s":"Nearest player walking"},los:true},
  Deogen:     {type:"Variable",speeds:{"0.4m/s":"Within 3m of player","3m/s":">3m of player"},los:true},
  Demon:      {type:"Constant",speeds:{"1.7m/s":"Constant"},los:true},
  Gallu:      {type:"Variable",speeds:{"1.36m/s":"Weakened","1.7m/s":"Normal","1.96m/s":"Enraged"},los:true},
  Goryo:      {type:"Constant",speeds:{"1.7m/s":"Constant"},los:true},
  Hantu:      {type:"Range",speeds:{"1.5m/s":"Lowest (warm)","2.7m/s":"Highest (freezing)"},los:false},
  Jinn:       {type:"Variable",speeds:{"1.7m/s":"Normal","2.5m/s":"Breaker on + player >3m"},los:true},
  Mare:       {type:"Constant",speeds:{"1.7m/s":"Constant"},los:true},
  Moroi:      {type:"Range",speeds:{"1.5m/s":"High sanity","2.25m/s":"Low sanity (0%)"},los:true},
  Myling:     {type:"Constant",speeds:{"1.7m/s":"Constant"},los:true},
  Obake:      {type:"Constant",speeds:{"1.7m/s":"Constant"},los:true},
  Obambo:     {type:"Variable",speeds:{"1.45m/s":"Calm (changes every 2m)","1.96m/s":"Aggressive"},los:true},
  Oni:        {type:"Constant",speeds:{"1.7m/s":"Constant"},los:true},
  Onryo:      {type:"Constant",speeds:{"1.7m/s":"Constant"},los:true},
  Phantom:    {type:"Constant",speeds:{"1.7m/s":"Constant"},los:true},
  Poltergeist:{type:"Constant",speeds:{"1.7m/s":"Constant"},los:true},
  Raiju:      {type:"Variable",speeds:{"1.7m/s":"Normal","2.5m/s":"Within 6m of active electronics"},los:true},
  Revenant:   {type:"Variable",speeds:{"1.0m/s":"No player","3.0m/s":"Player in sight"},los:false},
  Shade:      {type:"Constant",speeds:{"1.7m/s":"Constant"},los:true},
  Spirit:     {type:"Constant",speeds:{"1.7m/s":"Constant"},los:true},
  Thaye:      {type:"Range",speeds:{"1.0m/s":"Old","2.75m/s":"Young"},los:false},
  "The Mimic":{type:"Constant",speeds:{"1.7m/s":"Normal (varies by mimicked ghost)"},los:true},
  "The Twins": {type:"Variable",speeds:{"1.5m/s":"Twin 1","1.9m/s":"Twin 2"},los:true},
  Wraith:     {type:"Constant",speeds:{"1.7m/s":"Constant"},los:true},
  Yokai:      {type:"Constant",speeds:{"1.7m/s":"Constant"},los:true},
  Yurei:      {type:"Constant",speeds:{"1.7m/s":"Constant"},los:true}
};

const WHEEL_DEFS={
  winlose:{label:"Win / Lose",options:["Win","Lose","Partial Win"]},
  ghosttype:{label:"Ghost Type",options:["Banshee","Dayan","Deogen","Demon","Gallu","Goryo","Hantu","Jinn","Mare","Moroi","Myling","Obake","Obambo","Oni","Onryo","Phantom","Poltergeist","Raiju","Revenant","Shade","Spirit","Thaye","The Mimic","The Twins","Wraith","Yokai","Yurei"]},
  deaths:{label:"Deaths",options:null},
  perfectrun:{label:"Perfect Run",options:["Yes","No"]},
  ghostspeed:{label:"Ghost Speed",options:["Constant Speed", "Variable Speed"]},
  cursedobject:{label:"Cursed Object",options:["Music Box","Ouija Board","Summoning Circle","Voodoo Doll","Monkey's Paw","Tarot Cards","Haunted Mirror","None"]},
};
const WHEEL_KEYS=["wheel1","wheel2","wheel3"];
const DIFFICULTY_DEFS={
  amateur:      {label:"Amateur",          evidenceCount:3, noRuleOut:false},
  intermediate: {label:"Intermediate",     evidenceCount:3, noRuleOut:false},
  professional: {label:"Professional",     evidenceCount:3, noRuleOut:false},
  nightmare:    {label:"Nightmare",        evidenceCount:2, noRuleOut:true},
  insanity:     {label:"Insanity",         evidenceCount:1, noRuleOut:true},
  apocalypse:   {label:"Apocalypse III",   evidenceCount:0, noRuleOut:true, orbConfirmsMinic:true},
  custom:       {label:"Custom",           evidenceCount:null, noRuleOut:null},
};
function getDifficultyRules(diff){
  if(diff.preset==="custom"){
    const ec=Number(diff.customEvidence??3);
    return {evidenceCount:ec, noRuleOut:ec<3, orbConfirmsMinic:false};
  }
  return DIFFICULTY_DEFS[diff.preset]||DIFFICULTY_DEFS.professional;
}

const EVIDENCE=[
  {id:"emf",label:"EMF 5"},
  {id:"uv",label:"Ultraviolet"},
  {id:"writing",label:"Writing"},
  {id:"freezing",label:"Freezing"},
  {id:"dots",label:"D.O.T.S"},
  {id:"orb",label:"Ghost Orb"},
  {id:"spiritbox",label:"Spirit Box"},
];
const GHOSTS=[
  {name:"Banshee",evidence:["uv","orb","dots"]},
  {name:"Dayan",evidence:["emf","spiritbox","orb"]},
  {name:"Deogen",evidence:["spiritbox","writing","dots"]},
  {name:"Demon",evidence:["uv","freezing","writing"]},
  {name:"Gallu",evidence:["emf","uv","spiritbox"]},
  {name:"Goryo",evidence:["emf","uv","dots"]},
  {name:"Hantu",evidence:["uv","orb","freezing"]},
  {name:"Jinn",evidence:["emf","uv","freezing"]},
  {name:"Mare",evidence:["orb","writing","spiritbox"]},
  {name:"Moroi",evidence:["spiritbox","writing","freezing"]},
  {name:"Myling",evidence:["emf","uv","writing"]},
  {name:"Obake",evidence:["emf","uv","orb"]},
  {name:"Obambo",evidence:["emf","writing","dots"]},
  {name:"Oni",evidence:["emf","freezing","dots"]},
  {name:"Onryo",evidence:["orb","freezing","spiritbox"]},
  {name:"Phantom",evidence:["uv","dots","spiritbox"]},
  {name:"Poltergeist",evidence:["uv","writing","spiritbox"]},
  {name:"Raiju",evidence:["emf","orb","dots"]},
  {name:"Revenant",evidence:["orb","writing","freezing"]},
  {name:"Shade",evidence:["emf","writing","freezing"]},
  {name:"Spirit",evidence:["emf","writing","spiritbox"]},
  {name:"Thaye",evidence:["orb","writing","dots"]},
  {name:"The Mimic",evidence:["uv","freezing","spiritbox"],mimicExtra:["orb"]},
  {name:"The Twins",evidence:["emf","freezing","spiritbox"]},
  {name:"Wraith",evidence:["emf","dots","spiritbox"]},
  {name:"Yokai",evidence:["orb","dots","spiritbox"]},
  {name:"Yurei",evidence:["orb","freezing","dots"]},
];

let currentUid=null,currentLobbyCode=null,isAdmin=false,currencyLabel="Points",currentPlayers={};
let activeWheels=["winlose","ghosttype","deaths"],unsubLobby=null,unsubBets=null,unsubPresence=null;
let lastPayoutRound=-1;
let localEvidence={};
EVIDENCE.forEach(e=>{localEvidence[e.id]="none";});
let ghostVotes={};
let localDeaths={};
let myDied=false;
let currentDifficulty={preset:"professional",customEvidence:3,customHunt:"medium"};

const $=id=>document.getElementById(id);
function setPointsDisplay(pts){$("points-display").textContent=`${currencyLabel}: ${pts}`;}
function cleanupListeners(){
  if(unsubLobby){unsubLobby();unsubLobby=null;}
  if(unsubBets){unsubBets();unsubBets=null;}
  if(unsubPresence){unsubPresence();unsubPresence=null;}
}
function getWheelOptions(typeKey,players){
  const def=WHEEL_DEFS[typeKey];if(!def)return[];
  return def.options!==null?def.options:["None Dead",...Object.values(players),"All Dead"];
}

function buildCheatSheet(){
  const evPanel=$("cs-evidence-panel");evPanel.innerHTML="";
  EVIDENCE.forEach(ev=>{
    const btn=document.createElement("button");
    btn.className="cs-evi-btn";btn.id=`cs-evi-${ev.id}`;btn.textContent=ev.label;
    btn.addEventListener("click",()=>cycleEvidence(ev.id));
    evPanel.appendChild(btn);
  });

  const grid=$("cs-ghost-grid");grid.innerHTML="";
  GHOSTS.forEach(ghost=>{
    const card=document.createElement("div");
    card.className="cs-ghost-card";
    card.id=`cs-ghost-${ghost.name.replace(/[\s']/g,"-")}`;

    
    const inner=document.createElement("div");inner.className="cs-ghost-inner";

    
    const left=document.createElement("div");left.className="cs-ghost-left";

    const name=document.createElement("p");name.className="cs-ghost-name";name.textContent=ghost.name;
    left.appendChild(name);

    const tags=document.createElement("div");tags.className="cs-ghost-evidence";
    ghost.evidence.forEach(eid=>{
      const tag=document.createElement("span");
      tag.className=`cs-evi-tag cs-evi-tag-${eid}`;
      tag.dataset.eid=eid;
      tag.textContent=EVIDENCE.find(e=>e.id===eid).label;
      tags.appendChild(tag);
    });
    if(ghost.mimicExtra){
      ghost.mimicExtra.forEach(eid=>{
        const tag=document.createElement("span");
        tag.className=`cs-evi-tag cs-evi-tag-${eid}`;
        tag.dataset.eid=eid;
        tag.style.opacity="0.55";
        tag.style.fontStyle="italic";
        tag.title="Mimic evidence (fake)";
        tag.textContent=EVIDENCE.find(e=>e.id===eid).label+" (mimic)";
        tags.appendChild(tag);
      });
    }
    left.appendChild(tags);

    
    const spd=GHOST_SPEEDS[ghost.name];
    if(spd){
      const speedDiv=document.createElement("div");speedDiv.className="cs-ghost-speed";
      const typeRow=document.createElement("span");typeRow.className="cs-ghost-speed-type";
      typeRow.textContent=spd.type+(spd.los?" · LOS":" · No LOS");
      speedDiv.appendChild(typeRow);
      Object.entries(spd.speeds).forEach(([val,desc])=>{
        const row=document.createElement("div");row.className="cs-ghost-speed-row";
        const v=document.createElement("span");v.className="cs-ghost-speed-val";v.textContent=val;
        const d=document.createElement("span");d.className="cs-ghost-speed-desc";d.textContent=desc;
        row.appendChild(v);row.appendChild(d);speedDiv.appendChild(row);
      });
      left.appendChild(speedDiv);
    }

    
    const hs=GHOST_HUNT_SANITY[ghost.name];
    if(hs){
      const hsDiv=document.createElement("div");hsDiv.className="cs-ghost-hunt-sanity";
      const hsLabel=document.createElement("span");hsLabel.className="cs-ghost-hunt-label";hsLabel.textContent="Hunt sanity: ";
      let hsValue;
      if(hs.min!==undefined&&hs.max!==undefined){
        hsValue=`${hs.min}% – ${hs.start}% – ${hs.max}%`;
      }else if(hs.min!==undefined){
        hsValue=`${hs.min}% – ${hs.start}%`;
      }else if(hs.max!==undefined){
        hsValue=`${hs.start}% – ${hs.max}%`;
      }else{
        hsValue=`${hs.start}%`;
      }
      const hsVal=document.createElement("span");hsVal.className="cs-ghost-hunt-val";hsVal.textContent=hsValue;
      hsDiv.appendChild(hsLabel);hsDiv.appendChild(hsVal);
      if(hs.note){
        const hsNote=document.createElement("div");hsNote.className="cs-ghost-hunt-note";hsNote.textContent=hs.note;
        hsDiv.appendChild(hsNote);
      }
      left.appendChild(hsDiv);
    }

    inner.appendChild(left);

    
    const tellText=GHOST_TELL[ghost.name];
    if(tellText){
      const tellWrap=document.createElement("div");
      tellWrap.className="cs-ghost-tell-wrap";
      const tell=document.createElement("div");
      tell.className="cs-ghost-tell";
      tell.textContent=tellText;
      tellWrap.appendChild(tell);
      inner.appendChild(tellWrap);
    }

    
    const actions=document.createElement("div");actions.className="cs-ghost-actions";

    const btnConfirm=document.createElement("button");
    btnConfirm.className="cs-ghost-action-btn ghost-action-confirm";
    btnConfirm.title="Confirm — this is the ghost";
    btnConfirm.textContent="\u2713";
    btnConfirm.addEventListener("click",()=>toggleGhostVote(ghost.name,"confirmed"));
    actions.appendChild(btnConfirm);

    const btnRuledOut=document.createElement("button");
    btnRuledOut.className="cs-ghost-action-btn ghost-action-ruledout";
    btnRuledOut.title="Rule out — not this ghost";
    btnRuledOut.textContent="\u2715";
    btnRuledOut.addEventListener("click",()=>toggleGhostVote(ghost.name,"ruledout"));
    actions.appendChild(btnRuledOut);

    const btnGuess=document.createElement("button");
    btnGuess.className="cs-ghost-action-btn ghost-action-guess";
    btnGuess.title="Guess — probably this ghost";
    btnGuess.textContent="?";
    btnGuess.addEventListener("click",()=>toggleGhostVote(ghost.name,"guess"));
    actions.appendChild(btnGuess);

    const btnSkull=document.createElement("button");
    btnSkull.className="cs-ghost-action-btn ghost-action-skull";
    btnSkull.title="I died to this ghost (personal)";
    btnSkull.textContent="\uD83D\uDC80";
    btnSkull.addEventListener("click",()=>toggleLocalDeath(ghost.name));
    actions.appendChild(btnSkull);

    inner.appendChild(actions);
    card.appendChild(inner);
    grid.appendChild(card);
  });
}

function renderCheatSheet(){
  const confirmed=Object.entries(localEvidence).filter(([,v])=>v==="confirmed").map(([k])=>k);
  const ruledOut=Object.entries(localEvidence).filter(([,v])=>v==="ruled_out").map(([k])=>k);
  const rules=getDifficultyRules(currentDifficulty);

  function ghostMatchesFilter(ghost){
    const effectiveEvidence=ghost.mimicExtra?[...ghost.evidence,...ghost.mimicExtra]:ghost.evidence;
    const hasAllConfirmed=confirmed.every(e=>effectiveEvidence.includes(e));
    const hasNoRuledOut=rules.noRuleOut?true:ruledOut.every(e=>!effectiveEvidence.includes(e));
    if(rules.orbConfirmsMinic&&localEvidence["orb"]==="confirmed"){
      return ghost.name==="The Mimic";
    }
    return hasAllConfirmed&&hasNoRuledOut;
  }

  const possibleGhosts=GHOSTS.filter(ghostMatchesFilter);
  const possibleIds=new Set(possibleGhosts.flatMap(g=>g.mimicExtra?[...g.evidence,...g.mimicExtra]:g.evidence));

  EVIDENCE.forEach(ev=>{
    const btn=$(`cs-evi-${ev.id}`);if(!btn)return;
    btn.classList.remove("cs-evi-confirmed","cs-evi-ruled-out","cs-evi-impossible");
    if(localEvidence[ev.id]==="confirmed")btn.classList.add("cs-evi-confirmed");
    else if(localEvidence[ev.id]==="ruled_out")btn.classList.add("cs-evi-ruled-out");
    else if(!possibleIds.has(ev.id)&&possibleGhosts.length>0)btn.classList.add("cs-evi-impossible");
  });

  let visible=0;
  GHOSTS.forEach(ghost=>{
    const id=ghost.name.replace(/[\s']/g,"-");
    const card=$(`cs-ghost-${id}`);if(!card)return;
    const show=possibleGhosts.includes(ghost);
    card.classList.toggle("cs-ghost-hidden",!show);

    card.querySelectorAll(".cs-evi-tag[data-eid]").forEach(tag=>{
      const eid=tag.dataset.eid;
      const isMimic=tag.title==="Mimic evidence (fake)";
      if(!isMimic)tag.classList.toggle("cs-evi-tag-confirmed",localEvidence[eid]==="confirmed");
    });

    const vote=ghostVotes[ghost.name]||"none";
    card.classList.toggle("ghost-confirmed-card",vote==="confirmed");
    card.classList.toggle("ghost-ruledout-card",vote==="ruledout");
    card.classList.toggle("ghost-guess-card",vote==="guess");

    const btnConfirm=card.querySelector(".ghost-action-confirm");
    const btnRuledOut=card.querySelector(".ghost-action-ruledout");
    const btnGuess=card.querySelector(".ghost-action-guess");
    const btnSkull=card.querySelector(".ghost-action-skull");
    if(btnConfirm)btnConfirm.classList.toggle("active",vote==="confirmed");
    if(btnRuledOut)btnRuledOut.classList.toggle("active",vote==="ruledout");
    if(btnGuess)btnGuess.classList.toggle("active",vote==="guess");
    if(btnSkull)btnSkull.classList.toggle("active",!!localDeaths[ghost.name]);

    
    if(show){
      const spd=GHOST_SPEEDS[ghost.name];
      let speedShow=true;
      if(spd){
        if(speedTypeFilter==="constant")speedShow=spd.type==="Constant";
        if(speedTypeFilter==="variable")speedShow=spd.type!=="Constant";
        if(speedLosFilter==="active")speedShow=speedShow&&spd.los;
        if(speedLosFilter==="ruledout")speedShow=speedShow&&!spd.los;
      }
      card.classList.toggle("cs-ghost-speed-hidden",!speedShow);
      if(speedShow)visible++;
    } else {
      card.classList.remove("cs-ghost-speed-hidden");
    }
  });

  const counter=$("cs-ghost-count");
  if(counter)counter.textContent=`${visible} ghost${visible!==1?"s":""} remaining`;
}

async function cycleEvidence(id){
  if(!currentLobbyCode)return;
  const rules=getDifficultyRules(currentDifficulty);
  const cur=localEvidence[id];
  const next=cur==="none"?"confirmed":cur==="confirmed"?(rules.noRuleOut?"none":"ruled_out"):"none";
  localEvidence[id]=next;renderCheatSheet();
  try{await updateDoc(doc(db,"lobbies",currentLobbyCode),{[`evidence.${id}`]:next});}
  catch(e){console.error("cycleEvidence:",e);}
}

async function toggleGhostVote(ghostName,voteType){
  if(!currentLobbyCode)return;
  const current=ghostVotes[ghostName]||"none";
  const next=current===voteType?"none":voteType;
  ghostVotes[ghostName]=next;
  renderCheatSheet();
  try{
    const safeKey=ghostName.replace(/[\s']/g,"_");
    await updateDoc(doc(db,"lobbies",currentLobbyCode),{[`ghostVotes.${safeKey}`]:next});
  }catch(e){console.error("toggleGhostVote:",e);}
}

function toggleLocalDeath(ghostName){
  localDeaths[ghostName]=!localDeaths[ghostName];
  renderCheatSheet();
}

async function saveAndReset(){
  if(!currentLobbyCode)return;
  const reset={};
  EVIDENCE.forEach(e=>{reset[`evidence.${e.id}`]="none";localEvidence[e.id]="none";});
  GHOSTS.forEach(g=>{
    const safeKey=g.name.replace(/[\s']/g,"_");
    reset[`ghostVotes.${safeKey}`]="none";
    ghostVotes[g.name]="none";
  });
  localDeaths={};
  speedTypeFilter=null;speedLosFilter=false;
  applySpeedUI();
  renderCheatSheet();
  pushResetToOverlay();
  pushSpeedToOverlay();
  reset["speedFilter.type"]=null;
  reset["speedFilter.los"]=false;
  try{await updateDoc(doc(db,"lobbies",currentLobbyCode),reset);}
  catch(e){console.error("saveAndReset:",e);}
}

async function resetCheatSheet(){
  if(!currentLobbyCode)return;
  const reset={};EVIDENCE.forEach(e=>{reset[`evidence.${e.id}`]="none";localEvidence[e.id]="none";});
  speedTypeFilter=null;speedLosFilter=false;
  applySpeedUI();
  renderCheatSheet();
  pushResetToOverlay();
  pushSpeedToOverlay();
  reset["speedFilter.type"]=null;
  reset["speedFilter.los"]=false;
  try{await updateDoc(doc(db,"lobbies",currentLobbyCode),reset);}
  catch(e){console.error("resetCheatSheet:",e);}
}

async function toggleMyDeath(){
  if(!currentLobbyCode||!currentUid)return;
  myDied=!myDied;
  $("cs-death-btn").classList.toggle("cs-death-active",myDied);
  const myName=currentPlayers[currentUid]||"Someone";
  try{
    const snap=await getDoc(doc(db,"lobbies",currentLobbyCode));
    if(!snap.exists())return;
    const deaths=snap.data().deaths||{};
    if(myDied)deaths[currentUid]=myName;
    else delete deaths[currentUid];
    await updateDoc(doc(db,"lobbies",currentLobbyCode),{deaths});
  }catch(e){console.error("toggleMyDeath:",e);}
}

function updateDeathBanner(deaths){
  const banner=$("cs-death-banner"),text=$("cs-death-banner-text");
  if(!deaths||Object.keys(deaths).length===0){banner.classList.add("hidden");return;}
  const names=Object.values(deaths).join(", ");
  text.textContent=`${names} ${Object.keys(deaths).length===1?"has":"have"} died.`;
  banner.classList.remove("hidden");
}

let activeTab="ghost";
function switchTab(tab){
  activeTab=tab;
  $("cs-tab-content-ghost").classList.toggle("hidden",tab!=="ghost");
  $("cs-tab-content-tools").classList.toggle("hidden",tab!=="tools");
  $("cs-tab-ghost").classList.toggle("cs-tab-active",tab==="ghost");
  $("cs-tab-tools").classList.toggle("cs-tab-active",tab==="tools");
}

let speedTypeFilter=null;
let speedLosFilter=false;

async function pushSpeedToFirestore(){
  if(!currentLobbyCode)return;
  try{await updateDoc(doc(db,"lobbies",currentLobbyCode),{"speedFilter.type":speedTypeFilter,"speedFilter.los":speedLosFilter});}
  catch(e){console.error("pushSpeedToFirestore:",e);}
}

function pushSpeedToOverlay(){
  if(!desktopWS||desktopWS.readyState!==WebSocket.OPEN)return;
  desktopWS.send(JSON.stringify({type:"speed-full",speedType:speedTypeFilter,speedLos:speedLosFilter}));
}

function applySpeedUI(){
  $("cs-speed-constant")?.classList.toggle("cs-speed-active",speedTypeFilter==="constant");
  $("cs-speed-variable")?.classList.toggle("cs-speed-active",speedTypeFilter==="variable");
  $("cs-speed-los")?.classList.toggle("cs-speed-active",speedLosFilter==="active");
  $("cs-speed-los")?.classList.toggle("cs-speed-ruledout",speedLosFilter==="ruledout");
}

function initSpeedButtons(){
  const btnConstant=$("cs-speed-constant");
  const btnVariable=$("cs-speed-variable");
  const btnLos=$("cs-speed-los");
  if(!btnConstant||!btnVariable||!btnLos)return;

  [btnConstant,btnVariable].forEach(btn=>{
    btn.addEventListener("click",()=>{
      const key=btn.dataset.speed;
      speedTypeFilter=speedTypeFilter===key?null:key;
      applySpeedUI();
      renderCheatSheet();
      pushSpeedToFirestore();
      pushSpeedToOverlay();
    });
  });

  btnLos.addEventListener("click",()=>{
    if(speedLosFilter===false)speedLosFilter="active";
    else if(speedLosFilter==="active")speedLosFilter="ruledout";
    else speedLosFilter=false;
    applySpeedUI();
    renderCheatSheet();
    pushSpeedToFirestore();
    pushSpeedToOverlay();
  });
}

let linkingPanelOpen=false;
function toggleLinkingPanel(){
  linkingPanelOpen=!linkingPanelOpen;
  $("cs-linking-tab-trigger").classList.toggle("cs-linking-open",linkingPanelOpen);
  $("cs-sidebar").classList.toggle("linking-open",linkingPanelOpen);
  
}

let csIsOpen=false;
function openCheatSheet(){
  if(csIsOpen)return;csIsOpen=true;
  $("cs-overlay").classList.remove("hidden");
  document.body.classList.add("cs-active");
  requestAnimationFrame(()=>requestAnimationFrame(()=>$("cs-overlay").classList.add("cs-visible")));
}
function closeCheatSheet(){
  if(!csIsOpen)return;csIsOpen=false;
  const el=$("cs-overlay");
  el.classList.remove("cs-visible");
  document.body.classList.remove("cs-active");
  el.addEventListener("transitionend",()=>{if(!csIsOpen)el.classList.add("hidden");},{once:true});
}

function renderDifficultySection(diff){
  const section=$("difficulty-section");
  const sel=$("difficulty-select");
  const customOpts=$("difficulty-custom-opts");
  const display=$("difficulty-display");
  if(!section||!sel)return;
  if(isAdmin){
    section.classList.remove("hidden");
    sel.value=diff.preset||"professional";
    customOpts?.classList.toggle("hidden",diff.preset!=="custom");
    if(diff.preset==="custom"){
      const ec=$("custom-evidence-count");
      const ch=$("custom-hunt-sanity");
      if(ec)ec.value=String(diff.customEvidence??3);
      if(ch)ch.value=diff.customHunt||"medium";
    }
    if(display){
      const rules=getDifficultyRules(diff);
      const parts=[];
      if(rules.evidenceCount!==null)parts.push(`${rules.evidenceCount} evidence`);
      if(rules.noRuleOut)parts.push("no rule-out");
      if(rules.orbConfirmsMinic)parts.push("orb \u2192 Mimic");
      display.textContent=parts.length?parts.join(" \u00b7 "):"";
    }
  } else {
    section.classList.remove("hidden");
    if(sel)sel.disabled=true;
    if(customOpts)customOpts.classList.add("hidden");
    const rules=getDifficultyRules(diff);
    const def=DIFFICULTY_DEFS[diff.preset]||{label:"Professional"};
    const parts=[def.label];
    if(rules.noRuleOut)parts.push("no rule-out");
    if(rules.orbConfirmsMinic)parts.push("orb \u2192 Mimic");
    if(display)display.textContent=parts.join(" \u00b7 ");
    if(sel)sel.disabled=false;
  }
}

async function saveDifficulty(){
  if(!isAdmin||!currentLobbyCode)return;
  try{await updateDoc(doc(db,"lobbies",currentLobbyCode),{difficulty:currentDifficulty});}
  catch(e){console.error("saveDifficulty:",e);}
}

function renderBettingCards(){
  const main=$("main");main.innerHTML="";
  activeWheels.forEach((typeKey,i)=>{
    const def=WHEEL_DEFS[typeKey]||{label:"Unknown",options:[]};
    const options=getWheelOptions(typeKey,currentPlayers);
    const card=document.createElement("div");card.className="wheel-card";
    card.innerHTML=`<p class="wheel-label">${def.label}</p>
      <select class="pick-select" id="pick-${i+1}"><option value="">-- Pick --</option>${options.map(o=>`<option value="${o}">${o}</option>`).join("")}</select>
      <input class="bet-input" id="bet-${i+1}" type="number" placeholder="Your bet here..." min="0" />`;
    main.appendChild(card);
  });
  for(let i=activeWheels.length;i<3;i++){
    const card=document.createElement("div");card.className="wheel-card wheel-card-empty";
    card.innerHTML=`<p class="wheel-label" style="color:#555;">-- Not used --</p>`;
    ["bet","pick"].forEach(prefix=>{
      const d=document.createElement("input");d.type="hidden";d.id=`${prefix}-${i+1}`;d.value=prefix==="bet"?"0":"";card.appendChild(d);
    });
    main.appendChild(card);
  }
}

function renderOutcomeSelectors(){
  const c=$("outcome-selectors");c.innerHTML="";
  activeWheels.forEach((typeKey,i)=>{
    const def=WHEEL_DEFS[typeKey]||{label:"Unknown",options:[]};
    const options=getWheelOptions(typeKey,currentPlayers);
    const row=document.createElement("div");row.className="outcome-row";
    row.innerHTML=`<span class="outcome-label">${def.label}</span>
      <select class="outcome-select" id="outcome-${i+1}"><option value="">-- Select --</option>${options.map(o=>`<option value="${o}">${o}</option>`).join("")}</select>`;
    c.appendChild(row);
  });
  for(let i=activeWheels.length;i<3;i++){
    const d=document.createElement("select");d.id=`outcome-${i+1}`;d.style.display="none";
    d.innerHTML=`<option value="N/A" selected>N/A</option>`;c.appendChild(d);
  }
}

function renderWheelConfig(){
  const panel=$("wheel-config-panel");if(!panel)return;panel.innerHTML="";
  for(let i=0;i<3;i++){
    const row=document.createElement("div");row.className="wheel-config-row";
    const label=document.createElement("span");label.textContent=`Wheel ${i+1}`;label.className="wheel-config-label";row.appendChild(label);
    const sel=document.createElement("select");sel.id=`wheel-type-${i+1}`;sel.className="wheel-type-select";
    if(i>0){const none=document.createElement("option");none.value="";none.textContent="-- None --";sel.appendChild(none);}
    Object.entries(WHEEL_DEFS).forEach(([key,def])=>{
      const opt=document.createElement("option");opt.value=key;opt.textContent=def.label;sel.appendChild(opt);
    });
    sel.value=activeWheels[i]||"";
    sel.addEventListener("change",()=>{$("wheel-config-error").textContent="";});
    row.appendChild(sel);panel.appendChild(row);
  }
}

function resetBettingUI(){
  for(let i=1;i<=3;i++){const b=$(`bet-${i}`);if(b)b.value="";const p=$(`pick-${i}`);if(p)p.value="";}
  const err=$("bet-error");if(err)err.textContent="";
  const mb=$("my-bets-display");if(mb)mb.innerHTML=`<p class="my-bets-empty">No bets placed yet.</p>`;
}

$("settings-toggle").addEventListener("click",()=>$("settings-panel").classList.toggle("hidden"));

$("settings-name-save").addEventListener("click",async()=>{
  const msg=$("settings-msg");
  try{
    const n=$("settings-name-input").value.trim();if(!n){msg.textContent="Enter a name.";return;}
    await updateDoc(doc(db,"users",currentUid),{username:n});
    if(currentLobbyCode){
      const ls=await getDoc(doc(db,"lobbies",currentLobbyCode));
      if(ls.exists()){const pm={...ls.data().players};pm[currentUid]=n;await updateDoc(doc(db,"lobbies",currentLobbyCode),{players:pm});}
    }
    msg.textContent="Saved!";setTimeout(()=>{msg.textContent="";},2000);
  }catch(e){msg.textContent="Error: "+e.message;}
});

$("settings-lobby-code-save").addEventListener("click",async()=>{
  const msg=$("settings-msg"),code=$("settings-lobby-code-input").value.trim();
  try{
    await updateDoc(doc(db,"users",currentUid),{customLobbyCode:code});
    msg.textContent="Lobby code saved!";setTimeout(()=>{msg.textContent="";},2000);
  }catch(e){msg.textContent="Error: "+e.message;}
});

$("currency-select").addEventListener("change",async()=>{
  try{
    currencyLabel=$("currency-select").value;
    await updateDoc(doc(db,"users",currentUid),{currencyPref:currencyLabel});
    const snap=await getDoc(doc(db,"users",currentUid));
    if(snap.exists())setPointsDisplay(snap.data().points??0);
  }catch(e){console.error(e);}
});

$("reset-account-btn").addEventListener("click",async()=>{
  const msg=$("settings-msg");
  try{
    if(!confirm("Reset points to 300? Cannot be undone."))return;
    await updateDoc(doc(db,"users",currentUid),{points:300});
    setPointsDisplay(300);msg.textContent="Reset.";setTimeout(()=>{msg.textContent="";},2000);
  }catch(e){msg.textContent="Error: "+e.message;}
});

$("delete-account-btn").addEventListener("click",async()=>{
  const msg=$("settings-msg");
  try{
    if(!confirm("Delete your account? This cannot be undone."))return;
    if(currentLobbyCode){await doLeave(false);}
    await deleteDoc(doc(db,"users",currentUid));
    const user=auth.currentUser;
    if(user)await deleteUser(user);
    location.reload();
  }catch(e){msg.textContent="Error: "+e.message;}
});

$("wheel-config-save-btn").addEventListener("click",async()=>{
  const errEl=$("wheel-config-error"),msgEl=$("wheel-config-saved-msg");
  if(!isAdmin||!currentLobbyCode)return;
  const w1=$("wheel-type-1")?.value||"",w2=$("wheel-type-2")?.value||"",w3=$("wheel-type-3")?.value||"";
  if(!w1){errEl.textContent="Wheel 1 is required.";return;}
  const wheels=[w1,w2,w3].filter(Boolean);
  if(new Set(wheels).size!==wheels.length){errEl.textContent="Each wheel must be a different type.";return;}
  errEl.textContent="";
  try{
    await updateDoc(doc(db,"lobbies",currentLobbyCode),{wheels,wheelConfigDone:true});
    msgEl.textContent="Saved!";setTimeout(()=>{msgEl.textContent="";},2000);
    $("wheel-config-section").classList.add("hidden");
  }catch(e){errEl.textContent="Error: "+e.message;}
});

$("create-lobby-btn").addEventListener("click",async()=>{
  const err=$("landing-error"),name=$("display-name-input").value.trim();
  err.textContent="";
  if(!name){err.textContent="Enter a display name.";return;}
  if(!currentUid){err.textContent="Still signing in -- try again.";return;}
  try{
    const uSnap=await getDoc(doc(db,"users",currentUid));
    const customCode=uSnap.exists()?(uSnap.data().customLobbyCode||"").trim():"";
    let code;
    if(customCode){
      if((await getDoc(doc(db,"lobbies",customCode))).exists()){err.textContent=`Lobby "${customCode}" already exists.`;return;}
      code=customCode;
    }else{
      for(let i=0;i<10;i++){const c=String(Math.floor(1000+Math.random()*9000));if(!(await getDoc(doc(db,"lobbies",c))).exists()){code=c;break;}}
      if(!code){err.textContent="Could not generate a code.";return;}
    }
    const defaultEvidence={};EVIDENCE.forEach(e=>{defaultEvidence[e.id]="none";});
    const defaultVotes={};GHOSTS.forEach(g=>{defaultVotes[g.name.replace(/[\s']/g,"_")]="none";});
    await setDoc(doc(db,"lobbies",code),{
      adminUid:currentUid,round:1,phase:"betting",results:null,payouts:null,
      players:{[currentUid]:name},wheels:["winlose","ghosttype","deaths"],
      evidence:defaultEvidence,ghostVotes:defaultVotes,deaths:{},
      createdAt:serverTimestamp(),phaseChangedAt:serverTimestamp(),
      difficulty:{preset:"professional",customEvidence:3,customHunt:"medium"}
    });
    if(uSnap.exists()&&!uSnap.data().username){await updateDoc(doc(db,"users",currentUid),{username:name});$("settings-name-input").value=name;}
    enterLobby(code);
  }catch(e){err.textContent="Error: "+e.message;console.error(e);}
});

$("join-lobby-btn").addEventListener("click",async()=>{
  const err=$("landing-error"),name=$("display-name-input").value.trim(),code=$("join-code-input").value.trim();
  err.textContent="";
  if(!name){err.textContent="Enter a display name.";return;}
  if(!code){err.textContent="Enter a lobby code.";return;}
  if(!currentUid){err.textContent="Still signing in -- try again.";return;}
  try{
    const snap=await getDoc(doc(db,"lobbies",code));
    if(!snap.exists()){err.textContent="Lobby not found.";return;}
    const existingPlayers=snap.data().players||{};
    existingPlayers[currentUid]=name;
    await updateDoc(doc(db,"lobbies",code),{players:existingPlayers});
    const uSnap=await getDoc(doc(db,"users",currentUid));
    if(uSnap.exists()&&!uSnap.data().username){await updateDoc(doc(db,"users",currentUid),{username:name});$("settings-name-input").value=name;}
    enterLobby(code);
  }catch(e){err.textContent="Error: "+e.message;console.error(e);}
});

$("leave-lobby-btn").addEventListener("click",()=>doLeave(false));
$("cs-reset-btn").addEventListener("click",()=>resetCheatSheet());
$("cs-save-reset-btn").addEventListener("click",()=>saveAndReset());
$("cs-death-btn").addEventListener("click",()=>toggleMyDeath());
$("cs-tab-ghost").addEventListener("click",()=>switchTab("ghost"));
$("cs-tab-tools").addEventListener("click",()=>switchTab("tools"));
$("cs-linking-tab-trigger").addEventListener("click",()=>toggleLinkingPanel());

async function doEndRound(){
  try{
    if(!isAdmin||!currentLobbyCode)return;
    
    
    const resetEvidence={};
    EVIDENCE.forEach(e=>{resetEvidence[`evidence.${e.id}`]="none";});
    await updateDoc(doc(db,"lobbies",currentLobbyCode),{phase:"results",...resetEvidence,phaseChangedAt:serverTimestamp()});
    
    pushResetToOverlay();
  }catch(e){console.error("endRound:",e);}
}
$("end-round-btn").addEventListener("click",doEndRound);
$("cs-end-round-btn").addEventListener("click",doEndRound);

$("place-bets-btn").addEventListener("click",async()=>{
  const errEl=$("bet-error");errEl.textContent="";
  try{
    if(!currentUid){errEl.textContent="Not signed in yet.";return;}
    if(!currentLobbyCode){errEl.textContent="Not in a lobby.";return;}
    const amounts=[],picks=[];
    for(let i=1;i<=3;i++){amounts.push(Math.max(0,parseInt($(`bet-${i}`).value)||0));picks.push($(`pick-${i}`).value);}
    const total=amounts.reduce((a,b)=>a+b,0);
    if(total===0){errEl.textContent="Enter at least one bet amount.";return;}
    for(let i=0;i<activeWheels.length;i++){
      if(amounts[i]>0&&!picks[i]){errEl.textContent=`Choose a pick for "${WHEEL_DEFS[activeWheels[i]].label}", or set its bet to 0.`;return;}
    }
    const userSnap=await getDoc(doc(db,"users",currentUid));
    if(!userSnap.exists()){errEl.textContent="User account not found.";return;}
    const pts=userSnap.data().points??0;
    if(total>pts){errEl.textContent=`Not enough ${currencyLabel}. You have ${pts}, bet is ${total}.`;return;}
    await updateDoc(doc(db,"users",currentUid),{points:pts-total});setPointsDisplay(pts-total);
    await setDoc(doc(db,"lobbies",currentLobbyCode,"bets",currentUid),{
      wheel1:{pick:picks[0],amount:amounts[0]},
      wheel2:{pick:picks[1],amount:amounts[1]},
      wheel3:{pick:picks[2],amount:amounts[2]}
    });
    const msg=$("bets-placed-msg");if(msg){msg.classList.remove("hidden");setTimeout(()=>msg.classList.add("hidden"),2500);}
  }catch(e){errEl.textContent="Error: "+e.message;console.error("placeBets:",e);}
});

$("spin-btn").addEventListener("click",async()=>{
  try{
    if(!isAdmin||!currentLobbyCode)return;
    const resetEvidence={};EVIDENCE.forEach(e=>{resetEvidence[`evidence.${e.id}`]="none";});
    const resetVotes={};GHOSTS.forEach(g=>{resetVotes[`ghostVotes.${g.name.replace(/[\s']/g,"_")}`]="none";});
    await updateDoc(doc(db,"lobbies",currentLobbyCode),{phase:"playing",deaths:{},...resetEvidence,...resetVotes,phaseChangedAt:serverTimestamp()});
    myDied=false;$("cs-death-btn").classList.remove("cs-death-active");
  }catch(e){console.error("fixBets:",e);alert("Error: "+e.message);}
});

$("payout-btn").addEventListener("click",async()=>{
  const errEl=$("payout-error");errEl.textContent="";
  try{
    if(!isAdmin||!currentLobbyCode)return;
    const outcomes=[];for(let i=1;i<=3;i++)outcomes.push($(`outcome-${i}`)?.value||"N/A");
    for(let i=0;i<activeWheels.length;i++){if(!outcomes[i]){errEl.textContent=`Select an outcome for "${WHEEL_DEFS[activeWheels[i]].label}".`;return;}}
    const results={wheel1:outcomes[0],wheel2:outcomes[1],wheel3:outcomes[2]};
    const betsSnap=await getDocs(collection(db,"lobbies",currentLobbyCode,"bets"));
    const payoutRecord=calculatePayouts(betsSnap,results);
    const batch=writeBatch(db);betsSnap.forEach(b=>batch.delete(b.ref));await batch.commit();
    const lobbySnap=await getDoc(doc(db,"lobbies",currentLobbyCode));if(!lobbySnap.exists())return;
    await updateDoc(doc(db,"lobbies",currentLobbyCode),{phase:"payout_done",results,payouts:payoutRecord,round:lobbySnap.data().round,phaseChangedAt:serverTimestamp()});
    for(let i=1;i<=3;i++){const el=$(`outcome-${i}`);if(el)el.value="";}
  }catch(e){errEl.textContent="Error: "+e.message;console.error("payout:",e);}
});

$("popup-close-btn").addEventListener("click",async()=>{
  $("payout-popup").classList.add("hidden");resetBettingUI();
  ghostVotes={};localDeaths={};myDied=false;
  $("cs-death-btn").classList.remove("cs-death-active");
  try{
    if(!isAdmin||!currentLobbyCode)return;
    const snap=await getDoc(doc(db,"lobbies",currentLobbyCode));
    if(snap.exists()&&snap.data().phase==="payout_done"){
      const defaultVotes={};GHOSTS.forEach(g=>{defaultVotes[`ghostVotes.${g.name.replace(/[\s']/g,"_")}`]="none";});
      await updateDoc(doc(db,"lobbies",currentLobbyCode),{phase:"betting",results:null,payouts:null,round:snap.data().round+1,deaths:{},...defaultVotes,phaseChangedAt:serverTimestamp()});
    }
  }catch(e){console.error("popupClose:",e);}
});

$("difficulty-select")?.addEventListener("change",()=>{
  if(!isAdmin)return;
  const preset=$("difficulty-select").value;
  currentDifficulty.preset=preset;
  const customOpts=$("difficulty-custom-opts");
  customOpts?.classList.toggle("hidden",preset!=="custom");
  renderDifficultySection(currentDifficulty);
  saveDifficulty();
});
$("custom-evidence-count")?.addEventListener("change",()=>{
  if(!isAdmin)return;
  currentDifficulty.customEvidence=Number($("custom-evidence-count").value);
  renderDifficultySection(currentDifficulty);
  saveDifficulty();
});
$("custom-hunt-sanity")?.addEventListener("change",()=>{
  if(!isAdmin)return;
  currentDifficulty.customHunt=$("custom-hunt-sanity").value;
  saveDifficulty();
});

$("cs-blood-moon-evidence")?.addEventListener("click",()=>{
  const btn=$("cs-blood-moon-evidence");
  btn?.classList.toggle("active");
});

$("desktop-link-btn")?.addEventListener("click",()=>{
  const code=$("desktop-link-input").value.trim();
  if(!code||code.length!==4){setLinkStatus("error");return;}
  connectDesktopLink(code);
});

signInAnonymously(auth).catch(e=>alert("Auth failed: "+e.message));
onAuthStateChanged(auth,async user=>{
  if(!user)return;currentUid=user.uid;
  try{
    const snap=await getDoc(doc(db,"users",currentUid));
    if(!snap.exists()){
      await setDoc(doc(db,"users",currentUid),{points:300,username:"",currencyPref:"Points",customLobbyCode:""});
      currencyLabel="Points";setPointsDisplay(300);
    }else{
      const d=snap.data();currencyLabel=d.currencyPref||"Points";setPointsDisplay(d.points??300);
      if(d.username)$("settings-name-input").value=d.username;
      if(d.customLobbyCode)$("settings-lobby-code-input").value=d.customLobbyCode;
    }
    $("currency-select").value=currencyLabel;
    $("user-settings-card").classList.remove("hidden");
  }catch(e){alert("Startup error: "+e.message);}
});

async function doLeave(wasKicked){
  if(!currentLobbyCode)return;
  const code=currentLobbyCode;cleanupListeners();currentLobbyCode=null;isAdmin=false;lastPayoutRound=-1;
  closeCheatSheet();ghostVotes={};localDeaths={};myDied=false;
  
  linkingPanelOpen=false;
  $("cs-linking-tab-trigger").classList.remove("cs-linking-open");
  $("cs-sidebar").classList.remove("linking-open");
  try{await remove(ref(rtdb,`presence/${code}/${currentUid}`));}catch(_){}
  try{await removePlayerFromLobby(currentUid,code);}catch(_){}
  $("screen-lobby").classList.add("hidden");$("screen-landing").classList.remove("hidden");resetBettingUI();
  if(wasKicked){const err=$("landing-error");err.style.color="#e06c6c";err.textContent="You were kicked from the lobby.";}
}

async function removePlayerFromLobby(uid,code){
  const lobbyRef=doc(db,"lobbies",code),lobbySnap=await getDoc(lobbyRef);
  if(!lobbySnap.exists())return;
  const data=lobbySnap.data(),players={...data.players};delete players[uid];
  try{await deleteDoc(doc(db,"lobbies",code,"bets",uid));}catch(_){}
  if(Object.keys(players).length===0){
    const betsSnap=await getDocs(collection(db,"lobbies",code,"bets"));
    const batch=writeBatch(db);betsSnap.forEach(b=>batch.delete(b.ref));batch.delete(lobbyRef);await batch.commit();
  }else{
    let newAdmin=data.adminUid;if(uid===data.adminUid)newAdmin=Object.keys(players)[0];
    await updateDoc(lobbyRef,{players,adminUid:newAdmin});
  }
}

function enterLobby(code){
  currentLobbyCode=code;lastPayoutRound=-1;ghostVotes={};localDeaths={};myDied=false;
  $("screen-landing").classList.add("hidden");$("screen-lobby").classList.remove("hidden");
  $("lobby-code-display").textContent=`Lobby: ${code}`;
  
  $("cs-topbar-lobby-code").textContent=`Code: ${code}`;
  buildCheatSheet();initSpeedButtons();setupPresence(code);
  if(unsubLobby)unsubLobby();
  unsubLobby=onSnapshot(doc(db,"lobbies",code),snap=>{
    if(!snap.exists()){
      cleanupListeners();currentLobbyCode=null;isAdmin=false;closeCheatSheet();
      $("screen-lobby").classList.add("hidden");$("screen-landing").classList.remove("hidden");resetBettingUI();return;
    }
    handleLobbyUpdate(snap.data());
  },e=>console.error("lobby snapshot:",e));
  if(unsubBets)unsubBets();
  unsubBets=onSnapshot(collection(db,"lobbies",code,"bets"),snap=>{
    let pool=0,myBets=null;
    snap.forEach(b=>{const d=b.data();pool+=(d.wheel1?.amount||0)+(d.wheel2?.amount||0)+(d.wheel3?.amount||0);if(b.id===currentUid)myBets=d;});
    $("prize-pool-display").textContent=`Prize Pool: ${pool}`;renderMyBets(myBets);
  },e=>console.error("bets snapshot:",e));
}

function setupPresence(code){
  const myRef=ref(rtdb,`presence/${code}/${currentUid}`);set(myRef,{online:true});onDisconnect(myRef).remove();
  if(unsubPresence)unsubPresence();
  unsubPresence=onValue(ref(rtdb,`presence/${code}`),async snapshot=>{
    if(!currentLobbyCode||currentLobbyCode!==code)return;
    try{
      const lobbySnap=await getDoc(doc(db,"lobbies",code));if(!lobbySnap.exists())return;
      const inLobby=lobbySnap.data().players||{},online=snapshot.val()||{};
      for(const uid of Object.keys(inLobby)){if(!online[uid]&&uid!==currentUid)await removePlayerFromLobby(uid,code);}
    }catch(e){console.error("presence watcher:",e);}
  });
}

async function deleteStaleLobby(code){
  try{
    const betsSnap=await getDocs(collection(db,"lobbies",code,"bets"));
    const batch=writeBatch(db);
    betsSnap.forEach(b=>batch.delete(b.ref));
    batch.delete(doc(db,"lobbies",code));
    await batch.commit();
    await remove(ref(rtdb,`presence/${code}`));
  }catch(e){console.error("deleteStaleLobby:",e);}
}

function handleLobbyUpdate(data){
  $("lobby-round-display").textContent=`Round ${data.round}`;
  isAdmin=data.adminUid===currentUid;
  activeWheels=data.wheels||["winlose","ghosttype","deaths"];
  currentPlayers=data.players||{};
  if(currentLobbyCode&&!currentPlayers[currentUid]){doLeave(true);return;}

  const now=Date.now();
  const createdAt=data.createdAt?.toMillis?.();
  const phaseChangedAt=data.phaseChangedAt?.toMillis?.();
  const lobbyTooOld=createdAt&&(now-createdAt)>24*60*60*1000;
  const phaseStale=phaseChangedAt&&(now-phaseChangedAt)>60*60*1000;
  if(lobbyTooOld||phaseStale){
    const code=currentLobbyCode;
    if(isAdmin)deleteStaleLobby(code);
    doLeave(false);
    const err=$("landing-error");err.style.color="#aaa";
    err.textContent=lobbyTooOld?"Lobby expired after 24 hours.":"Lobby expired due to inactivity.";
    return;
  }

  if(data.difficulty)currentDifficulty=data.difficulty;
  if(data.evidence){EVIDENCE.forEach(e=>{localEvidence[e.id]=data.evidence[e.id]||"none";});}
  if(data.ghostVotes){
    GHOSTS.forEach(g=>{
      const safeKey=g.name.replace(/[\s']/g,"_");
      ghostVotes[g.name]=data.ghostVotes[safeKey]||"none";
    });
  }
  updateDeathBanner(data.deaths||{});

  const sf=data.speedFilter||{};
  const newSpeedType=sf.type??null;
  const newSpeedLos=sf.los??false;
  if(newSpeedType!==speedTypeFilter||newSpeedLos!==speedLosFilter){
    speedTypeFilter=newSpeedType;
    speedLosFilter=newSpeedLos;
    applySpeedUI();
  }

  renderCheatSheet();
  pushEvidenceToOverlay();
  pushSpeedToOverlay();

  const list=$("players-list");list.innerHTML="";
  for(const [uid,name] of Object.entries(currentPlayers)){
    const tag=document.createElement("div");
    tag.className="player-tag"+(uid===data.adminUid?" player-admin":"");
    const span=document.createElement("span");span.textContent=name+(uid===data.adminUid?" \u2605":"");tag.appendChild(span);
    if(isAdmin&&uid!==currentUid){
      const kb=document.createElement("button");kb.className="kick-btn";kb.textContent="\u2715";kb.title=`Kick ${name}`;
      kb.addEventListener("click",async()=>{if(!confirm(`Kick ${name}?`))return;try{await kickPlayer(uid);}catch(e){console.error("kick:",e);}});
      tag.appendChild(kb);
    }
    list.appendChild(tag);
  }

  $("phase-betting").classList.add("hidden");
  $("phase-playing").classList.add("hidden");
  $("phase-results").classList.add("hidden");

  if(data.phase==="betting"){
    closeCheatSheet();
    $("phase-betting").classList.remove("hidden");
    const cfgSection=$("wheel-config-section");
    if(cfgSection)cfgSection.classList.toggle("hidden",!isAdmin||!!data.wheelConfigDone);
    renderBettingCards();if(isAdmin&&!data.wheelConfigDone)renderWheelConfig();
    $("spin-btn").style.display=isAdmin?"inline-block":"none";
    $("place-bets-btn").style.display="inline-block";
    const diff=data.difficulty||{preset:"professional",customEvidence:3,customHunt:"medium"};
    currentDifficulty=diff;
    renderDifficultySection(diff);
  }else if(data.phase==="playing"){
    $("phase-playing").classList.remove("hidden");
    openCheatSheet();
    $("end-round-btn").style.display=isAdmin?"inline-block":"none";
    $("cs-end-round-btn").style.display=isAdmin?"inline-block":"none";
  }else if(data.phase==="results"){
    closeCheatSheet();
    $("phase-results").classList.remove("hidden");
    if(isAdmin){$("tbd-msg").classList.add("hidden");$("admin-outcome-section").classList.remove("hidden");renderOutcomeSelectors();}
    else{$("tbd-msg").classList.remove("hidden");$("admin-outcome-section").classList.add("hidden");}
  }else if(data.phase==="payout_done"){
    if(data.round!==lastPayoutRound){lastPayoutRound=data.round;applyMyPayoutAndShowPopup(data);}
  }
}

async function applyMyPayoutAndShowPopup(data){
  try{
    const myAmount=(data.payouts||{})[currentUid]||0;
    if(myAmount>0){
      const snap=await getDoc(doc(db,"users",currentUid));
      if(snap.exists()){const newPts=snap.data().points+Math.floor(myAmount);await updateDoc(doc(db,"users",currentUid),{points:newPts});setPointsDisplay(newPts);}
    }
    showPayoutPopup(data);
  }catch(e){console.error("applyMyPayout:",e);showPayoutPopup(data);}
}

async function kickPlayer(uid){
  if(!isAdmin||!currentLobbyCode)return;
  const snap=await getDoc(doc(db,"lobbies",currentLobbyCode));if(!snap.exists())return;
  const players={...snap.data().players};delete players[uid];
  await updateDoc(doc(db,"lobbies",currentLobbyCode),{players});
  try{await deleteDoc(doc(db,"lobbies",currentLobbyCode,"bets",uid));}catch(_){}
  try{await remove(ref(rtdb,`presence/${currentLobbyCode}/${uid}`));}catch(_){}
}

function renderMyBets(bets){
  const mb=$("my-bets-display");if(!mb)return;
  if(!bets){mb.innerHTML=`<p class="my-bets-empty">No bets placed yet.</p>`;return;}
  const rows=WHEEL_KEYS.map((k,i)=>{
    const b=bets[k],typeKey=activeWheels[i];if(!b||b.amount===0||!typeKey)return null;
    const label=WHEEL_DEFS[typeKey]?.label||`Wheel ${i+1}`;
    return `<div class="my-bet-row"><span class="my-bet-label">${label}</span><span class="my-bet-pick">${b.pick||"--"}</span><span class="my-bet-amount">${b.amount} ${currencyLabel}</span></div>`;
  }).filter(Boolean);
  mb.innerHTML=rows.length?rows.join(""):`<p class="my-bets-empty">No bets placed yet.</p>`;
}

function calculatePayouts(betsSnap,results){
  let totalPool=0;const allBets={};
  betsSnap.forEach(b=>{const d=b.data();allBets[b.id]=d;totalPool+=(d.wheel1?.amount||0)+(d.wheel2?.amount||0)+(d.wheel3?.amount||0);});
  const winStakes={};let totalWin=0;
  for(const [uid,bets] of Object.entries(allBets)){
    let stake=0;
    WHEEL_KEYS.forEach((k,i)=>{const b=bets[k];if(i>=activeWheels.length)return;if(b&&b.amount>0&&b.pick&&b.pick===results[k])stake+=b.amount;});
    if(stake>0){winStakes[uid]=stake;totalWin+=stake;}
  }
  if(totalWin===0)return{};
  const losingPool=totalPool-totalWin;
  
  
  
  
  
  const numBettors=Object.keys(allBets).length;
  const houseBonusRate=numBettors<=1?2.0:numBettors===2?0.5:numBettors===3?0.3:0.15;
  const payouts={};
  for(const [uid,stake] of Object.entries(winStakes)){
    const shareOfLosing=losingPool>0?(stake/totalWin)*losingPool:0;
    const houseBonus=Math.floor(stake*houseBonusRate);
    payouts[uid]=Math.floor(stake+shareOfLosing)+houseBonus;
  }
  return payouts;
}

function pushEvidenceToOverlay(){
  if(!desktopWS||desktopWS.readyState!==WebSocket.OPEN)return;
  desktopWS.send(JSON.stringify({type:"evidence-full",state:localEvidence}));
}

function pushResetToOverlay(){
  if(!desktopWS||desktopWS.readyState!==WebSocket.OPEN)return;
  desktopWS.send(JSON.stringify({type:"evidence-reset"}));
}

let desktopWS=null;
function connectDesktopLink(code){
  if(desktopWS){desktopWS.close();desktopWS=null;}
  try{desktopWS=new WebSocket("ws://localhost:37421");}catch(e){setLinkStatus("error");return;}
  desktopWS.addEventListener("open",()=>desktopWS.send(JSON.stringify({type:"auth",code})));
  desktopWS.addEventListener("message",ev=>{
    try{
      const msg=JSON.parse(ev.data);
      if(msg.type==="connected"){setLinkStatus("connected");if(msg.state){Object.entries(msg.state).forEach(([id,st])=>{localEvidence[id]=st;});renderCheatSheet();}}
      
      else if(msg.type==="evidence-update"){localEvidence[msg.id]=msg.state;renderCheatSheet();if(currentLobbyCode)updateDoc(doc(db,"lobbies",currentLobbyCode),{[`evidence.${msg.id}`]:msg.state}).catch(e=>console.error(e));}
      
      else if(msg.type==="evidence-reset"){EVIDENCE.forEach(e=>{localEvidence[e.id]="none";});renderCheatSheet();if(currentLobbyCode){const reset={};EVIDENCE.forEach(e=>{reset[`evidence.${e.id}`]="none";});updateDoc(doc(db,"lobbies",currentLobbyCode),reset).catch(e=>console.error(e));}} 
      else if(msg.type==="speed-update"){speedTypeFilter=msg.speedType??null;speedLosFilter=msg.speedLos??false;applySpeedUI();renderCheatSheet();pushSpeedToFirestore();}
    }catch(_){}
  });
  desktopWS.addEventListener("close",()=>{desktopWS=null;setLinkStatus("disconnected");});
  desktopWS.addEventListener("error",()=>setLinkStatus("error"));
}
function setLinkStatus(status){
  const el=$("link-status-text"),dot=$("link-status-dot");if(!el||!dot)return;
  const map={idle:{text:"Not connected",color:"#555"},connected:{text:"Overlay linked",color:"#7fd67f"},disconnected:{text:"Disconnected",color:"#e06c6c"},error:{text:"Could not connect",color:"#e06c6c"}};
  const s=map[status]||map.idle;el.textContent=s.text;el.style.color=s.color;dot.style.background=s.color;
}

function showPayoutPopup(data){
  const results=data.results||{},payouts=data.payouts||{},players=data.players||{},wheels=data.wheels||activeWheels;
  $("popup-results-display").innerHTML=WHEEL_KEYS.map((k,i)=>{
    const typeKey=wheels[i];if(!typeKey)return"";
    const label=WHEEL_DEFS[typeKey]?.label||`Wheel ${i+1}`;
    return`<div class="popup-result-row"><span class="popup-result-label">${label}</span><span class="popup-result-value">${results[k]||"--"}</span></div>`;
  }).join("");
  $("popup-payouts-display").innerHTML=Object.keys(payouts).length===0
    ?`<p style="color:#aaa;text-align:center;">No winners this round.</p>`
    :Object.entries(payouts).map(([uid,amt])=>`<div class="popup-payout-row"><span>${players[uid]||"Player"}</span><span class="payout-amount">+${amt} ${currencyLabel}</span></div>`).join("");
  const myAmt=payouts[currentUid]||0,msg=$("popup-your-payout");
  msg.textContent=myAmt>0?`You won ${myAmt} ${currencyLabel}!`:"Better luck next round.";
  msg.style.color=myAmt>0?"#7fd67f":"#aaa";
  $("payout-popup").classList.remove("hidden");
}