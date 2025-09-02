



# Dramaverse Backend Setup Guide (v2 - MySQL)

This document provides a comprehensive guide to setting up and running the optional backend server for the Dramaverse application using **MySQL and Docker**. This version is designed for scalability, persistence, and real-time, multi-device data synchronization.

## 1. Overview

-   **Technology Stack**:
    -   **Runtime**: Node.js
    -   **Framework**: Express.js
    -   **Real-Time**: Socket.IO for WebSocket communication.
    -   **Database**: **MySQL 8.0** (managed via Docker Compose).
    -   **Authentication**: JSON Web Tokens (JWT) via secure `HttpOnly` cookies.
    -   **Password Hashing**: `bcryptjs` to securely store user passwords.
    -   **Configuration**: `dotenv` for managing environment variables.
    -   **Security**: `helmet` for security headers and `express-rate-limit` for request throttling.
    -   **Cookie Handling**: `cookie-parser` for Express and `cookie` for Socket.IO.

-   **Key Features**:
    -   **Dockerized Database**: The MySQL server runs in an isolated Docker container with a persistent volume, ensuring data is never lost.
    -   **Custom Port**: Runs on a non-standard port (`3307`) to avoid conflicts with other local MySQL instances.
    -   **Automatic Migrations**: The database schema is automatically created and updated on server startup.
    -   **Default Admin User**: Automatically creates an `admin` user with password `admin` on first startup.
    -   **Full Admin Panel Backend**: Provides protected API endpoints for admins to manage all users.
    -   **Real-Time Sync**: When a user makes a change on one device, the server instantly pushes a granular update event to all of that user's other logged-in devices.
    -   **Server-Side Processing**: Offloads all heavy filtering, sorting, and pagination logic to the server.
    -   **Optimized Auth Flow**: Both the `/api/auth/login` and `/api/auth/register` endpoints return the full user data payload (user profile, favorites, statuses, etc.) upon success. This eliminates the need for a second API call from the frontend, fixing the "failed to fetch user data" error and improving performance.
    -   **Conflict Resolution**: Includes logic to detect and handle data sync conflicts, essential for robust multi-device offline PWA support.

## 2. Initial Setup

### Prerequisites
-   [Node.js](https://nodejs.org/) (version 16 or higher).
-   [Docker](https://www.docker.com/get-started/) and [Docker Compose](https://docs.docker.com/compose/install/).

### Steps
1.  **Create a Backend Directory**: In the root of your project, create a new folder named `backend`. All the following commands and file creations will happen inside this `backend` directory.

2.  **Initialize the Project**: Open a terminal inside the `backend` directory and run:
    ```bash
    npm init -y
    ```

3.  **Install Dependencies**: Install the necessary packages for the server, including the `mysql2` driver.
    ```bash
    npm install express mysql2 cors bcryptjs jsonwebtoken socket.io helmet express-rate-limit dotenv cookie-parser cookie
    ```

4.  **Install Development Dependency**: Install `nodemon` for automatic server restarts during development.
    ```bash
    npm install --save-dev nodemon
    ```

5.  **Create Docker Compose File**: Create a file named `docker-compose.yml` in the `backend` directory. This defines your MySQL service.
    ```yml
    version: '3.8'

    services:
      db:
        image: mysql:8.0
        container_name: dramaverse_mysql_db
        restart: always
        # Expose port 3307 on the host, mapping to the default 3306 inside the container
        ports:
          - "3307:3306"
        environment:
          # IMPORTANT: Change these passwords for production
          MYSQL_ROOT_PASSWORD: your_strong_root_password 
          MYSQL_DATABASE: dramaverse_db
          MYSQL_USER: drama_user
          MYSQL_PASSWORD: your_strong_password
        volumes:
          # This creates a named volume to persist database data
          - dramaverse-mysql-data:/var/lib/mysql
        healthcheck:
          # Checks if the database is ready to accept connections
          test: ["CMD", "mysqladmin" ,"ping", "-h", "localhost", "-u", "$${MYSQL_USER}", "-p$${MYSQL_PASSWORD}"]
          interval: 10s
          timeout: 5s
          retries: 5

    volumes:
      dramaverse-mysql-data:
        driver: local
    ```

6.  **Create Environment File**: Create a file named `.env` in the `backend` directory. It must match the credentials in `docker-compose.yml`.
    ```env
    # The port the Node.js server will run on
    PORT=3001

    # A comma-separated list of allowed origins for CORS.
    CORS_ALLOWED_ORIGINS="http://localhost:5173,http://127.0.0.1:5173"

    # A long, random, and secret string for signing JWTs
    JWT_SECRET="replace-this-with-a-very-long-and-random-string"

    # (Optional) The subpath for the Socket.IO server.
    SOCKET_IO_PATH="/dramaveerse/socket.io/"

    # --- MySQL Connection Details ---
    # These must match the values in your docker-compose.yml
    DB_HOST=127.0.0.1
    DB_PORT=3307 # Use the custom port exposed by Docker
    DB_USER=drama_user
    DB_PASSWORD=your_strong_password # Change this
    DB_DATABASE=dramaverse_db
    ```

7.  **Configure `.gitignore`**: Create a `.gitignore` file in the `backend` directory.
    ```gitignore
    .env
    node_modules/
    npm-debug.log*
    ```

8.  **Configure `package.json`**: Open `package.json` and add the following `scripts`:
    ```json
    "scripts": {
      "start": "node server.js",
      "dev": "nodemon server.js",
      "seed": "node server.js --seed"
    },
    ```

9.  **Copy Drama Data**: Copy `dramas.json` from `/public/data/dramas.json` into your new `/backend` directory for the seed script.

## 3. Project Structure

Your `backend` directory will now have this structure:

```
/backend
├── .env
├── .gitignore
├── docker-compose.yml   # New Docker configuration
├── server.js            # The self-contained server file (MySQL version)
├── dramas.json
└── package.json
```

## 4. Code Implementation

Create a file named `server.js` inside the `backend` directory and paste the **entire refactored code block below** into it. This version is built to connect to and work with MySQL.

### `server.js` (MySQL Version)
```javascript
// --- DEPENDENCIES ---
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const mysql = require('mysql2/promise');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const cookie = require('cookie');
const crypto = require('crypto');

// --- CONFIGURATION ---
dotenv.config();

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET;
const SOCKET_IO_PATH = process.env.SOCKET_IO_PATH || '/socket.io/';

if (!JWT_SECRET || JWT_SECRET === "replace-this-with-a-very-long-and-random-string") {
    console.error("FATAL ERROR: JWT_SECRET is not set or is set to the default value in the .env file.");
    process.exit(1);
}

const CORS_ALLOWED_ORIGINS = process.env.CORS_ALLOWED_ORIGINS;
let allowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173']; 
if (CORS_ALLOWED_ORIGINS) {
    allowedOrigins = CORS_ALLOWED_ORIGINS.split(',').map(origin => origin.trim());
}
const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) callback(null, true);
        else callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
};

// --- DATABASE MIGRATIONS (MySQL Syntax) ---
const migrations = [
    {
        name: '001_initial_schema',
        up: `
            CREATE TABLE IF NOT EXISTS users (
                id INT PRIMARY KEY AUTO_INCREMENT, 
                username VARCHAR(255) UNIQUE NOT NULL, 
                password VARCHAR(255) NOT NULL, 
                is_admin TINYINT(1) DEFAULT 0 NOT NULL, 
                is_banned TINYINT(1) DEFAULT 0 NOT NULL, 
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS dramas (
                url VARCHAR(255) PRIMARY KEY, 
                title VARCHAR(255), 
                data JSON
            );

            CREATE TABLE IF NOT EXISTS user_favorites (
                user_id INT, 
                drama_url VARCHAR(255),
                PRIMARY KEY (user_id, drama_url), 
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, 
                FOREIGN KEY (drama_url) REFERENCES dramas(url) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS user_statuses (
                user_id INT, 
                drama_url VARCHAR(255), 
                status VARCHAR(255), 
                currentEpisode INT, 
                PRIMARY KEY (user_id, drama_url), 
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, 
                FOREIGN KEY (drama_url) REFERENCES dramas(url) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS user_episode_reviews (
                user_id INT, 
                drama_url VARCHAR(255), 
                episode_number INT, 
                review_text TEXT, 
                updated_at BIGINT, 
                PRIMARY KEY (user_id, drama_url, episode_number), 
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, 
                FOREIGN KEY (drama_url) REFERENCES dramas(url) ON DELETE CASCADE
            );
        `
    },
    // Split the ALTER TABLE statements into separate, more atomic migrations.
    // This makes them individually transactional and easier to debug.
    {
        name: '002_add_updated_at_to_favorites',
        up: `ALTER TABLE user_favorites ADD COLUMN updated_at BIGINT;`
    },
    {
        name: '003_add_updated_at_to_statuses',
        up: `ALTER TABLE user_statuses ADD COLUMN updated_at BIGINT;`
    }
];

// --- DATABASE & IN-MEMORY CACHE SETUP ---
let db;
let inMemoryDramas = [];
let inMemoryMetadata = {};

async function initializeDatabase() {
    db = await mysql.createPool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });
    console.log('Connected to the MySQL database.');
}

// --- HELPER & HANDLER FUNCTION DEFINITIONS ---
async function runMigrations() {
    await db.execute(`CREATE TABLE IF NOT EXISTS migrations (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(255) UNIQUE NOT NULL)`);
    const [completedRows] = await db.query('SELECT name FROM migrations');
    const completedNames = new Set(completedRows.map(m => m.name));
    
    for (const migration of migrations) {
        if (!completedNames.has(migration.name)) {
            console.log(`Applying new migration: '${migration.name}'...`);
            const connection = await db.getConnection();
            try {
                await connection.beginTransaction();
                const statements = migration.up.split(';').map(s => s.trim()).filter(s => s.length > 0);
                for (const statement of statements) {
                    try {
                        await connection.execute(statement);
                    } catch (statementErr) {
                        // If the error is specifically about a duplicate column, we can ignore it
                        // as it means a previous, failed migration attempt partially succeeded.
                        // This makes the migration script idempotent for column additions.
                        if (statementErr.code === 'ER_DUP_FIELDNAME') {
                            console.warn(`  ...WARN: Column in statement already exists, likely from a previous run. Skipping. Statement: "${statement}"`);
                        } else {
                            // For any other error, re-throw to trigger the rollback.
                            throw statementErr;
                        }
                    }
                }
                await connection.execute('INSERT INTO migrations (name) VALUES (?)', [migration.name]);
                await connection.commit();
                console.log(`  ...Success: Applied migration '${migration.name}'`);
            } catch (err) {
                await connection.rollback();
                console.error(`  ...ERROR: Failed to apply migration '${migration.name}'. Rolling back.`, err);
                throw err; 
            } finally {
                connection.release();
            }
        }
    }
    console.log("Database schema is up to date.");
}

async function seedAdminUser() {
    const [rows] = await db.query('SELECT id, is_admin FROM users WHERE username = ?', ['admin']);
    const user = rows[0];
    if (user) {
        if (!user.is_admin) {
            await db.execute('UPDATE users SET is_admin = 1 WHERE id = ?', [user.id]);
            console.log("Updated existing 'admin' user to have admin privileges.");
        } else {
            console.log("Default admin user 'admin' already exists and has admin rights.");
        }
    } else {
        const hashedPassword = bcrypt.hashSync('admin', 8);
        await db.execute('INSERT INTO users (username, password, is_admin, is_banned) VALUES (?, ?, ?, ?)', ['admin', hashedPassword, 1, 0]);
        console.log("Default admin user 'admin' created successfully.");
    }
}

async function seedDatabase() {
    if (!fs.existsSync('dramas.json')) throw new Error('dramas.json not found.');
    const dramas = JSON.parse(fs.readFileSync('dramas.json'));
    const sql = "INSERT INTO dramas (url, title, data) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE title=VALUES(title), data=VALUES(data)";
    for (const drama of dramas) {
        const { url, title, ...rest } = drama;
        await db.execute(sql, [url, title, JSON.stringify(rest)]);
    }
    console.log(`Successfully seeded/updated ${dramas.length} dramas.`);
}

async function loadDramasIntoMemory() {
    const [rows] = await db.query('SELECT url, title, data FROM dramas');
    inMemoryDramas = rows.map(row => {
        const data = row.data;
        return {
            url: row.url, title: row.title, ...data,
            genresSet: new Set(data.genres), tagsSet: new Set(data.tags),
            castSet: new Set(data.cast.map(c => c.actor_name)),
        };
    });
    console.log(`Loaded ${inMemoryDramas.length} dramas into memory.`);
    
    const allGenres = new Set(), allTags = new Set(), allCountries = new Set(), allCast = new Set();
    inMemoryDramas.forEach(d => {
        d.genres.forEach(g => allGenres.add(g)); d.tags.forEach(t => allTags.add(t));
        allCountries.add(d.country); d.cast.forEach(c => allCast.add(c.actor_name));
    });
    inMemoryMetadata = {
        genres: Array.from(allGenres).sort(), tags: Array.from(allTags).sort(),
        countries: Array.from(allCountries).sort(), cast: Array.from(allCast).sort(),
    };
    console.log('Derived and cached drama metadata.');
}

const authMiddleware = (req, res, next) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ message: 'Authentication required' });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (err) {
        res.clearCookie('token').status(401).json({ message: 'Invalid or expired token' });
    }
};

const adminAuthMiddleware = (req, res, next) => {
    if (!req.user || !req.user.isAdmin) return res.status(403).json({ message: 'Forbidden: Administrator access required.' });
    next();
};

function emitToUserRoom(userId, event, payload) {
    io.to(`user_${userId}`).emit(event, payload);
    console.log(`[Socket.IO Emit] Emitted event '${event}' to room 'user_${userId}'`);
}

async function fetchUserData(userId) {
    if (!userId) throw new Error("User ID is required.");
    const userData = { favorites: [], statuses: {}, reviews: {}, episodeReviews: {}, listUpdateTimestamps: {} };
    
    const [favRows] = await db.query('SELECT drama_url FROM user_favorites WHERE user_id = ?', [userId]);
    userData.favorites = favRows.map(f => f.drama_url);

    const [favTsRows] = await db.query('SELECT MAX(updated_at) as max_ts FROM user_favorites WHERE user_id = ?', [userId]);
    if (favTsRows[0]?.max_ts) {
        userData.listUpdateTimestamps['Favorites'] = parseInt(favTsRows[0].max_ts, 10);
    }

    const [statusRows] = await db.query('SELECT drama_url, status, currentEpisode, updated_at FROM user_statuses WHERE user_id = ?', [userId]);
    statusRows.forEach(s => { 
        const statusTimestamp = parseInt(s.updated_at, 10);
        userData.statuses[s.drama_url] = { status: s.status, currentEpisode: s.currentEpisode, updatedAt: statusTimestamp }; 
        userData.listUpdateTimestamps[s.status] = Math.max(userData.listUpdateTimestamps[s.status] || 0, statusTimestamp);
    });

    const [reviewRows] = await db.query('SELECT drama_url, episode_number, review_text, updated_at FROM user_episode_reviews WHERE user_id = ?', [userId]);
    reviewRows.forEach(r => {
        if (!userData.episodeReviews[r.drama_url]) userData.episodeReviews[r.drama_url] = {};
        userData.episodeReviews[r.drama_url][r.episode_number] = { text: r.review_text, updatedAt: parseInt(r.updated_at, 10) };
    });

    return userData;
}

const app = express();
const server = http.createServer(app);
app.use(helmet());
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
const authLimiter = rateLimit({ windowMs: 30 * 60 * 1000, max: 10 });
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());
const io = new Server(server, { cors: corsOptions, path: SOCKET_IO_PATH });

io.use((socket, next) => {
    const token = cookie.parse(socket.handshake.headers.cookie || '').token;
    if (!token) return next(new Error('Authentication error: Token cookie not found.'));
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return next(new Error('Authentication error: Invalid token.'));
        socket.user = decoded;
        next();
    });
});
io.on('connection', (socket) => {
    socket.join(`user_${socket.user.id}`);
    socket.onAny((event) => socket.disconnect(true));
    socket.on('disconnect', (reason) => console.log(`Client ${socket.user.username} disconnected: ${reason}`));
});

// --- API ENDPOINTS ---
app.get('/api/health', (req, res) => res.status(200).json({ status: 'ok' }));
app.get('/api/dramas/metadata', apiLimiter, (req, res) => res.json(inMemoryMetadata));

app.get('/api/dramas', apiLimiter, (req, res) => {
    const { page = '1', limit = '24', search = '', minRating = '0', genres = '', excludeGenres = '', tags = '', excludeTags = '', countries = '', cast = '', sort = '[]', sortMode = 'weighted' } = req.query;
    const filters = {
        genres: genres.split(',').filter(Boolean), excludeGenres: excludeGenres.split(',').filter(Boolean),
        tags: tags.split(',').filter(Boolean), excludeTags: excludeTags.split(',').filter(Boolean),
        countries: countries.split(',').filter(Boolean), cast: cast.split(',').filter(Boolean),
        minRating: parseFloat(minRating),
    };
    let result = inMemoryDramas.filter(d => 
        (d.title.toLowerCase().includes(search.toLowerCase())) &&
        (d.rating >= filters.minRating) &&
        (filters.countries.length === 0 || filters.countries.includes(d.country)) &&
        (filters.genres.length === 0 || filters.genres.every(g => d.genresSet.has(g))) &&
        (filters.excludeGenres.length === 0 || !filters.excludeGenres.some(g => d.genresSet.has(g))) &&
        (filters.tags.length === 0 || filters.tags.every(t => d.tagsSet.has(t))) &&
        (filters.excludeTags.length === 0 || !filters.excludeTags.some(t => d.tagsSet.has(t))) &&
        (filters.cast.length === 0 || filters.cast.every(actor => d.castSet.has(actor)))
    );

    if (sortMode === 'random') {
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
    } else {
        const sortPriorities = JSON.parse(sort);
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

app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password || password.length < 6 || username.length < 3) return res.status(400).json({ message: "Invalid username or password." });
        const hashedPassword = bcrypt.hashSync(password, 8);
        const [result] = await db.execute('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword]);
        const newUser = { id: result.insertId, username, isAdmin: false };
        const token = jwt.sign(newUser, JWT_SECRET, { expiresIn: '24h' });
        res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 24 * 60 * 60 * 1000 });
        const data = await fetchUserData(newUser.id);
        res.status(201).json({ user: { username, isAdmin: false }, data });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: "Username already exists." });
        res.status(500).json({ message: "Server error." });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const [rows] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
        const user = rows[0];
        if (!user || !bcrypt.compareSync(password, user.password)) return res.status(401).json({ message: 'Invalid credentials' });
        if (user.is_banned) return res.status(403).json({ message: 'This account has been banned.' });
        
        const token = jwt.sign({ id: user.id, username: user.username, isAdmin: !!user.is_admin }, JWT_SECRET, { expiresIn: '24h' });
        res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 24 * 60 * 60 * 1000 });
        
        const data = await fetchUserData(user.id);
        res.json({ user: { username: user.username, isAdmin: !!user.is_admin }, data });
    } catch (err) {
        res.status(500).json({ message: "Server error." });
    }
});

app.post('/api/auth/logout', (req, res) => res.clearCookie('token').sendStatus(200));

app.use('/api/user', authMiddleware, apiLimiter); 
app.get('/api/user/data', async (req, res) => res.json({ user: { username: req.user.username, isAdmin: !!req.user.isAdmin }, data: await fetchUserData(req.user.id) }));

app.post('/api/user/favorites', async (req, res) => {
    const { dramaUrl, isFavorite } = req.body;
    const now = Date.now();
    const sql = isFavorite ? 'INSERT INTO user_favorites (user_id, drama_url, updated_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE updated_at=?' : 'DELETE FROM user_favorites WHERE user_id = ? AND drama_url = ?';
    const [result] = await db.execute(sql, isFavorite ? [req.user.id, dramaUrl, now, now] : [req.user.id, dramaUrl]);
    if (result.affectedRows > 0) emitToUserRoom(req.user.id, 'favorite_updated', { dramaUrl, isFavorite });
    res.sendStatus(200);
});

app.post('/api/user/statuses', async (req, res) => {
    const { dramaUrl, status, currentEpisode } = req.body;
    const updatedAt = Date.now();
    if (!status) {
        const [result] = await db.execute('DELETE FROM user_statuses WHERE user_id = ? AND drama_url = ?', [req.user.id, dramaUrl]);
        if (result.affectedRows > 0) emitToUserRoom(req.user.id, 'status_updated', { dramaUrl, statusInfo: null });
    } else {
        const [result] = await db.execute('INSERT INTO user_statuses (user_id, drama_url, status, currentEpisode, updated_at) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE status=VALUES(status), currentEpisode=VALUES(currentEpisode), updated_at=VALUES(updated_at)', [req.user.id, dramaUrl, status, currentEpisode || 0, updatedAt]);
        if (result.affectedRows > 0) emitToUserRoom(req.user.id, 'status_updated', { dramaUrl, statusInfo: { status, currentEpisode: currentEpisode || 0, updatedAt } });
    }
    res.sendStatus(200);
});

app.post('/api/user/reviews/track_progress', async (req, res) => {
    const { dramaUrl, episodeNumber, text, totalEpisodes, clientUpdatedAt, force } = req.body;
    const now = Date.now();
    const userId = req.user.id;
    const connection = await db.getConnection();
    try {
        if (!force && text.trim() && clientUpdatedAt) {
            const [rows] = await connection.query('SELECT updated_at, review_text FROM user_episode_reviews WHERE user_id = ? AND drama_url = ? AND episode_number = ?', [userId, dramaUrl, episodeNumber]);
            const serverReview = rows[0];
            if (serverReview && serverReview.updated_at > clientUpdatedAt) {
                 connection.release();
                 return res.status(409).json({ message: 'Conflict detected.', serverVersion: { text: serverReview.review_text, updatedAt: serverReview.updated_at } });
            }
        }

        await connection.beginTransaction();
        let reviewUpdated = false;
        if (text.trim() === '') {
            const [del] = await connection.execute('DELETE FROM user_episode_reviews WHERE user_id = ? AND drama_url = ? AND episode_number = ?', [userId, dramaUrl, episodeNumber]);
            if (del.affectedRows > 0) reviewUpdated = true;
        } else {
            const [up] = await connection.execute('INSERT INTO user_episode_reviews (user_id, drama_url, episode_number, review_text, updated_at) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE review_text=VALUES(review_text), updated_at=VALUES(updated_at)', [userId, dramaUrl, episodeNumber, text, now]);
            if (up.affectedRows > 0) reviewUpdated = true;
        }

        let statusUpdated = false;
        let finalStatusInfo = null;
        if (text.trim() !== '') {
            const [statusRows] = await connection.query('SELECT * FROM user_statuses WHERE user_id = ? AND drama_url = ? FOR UPDATE', [userId, dramaUrl]);
            const oldStatusInfo = statusRows[0];
            let newStatus = oldStatusInfo?.status || 'Watching';
            let newEp = Math.max(oldStatusInfo?.currentEpisode || 0, episodeNumber);
            if (newStatus === 'Plan to Watch') newStatus = 'Watching';
            if (episodeNumber === totalEpisodes) { newStatus = 'Completed'; newEp = totalEpisodes; }
            if (!oldStatusInfo || newStatus !== oldStatusInfo.status || newEp !== oldStatusInfo.currentEpisode) {
                const [statusResult] = await connection.execute('INSERT INTO user_statuses (user_id, drama_url, status, currentEpisode, updated_at) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE status=VALUES(status), currentEpisode=VALUES(currentEpisode), updated_at=VALUES(updated_at)', [userId, dramaUrl, newStatus, newEp, now]);
                if (statusResult.affectedRows > 0) {
                    statusUpdated = true;
                    finalStatusInfo = { status: newStatus, currentEpisode: newEp, updatedAt: now };
                }
            }
        }
        await connection.commit();
        if (reviewUpdated) emitToUserRoom(userId, 'episode_review_updated', { dramaUrl, episodeNumber, review: text.trim() ? { text, updatedAt: now } : null });
        if (statusUpdated) emitToUserRoom(userId, 'status_updated', { dramaUrl, statusInfo: finalStatusInfo });
        res.status(200).json({ success: true });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ message: 'Failed to update review and progress.' });
    } finally {
        connection.release();
    }
});

app.post('/api/user/change-password', async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user.id;

        if (!currentPassword || !newPassword || newPassword.length < 6) {
            return res.status(400).json({ message: "Invalid payload. New password must be at least 6 characters." });
        }

        const [rows] = await db.query('SELECT password FROM users WHERE id = ?', [userId]);
        const user = rows[0];

        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        const isPasswordValid = bcrypt.compareSync(currentPassword, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Incorrect current password.' });
        }

        const newHashedPassword = bcrypt.hashSync(newPassword, 8);
        await db.execute('UPDATE users SET password = ? WHERE id = ?', [newHashedPassword, userId]);

        res.status(200).json({ message: "Password updated successfully." });
    } catch (err) {
        console.error("Password change error:", err);
        res.status(500).json({ message: "Server error during password change." });
    }
});

// --- RECOMMENDATION ENDPOINTS & LOGIC ---

// Helper function to get a user's library (URLs of dramas they've favorited or completed)
const getUserLibrary = async (userId) => {
    const [rows] = await db.query(`
        (SELECT drama_url FROM user_favorites WHERE user_id = ?)
        UNION
        (SELECT drama_url FROM user_statuses WHERE user_id = ? AND status = 'Completed')
    `, [userId, userId]);
    return new Set(rows.map(r => r.drama_url));
};

// Engine 1: The Hidden Gem
const getHiddenGem = async (userId) => {
    const userLibrary = await getUserLibrary(userId);
    if (userLibrary.size === 0) return null;

    const userProfile = {}; // to store weighted genres/tags
    inMemoryDramas.filter(d => userLibrary.has(d.url)).forEach(d => {
        d.genres.forEach(g => { userProfile[g] = (userProfile[g] || 0) + 1.5; });
        d.tags.forEach(t => { userProfile[t] = (userProfile[t] || 0) + 1; });
    });

    const candidates = inMemoryDramas.filter(d => 
        !userLibrary.has(d.url) && d.rating >= 8.5 && d.popularity_rank > 500
    );

    if (candidates.length === 0) return null;

    const scoredCandidates = candidates.map(d => {
        let score = 0;
        d.genres.forEach(g => { if (userProfile[g]) score += userProfile[g]; });
        d.tags.forEach(t => { if (userProfile[t]) score += userProfile[t]; });
        return { drama: d, score };
    });

    const bestMatch = scoredCandidates.sort((a, b) => b.score - a.score)[0];
    return bestMatch.score > 0 ? bestMatch.drama : null;
};

// Engine 2: The Genre Specialist
const getGenreSpecialist = async (userId) => {
    const [rows] = await db.query(`
        SELECT drama_url FROM user_statuses 
        WHERE user_id = ? AND status IN ('Watching', 'Completed')
    `, [userId]);
    const watchedUrls = new Set(rows.map(r => r.drama_url));
    if (watchedUrls.size === 0) return null;

    const genreCounts = {};
    inMemoryDramas.filter(d => watchedUrls.has(d.url)).forEach(d => {
        d.genres.forEach(g => { genreCounts[g] = (genreCounts[g] || 0) + 1; });
    });
    
    if (Object.keys(genreCounts).length === 0) return null;

    const topGenre = Object.entries(genreCounts).sort((a, b) => b[1] - a[1])[0][0];
    
    const candidates = inMemoryDramas
        .filter(d => !watchedUrls.has(d.url) && d.genres.includes(topGenre))
        .sort((a, b) => b.rating - a.rating);

    return candidates.length > 0 ? { drama: candidates[0], genre: topGenre } : null;
};

// Engine 3: Star Power
const getStarPower = async (userId) => {
    const userLibrary = await getUserLibrary(userId);
    if (userLibrary.size === 0) return null;

    const actorCounts = {};
    inMemoryDramas.filter(d => userLibrary.has(d.url)).forEach(d => {
        d.cast.forEach(c => { actorCounts[c.actor_name] = (actorCounts[c.actor_name] || 0) + 1; });
    });

    if (Object.keys(actorCounts).length === 0) return null;

    const topActor = Object.entries(actorCounts).filter(([name, count]) => count > 1).sort((a, b) => b[1] - a[1])[0];
    if (!topActor) return null;

    const topActorName = topActor[0];
    const candidates = inMemoryDramas
        .filter(d => !userLibrary.has(d.url) && d.cast.some(c => c.actor_name === topActorName))
        .sort((a, b) => a.popularity_rank - b.popularity_rank);

    return candidates.length > 0 ? { drama: candidates[0], actor: topActorName } : null;
};

// Engine 4: Peer Pick (Collaborative Filtering Lite)
const getPeerRecommendation = async (userId) => {
    // 1. Find top 10 most similar users based on shared favorites (a strong signal of taste)
    const [similarUserRows] = await db.query(`
        SELECT uf2.user_id, COUNT(uf2.drama_url) AS common_dramas
        FROM user_favorites uf1
        JOIN user_favorites uf2 ON uf1.drama_url = uf2.drama_url AND uf1.user_id != uf2.user_id
        WHERE uf1.user_id = ?
        GROUP BY uf2.user_id
        ORDER BY common_dramas DESC
        LIMIT 10
    `, [userId]);

    const similarUserIds = similarUserRows.map(u => u.user_id);
    if (similarUserIds.length === 0) return null;

    // 2. Find the most favorited drama among these similar users, which the current user hasn't seen
    const userLibrary = await getUserLibrary(userId);
    const placeholders = similarUserIds.map(() => '?').join(',');
    
    const [recRows] = await db.query(`
        SELECT drama_url, COUNT(drama_url) AS recommendation_count
        FROM user_favorites
        WHERE user_id IN (${placeholders})
        GROUP BY drama_url
        ORDER BY recommendation_count DESC
    `, similarUserIds);

    const topRec = recRows.find(rec => !userLibrary.has(rec.drama_url));
    if (!topRec) return null;

    return inMemoryDramas.find(d => d.url === topRec.drama_url) || null;
};

app.get('/api/user/recommendations', authMiddleware, apiLimiter, async (req, res) => {
    try {
        const userId = req.user.id;
        const [hiddenGem, genreSpecialist, starPower, peerPick] = await Promise.all([
            getHiddenGem(userId),
            getGenreSpecialist(userId),
            getStarPower(userId),
            getPeerRecommendation(userId)
        ]);
        res.json({ hiddenGem, genreSpecialist, starPower, peerPick });
    } catch (error) {
        console.error("Recommendation engine failed:", error);
        res.status(500).json({ message: "Could not generate recommendations at this time." });
    }
});


// --- ADMIN API ENDPOINTS ---
app.use('/api/admin', authMiddleware, adminAuthMiddleware, apiLimiter);
app.get('/api/admin/users', async (req, res) => {
    const [rows] = await db.query('SELECT id, username, is_banned, is_admin FROM users');
    res.json(rows.map(user => ({ ...user, isAdmin: !!user.is_admin, is_banned: !!user.is_banned })));
});
app.get('/api/admin/stats/registrations', async (req, res) => {
    const [rows] = await db.query(`SELECT DATE(created_at) as registration_date, COUNT(id) as count FROM users WHERE created_at >= CURDATE() - INTERVAL 13 DAY GROUP BY registration_date ORDER BY registration_date ASC`);
    const statsMap = new Map(rows.map(row => [new Date(row.registration_date).toISOString().split('T')[0], row.count]));
    res.json(Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - i); const dateStr = d.toISOString().split('T')[0]; return { date: dateStr, count: statsMap.get(dateStr) || 0 }; }).reverse());
});
app.get('/api/admin/users/:id/data', async (req, res) => res.json(await fetchUserData(parseInt(req.params.id))));
app.post('/api/admin/users/:id/admin', async (req, res) => {
    const userId = parseInt(req.params.id);
    if (req.user.id === userId && !req.body.isAdmin) return res.status(403).json({ message: 'Cannot demote self.' });
    await db.execute('UPDATE users SET is_admin = ? WHERE id = ?', [req.body.isAdmin ? 1 : 0, userId]);
    res.sendStatus(200);
});
app.post('/api/admin/users/:id/ban', async (req, res) => {
    const [rows] = await db.query('SELECT is_admin FROM users WHERE id = ?', [parseInt(req.params.id)]);
    if (rows[0] && rows[0].is_admin) return res.status(403).json({ message: 'Cannot ban an admin.' });
    await db.execute('UPDATE users SET is_banned = ? WHERE id = ?', [req.body.ban ? 1 : 0, parseInt(req.params.id)]);
    res.sendStatus(200);
});
app.delete('/api/admin/users/:id', async (req, res) => {
    const [rows] = await db.query('SELECT is_admin FROM users WHERE id = ?', [parseInt(req.params.id)]);
    if (rows[0] && rows[0].is_admin) return res.status(403).json({ message: 'Cannot delete an admin.' });
    await db.execute('DELETE FROM users WHERE id = ?', [parseInt(req.params.id)]);
    res.sendStatus(200);
});
app.post('/api/admin/users/:id/reset-password', async (req, res) => {
    const newPassword = crypto.randomBytes(8).toString('hex');
    await db.execute('UPDATE users SET password = ? WHERE id = ?', [bcrypt.hashSync(newPassword, 8), parseInt(req.params.id)]);
    res.json({ newPassword });
});

app.use((err, req, res, next) => res.status(500).json({ message: 'Server error.' }));

async function startServer() {
    try {
        await initializeDatabase();
        await runMigrations();
        await seedAdminUser();
        await loadDramasIntoMemory();
        server.listen(PORT, () => console.log(`Server with MySQL running on http://localhost:${PORT}`));
    } catch (err) {
        console.error("Failed to start server:", err);
        if (db) await db.end();
        process.exit(1);
    }
}

if (process.argv.includes('--seed')) {
    (async () => {
        try {
            await initializeDatabase();
            await seedDatabase();
        } catch (err) { console.error("Seeding failed:", err); } 
        finally { if (db) await db.end(); process.exit(0); }
    })();
} else {
    startServer();
}

process.on('SIGINT', async () => {
    server.close(async () => {
        if (db) await db.end();
        process.exit(0);
    });
});
```
## 5. Running the Backend

1.  **Start MySQL Container**: Open a terminal in the `/backend` directory and run:
    ```bash
    docker-compose up -d
    ```

2.  **Install Node Dependencies**:
    ```bash
    npm install
    ```

3.  **Start the Server for Development**:
    ```bash
    npm run dev
    ```

4.  **Seed the Database with Data (One-Time Command)**:
    ```bash
    npm run seed
    ```

Your MySQL-powered backend is now running! The frontend will connect to it as long as `BACKEND_MODE` is enabled in your frontend configuration.