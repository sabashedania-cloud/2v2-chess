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

  if (entries.length === 0) {
    waitingRooms.textContent = "0";
    playingRooms.textContent = "0";
    adminRooms.innerHTML = '<div class="empty-admin">No rooms created yet.</div>';
    return;
  }

  adminRooms.innerHTML = "";

  for (const [code, room] of entries) {
    const players = normalizePlayers(room.players || {});
    const joinedCount = getJoinedCount(players);
    const status = getRoomStatus(room, joinedCount);

    if (status === "Playing") playing++;
    else waiting++;

    const card = document.createElement("div");
    card.className = "admin-room-card";

    const createdText = room.createdAt ? formatDate(room.createdAt) : "Unknown";
    const creatorText = room.createdBy || "Unknown";

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
      </div>

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
