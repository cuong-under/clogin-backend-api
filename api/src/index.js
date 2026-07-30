require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/auth');
const licenseRoutes = require('./routes/license');
const teamRoutes = require('./routes/team');
const profilesRoutes = require('./routes/profiles');
const appRoutes = require('./routes/app');
const adminRoutes = require('./routes/admin');
const { errorHandler } = require('./middleware/error');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS Whitelist
const allowedOrigins = ['tauri://localhost', 'http://localhost', 'https://api-clogin.nghemmo.com', 'https://clogin.nghemmo.com'];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || origin.startsWith('http://localhost:')) {
      callback(null, true);
    } else {
      callback(null, true); // Allow for mobile/desktop agents
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization', 'Cookie']
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// Health Check Endpoint
app.get('/health', (req, res) => {
  return res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API V1 Routes
app.use('/v1/auth', authRoutes);
app.use('/v1/license', licenseRoutes);
app.use('/v1/team', teamRoutes);
app.use('/v1/profiles', profilesRoutes);
app.use('/v1/app', appRoutes);
app.use('/v1/admin', adminRoutes);

// Global Error Handler
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Clogin Backend API listening on port ${PORT}`);
});

module.exports = app;
