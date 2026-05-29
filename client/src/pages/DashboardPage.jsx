import React, { useState, useEffect, useRef } from 'react';
import { createSocket } from '../socket';

const TYPE_LABEL = {
  room_created:     'Room Created',
  room_closed:      'Room Closed',
  user_joined_room: 'User Joined',
  user_left_room:   'User Left',
  activity:         'Activity',
};

const TYPE_KIND = {
  room_created:     'success',
  room_closed:      'error',
  user_joined_room: 'info',
  user_left_room:   'warn',
  activity:         'muted',
};

function fmt(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export default function DashboardPage() {
  const feedRef = useRef(null);

  const [rooms, setRooms] = useState([]);
  const [events, setEvents] = useState([]);
  const [connected, setConnected] = useState(false);
  const [filter, setFilter] = useState('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const [, tick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => tick(t => t + 1), 15000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    // Dashboard uses its own independent socket (not the user-session singleton)
    const socket = createSocket();

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('initial_state', ({ rooms: r, events: e }) => {
      setRooms(r || []);
      setEvents(e || []);
    });
    socket.on('rooms_update', setRooms);
    socket.on('system_event', ev => setEvents(prev => [...prev, ev].slice(-200)));

    socket.connect();
    return () => socket.disconnect();
  }, []);

  useEffect(() => {
    if (autoScroll && feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [events, autoScroll]);

  const filtered = filter === 'all' ? events : events.filter(e => e.type === filter);
  const totalMembers = rooms.reduce((s, r) => s + r.memberCount, 0);

  return (
    <div className="page dashboard-page">
      <div className="page-header dashboard-header">
        <div>
          <h1>Monitoring Dashboard</h1>
          <p className="page-sub">Live system events across all rooms</p>
        </div>
        <div className="header-stats">
          <div className="stat">
            <span className="stat-value">{rooms.length}</span>
            <span className="stat-label">Rooms</span>
          </div>
          <div className="stat">
            <span className="stat-value">{totalMembers}</span>
            <span className="stat-label">Online</span>
          </div>
          <div className="stat">
            <span className="stat-value">{events.length}</span>
            <span className="stat-label">Events</span>
          </div>
          <div className={`server-badge ${connected ? 'server-ok' : 'server-off'}`}>
            <span className="badge-dot" />
            {connected ? 'Live' : 'Offline'}
          </div>
        </div>
      </div>

      <div className="dashboard-layout">
        {/* Rooms panel */}
        <div className="card users-card">
          <h2 className="card-title">Active Rooms <span className="count-badge">{rooms.length}</span></h2>
          {rooms.length === 0 ? (
            <p className="empty-state">No active rooms</p>
          ) : (
            <ul className="dash-rooms">
              {rooms.map(r => (
                <li key={r.id} className="dash-room-row">
                  <div className="dash-room-info">
                    <span className="dash-room-name">{r.name}</span>
                    <span className="muted dash-room-meta">
                      by {r.createdBy} &middot; {timeAgo(r.createdAt)}
                    </span>
                  </div>
                  <div className="dash-room-right">
                    <span className="room-code-chip mono">{r.id}</span>
                    <span className="member-count-chip">{r.memberCount} online</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Event feed */}
        <div className="card feed-card">
          <div className="feed-header">
            <h2 className="card-title">System Event Feed</h2>
            <div className="feed-controls">
              <select
                className="filter-select"
                value={filter}
                onChange={e => setFilter(e.target.value)}
              >
                <option value="all">All events</option>
                <option value="room_created">Room Created</option>
                <option value="room_closed">Room Closed</option>
                <option value="user_joined_room">User Joined</option>
                <option value="user_left_room">User Left</option>
                <option value="activity">Activity</option>
              </select>
              <label className="autoscroll-label">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={e => setAutoScroll(e.target.checked)}
                />
                Auto-scroll
              </label>
            </div>
          </div>

          {filtered.length === 0 ? (
            <p className="empty-state">No events yet</p>
          ) : (
            <ul className="event-list feed-list" ref={feedRef}>
              {filtered.map(ev => {
                const label = TYPE_LABEL[ev.type] || ev.type;
                const kind = TYPE_KIND[ev.type] || 'info';
                const detail = ev.type === 'activity'
                  ? ` — ${ev.eventType}`
                  : ev.roomName ? ` — ${ev.roomName}` : ev.roomId ? ` — #${ev.roomId}` : '';
                return (
                  <li key={ev.id} className={`event-item event-${kind}`}>
                    <span className="event-time mono">{fmt(ev.timestamp)}</span>
                    <span className={`event-tag tag-${kind}`}>{label}</span>
                    <span className="event-msg">
                      {ev.username && <strong>{ev.username}</strong>}
                      {detail && <span className="muted">{detail}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
