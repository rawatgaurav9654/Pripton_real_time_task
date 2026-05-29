import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { getSocket, destroySocket } from '../socketManager';
import { useToast } from '../hooks/useToast';
import ToastContainer from '../components/ToastContainer';

const ACTIVITIES = [
  { label: 'File Upload',   type: 'file_upload',   icon: 'F' },
  { label: 'Page View',     type: 'page_view',     icon: 'V' },
  { label: 'Button Click',  type: 'button_click',  icon: 'C' },
  { label: 'Form Submit',   type: 'form_submit',   icon: 'S' },
  { label: 'Search',        type: 'search_query',  icon: 'Q' },
  { label: 'Screen Share',  type: 'screen_share',  icon: 'P' },
];

const ACTIVITY_LABELS = {
  file_upload:  'uploaded a file',
  page_view:    'viewed a page',
  button_click: 'clicked a button',
  form_submit:  'submitted a form',
  search_query: 'ran a search',
  screen_share: 'started screen share',
};

function fmt(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export default function RoomPage() {
  const { roomId: paramRoomId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { toasts, addToast } = useToast();

  // Resolve session from nav state or sessionStorage
  const session = (() => {
    if (location.state?.username) return location.state;
    try {
      const stored = JSON.parse(sessionStorage.getItem('roomSession') || 'null');
      if (stored?.roomId === paramRoomId) return stored;
    } catch {}
    return null;
  })();

  const [messages, setMessages] = useState(session?.messages || []);
  const [members, setMembers] = useState(session?.members || []);
  const [text, setText] = useState('');
  const [connected, setConnected] = useState(false);
  const [, tick] = useState(0);

  const chatRef = useRef(null);
  const userScrolled = useRef(false);
  const sessionRef = useRef(session);
  const didJoinRef = useRef(false);

  // Re-render for timeAgo
  useEffect(() => {
    const id = setInterval(() => tick(t => t + 1), 15000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!session) { navigate('/lobby', { replace: true }); return; }

    const socket = getSocket();

    function onConnect() {
      setConnected(true);
      // Rejoin on reconnect (socket got a new id)
      if (didJoinRef.current) {
        socket.emit('join_room', {
          username: sessionRef.current.username,
          roomId: sessionRef.current.roomId,
        });
        addToast('Reconnected to server', 'success');
      }
      didJoinRef.current = true;
    }

    function onDisconnect() {
      setConnected(false);
      addToast('Connection lost — reconnecting…', 'warn');
    }

    function onRoomJoined({ members: m, messages: msgs }) {
      setMembers(m);
      if (msgs?.length) setMessages(msgs);
    }

    function onUserJoined({ username, members: m }) {
      setMembers(m);
      if (username !== session.username) {
        addToast(`${username} joined the room`, 'success');
        appendSystem(`${username} joined the room`, 'joined');
      }
    }

    function onUserLeft({ username, members: m, reason }) {
      setMembers(m);
      const msg = reason === 'disconnect'
        ? `${username} lost connection`
        : `${username} left the room`;
      addToast(msg, 'warn');
      appendSystem(msg, 'left');
    }

    function onChatMessage(msg) {
      setMessages(prev => [...prev, msg]);
    }

    function onActivityEvent({ username, eventType }) {
      const label = ACTIVITY_LABELS[eventType] || eventType;
      const sysMsg = {
        id: `sys-${Date.now()}`,
        type: 'system',
        text: `${username} ${label}`,
        activityType: eventType,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, sysMsg]);
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room_joined', onRoomJoined);
    socket.on('user_joined', onUserJoined);
    socket.on('user_left', onUserLeft);
    socket.on('chat_message', onChatMessage);
    socket.on('activity_event', onActivityEvent);

    if (!socket.connected) {
      socket.connect();
    } else {
      // Already connected from lobby (first join)
      setConnected(true);
      didJoinRef.current = true;
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room_joined', onRoomJoined);
      socket.off('user_joined', onUserJoined);
      socket.off('user_left', onUserLeft);
      socket.off('chat_message', onChatMessage);
      socket.off('activity_event', onActivityEvent);
    };
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    if (!userScrolled.current && chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages]);

  function appendSystem(text, kind) {
    setMessages(prev => [...prev, {
      id: `sys-${Date.now()}-${Math.random()}`,
      type: 'system',
      text,
      kind,
      timestamp: new Date().toISOString(),
    }]);
  }

  function handleChatScroll() {
    const el = chatRef.current;
    if (!el) return;
    userScrolled.current = el.scrollHeight - el.scrollTop - el.clientHeight > 60;
  }

  function sendChat(e) {
    e.preventDefault();
    const msg = text.trim();
    if (!msg) return;
    getSocket().emit('chat', { text: msg });
    setText('');
  }

  function sendActivity(eventType) {
    getSocket().emit('activity', { eventType });
  }

  function handleLeave() {
    getSocket().emit('leave_room');
    destroySocket();
    sessionStorage.removeItem('roomSession');
    navigate('/lobby');
  }

  function copyCode() {
    navigator.clipboard.writeText(session?.roomId || '').then(() => {
      addToast('Room code copied!', 'info', 2000);
    });
  }

  if (!session) return null;

  const myUsername = session.username;
  const roomName = session.roomName;
  const roomId = session.roomId;

  return (
    <div className="room-page">
      <ToastContainer toasts={toasts} />

      {/* Room header */}
      <div className="room-header">
        <div className="room-header-left">
          <h1 className="room-title">{roomName}</h1>
          <div className="room-meta">
            <span className="room-code mono">{roomId}</span>
            <button className="copy-btn" onClick={copyCode} title="Copy room code">
              Copy
            </button>
            {session.isHost && <span className="host-badge">Host</span>}
          </div>
        </div>
        <div className="room-header-right">
          <span className={`server-badge ${connected ? 'server-ok' : 'server-off'}`}>
            <span className="badge-dot" />
            {connected ? 'Connected' : 'Reconnecting'}
          </span>
          <button className="btn btn-danger btn-sm" onClick={handleLeave}>
            Leave
          </button>
        </div>
      </div>

      <div className="room-layout">
        {/* Members sidebar */}
        <div className="members-panel card">
          <h2 className="card-title">
            Members <span className="count-badge">{members.length}</span>
          </h2>
          {members.length === 0 ? (
            <p className="empty-state">No members</p>
          ) : (
            <ul className="member-list">
              {members.map(m => (
                <li key={m.socketId} className="member-row">
                  <span className="presence-dot" />
                  <div className="member-info">
                    <span className="member-name">
                      {m.username}
                      {m.username === myUsername && <span className="you-tag"> (you)</span>}
                    </span>
                    {m.isHost && <span className="host-chip">host</span>}
                    <span className="member-since muted">{timeAgo(m.joinedAt)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Chat + activity */}
        <div className="chat-panel card">
          {/* Messages */}
          <div
            className="chat-messages"
            ref={chatRef}
            onScroll={handleChatScroll}
          >
            {messages.length === 0 && (
              <p className="empty-state chat-empty">Say hello!</p>
            )}
            {messages.map(msg => (
              msg.type === 'system' ? (
                <div key={msg.id} className={`msg-system msg-sys-${msg.kind || 'activity'}`}>
                  <span className="msg-sys-dot" />
                  <span className="msg-sys-text">{msg.text}</span>
                  <span className="msg-time muted">{fmt(msg.timestamp)}</span>
                </div>
              ) : (
                <div
                  key={msg.id}
                  className={`msg-chat ${msg.username === myUsername ? 'msg-mine' : ''}`}
                >
                  <div className="msg-header">
                    <span className="msg-author">
                      {msg.username === myUsername ? 'You' : msg.username}
                    </span>
                    <span className="msg-time muted">{fmt(msg.timestamp)}</span>
                  </div>
                  <div className="msg-bubble">{msg.text}</div>
                </div>
              )
            ))}
          </div>

          {/* Chat input */}
          <form className="chat-input-row" onSubmit={sendChat}>
            <input
              type="text"
              className="chat-input"
              placeholder="Type a message…"
              value={text}
              onChange={e => setText(e.target.value)}
              maxLength={500}
              autoComplete="off"
            />
            <button type="submit" className="btn btn-primary" disabled={!text.trim()}>
              Send
            </button>
          </form>
        </div>
      </div>

      {/* Activity bar */}
      <div className="activity-bar card">
        <span className="activity-bar-label">Trigger event</span>
        <div className="activity-buttons">
          {ACTIVITIES.map(a => (
            <button
              key={a.type}
              className="btn btn-secondary btn-sm activity-btn"
              onClick={() => sendActivity(a.type)}
              disabled={!connected}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
