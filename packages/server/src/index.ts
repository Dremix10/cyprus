import express from 'express';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import path from 'path';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@cyprus/shared';
import { RoomManager } from './RoomManager.js';
import { SocketHandler } from './SocketHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);

const isProduction = process.env.NODE_ENV === 'production';

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: isProduction
    ? undefined
    : { origin: process.env.CLIENT_URL ?? 'http://localhost:5173' },
});

const PORT = process.env.PORT ?? 3001;

const roomManager = new RoomManager();
const socketHandler = new SocketHandler(io, roomManager);
socketHandler.setup();

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// In production, serve the client build
if (isProduction) {
  const clientDist = path.resolve(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
