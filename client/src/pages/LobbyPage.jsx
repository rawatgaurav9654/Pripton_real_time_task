import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSocket, destroySocket } from '../socketManager';

export default function LobbyPage() {
  const navigate = useNavigate();

  const [tab, setTab] = useState('create'); // 'create' | 'join'
  const [username, setUsername] = useState('');
  const [roomName, setRoomName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [rooms, setRooms] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('http://localhost:3001/rooms')
      .then(r => r.json())
      .then(setRooms)
      .catch(() => {});

    const socket = getSocket();
    socket.connect();
    socket.on('initial_state', ({ rooms: r }) => setRooms(r));
    socket.on('rooms_update', setRooms);

    return () => {
      socket.off('initial_state');
      socket.off('rooms_update');
    };
  }, []);

  function handleSubmit(e) {
    e.preventDefault();
    const name = username.trim();
    if (!name) { setError('Username is required'); return; }
    setError('');
    setLoading(true);

    const socket = getSocket();

    socket.off('room_joined');
    socket.off('room_error');

    socket.once('room_joined', ({ roomId, roomName: rName, isHost, members, messages }) => {
      setLoading(false);
      // Update URL to actual roomId without remounting via history API
      sessionStorage.setItem('roomSession', JSON.stringify({
        username: name,
        roomId,
        roomName: rName,
        isHost,
      }));
      navigate(`/room/${roomId}`, {
        state: { username: name, roomId, roomName: rName, isHost, members, messages },
      });
    });

    socket.once('room_error', ({ message }) => {
      setLoading(false);
      setError(message);
    });

    if (tab === 'create') {
      socket.emit('create_room', { username: name, roomName: roomName.trim() || undefined });
    } else {
      const code = joinCode.trim().toUpperCase();
      if (!code) { setLoading(false); setError('Room code is required'); return; }
      socket.emit('join_room', { username: name, roomId: code });
    }
  }

  function prefillJoin(roomId) {
    setTab('join');
    setJoinCode(roomId);
  }

  return (
    <div className="page lobby-page">
      <div className="lobby-hero">
        <h1>Realtime Rooms</h1>
        <p className="page-sub">Create a room or join one with a code — chat and trigger live events together</p>
      </div>

      <div className="lobby-layout">
        {/* Form card */}
        <div className="card lobby-card">
          <div className="tab-bar">
            <button
              className={`tab-btn ${tab === 'create' ? 'tab-active' : ''}`}
              onClick={() => { setTab('create'); setError(''); }}
            >
              Create Room
            </button>
            <button
              className={`tab-btn ${tab === 'join' ? 'tab-active' : ''}`}
              onClick={() => { setTab('join'); setError(''); }}
            >
              Join Room
            </button>
          </div>

          <form onSubmit={handleSubmit} className="join-form">
            <div className="field">
              <label>Your name</label>
              <input
                type="text"
                placeholder="e.g. Alice"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoFocus
                required
              />
            </div>

            {tab === 'create' && (
              <div className="field">
                <label>Room name <span className="muted">(optional)</span></label>
                <input
                  type="text"
                  placeholder="e.g. Design Collab"
                  value={roomName}
                  onChange={e => setRoomName(e.target.value)}
                />
              </div>
            )}

            {tab === 'join' && (
              <div className="field">
                <label>Room code</label>
                <input
                  type="text"
                  placeholder="e.g. A1B2C3"
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value.toUpperCase())}
                  className="mono"
                  maxLength={6}
                  required
                />
              </div>
            )}

            {error && <p className="form-error">{error}</p>}

            <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
              {loading ? 'Connecting…' : tab === 'create' ? 'Create Room' : 'Join Room'}
            </button>
          </form>
        </div>

        {/* Active rooms list */}
        <div className="card">
          <h2 className="card-title">Active Rooms <span className="count-badge">{rooms.length}</span></h2>
          {rooms.length === 0 ? (
            <p className="empty-state">No active rooms — be the first to create one</p>
          ) : (
            <ul className="rooms-list">
              {rooms.map(r => (
                <li key={r.id} className="room-row">
                  <div className="room-row-info">
                    <span className="room-row-name">{r.name}</span>
                    <span className="room-row-meta muted">
                      by {r.createdBy} &middot; {r.memberCount} member{r.memberCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="room-row-right">
                    <span className="room-code-chip mono">{r.id}</span>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => prefillJoin(r.id)}
                    >
                      Join
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
