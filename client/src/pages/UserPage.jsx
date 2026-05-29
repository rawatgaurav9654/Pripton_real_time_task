import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createSocket } from '../socket';

const ACTIVITY_EVENTS = [
  { label: 'Page View', type: 'page_view' },
  { label: 'Button Click', type: 'button_click' },
  { label: 'Form Submit', type: 'form_submit' },
  { label: 'File Upload', type: 'file_upload' },
  { label: 'Search Query', type: 'search_query' },
];

function fmt(ts) {
  return new Date(ts).toLocaleTimeString();
}

export default function UserPage() {
  const socketRef = useRef(null);
  const heartbeatRef = useRef(null);

  const [username, setUsername] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [status, setStatus] = useState('idle'); // idle | connecting | connected | disconnected
  const [session, setSession] = useState(null); // { username, sessionId }
  const [localEvents, setLocalEvents] = useState([]);
  const [reconnectCount, setReconnectCount] = useState(0);

  const addLocal = useCallback((msg, kind = 'info') => {
    setLocalEvents(prev => [
      { id: Date.now() + Math.random(), msg, kind, ts: new Date().toISOString() },
      ...prev,
    ].slice(0, 50));
  }, []);

  useEffect(() => {
    const socket = createSocket();
    socketRef.current = socket;

    socket.on('connect', () => {
      setStatus('connected');
      addLocal('Connected to server', 'success');
      if (session) {
        socket.emit('rejoin', { username: session.username, sessionId: session.sessionId });
        addLocal(`Rejoined session "${session.sessionId}"`, 'info');
        setReconnectCount(c => c + 1);
      }
    });

    socket.on('disconnect', () => {
      setStatus('disconnected');
      addLocal('Disconnected from server — attempting to reconnect…', 'warn');
      clearInterval(heartbeatRef.current);
    });

    socket.on('connect_error', () => {
      addLocal('Connection error', 'error');
    });

    return () => {
      clearInterval(heartbeatRef.current);
      socket.disconnect();
    };
  }, []);

  // Restart heartbeat when session or status changes
  useEffect(() => {
    clearInterval(heartbeatRef.current);
    if (status === 'connected' && session) {
      heartbeatRef.current = setInterval(() => {
        socketRef.current?.emit('heartbeat');
        addLocal('Heartbeat sent', 'muted');
      }, 5000);
    }
    return () => clearInterval(heartbeatRef.current);
  }, [status, session]);

  function handleJoin(e) {
    e.preventDefault();
    const name = username.trim();
    const sid = sessionId.trim() || `session-${Math.random().toString(36).slice(2, 7)}`;
    if (!name) return;
    setSession({ username: name, sessionId: sid });
    setStatus('connecting');
    socketRef.current.connect();
    // emit join after connect fires
    socketRef.current.once('connect', () => {
      socketRef.current.emit('join', { username: name, sessionId: sid });
      addLocal(`Joined session "${sid}" as ${name}`, 'success');
    });
  }

  function handleActivity(type) {
    socketRef.current?.emit('activity', { eventType: type });
    addLocal(`Activity triggered: ${type}`, 'info');
  }

  function handleDisconnect() {
    clearInterval(heartbeatRef.current);
    socketRef.current?.emit('leave');
    socketRef.current?.disconnect();
    setSession(null);
    setStatus('idle');
    addLocal('Left session', 'warn');
  }

  const isConnected = status === 'connected' && session;

  return (
    <div className="page user-page">
      <div className="page-header">
        <h1>User Session</h1>
        <p className="page-sub">Join a live session and emit presence events</p>
      </div>

      <div className="user-layout">
        {/* Left: Join form / Session controls */}
        <div className="card">
          {!session ? (
            <>
              <h2 className="card-title">Join a Session</h2>
              <form onSubmit={handleJoin} className="join-form">
                <div className="field">
                  <label>Username</label>
                  <input
                    type="text"
                    placeholder="e.g. alice"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <div className="field">
                  <label>Session ID <span className="muted">(optional)</span></label>
                  <input
                    type="text"
                    placeholder="auto-generated if empty"
                    value={sessionId}
                    onChange={e => setSessionId(e.target.value)}
                  />
                </div>
                <button type="submit" className="btn btn-primary btn-full">
                  Join Session
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 className="card-title">Session Info</h2>
              <div className="session-info">
                <div className="info-row">
                  <span className="info-label">Status</span>
                  <span className={`badge badge-${status}`}>
                    <span className="badge-dot" />
                    {status}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">Username</span>
                  <span className="info-value mono">{session.username}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Session</span>
                  <span className="info-value mono">{session.sessionId}</span>
                </div>
                {reconnectCount > 0 && (
                  <div className="info-row">
                    <span className="info-label">Reconnects</span>
                    <span className="info-value">{reconnectCount}</span>
                  </div>
                )}
              </div>

              <div className="divider" />

              <h3 className="section-title">Trigger Activity</h3>
              <div className="activity-grid">
                {ACTIVITY_EVENTS.map(ev => (
                  <button
                    key={ev.type}
                    className="btn btn-secondary"
                    onClick={() => handleActivity(ev.type)}
                    disabled={!isConnected}
                  >
                    {ev.label}
                  </button>
                ))}
              </div>

              <div className="divider" />

              <button className="btn btn-danger btn-full" onClick={handleDisconnect}>
                Leave Session
              </button>
            </>
          )}
        </div>

        {/* Right: Local event log */}
        <div className="card log-card">
          <h2 className="card-title">Local Activity Log</h2>
          {localEvents.length === 0 ? (
            <p className="empty-state">No events yet — join a session to start</p>
          ) : (
            <ul className="event-list">
              {localEvents.map(ev => (
                <li key={ev.id} className={`event-item event-${ev.kind}`}>
                  <span className="event-time mono">{fmt(ev.ts)}</span>
                  <span className="event-msg">{ev.msg}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
