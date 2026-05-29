import { io } from 'socket.io-client';

const SERVER_URL = 'http://localhost:3001';

export function createSocket() {
  return io(SERVER_URL, {
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });
}
