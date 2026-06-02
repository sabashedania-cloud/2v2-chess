const board = document.getElementById("board");
const turnText = document.getElementById("turnText");
const restartBtn = document.getElementById("restartBtn");
const moveHistory = document.getElementById("moveHistory");
const whiteTimerEl = document.getElementById("whiteTimer");
const blackTimerEl = document.getElementById("blackTimer");

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

function getSquareName(row, col) {
  return files[col] + (8 - row);
}

function startGame() {
  pieces = startingPieces.map(row => [...row]);
  selectedPiece = null;
  selectedRow = null;
  selectedCol = null;

  currentTurn = "White1";
  gameOver = false;
  waitingPromotion = false;
  moves = [];
  enPassantTarget = null;

  whiteTime = 600;
  blackTime = 600;

  castlingRights = {
    whiteKingMoved: false,
    whiteLeftRookMoved: false,
    whiteRightRookMoved: false,
    blackKingMoved: false,
    blackLeftRookMoved: false,
    blackRightRookMoved: false
  };

  updateHistory();
  updateTimers();
  startTimer();
  createBoard();
}

function startTimer() {
  clearInterval(timerInterval);

  timerInterval = setInterval(() => {
    if (gameOver || waitingPromotion) return;

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

    updateTimers();
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

function playSound(type) {
  const audio = new AudioContext();
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

  if (!gameOver && !waitingPromotion) {
    const color = getTurnColor();

    if (!hasAnyLegalMove(color)) {
      gameOver = true;
      text = isKingInCheck(color)
        ? color.toUpperCase() + " CHECKMATE!"
        : "STALEMATE!";
      playSound("mate");
    } else {
      if (isKingInCheck("white")) text += " | White King is in CHECK!";
      if (isKingInCheck("black")) text += " | Black King is in CHECK!";
    }
  }

  if (!gameOver) turnText.textContent = text;

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

  if (!isLegalMove(selectedPiece, selectedRow, selectedCol, row, col)) {
    selectedPiece = null;
    selectedRow = null;
    selectedCol = null;
    createBoard();
    return;
  }

  makeMove(row, col);
}

function makeMove(row, col) {
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

  updateCastlingRights(movingPiece, oldRow, oldCol, row, col, capturedPiece);

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

  if (isKingInCheck(getTurnColor())) {
    playSound("check");
  }

  createBoard();
}

function showPromotion(row, col, color, moveText) {
  waitingPromotion = true;
  createBoard();

  const box = document.createElement("div");
  box.id = "promotionBox";

  const title = document.createElement("div");
  title.textContent = "აირჩიე ფიგურა";
  title.style.marginBottom = "10px";
  box.appendChild(title);

  const options = color === "white"
    ? ["♕", "♖", "♗", "♘"]
    : ["♛", "♜", "♝", "♞"];

  options.forEach(piece => {
    const btn = document.createElement("button");
    btn.textContent = piece;

    btn.onclick = () => {
      pieces[row][col] = piece;
      moves.push(moveText + " promoted to " + piece);
      updateHistory();

      waitingPromotion = false;
      box.remove();

      playSound("move");
      nextTurn();
      createBoard();
    };

    box.appendChild(btn);
  });

  document.body.appendChild(box);
}

function updateCastlingRights(piece, fromRow, fromCol) {
  if (piece === "♔") castlingRights.whiteKingMoved = true;
  if (piece === "♚") castlingRights.blackKingMoved = true;

  if (piece === "♖" && fromRow === 7 && fromCol === 0) castlingRights.whiteLeftRookMoved = true;
  if (piece === "♖" && fromRow === 7 && fromCol === 7) castlingRights.whiteRightRookMoved = true;

  if (piece === "♜" && fromRow === 0 && fromCol === 0) castlingRights.blackLeftRookMoved = true;
  if (piece === "♜" && fromRow === 0 && fromCol === 7) castlingRights.blackRightRookMoved = true;
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
  if (isKing(pieces[toRow][toCol])) return false;
  if (!isValidMove(piece, fromRow, fromCol, toRow, toCol)) return false;

  const target = pieces[toRow][toCol];

  pieces[toRow][toCol] = piece;
  pieces[fromRow][fromCol] = "";

  const color = isWhitePiece(piece) ? "white" : "black";
  const kingStillInCheck = isKingInCheck(color);

  pieces[fromRow][fromCol] = piece;
  pieces[toRow][toCol] = target;

  return !kingStillInCheck;
}

function isValidMove(piece, fromRow, fromCol, toRow, toCol) {
  const target = pieces[toRow][toCol];

  if (fromRow === toRow && fromCol === toCol) return false;
  if (target !== "" && sameColor(piece, target)) return false;

  const rowDiff = toRow - fromRow;
  const colDiff = toCol - fromCol;

  if (piece === "♙") {
    if (fromCol === toCol && target === "" && rowDiff === -1) return true;
    if (fromRow === 6 && fromCol === toCol && target === "" && rowDiff === -2 && pieces[5][fromCol] === "") return true;
    if (Math.abs(colDiff) === 1 && rowDiff === -1 && target !== "" && isBlackPiece(target)) return true;
    return false;
  }

  if (piece === "♟") {
    if (fromCol === toCol && target === "" && rowDiff === 1) return true;
    if (fromRow === 1 && fromCol === toCol && target === "" && rowDiff === 2 && pieces[2][fromCol] === "") return true;
    if (Math.abs(colDiff) === 1 && rowDiff === 1 && target !== "" && isWhitePiece(target)) return true;
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
    return Math.abs(rowDiff) <= 1 && Math.abs(colDiff) <= 1;
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

restartBtn.addEventListener("click", startGame);

startGame();