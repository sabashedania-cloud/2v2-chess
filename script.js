import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  update,
  onValue,
  get
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCgIujywiokMzJrY_ZWMESozxRxwrMocGI",
  authDomain: "v2-chess-fdc1a.firebaseapp.com",
  projectId: "v2-chess-fdc1a",
  storageBucket: "v2-chess-fdc1a.firebasestorage.app",
  messagingSenderId: "904445661963",
  appId: "1:904445661963:web:bfa49b4766a8f4a4e6080e",
  databaseURL: "https://v2-chess-fdc1a-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const joinScreen = document.getElementById("joinScreen");
const gameScreen = document.getElementById("gameScreen");
const nameInput = document.getElementById("nameInput");
const roomInput = document.getElementById("roomInput");
const playerSelect = document.getElementById("playerSelect");
const joinBtn = document.getElementById("joinBtn");

const board = document.getElementById("board");
const turnText = document.getElementById("turnText");
const restartBtn = document.getElementById("restartBtn");
const moveHistory = document.getElementById("moveHistory");
const whiteTimerEl = document.getElementById("whiteTimer");
const blackTimerEl = document.getElementById("blackTimer");
const roomText = document.getElementById("roomText");
const playerText = document.getElementById("playerText");

const gameOverOverlay = document.getElementById("gameOverOverlay");
const gameOverTitle = document.getElementById("gameOverTitle");
const gameOverMessage = document.getElementById("gameOverMessage");
const closeGameOverBtn = document.getElementById("closeGameOverBtn");

const playerStatusEls = {
  White1: document.getElementById("White1Status"),
  Black1: document.getElementById("Black1Status"),
  White2: document.getElementById("White2Status"),
  Black2: document.getElementById("Black2Status")
};

let roomCode = "";
let myPlayer = "";
let myName = "";
let roomRef = null;
let localUpdatingFromFirebase = false;
let lastGameOverText = "";

let selectedPiece = null;
let selectedRow = null;
let selectedCol = null;

let currentTurn = "White1";
const turnOrder = ["White1", "Black1", "White2", "Black2"];
let gameOver = false;
let winnerText = "";

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

function createEmptyPlayers() {
  return {
    White1: { joined: false, name: "" },
    Black1: { joined: false, name: "" },
    White2: { joined: false, name: "" },
    Black2: { joined: false, name: "" }
  };
}

function normalizePlayers(players = {}) {
  const normalized = createEmptyPlayers();

  for (const player of turnOrder) {
    const value = players[player];

    if (value === true) {
      normalized[player] = { joined: true, name: player };
    } else if (value && typeof value === "object") {
      normalized[player] = {
        joined: Boolean(value.joined),
        name: value.name || player
      };
    }
  }

  return normalized;
}

function createNewGameState() {
  return {
    pieces: startingPieces.map(row => [...row]),
    currentTurn: "White1",
    gameOver: false,
    winnerText: "",
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
    players: createEmptyPlayers()
  };
}

joinBtn.addEventListener("click", joinRoom);
closeGameOverBtn.addEventListener("click", () => gameOverOverlay.classList.add("hidden"));

async function joinRoom() {
  const code = roomInput.value.trim();
  const typedName = nameInput.value.trim();

  if (typedName.length < 2) {
    alert("Please enter your name.");
    return;
  }

  if (code.length < 3) {
    alert("Room Code must be at least 3 characters.");
    return;
  }

  roomCode = code;
  myPlayer = playerSelect.value;
  myName = typedName;
  roomRef = ref(db, "rooms/" + roomCode);

  const snapshot = await get(roomRef);

  if (!snapshot.exists()) {
    await set(roomRef, createNewGameState());
  }

  const freshSnapshot = await get(roomRef);
  const roomData = freshSnapshot.val();
  const players = normalizePlayers(roomData.players);

  if (players[myPlayer] && players[myPlayer].joined === true) {
    alert(myPlayer + " is already taken. Please choose another player.");
    return;
  }

  await update(roomRef, {
    ["players/" + myPlayer]: {
      joined: true,
      name: myName
    }
  });

  joinScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");

  roomText.textContent = "Room: " + roomCode;
  playerText.textContent = "You are: " + myName + " (" + myPlayer + ")";

  listenRoom();
  startTimer();
}

function listenRoom() {
  onValue(roomRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    localUpdatingFromFirebase = true;

    pieces = data.pieces || startingPieces.map(row => [...row]);
    currentTurn = data.currentTurn || "White1";
    gameOver = data.gameOver || false;
    winnerText = data.winnerText || "";
    waitingPromotion = data.waitingPromotion || false;
    moves = data.moves || [];
    castlingRights = data.castlingRights || createNewGameState().castlingRights;
    enPassantTarget = data.enPassantTarget || null;
    whiteTime = data.whiteTime ?? 600;
    blackTime = data.blackTime ?? 600;
    lastTimerUpdate = data.lastTimerUpdate || Date.now();

    updatePlayerStatuses(normalizePlayers(data.players || {}));
    updateHistory();
    updateTimers();
    createBoard();

    if (gameOver && winnerText) {
      showGameOver(winnerText);
    }

    localUpdatingFromFirebase = false;
  });
}

function updatePlayerStatuses(players) {
  for (const player of turnOrder) {
    const info = players[player];
    const name = info.joined ? info.name : "empty";
    playerStatusEls[player].textContent = player + ": " + name;
    playerStatusEls[player].className = info.joined ? "joined" : "";
  }
}

async function saveGameState(extra = {}) {
  if (!roomRef || localUpdatingFromFirebase) return;

  await update(roomRef, {
    pieces,
    currentTurn,
    gameOver,
    winnerText,
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

function getSquareName(row, col) {
  return files[col] + (8 - row);
}

function startTimer() {
  clearInterval(timerInterval);

  timerInterval = setInterval(async () => {
    if (!roomRef) return;
    if (gameOver || waitingPromotion) return;
    if (myPlayer !== currentTurn) return;

    if (currentTurn.includes("White")) {
      whiteTime--;
      if (whiteTime <= 0) {
        whiteTime = 0;
        gameOver = true;
        winnerText = "Black Team wins on time!";
        turnText.textContent = winnerText;
        playSound("mate");
        showGameOver(winnerText);
      }
    } else {
      blackTime--;
      if (blackTime <= 0) {
        blackTime = 0;
        gameOver = true;
        winnerText = "White Team wins on time!";
        turnText.textContent = winnerText;
        playSound("mate");
        showGameOver(winnerText);
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

function showGameOver(message) {
  if (lastGameOverText === message && !gameOverOverlay.classList.contains("hidden")) return;
  lastGameOverText = message;

  gameOverTitle.textContent = "Game Over";
  gameOverMessage.textContent = message;
  gameOverOverlay.classList.remove("hidden");
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

function createBoard() {
  board.innerHTML = "";

  let text = "Turn: " + currentTurn;

  if (myPlayer !== currentTurn && !gameOver) {
    text += " | Waiting for your turn";
  }

  if (myPlayer === currentTurn && !gameOver) {
    text += " | Your move";
  }

  if (!gameOver && !waitingPromotion) {
    const color = getTurnColor();

    if (!hasAnyLegalMove(color)) {
      gameOver = true;

      if (isKingInCheck(color)) {
        const winner = color === "white" ? "Black Team" : "White Team";
        winnerText = winner + " wins by checkmate!";
      } else {
        winnerText = "Draw by stalemate!";
      }

      text = winnerText;
      playSound("mate");
      showGameOver(winnerText);
      saveGameState();
    } else {
      if (isKingInCheck("white")) text += " | White King is in CHECK!";
      if (isKingInCheck("black")) text += " | Black King is in CHECK!";
    }
  }

  if (gameOver && winnerText) {
    text = winnerText;
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
    alert("It is not your turn yet.");
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
  title.textContent = "Choose promotion piece";
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

restartBtn.addEventListener("click", async () => {
  if (!roomRef) return;

  const oldSnapshot = await get(roomRef);
  const oldData = oldSnapshot.val();
  const oldPlayers = normalizePlayers(oldData?.players || createEmptyPlayers());

  const newState = createNewGameState();
  newState.players = oldPlayers;

  lastGameOverText = "";
  gameOverOverlay.classList.add("hidden");

  await set(roomRef, newState);
});
