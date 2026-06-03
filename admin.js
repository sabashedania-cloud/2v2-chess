import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  remove
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-database.js";

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

const adminRooms = document.getElementById("adminRooms");
const totalRooms = document.getElementById("totalRooms");
const waitingRooms = document.getElementById("waitingRooms");
const playingRooms = document.getElementById("playingRooms");
const finishedRooms = document.getElementById("finishedRooms");
const refreshBtn = document.getElementById("refreshBtn");

const turnOrder = ["White1", "Black1", "White2", "Black2"];

refreshBtn.addEventListener("click", () => window.location.reload());

onValue(ref(db, "rooms"), snapshot => {
  const rooms = snapshot.val() || {};
  renderRooms(rooms);
});

function renderRooms(rooms) {
  const entries = Object.entries(rooms).sort((a, b) => {
    const aTime = a[1]?.createdAt || 0;
    const bTime = b[1]?.createdAt || 0;
    return bTime - aTime;
  });

  totalRooms.textContent = entries.length;

  let waiting = 0;
  let playing = 0;
  let finished = 0;

  if (entries.length === 0) {
    waitingRooms.textContent = "0";
    playingRooms.textContent = "0";
    finishedRooms.textContent = "0";
    adminRooms.innerHTML = '<div class="empty-admin">No rooms created yet.</div>';
    return;
  }

  adminRooms.innerHTML = "";

  for (const [code, room] of entries) {
    const players = normalizePlayers(room.players || {});
    const joinedCount = getJoinedCount(players);
    const status = getRoomStatus(room, joinedCount);

    if (status === "Playing") playing++;
    else if (status === "Finished") finished++;
    else waiting++;

    const card = document.createElement("div");
    card.className = "admin-room-card";

    const createdText = room.createdAt ? formatDate(room.createdAt) : "Unknown";
    const creatorText = room.createdBy || "Unknown";
    const resultHtml = renderGameResult(room.gameResult, players);
    const historyHtml = renderGameHistory(room.gameHistory);

    card.innerHTML = `
      <div class="admin-room-top">
        <div>
          <div class="admin-room-code">Room: ${escapeHtml(code)}</div>
          <div class="admin-room-meta">Created by: ${escapeHtml(creatorText)} • ${createdText}</div>
        </div>
        <div class="admin-status ${status.toLowerCase()}">${status}</div>
      </div>

      <div class="admin-room-info">
        <span>Players: <b>${joinedCount}/4</b></span>
        <span>Turn: <b>${escapeHtml(room.currentTurn || "White1")}</b></span>
        <span>Moves: <b>${Array.isArray(room.moves) ? room.moves.length : 0}</b></span>
        <span>Time: <b>${escapeHtml(room.timeLimitMinutes || 10)} min</b></span>
      </div>

      ${resultHtml}
      ${historyHtml}

      <div class="admin-player-grid">
        ${turnOrder.map(player => playerBox(player, players[player], room.currentTurn)).join("")}
      </div>

      <div class="admin-actions">
        <button class="danger-btn" data-room="${escapeHtml(code)}">Delete Room</button>
      </div>
    `;

    const deleteBtn = card.querySelector(".danger-btn");
    deleteBtn.addEventListener("click", async () => {
      const ok = confirm("Delete room " + code + "?");
      if (!ok) return;
      await remove(ref(db, "rooms/" + code));
    });

    adminRooms.appendChild(card);
  }

  waitingRooms.textContent = waiting;
  playingRooms.textContent = playing;
  finishedRooms.textContent = finished;
}


function renderGameHistory(history) {
  const results = Object.values(history || {}).sort((a, b) => {
    return (b.finishedAt || 0) - (a.finishedAt || 0);
  });

  if (results.length === 0) {
    return `
      <div class="admin-history-box">
        <h3>Game History</h3>
        <div class="admin-history-empty">No finished games in this room yet.</div>
      </div>
    `;
  }

  return `
    <div class="admin-history-box">
      <h3>Game History</h3>
      <div class="admin-history-list">
        ${results.map(result => renderHistoryItem(result)).join("")}
      </div>
    </div>
  `;
}

function renderHistoryItem(result) {
  const winnerNames = namesFromSlots(result.winners);
  const loserNames = namesFromSlots(result.losers);
  const finishedAt = result.finishedAt ? formatDate(result.finishedAt) : "Unknown";
  const icon = result.winnerTeam === "Draw" ? "🤝" : (result.winnerTeam === "White Team" ? "♔" : "♚");
  return `
    <div class="admin-history-item">
      <div class="history-icon">${icon}</div>
      <div class="history-main">
        <div><b>Game ${escapeHtml(result.gameNumber || "-")}</b> • ${escapeHtml(result.reason || "Unknown")}</div>
        <div>Winner: <b>${escapeHtml(result.winnerTeam || "Unknown")}</b> — ${escapeHtml(winnerNames || "-")}</div>
        <div>Loser: <b>${escapeHtml(result.loserTeam || "Unknown")}</b> — ${escapeHtml(loserNames || "-")}</div>
        <div class="history-date">${escapeHtml(finishedAt)}</div>
      </div>
    </div>
  `;
}

function renderGameResult(result, players) {
  if (!result) {
    return `
      <div class="admin-result-box pending-result">
        <span>Winner: <b>Not finished yet</b></span>
        <span>Loser: <b>-</b></span>
        <span>Reason: <b>-</b></span>
      </div>
    `;
  }

  const winnerNames = namesFromSlots(result.winners);
  const loserNames = namesFromSlots(result.losers);
  const finishedAt = result.finishedAt ? formatDate(result.finishedAt) : "Unknown";

  const icon = result.winnerTeam === "Draw" ? "🤝" : (result.winnerTeam === "White Team" ? "🏆 ♔" : "🏆 ♚");

  return `
    <div class="admin-result-box finished-result admin-winner-visual">
      <div class="admin-result-icon">${icon}</div>
      <div class="admin-result-details">
        <span>Winner: <b>${escapeHtml(result.winnerTeam || "Unknown")}</b></span>
        <span>Winners: <b>${escapeHtml(winnerNames || "-")}</b></span>
        <span>Loser: <b>${escapeHtml(result.loserTeam || "Unknown")}</b></span>
        <span>Losers: <b>${escapeHtml(loserNames || "-")}</b></span>
        <span>Reason: <b>${escapeHtml(result.reason || "Unknown")}</b></span>
        <span>Finished: <b>${escapeHtml(finishedAt)}</b></span>
      </div>
    </div>
  `;
}

function namesFromSlots(slots) {
  if (!slots) return "";
  return Object.entries(slots)
    .map(([slot, name]) => name ? `${slot}: ${name}` : `${slot}: empty`)
    .join(" + ");
}

function playerBox(slot, playerData, currentTurn) {
  const name = getPlayerName(playerData);
  const joinedAt = playerData?.joinedAt ? formatDate(playerData.joinedAt) : "";
  const activeClass = currentTurn === slot ? " active-admin-player" : "";

  return `
    <div class="admin-player${name ? " joined-admin-player" : ""}${activeClass}">
      <div class="admin-player-slot">${slot}</div>
      <div class="admin-player-name">${escapeHtml(name || "empty")}</div>
      <div class="admin-player-time">${joinedAt}</div>
    </div>
  `;
}

function normalizePlayers(players) {
  const result = {};
  for (const player of turnOrder) {
    const value = players[player];
    if (!value) result[player] = null;
    else if (typeof value === "string") result[player] = { name: value };
    else result[player] = value;
  }
  return result;
}

function getPlayerName(playerData) {
  if (!playerData) return "";
  if (typeof playerData === "string") return playerData;
  return playerData.name || "";
}

function getJoinedCount(players) {
  return turnOrder.filter(player => Boolean(getPlayerName(players[player]))).length;
}

function getRoomStatus(room, joinedCount) {
  if (room.gameOver) return "Finished";
  if (room.gameStarted && joinedCount === 4) return "Playing";
  return "Waiting";
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
