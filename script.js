import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  update,
  onValue,
  get,
  runTransaction,
  onDisconnect
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-database.js";

/*
  IMPORTANT:
  This is your Firebase config.
  If Firebase Console shows a different config, change only this part.
*/
const firebaseConfig = {
  apiKey: "AIzaSyCgIujywiokMzJrY_ZWMESozxRxwrMocGI",
  authDomain: "v2-chess-fdc1a.firebaseapp.com",
  projectId: "v2-chess-fdc1a",
  storageBucket: "v2-chess-fdc1a.firebasestorage.app",
  messagingSenderId: "REPLACE_IF_NEEDED",
  appId: "REPLACE_IF_NEEDED",
  databaseURL: "https://v2-chess-fdc1a-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const joinScreen = document.getElementById("joinScreen");
const gameScreen = document.getElementById("gameScreen");
const gameArea = document.getElementById("gameArea");
const lobbyStatus = document.getElementById("lobbyStatus");
const joinedCountText = document.getElementById("joinedCountText");
const nameInput = document.getElementById("nameInput");
const roomInput = document.getElementById("roomInput");
const createRoomBtn = document.getElementById("createRoomBtn");
const loadRoomBtn = document.getElementById("loadRoomBtn");
const slotPanel = document.getElementById("slotPanel");
const slotButtons = document.querySelectorAll(".slot-btn");
const joinMessage = document.getElementById("joinMessage");
const roomCodeCopy = document.getElementById("roomCodeCopy");
const copyRoomBtn = document.getElementById("copyRoomBtn");

const board = document.getElementById("board");
const turnText = document.getElementById("turnText");
const moveHistory = document.getElementById("moveHistory");
const whiteTimerEl = document.getElementById("whiteTimer");
const blackTimerEl = document.getElementById("blackTimer");
const roomText = document.getElementById("roomText");
const playerText = document.getElementById("playerText");

const playerStatusEls = {
  White1: document.getElementById("White1Status"),
  Black1: document.getElementById("Black1Status"),
  White2: document.getElementById("White2Status"),
  Black2: document.getElementById("Black2Status")
};

let roomCode = "";
let myPlayer = "";
let myName = "";
let mySessionId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random();
let roomRef = null;
let roomListenerStarted = false;
let localUpdatingFromFirebase = false;
let latestPlayers = {};
let gameStarted = false;
let gameClockStarted = false;

let selectedPiece = null;
let selectedRow = null;
let selectedCol = null;

let currentTurn = "White1";
const turnOrder = ["White1", "Black1", "White2", "Black2"];
let gameOver = false;

let pieces = [];
let moves = [];
let castlingRights = {};
let enPassantTarget = null;
let waitingPromotion = false;

let whiteTime = 600;
let blackTime = 600;
let timerInterval = null;
let lastTimerUpdate = Date.now();

const startingPieces = [
  ["♜","♞","♝","♛","♚","♝","♞","♜"],
  ["♟","♟","♟","♟","♟","♟","♟","♟"],
  ["","","","","","","",""],
  ["","","","","","","",""],
  ["","","","","","","",""],
  ["","","","","","","",""],
  ["♙","♙","♙","♙","♙","♙","♙","♙"],
  ["♖","♘","♗","♕","♔","♗","♘","♖"]
];

const files = ["a","b","c","d","e","f","g","h"];

function emptyPlayers() {
  return {
    White1: null,
    Black1: null,
    White2: null,
    Black2: null
  };
}

function createNewGameState(creatorName = "") {
  return {
    roomCode: roomCode || "",
    createdAt: Date.now(),
    createdBy: creatorName,
    pieces: startingPieces.map(row => [...row]),
    currentTurn: "White1",
    gameOver: false,
    gameStarted: false,
    gameClockStarted: false,
    waitingPromotion: false,
    moves: [],
    enPassantTarget: null,
    whiteTime: 600,
    blackTime: 600,
    lastTimerUpdate: Date.now(),
    castlingRights: {
      whiteKingMoved: false,
      whiteLeftRookMoved: false,
      whiteRightRookMoved: false,
      blackKingMoved: false,
      blackLeftRookMoved: false,
      blackRightRookMoved: false
    },
    players: emptyPlayers()
  };
}

createRoomBtn.addEventListener("click", createRoom);
loadRoomBtn.addEventListener("click", loadRoom);
copyRoomBtn.addEventListener("click", copyRoomCode);
slotButtons.forEach(btn => btn.addEventListener("click", () => claimSlot(btn.dataset.player)));

async function createRoom() {
  myName = nameInput.value.trim();
  if (myName.length < 2) {
    alert("Enter your name first.");
    return;
  }

  let code = "";
  let tries = 0;

  while (tries < 10) {
    code = generateRoomCode();
    const newRoomRef = ref(db, "rooms/" + code);
    const snapshot = await get(newRoomRef);

    if (!snapshot.exists()) {
      const newGameState = createNewGameState(myName);
      newGameState.roomCode = code;
      await set(newRoomRef, newGameState);
      roomInput.value = code;
      await openLobby(code, "Room created. Choose your slot.");
      return;
    }

    tries++;
  }

  alert("Could not create a room. Try again.");
}

async function loadRoom() {
  myName = nameInput.value.trim();
  const code = cleanRoomCode(roomInput.value);

  if (myName.length < 2) {
    alert("Enter your name first.");
    return;
  }

  if (code.length < 3) {
    alert("Room Code must be at least 3 characters.");
    return;
  }

  const newRoomRef = ref(db, "rooms/" + code);
  const snapshot = await get(newRoomRef);

  if (!snapshot.exists()) {
    alert("Room not found. Check the code or create a new room.");
    return;
  }

  await openLobby(code, "Room loaded. Choose your slot.");
}

async function openLobby(code, message) {
  roomCode = cleanRoomCode(code);
  roomRef = ref(db, "rooms/" + roomCode);
  roomCodeCopy.value = roomCode;
  joinMessage.textContent = message;
  slotPanel.classList.remove("hidden");

  if (!roomListenerStarted) {
    listenRoom();
    roomListenerStarted = true;
  }
}

async function claimSlot(player) {
  myName = nameInput.value.trim();

  if (!roomRef || !roomCode) {
    alert("Create or load a room first.");
    return;
  }

  if (myName.length < 2) {
    alert("Enter your name first.");
    return;
  }

  const playerRef = ref(db, "rooms/" + roomCode + "/players/" + player);

  const result = await runTransaction(playerRef, currentValue => {
    if (currentValue === null || currentValue === false) {
      return {
        name: myName,
        sessionId: mySessionId,
        joinedAt: Date.now()
      };
    }

    if (currentValue && currentValue.sessionId === mySessionId) {
      return currentValue;
    }

    return;
  });

  if (!result.committed) {
    alert(player + " is already taken. Choose another slot.");
    return;
  }

  myPlayer = player;
  await onDisconnect(playerRef).remove();

  joinScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");

  roomText.textContent = "Room: " + roomCode;
  playerText.textContent = "You are: " + myPlayer + " (" + myName + ")";

  startTimer();
}

function listenRoom() {
  onValue(roomRef, async (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    localUpdatingFromFirebase = true;

    pieces = data.pieces || startingPieces.map(row => [...row]);
    currentTurn = data.currentTurn || "White1";
    gameOver = data.gameOver || false;
    gameStarted = data.gameStarted || false;
    gameClockStarted = data.gameClockStarted || false;
    waitingPromotion = data.waitingPromotion || false;
    moves = data.moves || [];
    castlingRights = data.castlingRights || createNewGameState().castlingRights;
    enPassantTarget = data.enPassantTarget || null;
    whiteTime = data.whiteTime ?? 600;
    blackTime = data.blackTime ?? 600;
    lastTimerUpdate = data.lastTimerUpdate || Date.now();
    latestPlayers = normalizePlayers(data.players || emptyPlayers());

    updatePlayerStatuses(latestPlayers);
    updateSlotButtons(latestPlayers);
    updateHistory();
    updateTimers();

    const joinedCount = getJoinedCount(latestPlayers);
    const allJoined = joinedCount === 4;
    joinedCountText.textContent = joinedCount + "/4";

    if (allJoined && !gameStarted && myPlayer) {
      gameStarted = true;
      await update(roomRef, { gameStarted: true, lastTimerUpdate: Date.now() });
    }

    if (allJoined && gameStarted) {
      lobbyStatus.classList.add("hidden");
      gameArea.classList.remove("hidden");
      createBoard();
    } else {
      lobbyStatus.classList.remove("hidden");
      gameArea.classList.add("hidden");
      turnText.textContent = "Waiting for players... " + joinedCount + "/4";
      board.innerHTML = "";
    }

    localUpdatingFromFirebase = false;
  });
}

function updatePlayerStatuses(players) {
  for (const player of turnOrder) {
    const playerData = players[player];
    const name = getPlayerName(playerData);
    playerStatusEls[player].textContent = player + ": " + (name ? name : "empty");
    playerStatusEls[player].className = name ? "joined" : "";

    if (gameStarted && !gameOver && player === currentTurn) {
      playerStatusEls[player].classList.add("active-turn");
    }
  }
}

function updateSlotButtons(players) {
  slotButtons.forEach(btn => {
    const player = btn.dataset.player;
    const playerData = players[player];
    const name = getPlayerName(playerData);
    const isMine = playerData && playerData.sessionId === mySessionId;

    btn.disabled = Boolean(name) && !isMine;
    btn.classList.toggle("taken", Boolean(name) && !isMine);
    btn.classList.toggle("mine", Boolean(isMine));
    btn.textContent = name ? player + " - " + name : player;
  });
}

async function saveGameState(extra = {}) {
  if (!roomRef || localUpdatingFromFirebase) return;

  await update(roomRef, {
    pieces,
    currentTurn,
    gameOver,
    gameStarted,
    waitingPromotion,
    moves,
    castlingRights,
    enPassantTarget,
    whiteTime,
    blackTime,
    lastTimerUpdate,
    ...extra
  });
}

function startTimer() {
  clearInterval(timerInterval);

  timerInterval = setInterval(async () => {
    if (!roomRef) return;
    if (!gameStarted || !gameClockStarted || getJoinedCount(latestPlayers) < 4) return;
    if (gameOver || waitingPromotion) return;

    /*
      Only the player whose turn it is decreases the timer.
      This prevents the timer from running 4x faster on 4 computers.
    */
    if (myPlayer !== currentTurn) return;

    if (currentTurn.includes("White")) {
      whiteTime--;
      if (whiteTime <= 0) {
        whiteTime = 0;
        gameOver = true;
        turnText.textContent = "BLACK WINS ON TIME!";
        playSound("mate");
      }
    } else {
      blackTime--;
      if (blackTime <= 0) {
        blackTime = 0;
        gameOver = true;
        turnText.textContent = "WHITE WINS ON TIME!";
        playSound("mate");
      }
    }

    lastTimerUpdate = Date.now();
    updateTimers();
    await saveGameState();
  }, 1000);
}

function updateTimers() {
  whiteTimerEl.textContent = formatTime(whiteTime);
  blackTimerEl.textContent = formatTime(blackTime);
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function cleanRoomCode(value) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function normalizePlayers(players) {
  const result = emptyPlayers();

  for (const player of turnOrder) {
    const value = players[player];

    if (value === true) {
      result[player] = { name: player, sessionId: "old-slot" };
    } else if (value && typeof value === "object") {
      result[player] = value;
    } else {
      result[player] = null;
    }
  }

  return result;
}

function getPlayerName(playerData) {
  if (!playerData) return "";
  if (playerData === true) return "joined";
  return playerData.name || "joined";
}

function getJoinedCount(players) {
  return turnOrder.filter(player => Boolean(getPlayerName(players[player]))).length;
}

async function copyRoomCode() {
  if (!roomCode) return;
  try {
    await navigator.clipboard.writeText(roomCode);
    copyRoomBtn.textContent = "Copied!";
    setTimeout(() => copyRoomBtn.textContent = "Copy Room Code", 1200);
  } catch (error) {
    roomCodeCopy.select();
    document.execCommand("copy");
  }
}

function playSound(type) {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const audio = new AudioContextClass();
    const osc = audio.createOscillator();
    const gain = audio.createGain();

    osc.connect(gain);
    gain.connect(audio.destination);

    if (type === "move") osc.frequency.value = 500;
    if (type === "capture") osc.frequency.value = 250;
    if (type === "check") osc.frequency.value = 750;
    if (type === "mate") osc.frequency.value = 120;

    gain.gain.value = 0.12;
    osc.start();
    osc.stop(audio.currentTime + 0.15);
  } catch (error) {}
}

function isWhitePiece(piece) {
  return ["♙","♖","♘","♗","♕","♔"].includes(piece);
}

function isBlackPiece(piece) {
  return ["♟","♜","♞","♝","♛","♚"].includes(piece);
}

function getTurnColor() {
  return currentTurn.includes("White") ? "white" : "black";
}

function sameColor(a, b) {
  return (isWhitePiece(a) && isWhitePiece(b)) ||
         (isBlackPiece(a) && isBlackPiece(b));
}

function isKing(piece) {
  return piece === "♔" || piece === "♚";
}

function getSquareName(row, col) {
  return files[col] + (8 - row);
}

function createBoard() {
  board.innerHTML = "";

  let text = "Turn: " + currentTurn;

  if (myPlayer !== currentTurn && !gameOver) {
    text += " | wait for your turn";
  }

  if (myPlayer === currentTurn && !gameOver) {
    text += " | your move";
  }

  if (!gameOver && !waitingPromotion) {
    const color = getTurnColor();

    if (!hasAnyLegalMove(color)) {
      gameOver = true;

      if (isKingInCheck(color)) {
        const winner = color === "white" ? "BLACK" : "WHITE";
        text = winner + " WINS BY CHECKMATE!";
      } else {
        text = "STALEMATE!";
      }

      playSound("mate");
      saveGameState();
    } else {
      if (isKingInCheck("white")) text += " | White King is in CHECK!";
      if (isKingInCheck("black")) text += " | Black King is in CHECK!";
    }
  }

  turnText.textContent = text;

  const legalMoves = getLegalMovesForSelected();

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const square = document.createElement("div");
      const piece = pieces[row][col];

      square.classList.add("square");
      square.classList.add((row + col) % 2 === 0 ? "light" : "dark");

      if (isWhitePiece(piece)) square.classList.add("white-piece");
      if (isBlackPiece(piece)) square.classList.add("black-piece");

      if (selectedRow === row && selectedCol === col) {
        square.classList.add("selected");
      }

      const moveData = legalMoves.find(m => m.row === row && m.col === col);
      if (moveData) {
        if (piece === "") square.classList.add("move-highlight");
        else square.classList.add("capture-highlight");
      }

      const pieceSpan = document.createElement("span");
      pieceSpan.textContent = piece;
      square.appendChild(pieceSpan);

      if (col === 0) {
        const rankLabel = document.createElement("div");
        rankLabel.classList.add("board-label", "rank-label");
        rankLabel.textContent = 8 - row;
        square.appendChild(rankLabel);
      }

      if (row === 7) {
        const fileLabel = document.createElement("div");
        fileLabel.classList.add("board-label", "file-label");
        fileLabel.textContent = files[col];
        square.appendChild(fileLabel);
      }

      square.addEventListener("click", () => handleClick(row, col));
      board.appendChild(square);
    }
  }
}

function getLegalMovesForSelected() {
  const result = [];

  if (selectedPiece === null) return result;
  if (myPlayer !== currentTurn) return result;

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if (isLegalMove(selectedPiece, selectedRow, selectedCol, row, col)) {
        result.push({ row, col });
      }
    }
  }

  return result;
}

function handleClick(row, col) {
  if (gameOver || waitingPromotion) return;

  if (myPlayer !== currentTurn) {
    alert("It is not your turn.");
    return;
  }

  const clickedPiece = pieces[row][col];

  if (selectedPiece === null) {
    if (clickedPiece === "") return;
    if (currentTurn.includes("White") && !isWhitePiece(clickedPiece)) return;
    if (currentTurn.includes("Black") && !isBlackPiece(clickedPiece)) return;

    selectedPiece = clickedPiece;
    selectedRow = row;
    selectedCol = col;

    createBoard();
    return;
  }

  if (clickedPiece !== "" && sameColor(selectedPiece, clickedPiece)) {
    selectedPiece = clickedPiece;
    selectedRow = row;
    selectedCol = col;
    createBoard();
    return;
  }

  if (!isLegalMove(selectedPiece, selectedRow, selectedCol, row, col)) {
    selectedPiece = null;
    selectedRow = null;
    selectedCol = null;
    createBoard();
    return;
  }

  makeMove(row, col);
}

async function makeMove(row, col) {
  const fromSquare = getSquareName(selectedRow, selectedCol);
  const toSquare = getSquareName(row, col);
  const movingPiece = selectedPiece;

  let capturedPiece = pieces[row][col];

  const oldRow = selectedRow;
  const oldCol = selectedCol;

  const isCastlingMove =
    (movingPiece === "♔" || movingPiece === "♚") &&
    oldRow === row &&
    Math.abs(col - oldCol) === 2;

  const isEnPassantMove =
    (movingPiece === "♙" || movingPiece === "♟") &&
    enPassantTarget !== null &&
    row === enPassantTarget.row &&
    col === enPassantTarget.col &&
    pieces[row][col] === "";

  pieces[row][col] = movingPiece;
  pieces[oldRow][oldCol] = "";

  if (isEnPassantMove) {
    capturedPiece = pieces[enPassantTarget.capturedPawnRow][enPassantTarget.capturedPawnCol];
    pieces[enPassantTarget.capturedPawnRow][enPassantTarget.capturedPawnCol] = "";
  }

  if (isCastlingMove) {
    if (col === 6) {
      pieces[row][5] = pieces[row][7];
      pieces[row][7] = "";
    }

    if (col === 2) {
      pieces[row][3] = pieces[row][0];
      pieces[row][0] = "";
    }
  }

  updateCastlingRights(movingPiece, oldRow, oldCol, capturedPiece, row, col);

  enPassantTarget = null;

  if (movingPiece === "♙" && oldRow === 6 && row === 4) {
    enPassantTarget = { row: 5, col: oldCol, capturedPawnRow: 4, capturedPawnCol: oldCol };
  }

  if (movingPiece === "♟" && oldRow === 1 && row === 3) {
    enPassantTarget = { row: 2, col: oldCol, capturedPawnRow: 3, capturedPawnCol: oldCol };
  }

  let moveText = currentTurn + ": " + movingPiece + " " + fromSquare + " → " + toSquare;

  if (isCastlingMove) moveText += " castling";
  if (isEnPassantMove) moveText += " en passant";
  if (capturedPiece !== "") moveText += " captured " + capturedPiece;

  selectedPiece = null;
  selectedRow = null;
  selectedCol = null;

  if (movingPiece === "♙" && row === 0) {
    showPromotion(row, col, "white", moveText);
    return;
  }

  if (movingPiece === "♟" && row === 7) {
    showPromotion(row, col, "black", moveText);
    return;
  }

  moves.push(moveText);
  gameClockStarted = true;
  updateHistory();

  playSound(capturedPiece !== "" ? "capture" : "move");

  nextTurn();

  if (!gameOver && isKingInCheck(getTurnColor())) {
    playSound("check");
  }

  await saveGameState();
  createBoard();
}

function showPromotion(row, col, color, moveText) {
  waitingPromotion = true;
  saveGameState();
  createBoard();

  const oldBox = document.getElementById("promotionBox");
  if (oldBox) oldBox.remove();

  const box = document.createElement("div");
  box.id = "promotionBox";

  const title = document.createElement("div");
  title.textContent = "Choose a piece";
  title.style.marginBottom = "10px";
  box.appendChild(title);

  const options = color === "white"
    ? ["♕", "♖", "♗", "♘"]
    : ["♛", "♜", "♝", "♞"];

  options.forEach(piece => {
    const btn = document.createElement("button");
    btn.textContent = piece;

    btn.onclick = async () => {
      pieces[row][col] = piece;
      moves.push(moveText + " promoted to " + piece);
      gameClockStarted = true;
      updateHistory();

      waitingPromotion = false;
      box.remove();

      playSound("move");
      nextTurn();

      if (!gameOver && isKingInCheck(getTurnColor())) {
        playSound("check");
      }

      await saveGameState();
      createBoard();
    };

    box.appendChild(btn);
  });

  document.body.appendChild(box);
}

function updateCastlingRights(piece, fromRow, fromCol, capturedPiece, toRow, toCol) {
  if (piece === "♔") castlingRights.whiteKingMoved = true;
  if (piece === "♚") castlingRights.blackKingMoved = true;

  if (piece === "♖" && fromRow === 7 && fromCol === 0) castlingRights.whiteLeftRookMoved = true;
  if (piece === "♖" && fromRow === 7 && fromCol === 7) castlingRights.whiteRightRookMoved = true;

  if (piece === "♜" && fromRow === 0 && fromCol === 0) castlingRights.blackLeftRookMoved = true;
  if (piece === "♜" && fromRow === 0 && fromCol === 7) castlingRights.blackRightRookMoved = true;

  if (capturedPiece === "♖" && toRow === 7 && toCol === 0) castlingRights.whiteLeftRookMoved = true;
  if (capturedPiece === "♖" && toRow === 7 && toCol === 7) castlingRights.whiteRightRookMoved = true;

  if (capturedPiece === "♜" && toRow === 0 && toCol === 0) castlingRights.blackLeftRookMoved = true;
  if (capturedPiece === "♜" && toRow === 0 && toCol === 7) castlingRights.blackRightRookMoved = true;
}

function updateHistory() {
  moveHistory.innerHTML = "";

  for (let i = 0; i < moves.length; i++) {
    const li = document.createElement("li");
    li.textContent = moves[i];
    moveHistory.appendChild(li);
  }

  moveHistory.scrollTop = moveHistory.scrollHeight;
}

function isLegalMove(piece, fromRow, fromCol, toRow, toCol) {
  if (!isInsideBoard(toRow, toCol)) return false;
  if (isKing(pieces[toRow][toCol])) return false;
  if (!isValidMove(piece, fromRow, fromCol, toRow, toCol)) return false;

  const target = pieces[toRow][toCol];
  const oldEnPassantTarget = enPassantTarget;
  let capturedEnPassantPiece = "";
  let capturedEnPassantRow = null;
  let capturedEnPassantCol = null;

  const enPassantSimulation =
    (piece === "♙" || piece === "♟") &&
    oldEnPassantTarget !== null &&
    toRow === oldEnPassantTarget.row &&
    toCol === oldEnPassantTarget.col &&
    target === "";

  const castlingSimulation =
    (piece === "♔" || piece === "♚") &&
    fromRow === toRow &&
    Math.abs(toCol - fromCol) === 2;

  pieces[toRow][toCol] = piece;
  pieces[fromRow][fromCol] = "";

  if (enPassantSimulation) {
    capturedEnPassantRow = oldEnPassantTarget.capturedPawnRow;
    capturedEnPassantCol = oldEnPassantTarget.capturedPawnCol;
    capturedEnPassantPiece = pieces[capturedEnPassantRow][capturedEnPassantCol];
    pieces[capturedEnPassantRow][capturedEnPassantCol] = "";
  }

  if (castlingSimulation) {
    if (toCol === 6) {
      pieces[toRow][5] = pieces[toRow][7];
      pieces[toRow][7] = "";
    }

    if (toCol === 2) {
      pieces[toRow][3] = pieces[toRow][0];
      pieces[toRow][0] = "";
    }
  }

  const color = isWhitePiece(piece) ? "white" : "black";
  const kingStillInCheck = isKingInCheck(color);

  if (castlingSimulation) {
    if (toCol === 6) {
      pieces[toRow][7] = pieces[toRow][5];
      pieces[toRow][5] = "";
    }

    if (toCol === 2) {
      pieces[toRow][0] = pieces[toRow][3];
      pieces[toRow][3] = "";
    }
  }

  if (enPassantSimulation) {
    pieces[capturedEnPassantRow][capturedEnPassantCol] = capturedEnPassantPiece;
  }

  pieces[fromRow][fromCol] = piece;
  pieces[toRow][toCol] = target;

  return !kingStillInCheck;
}

function isValidMove(piece, fromRow, fromCol, toRow, toCol) {
  if (!isInsideBoard(toRow, toCol)) return false;

  const target = pieces[toRow][toCol];

  if (fromRow === toRow && fromCol === toCol) return false;
  if (target !== "" && sameColor(piece, target)) return false;

  const rowDiff = toRow - fromRow;
  const colDiff = toCol - fromCol;

  if (piece === "♙") {
    if (fromCol === toCol && target === "" && rowDiff === -1) return true;
    if (fromRow === 6 && fromCol === toCol && target === "" && rowDiff === -2 && pieces[5][fromCol] === "") return true;
    if (Math.abs(colDiff) === 1 && rowDiff === -1 && target !== "" && isBlackPiece(target)) return true;

    if (
      enPassantTarget !== null &&
      Math.abs(colDiff) === 1 &&
      rowDiff === -1 &&
      toRow === enPassantTarget.row &&
      toCol === enPassantTarget.col
    ) {
      return true;
    }

    return false;
  }

  if (piece === "♟") {
    if (fromCol === toCol && target === "" && rowDiff === 1) return true;
    if (fromRow === 1 && fromCol === toCol && target === "" && rowDiff === 2 && pieces[2][fromCol] === "") return true;
    if (Math.abs(colDiff) === 1 && rowDiff === 1 && target !== "" && isWhitePiece(target)) return true;

    if (
      enPassantTarget !== null &&
      Math.abs(colDiff) === 1 &&
      rowDiff === 1 &&
      toRow === enPassantTarget.row &&
      toCol === enPassantTarget.col
    ) {
      return true;
    }

    return false;
  }

  if (piece === "♖" || piece === "♜") {
    return (fromRow === toRow || fromCol === toCol) && pathClear(fromRow, fromCol, toRow, toCol);
  }

  if (piece === "♗" || piece === "♝") {
    return Math.abs(rowDiff) === Math.abs(colDiff) && pathClear(fromRow, fromCol, toRow, toCol);
  }

  if (piece === "♕" || piece === "♛") {
    return (fromRow === toRow || fromCol === toCol || Math.abs(rowDiff) === Math.abs(colDiff)) &&
           pathClear(fromRow, fromCol, toRow, toCol);
  }

  if (piece === "♘" || piece === "♞") {
    return (
      (Math.abs(rowDiff) === 2 && Math.abs(colDiff) === 1) ||
      (Math.abs(rowDiff) === 1 && Math.abs(colDiff) === 2)
    );
  }

  if (piece === "♔" || piece === "♚") {
    if (Math.abs(rowDiff) <= 1 && Math.abs(colDiff) <= 1) return true;

    if (piece === "♔") return canCastle("white", fromRow, fromCol, toRow, toCol);
    if (piece === "♚") return canCastle("black", fromRow, fromCol, toRow, toCol);
  }

  return false;
}

function canCastle(color, fromRow, fromCol, toRow, toCol) {
  const isWhite = color === "white";
  const row = isWhite ? 7 : 0;

  if (fromRow !== row || toRow !== row || fromCol !== 4) return false;
  if (isKingInCheck(color)) return false;

  const enemyColor = isWhite ? "black" : "white";

  if (toCol === 6) {
    if (isWhite && castlingRights.whiteKingMoved) return false;
    if (isWhite && castlingRights.whiteRightRookMoved) return false;
    if (!isWhite && castlingRights.blackKingMoved) return false;
    if (!isWhite && castlingRights.blackRightRookMoved) return false;

    const rook = isWhite ? "♖" : "♜";
    if (pieces[row][7] !== rook) return false;
    if (pieces[row][5] !== "" || pieces[row][6] !== "") return false;
    if (isSquareAttacked(row, 5, enemyColor)) return false;
    if (isSquareAttacked(row, 6, enemyColor)) return false;

    return true;
  }

  if (toCol === 2) {
    if (isWhite && castlingRights.whiteKingMoved) return false;
    if (isWhite && castlingRights.whiteLeftRookMoved) return false;
    if (!isWhite && castlingRights.blackKingMoved) return false;
    if (!isWhite && castlingRights.blackLeftRookMoved) return false;

    const rook = isWhite ? "♖" : "♜";
    if (pieces[row][0] !== rook) return false;
    if (pieces[row][1] !== "" || pieces[row][2] !== "" || pieces[row][3] !== "") return false;
    if (isSquareAttacked(row, 3, enemyColor)) return false;
    if (isSquareAttacked(row, 2, enemyColor)) return false;

    return true;
  }

  return false;
}

function pathClear(fromRow, fromCol, toRow, toCol) {
  const rowStep = Math.sign(toRow - fromRow);
  const colStep = Math.sign(toCol - fromCol);

  let row = fromRow + rowStep;
  let col = fromCol + colStep;

  while (row !== toRow || col !== toCol) {
    if (pieces[row][col] !== "") return false;
    row += rowStep;
    col += colStep;
  }

  return true;
}

function isInsideBoard(row, col) {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

function findKing(color) {
  const king = color === "white" ? "♔" : "♚";

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if (pieces[row][col] === king) return { row, col };
    }
  }

  return null;
}

function isKingInCheck(color) {
  const kingPos = findKing(color);
  if (!kingPos) return false;

  const attackerColor = color === "white" ? "black" : "white";
  return isSquareAttacked(kingPos.row, kingPos.col, attackerColor);
}

function isSquareAttacked(row, col, byColor) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = pieces[r][c];

      if (piece === "") continue;
      if (byColor === "white" && !isWhitePiece(piece)) continue;
      if (byColor === "black" && !isBlackPiece(piece)) continue;

      if (piece === "♔" || piece === "♚") {
        if (Math.abs(row - r) <= 1 && Math.abs(col - c) <= 1) return true;
        continue;
      }

      if (piece === "♙") {
        if (row === r - 1 && Math.abs(col - c) === 1) return true;
        continue;
      }

      if (piece === "♟") {
        if (row === r + 1 && Math.abs(col - c) === 1) return true;
        continue;
      }

      if (isValidMove(piece, r, c, row, col)) return true;
    }
  }

  return false;
}

function hasAnyLegalMove(color) {
  for (let fromRow = 0; fromRow < 8; fromRow++) {
    for (let fromCol = 0; fromCol < 8; fromCol++) {
      const piece = pieces[fromRow][fromCol];

      if (piece === "") continue;
      if (color === "white" && !isWhitePiece(piece)) continue;
      if (color === "black" && !isBlackPiece(piece)) continue;

      for (let toRow = 0; toRow < 8; toRow++) {
        for (let toCol = 0; toCol < 8; toCol++) {
          if (isLegalMove(piece, fromRow, fromCol, toRow, toCol)) return true;
        }
      }
    }
  }

  return false;
}

function nextTurn() {
  const index = turnOrder.indexOf(currentTurn);
  currentTurn = turnOrder[(index + 1) % turnOrder.length];
}
