

# Dramaverse Backend Setup Guide (Single File)

This document provides a comprehensive guide to setting up and running the optional backend server for the Dramaverse application. This version consolidates all logic into a **single `server.js` file** for simplicity and easier maintenance. When enabled, the backend provides persistent storage and **real-time, multi-device data synchronization**.

## 1. Overview

-   **Technology Stack**:
    -   **Runtime**: Node.js
    -   **Framework**: Express.js
    -   **Real-Time**: Socket.IO for WebSocket communication.
    -   **Database**: SQLite3 (a lightweight, file-based SQL database)
    -   **Authentication**: JSON Web Tokens (JWT) for secure sessions.
    -   **Password Hashing**: `bcryptjs` to securely store user passwords.
    -   **Configuration**: `dotenv` for managing environment variables.
    -   **Security**: `helmet` for security headers and `express-rate-limit` for request throttling.
    -   **Clustering**: **Redis** and the **Socket.IO Redis Adapter** to enable real-time communication across multiple processes (essential for PM2 cluster mode).

-   **Functionality**:
    -   Handles user registration and login.
    -   Provides authenticated endpoints for users to manage their data.
    -   **Automatic Migrations**: The database schema is automatically created and updated on server startup.
    -   **Real-Time Sync**: When a user makes a change on one device, the server instantly pushes a granular update event to all of that user's other logged-in devices, even when running in a multi-process cluster.
    -   Includes logic for **conflict resolution** to support multi-device, offline-first usage.
    -   **Server-Side Processing**: Offloads all heavy filtering, sorting, and pagination logic to the server, sending only the necessary data to the client for a faster, more scalable experience.

## 2. Initial Setup

### Prerequisites
-   Ensure you have [Node.js](https://nodejs.org/) installed (version 16 or higher is recommended).
-   Ensure you have a **Redis server** installed and running. Redis is required for the Socket.IO adapter to work. You can [install Redis locally](https://redis.io/docs/getting-started/installation/) or use a cloud-based Redis service.

### Steps
1.  **Create a Backend Directory**: In the root of your project, create a new folder named `backend`. All the following commands and file creations will happen inside this `backend` directory.

2.  **Initialize the Project**: Open a terminal inside the `backend` directory and run:
    ```bash
    npm init -y
    ```

3.  **Install Dependencies**: Install the necessary packages for the server.
    ```bash
    npm install express sqlite3 cors bcryptjs jsonwebtoken socket.io helmet express-rate-limit dotenv redis @socket.io/redis-adapter
    ```

4.  **Install Development Dependency**: Install `nodemon` for automatic server restarts during development.
    ```bash
    npm install --save-dev nodemon
    ```

5.  **Create Environment File**: Create a new file named `.env` in the `backend` directory. This file will store your secret keys and configuration. **This file should never be committed to version control.**
    ```env
    # The port the server will run on
    PORT=3001

    # A comma-separated list of allowed origins for CORS.
    # No spaces around the comma.
    # For production, this should be your frontend's domain (e.g., "https://your-app-domain.com").
    CORS_ALLOWED_ORIGINS="http://localhost:5173,http://127.0.0.1:5173"

    # The connection string for your Redis server.
    # This is required for real-time event broadcasting in a multi-process setup (like PM2 cluster).
    REDIS_URL="redis://localhost:6379"

    # A long, random, and secret string for signing JWTs
    # IMPORTANT: Change this to your own unique secret!
    JWT_SECRET="replace-this-with-a-very-long-and-random-string"

    # (Optional) The subpath for the Socket.IO server if running behind a reverse proxy sub-directory.
    # Must start and end with a slash. e.g. /dramaverse/socket.io/
    SOCKET_IO_PATH="/dramaverse/socket.io/"
    ```

6.  **Configure `.gitignore`**: Create a `.gitignore` file in the `backend` directory to prevent sensitive files from being committed.
    ```gitignore
    # Environment variables
    .env

    # Node modules
    node_modules/

    # Database file
    dramas.db
    dramas.db-journal

    # NPM debug logs
    npm-debug.log*
    ```

7.  **Configure `package.json`**: Open the `package.json` file and add the following `scripts`:
    ```json
    "scripts": {
      "start": "node server.js",
      "dev": "nodemon server.js",
      "seed": "node server.js --seed"
    },
    ```

8.  **Copy Drama Data**: Copy the `dramas.json` file from `/public/data/dramas.json` into your new `/backend` directory. The seed script will use this file.

## 3. Project Structure

After setup, your `backend` directory will have this structure:

```
/backend
├── .env              # Your secret keys and config (DO NOT COMMIT)
├── .gitignore        # Tells Git which files to ignore
├── server.js         # The single, self-contained server file
├── dramas.json       # Copied from the frontend for seeding
└── package.json
```

## 4. Code Implementation

Create a file named `server.js` inside the `backend` directory and paste the entire code block below into it.

### `server.js`
This single file contains all the logic for the database, authentication, API routes, and real-time communication. It now loads configuration from the `.env` file and uses a Redis adapter for scalable real-time events.

```javascript
// --- DEPENDENCIES ---
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const { createClient } = require("redis");
const { createAdapter } = require("@socket.io/redis-adapter");

// --- CONFIGURATION ---
dotenv.config(); // Load environment variables from .env file

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET;
const REDIS_URL = process.env.REDIS_URL;
const DB_SOURCE = "dramas.db";
const SOCKET_IO_PATH = process.env.SOCKET_IO_PATH || '/socket.io/';

if (!JWT_SECRET || JWT_SECRET === "replace-this-with-a-very-long-and-random-string") {
    console.error("FATAL ERROR: JWT_SECRET is not set or is set to the default value in the .env file.");
    process.exit(1);
}
if (!REDIS_URL) {
    console.error("FATAL ERROR: REDIS_URL is not set in the .env file. It is required for multi-process real-time communication.");
    process.exit(1);
}

const CORS_ALLOWED_ORIGINS = process.env.CORS_ALLOWED_ORIGINS;
let allowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173']; 
if (CORS_ALLOWED_ORIGINS) {
    allowedOrigins = CORS_ALLOWED_ORIGINS.split(',').map(origin => origin.trim());
    console.log('CORS is configured to allow origins:', allowedOrigins);
} else {
    console.warn('WARN: CORS_ALLOWED_ORIGINS is not set in the .env file. Using default development origins.');
}
const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.error(`CORS Blocked: The origin '${origin}' is not in the allowed list.`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
};

// --- DATABASE MIGRATIONS ---
const migrations = [
    `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT)`,
    `CREATE TABLE IF NOT EXISTS dramas (url TEXT PRIMARY KEY, title TEXT, data TEXT)`,
    `CREATE TABLE IF NOT EXISTS user_favorites (user_id INTEGER, drama_url TEXT, PRIMARY KEY (user_id, drama_url), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (drama_url) REFERENCES dramas(url) ON DELETE CASCADE)`,
    `CREATE TABLE IF NOT EXISTS user_statuses (user_id INTEGER, drama_url TEXT, status TEXT, currentEpisode INTEGER, PRIMARY KEY (user_id, drama_url), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (drama_url) REFERENCES dramas(url) ON DELETE CASCADE)`,
    `CREATE TABLE IF NOT EXISTS user_episode_reviews (user_id INTEGER, drama_url TEXT, episode_number INTEGER, review_text TEXT, updated_at INTEGER, PRIMARY KEY (user_id, drama_url, episode_number), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (drama_url) REFERENCES dramas(url) ON DELETE CASCADE)`
];

// --- DATABASE & IN-MEMORY CACHE SETUP ---
let inMemoryDramas = [];
let inMemoryMetadata = {};

const db = new sqlite3.Database(DB_SOURCE, (err) => {
    if (err) { console.error("Error connecting to database:", err.message); throw err; }
    console.log('Connected to the SQLite database.');
});

// --- HELPER & HANDLER FUNCTION DEFINITIONS ---
async function runMigrations() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE)`);
            db.all('SELECT name FROM migrations', async (err, completedMigrations) => {
                if (err) return reject(err);
                const completedNames = new Set(completedMigrations.map(m => m.name));
                const pendingMigrations = migrations.filter((_, index) => !completedNames.has(`migration_${index}`));
                if (pendingMigrations.length === 0) { console.log("Database schema is up to date."); return resolve(); }
                console.log(`Found ${pendingMigrations.length} pending migrations. Applying...`);
                for (let i = 0; i < migrations.length; i++) {
                    if (!completedNames.has(`migration_${i}`)) {
                        try {
                            await new Promise((res, rej) => db.run(migrations[i], (e) => e ? rej(e) : res()));
                            await new Promise((res, rej) => db.run('INSERT INTO migrations (name) VALUES (?)', [`migration_${i}`], (e) => e ? rej(e) : res()));
                            console.log(`Applied migration_${i}`);
                        } catch (migrationErr) {
                            console.error(`Failed to apply migration_${i}:`, migrationErr);
                            return reject(migrationErr);
                        }
                    }
                }
                console.log("All pending migrations applied successfully.");
                resolve();
            });
        });
    });
}

function seedDatabase() {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync('dramas.json')) { return reject(new Error('dramas.json not found in the backend directory.')); }
        const dramas = JSON.parse(fs.readFileSync('dramas.json'));
        db.serialize(() => {
            const stmt = db.prepare("INSERT OR REPLACE INTO dramas (url, title, data) VALUES (?, ?, ?)");
            let count = 0;
            dramas.forEach(drama => {
                const { url, title, ...rest } = drama;
                stmt.run(url, title, JSON.stringify(rest));
                count++;
            });
            stmt.finalize((err) => {
                if (err) return reject(err);
                console.log(`Successfully seeded/updated ${count} dramas into the database.`);
                resolve();
            });
        });
    });
}

async function loadDramasIntoMemory() {
    return new Promise((resolve, reject) => {
        db.all('SELECT url, title, data FROM dramas', (err, rows) => {
            if (err) return reject(err);
            inMemoryDramas = rows.map(row => {
                const data = JSON.parse(row.data);
                return {
                    url: row.url,
                    title: row.title,
                    ...data,
                    genresSet: new Set(data.genres),
                    tagsSet: new Set(data.tags),
                    castSet: new Set(data.cast.map(c => c.actor_name)),
                };
            });
            console.log(`Loaded ${inMemoryDramas.length} dramas into memory.`);
            const allGenres = new Set(), allTags = new Set(), allCountries = new Set(), allCast = new Set();
            inMemoryDramas.forEach(d => {
                d.genres.forEach(g => allGenres.add(g));
                d.tags.forEach(t => allTags.add(t));
                allCountries.add(d.country);
                d.cast.forEach(c => allCast.add(c.actor_name));
            });
            inMemoryMetadata = {
                genres: Array.from(allGenres).sort(),
                tags: Array.from(allTags).sort(),
                countries: Array.from(allCountries).sort(),
                cast: Array.from(allCast).sort(),
            };
            console.log('Derived and cached drama metadata.');
            resolve();
        });
    });
}

const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ message: 'Authentication token required' });
    const token = authHeader.split(' ')[1];
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
};

function emitToUserRoom(userId, event, payload) {
    if (!userId || !event || !payload) return;
    const room = `user_${userId}`;
    io.to(room).emit(event, payload);
    console.log(`[Socket.IO Emit] Emitted event '${event}' to room '${room}' with payload:`, JSON.stringify(payload));
}

async function fetchUserData(userId) {
    if (!userId) throw new Error("User ID is required.");
    try {
        const userData = { favorites: [], statuses: {}, reviews: {}, episodeReviews: {} };
        const queries = [
            new Promise((resolve, reject) => db.all('SELECT drama_url FROM user_favorites WHERE user_id = ?', [userId], (err, rows) => err ? reject(err) : resolve(rows || []))),
            new Promise((resolve, reject) => db.all('SELECT * FROM user_statuses WHERE user_id = ?', [userId], (err, rows) => err ? reject(err) : resolve(rows || []))),
            new Promise((resolve, reject) => db.all('SELECT * FROM user_episode_reviews WHERE user_id = ?', [userId], (err, rows) => err ? reject(err) : resolve(rows || []))),
        ];
        const [favorites, statuses, episodeReviews] = await Promise.all(queries);
        userData.favorites = favorites.map(f => f.drama_url);
        statuses.forEach(s => { userData.statuses[s.drama_url] = { status: s.status, currentEpisode: s.currentEpisode }; });
        episodeReviews.forEach(r => {
            if (!userData.episodeReviews[r.drama_url]) userData.episodeReviews[r.drama_url] = {};
            userData.episodeReviews[r.drama_url][r.episode_number] = { text: r.review_text, updatedAt: r.updated_at };
        });
        return userData;
    } catch (error) {
        console.error(`Failed to fetch data for user ID ${userId}:`, error);
        throw error;
    }
}


// --- EXPRESS & SOCKET.IO SERVER SETUP ---
const app = express();
const server = http.createServer(app);
app.set('trust proxy', 1); 
app.use(helmet());
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false, message: 'Too many requests, please try again after 15 minutes.' });
const authLimiter = rateLimit({ windowMs: 30 * 60 * 1000, max: 10, message: 'Too many authentication attempts, please try again after 30 minutes.' });
app.use(express.json());
app.use(cors(corsOptions));
const io = new Server(server, { 
    cors: corsOptions,
    path: SOCKET_IO_PATH,
});
console.log(`Socket.IO server listening on path: ${SOCKET_IO_PATH}`);

// --- SOCKET.IO MIDDLEWARE & LISTENERS ---
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    console.log(`[Socket.IO Auth] Attempting to authenticate connection from ${socket.handshake.address} with transport ${socket.handshake.query.transport}`);
    if (!token) {
        console.error(`[Socket.IO Auth] REJECTED: No token provided from ${socket.handshake.address}.`);
        return next(new Error('Authentication error: Token not provided.'));
    }
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            console.error(`[Socket.IO Auth] REJECTED: Invalid token from ${socket.handshake.address}. Error: ${err.message}`);
            return next(new Error('Authentication error: Invalid token.'));
        }
        console.log(`[Socket.IO Auth] SUCCESS: Authenticated user '${decoded.username}' (ID: ${decoded.id})`);
        socket.user = decoded;
        next();
    });
});
io.on('connection', (socket) => {
    console.log(`[Socket.IO Connect] Client connected: '${socket.user.username}' (ID: ${socket.user.id}) using transport: ${socket.conn.transport.name}. Socket ID: ${socket.id}`);
    socket.join(`user_${socket.user.id}`);
    console.log(`[Socket.IO Rooms] User '${socket.user.username}' joined room 'user_${socket.user.id}'`);

    socket.onAny((event, ...args) => {
        console.warn(`[Socket.IO Security] Received unexpected event '${event}' from user '${socket.user.username}' (ID: ${socket.user.id}).`);
    });

    socket.on('disconnect', (reason) => {
        console.log(`[Socket.IO Disconnect] Client disconnected: ${socket.user.username}. Reason: ${reason}. Socket ID: ${socket.id}`);
    });
});

// --- API ENDPOINTS ---
app.get('/api/health', (req, res) => res.status(200).json({ status: 'ok' }));

app.get('/api/dramas/metadata', (req, res) => {
    res.json(inMemoryMetadata);
});

app.get('/api/dramas', (req, res) => {
    const { page = '1', limit = '24', search = '', minRating = '0', genres = '', excludeGenres = '', tags = '', excludeTags = '', countries = '', cast = '', sort = '[]' } = req.query;
    const filters = {
        genres: genres ? genres.split(',') : [],
        excludeGenres: excludeGenres ? excludeGenres.split(',') : [],
        tags: tags ? tags.split(',') : [],
        excludeTags: excludeTags ? excludeTags.split(',') : [],
        countries: countries ? countries.split(',') : [],
        cast: cast ? cast.split(',') : [],
        minRating: parseFloat(minRating),
    };
    const sortPriorities = JSON.parse(sort);
    const searchTerm = search.toLowerCase();
    
    let result = inMemoryDramas;
    if (searchTerm) { result = result.filter(d => d.title.toLowerCase().includes(searchTerm)); }
    const hasActiveFilters = filters.genres.length > 0 || filters.excludeGenres.length > 0 || filters.tags.length > 0 || filters.excludeTags.length > 0 || filters.countries.length > 0 || filters.cast.length > 0 || filters.minRating > 0;
    if (hasActiveFilters) {
        result = result.filter(d =>
            (d.rating >= filters.minRating) &&
            (filters.countries.length === 0 || filters.countries.includes(d.country)) &&
            (filters.genres.length === 0 || filters.genres.every(g => d.genresSet.has(g))) &&
            (filters.excludeGenres.length === 0 || !filters.excludeGenres.some(g => d.genresSet.has(g))) &&
            (filters.tags.length === 0 || filters.tags.every(t => d.tagsSet.has(t))) &&
            (filters.excludeTags.length === 0 || !filters.excludeTags.some(t => d.tagsSet.has(t))) &&
            (filters.cast.length === 0 || filters.cast.every(actor => d.castSet.has(actor)))
        );
    }
    
    if (sortPriorities.length > 0 && result.length > 0) {
        const stats = { rating: { min: Infinity, max: -Infinity }, popularity_rank: { min: Infinity, max: -Infinity }, watchers: { min: Infinity, max: -Infinity }, aired_date: { min: Infinity, max: -Infinity }};
        result.forEach(d => {
            stats.rating.min = Math.min(stats.rating.min, d.rating); stats.rating.max = Math.max(stats.rating.max, d.rating);
            stats.popularity_rank.min = Math.min(stats.popularity_rank.min, d.popularity_rank); stats.popularity_rank.max = Math.max(stats.popularity_rank.max, d.popularity_rank);
            stats.watchers.min = Math.min(stats.watchers.min, d.watchers); stats.watchers.max = Math.max(stats.watchers.max, d.watchers);
            const dateTimestamp = new Date(d.aired_date.split(' - ')[0]).getTime();
            if (!isNaN(dateTimestamp)) { stats.aired_date.min = Math.min(stats.aired_date.min, dateTimestamp); stats.aired_date.max = Math.max(stats.aired_date.max, dateTimestamp); }
        });
        const higherIsBetterKeys = ['rating', 'watchers', 'aired_date'];
        const scoredDramas = result.map(d => {
            let score = 0; const maxWeight = sortPriorities.length;
            sortPriorities.forEach((p, index) => {
                const { key, order } = p; const weight = maxWeight - index; const keyStats = stats[key]; const range = keyStats.max - keyStats.min; if (range === 0) return;
                let value = key === 'aired_date' ? (new Date(d.aired_date.split(' - ')[0]).getTime() || keyStats.min) : d[key];
                let normalized = (value - keyStats.min) / range;
                if (!higherIsBetterKeys.includes(key)) { normalized = 1 - normalized; }
                if (order === 'asc') { normalized = 1 - normalized; }
                score += normalized * weight;
            });
            return { ...d, score };
        });
        scoredDramas.sort((a, b) => { if (b.score !== a.score) { return b.score - a.score; } return a.title.localeCompare(b.title); });
        result = scoredDramas;
    } else {
        result.sort((a,b) => a.popularity_rank - b.popularity_rank);
    }
    
    const totalItems = result.length;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const startIndex = (pageNum - 1) * limitNum;
    const paginatedItems = result.slice(startIndex, startIndex + limitNum);

    res.json({
        totalItems,
        dramas: paginatedItems.map(({ genresSet, tagsSet, castSet, score, ...rest }) => rest),
        currentPage: pageNum,
        totalPages: Math.ceil(totalItems / limitNum)
    });
});

app.use('/api/auth', authLimiter);

app.post('/api/auth/register', (req, res) => {
    const { username, password } = req.body;
    const usernameRegex = /^[a-zA-Z0-9_.-]{3,20}$/;
    if (typeof username !== 'string' || typeof password !== 'string' || !usernameRegex.test(username) || password.length < 6) { 
        return res.status(400).json({ message: "Invalid input: Username must be 3-20 alphanumeric characters (letters, numbers, _, ., -). Password must be at least 6 characters." }); 
    }
    const hashedPassword = bcrypt.hashSync(password, 8);
    db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword], function(err) {
        if (err) return res.status(409).json({ message: "Username already exists" });
        const userId = this.lastID;
        const token = jwt.sign({ id: userId, username: username }, JWT_SECRET, { expiresIn: '24h' });
        res.status(201).json({ message: "User created successfully", user: { username }, token });
    });
});

app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) { return res.status(400).json({ message: "Username and password are required." }); }
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (err || !user || !bcrypt.compareSync(password, user.password)) { return res.status(401).json({ message: 'Invalid credentials' }); }
        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ user: { username: user.username }, token });
    });
});

app.use('/api/user', authMiddleware, apiLimiter); 

app.get('/api/user/data', async (req, res) => {
    try {
        const userData = await fetchUserData(req.user.id);
        res.json({ user: { username: req.user.username }, data: userData });
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch user data." });
    }
});

app.post('/api/user/favorites', (req, res) => {
    const { dramaUrl, isFavorite } = req.body;
    if (typeof dramaUrl !== 'string' || typeof isFavorite !== 'boolean') return res.status(400).json({ message: 'Invalid payload.' });
    const sql = isFavorite ? 'INSERT OR IGNORE INTO user_favorites (user_id, drama_url) VALUES (?, ?)' : 'DELETE FROM user_favorites WHERE user_id = ? AND drama_url = ?';
    db.run(sql, [req.user.id, dramaUrl], function(err) {
        if (err) return res.status(500).json({ message: 'Database error' });
        if (this.changes > 0) { emitToUserRoom(req.user.id, 'favorite_updated', { dramaUrl, isFavorite }); }
        res.status(200).json({ success: true });
    });
});

app.post('/api/user/statuses', (req, res) => {
    const { dramaUrl, status, currentEpisode } = req.body;
    if (typeof dramaUrl !== 'string' || typeof status !== 'string' || (currentEpisode !== undefined && typeof currentEpisode !== 'number')) { return res.status(400).json({ message: 'Invalid payload.' }); }
    const statusInfo = { status, currentEpisode: currentEpisode || 0 };
    if (!status) {
        db.run('DELETE FROM user_statuses WHERE user_id = ? AND drama_url = ?', [req.user.id, dramaUrl], function(err) {
            if (err) return res.status(500).json({ message: 'Database error' });
            if (this.changes > 0) { emitToUserRoom(req.user.id, 'status_updated', { dramaUrl, statusInfo: null }); }
            res.status(200).json({ success: true });
        });
    } else {
        db.run('INSERT OR REPLACE INTO user_statuses (user_id, drama_url, status, currentEpisode) VALUES (?, ?, ?, ?)', [req.user.id, dramaUrl, status, currentEpisode || 0], function(err) {
            if (err) return res.status(500).json({ message: 'Database error' });
            if (this.changes > 0) { emitToUserRoom(req.user.id, 'status_updated', { dramaUrl, statusInfo }); }
            res.status(200).json({ success: true });
        });
    }
});

app.post('/api/user/reviews/episodes', (req, res) => {
    const { dramaUrl, episodeNumber, text, clientUpdatedAt, force } = req.body;
    if (typeof dramaUrl !== 'string' || typeof episodeNumber !== 'number' || typeof text !== 'string' || typeof clientUpdatedAt !== 'number' || (force !== undefined && typeof force !== 'boolean')) { return res.status(400).json({ message: 'Invalid payload.' }); }
    if (text.trim() === '') {
        db.run('DELETE FROM user_episode_reviews WHERE user_id = ? AND drama_url = ? AND episode_number = ?', [req.user.id, dramaUrl, episodeNumber], function(err) {
            if (err) return res.status(500).json({ message: 'Database error' });
            if (this.changes > 0) { emitToUserRoom(req.user.id, 'episode_review_updated', { dramaUrl, episodeNumber, review: null }); }
            res.status(200).json({ success: true });
        });
        return;
    }
    db.get('SELECT updated_at, review_text FROM user_episode_reviews WHERE user_id = ? AND drama_url = ? AND episode_number = ?', [req.user.id, dramaUrl, episodeNumber], (err, row) => {
        if (err) return res.status(500).json({ message: 'Database query failed.' });
        if (!force && row && row.updated_at > clientUpdatedAt) {
            return res.status(409).json({ message: 'Conflict detected.', serverVersion: { text: row.review_text, updatedAt: row.updated_at } });
        }
        const newUpdatedAt = Date.now();
        db.run('INSERT OR REPLACE INTO user_episode_reviews (user_id, drama_url, episode_number, review_text, updated_at) VALUES (?, ?, ?, ?, ?)', [req.user.id, dramaUrl, episodeNumber, text, newUpdatedAt], function(err) {
            if (err) return res.status(500).json({ message: 'Database error' });
            if (this.changes > 0) {
                const review = { text, updatedAt: newUpdatedAt };
                emitToUserRoom(req.user.id, 'episode_review_updated', { dramaUrl, episodeNumber, review });
            }
            res.status(200).json({ success: true, newUpdatedAt });
        });
    });
});

// --- ERROR HANDLING & SERVER START ---
app.use((err, req, res, next) => {
    console.error("An unexpected error occurred:", err);
    res.status(500).json({ message: 'Something broke! A server error occurred.' });
});

async function startServer() {
    try {
        await runMigrations();
        await loadDramasIntoMemory();

        const pubClient = createClient({ url: REDIS_URL });
        const subClient = pubClient.duplicate();

        await Promise.all([pubClient.connect(), subClient.connect()]);
        
        io.adapter(createAdapter(pubClient, subClient));
        console.log("Socket.IO is now using the Redis adapter.");

        server.listen(PORT, () => {
            console.log(`Server with real-time support is running on http://localhost:${PORT}`);
        });
    } catch (err) {
        console.error("Failed to start server:", err);
        process.exit(1);
    }
}

// --- SEED SCRIPT RUNNER ---
if (process.argv.includes('--seed')) {
    seedDatabase()
      .then(() => {
          console.log("Seeding complete. Closing database connection.");
          db.close();
       })
      .catch(err => {
          console.error("Seeding failed:", err);
          db.close();
          process.exit(1);
      });
} else {
    startServer();
}

process.on('SIGINT', () => {
    console.log('SIGINT signal received: closing HTTP server and database.');
    server.close(() => {
        console.log('HTTP server closed.');
        db.close((err) => {
            if (err) console.error('Error closing the database:', err.message);
            else console.log('Database connection closed.');
            process.exit(0);
        });
    });
});
```
## 5. Running the Backend

The workflow is now simpler. The database schema is handled automatically.

1.  **Start the Server for Development**:
    Make sure your Redis server is running first, then start the Node.js server.
    ```bash
    npm run dev
    ```
    The first time you run this, the server will automatically create the `dramas.db` file, run all necessary schema migrations, connect to Redis, load the drama data into memory, and start the server.

2.  **Seed the Database with Data (One-Time Command)**:
    This command now only populates the tables with data from `dramas.json`. You only need to run this once after the initial setup, or again if you update `dramas.json`.
    ```bash
    npm run seed
    ```

## 6. Production Deployment with PM2

For production, it is highly recommended to use a process manager like PM2 and to set your `JWT_SECRET` and `REDIS_URL` as environment variables rather than in the `.env` file.

1.  **Install PM2 Globally**:
    ```bash
    npm install pm2 -g
    ```

2.  **Start the Production Server**:
    From your `/backend` directory, run the following command. The server will automatically pick up the `PORT` from your `.env` file, but we will override the secrets directly on the command line for better security.

    ```bash
    JWT_SECRET="your-long-random-super-secret-string-for-production" REDIS_URL="redis://your-production-redis-host:6379" pm2 start server.js -i max --name "dramaverse-backend"
    ```
    -   `JWT_SECRET=...`: **Crucially, replace this with your own long, random secret.** Setting it here overrides any value in `.env`.
    -   `REDIS_URL=...`: Set this to your production Redis server's URL.
    -   `-i max`: Enables cluster mode to use all available CPU cores. This is why the Redis adapter is essential.
    -   `--name "..."`: Gives the process a memorable name in PM2.

3.  **Useful PM2 Commands**:
    -   `pm2 list`: See the status of all managed applications.
    -   `pm2 monit`: Open a real-time dashboard to monitor CPU and memory usage.
    -   `pm2 logs dramaverse-backend`: View the logs for your app.
    -   `pm2 restart dramaverse-backend`: Gracefully restart the app.
    -   `pm2 stop dramaverse-backend`: Stop the app.
    -   `pm2 delete dramaverse-backend`: Stop and remove the app from PM2's list.

## 7. Security & Nginx

The security best practices and Nginx reverse proxy configurations from the previous guide are still highly recommended and can be used without any changes. Remember to:
-   Update the `CORS_ALLOWED_ORIGINS` variable in your `.env` file for your production domain.
-   Use a strong, secret `JWT_SECRET` and a correct `REDIS_URL` set via an environment variable.
-   Run your Node.js application behind a reverse proxy like Nginx in production, and ensure it is configured to handle WebSocket upgrade requests correctly.
-   If you are load-balancing between multiple servers (not just processes on one server), ensure your Nginx configuration **does not** use sticky sessions, as the Redis adapter makes them unnecessary.
