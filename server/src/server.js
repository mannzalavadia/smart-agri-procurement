import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import app from './app.js';
import { ENV } from './config/env.js';
import { initDb } from './config/db.js';
import { runMigrations } from './migrations/runner.js';
import { seedAll } from './seeds/seed_all.js';

const server = http.createServer(app);

// Initialize Socket.IO
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Socket.IO event handler
io.on('connection', (socket) => {
  console.log(`🔌 [Socket.IO] Client connected: ${socket.id}`);

  // Join center-specific room
  socket.on('join_center', (centerId) => {
    socket.join(`center_${centerId}`);
    console.log(`Socket ${socket.id} joined center_${centerId}`);
  });

  // Join user-specific room
  socket.on('join_user', (userId) => {
    socket.join(`user_${userId}`);
    console.log(`Socket ${socket.id} joined user_${userId}`);
  });

  socket.on('disconnect', () => {
    console.log(`🔌 [Socket.IO] Client disconnected: ${socket.id}`);
  });
});

// Attach io instance to express app
app.set('io', io);

async function startServer() {
  try {
    console.log('🌾 Starting Smart Agricultural Procurement System...');
    await initDb();
    await runMigrations();

    // Auto-seed in dev / in-memory mode if needed
    if (!ENV.DATABASE_URL) {
      await seedAll();
    }

    server.listen(ENV.PORT, () => {
      console.log(`🚀 Server listening on port ${ENV.PORT} (${ENV.NODE_ENV})`);
      console.log(`📡 Socket.IO server attached and ready`);
    });
  } catch (err) {
    console.error('💥 Failed to start server:', err);
    process.exit(1);
  }
}

// Export for testing
export { app, server, io };

if (process.argv[1]?.endsWith('server.js')) {
  startServer();
}
