const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:5174'],
    methods: ['GET', 'POST'],
  },
});


const users = new Map();

const rooms = new Map();

const systemEvents = [];
const MAX_HISTORY = 200;

function genRoomId() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

function getRoomMembers(roomId) {
  return Array.from(users.entries())
    .filter(([, u]) => u.roomId === roomId)
    .map(([socketId, u]) => ({ socketId, ...u }));
}

function roomSummary(room) {
  return {
    id: room.id,
    name: room.name,
    createdBy: room.createdBy,
    createdAt: room.createdAt,
    memberCount: getRoomMembers(room.id).length,
  };
}

function pushSystem(type, payload) {
  const event = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    type,
    ...payload,
    timestamp: new Date().toISOString(),
  };
  systemEvents.push(event);
  if (systemEvents.length > MAX_HISTORY) systemEvents.shift();
  io.emit('system_event', event);
  return event;
}

io.on('connection', (socket) => {
  // Hydrate new connection with current state
  socket.emit('initial_state', {
    rooms: Array.from(rooms.values()).map(roomSummary),
    events: systemEvents,
  });

  // ── Create room ─────────────────────────────
  socket.on('create_room', ({ username, roomName }) => {
    const name = username?.trim();
    const rName = roomName?.trim() || `${name}'s Room`;
    if (!name) return;

    const roomId = genRoomId();
    rooms.set(roomId, {
      id: roomId,
      name: rName,
      createdBy: name,
      createdAt: new Date().toISOString(),
      messages: [],
    });

    users.set(socket.id, {
      username: name,
      roomId,
      joinedAt: new Date().toISOString(),
      isHost: true,
    });
    socket.join(roomId);

    socket.emit('room_joined', {
      roomId,
      roomName: rName,
      isHost: true,
      members: getRoomMembers(roomId),
      messages: [],
    });

    pushSystem('room_created', { username: name, roomId, roomName: rName });
    io.emit('rooms_update', Array.from(rooms.values()).map(roomSummary));
  });

  // ── Join room ────────────────────────────────
  socket.on('join_room', ({ username, roomId }) => {
    const name = username?.trim();
    const rid = roomId?.trim().toUpperCase();
    if (!name || !rid) return;

    const room = rooms.get(rid);
    if (!room) {
      socket.emit('room_error', { message: `Room "${rid}" does not exist. Check the code and try again.` });
      return;
    }

    // Handle rejoins (same username re-entering after disconnect)
    const existing = Array.from(users.values()).find(
      u => u.roomId === rid && u.username === name
    );

    users.set(socket.id, {
      username: name,
      roomId: rid,
      joinedAt: existing?.joinedAt || new Date().toISOString(),
      isHost: room.createdBy === name,
    });
    socket.join(rid);

    const members = getRoomMembers(rid);

    socket.emit('room_joined', {
      roomId: rid,
      roomName: room.name,
      isHost: room.createdBy === name,
      members,
      messages: room.messages.slice(-100),
    });

    // Notify other room members
    socket.to(rid).emit('user_joined', {
      username: name,
      socketId: socket.id,
      members,
    });

    pushSystem('user_joined_room', { username: name, roomId: rid, roomName: room.name });
    io.emit('rooms_update', Array.from(rooms.values()).map(roomSummary));
  });

  // ── Chat message ─────────────────────────────
  socket.on('chat', ({ text }) => {
    const user = users.get(socket.id);
    if (!user || !text?.trim()) return;

    const msg = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      type: 'chat',
      username: user.username,
      text: text.trim().slice(0, 500),
      timestamp: new Date().toISOString(),
    };

    const room = rooms.get(user.roomId);
    if (room) {
      room.messages.push(msg);
      if (room.messages.length > 100) room.messages.shift();
    }

    io.to(user.roomId).emit('chat_message', msg);
  });

  // ── Activity event ───────────────────────────
  socket.on('activity', ({ eventType }) => {
    const user = users.get(socket.id);
    if (!user) return;

    const ev = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      type: 'activity',
      username: user.username,
      eventType,
      roomId: user.roomId,
      timestamp: new Date().toISOString(),
    };

    // Broadcast to room as a system chat entry
    io.to(user.roomId).emit('activity_event', ev);
    pushSystem('activity', ev);
  });

  // ── Leave / disconnect ───────────────────────
  function handleLeave(reason) {
    const user = users.get(socket.id);
    if (!user) return;

    const { username, roomId } = user;
    users.delete(socket.id);
    socket.leave(roomId);

    const members = getRoomMembers(roomId);

    io.to(roomId).emit('user_left', {
      username,
      socketId: socket.id,
      members,
      reason,
    });

    pushSystem('user_left_room', { username, roomId, reason });

    if (members.length === 0) {
      rooms.delete(roomId);
      pushSystem('room_closed', { roomId });
    }

    io.emit('rooms_update', Array.from(rooms.values()).map(roomSummary));
  }

  socket.on('leave_room', () => handleLeave('left'));
  socket.on('disconnect', () => handleLeave('disconnect'));
});

// REST endpoints
app.get('/rooms', (_req, res) => {
  res.json(Array.from(rooms.values()).map(roomSummary));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));
