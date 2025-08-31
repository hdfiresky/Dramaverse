

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
    `CREATE TABLE IF NOT EXISTS users (id INT PRIMARY KEY AUTO_INCREMENT, username VARCHAR(255) UNIQUE NOT NULL, password VARCHAR(255) NOT NULL, is_admin TINYINT(1) DEFAULT 0 NOT NULL, is_banned TINYINT(1) DEFAULT 0 NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS dramas (url VARCHAR(255) PRIMARY KEY, title VARCHAR(255), data JSON)`,
    `CREATE TABLE IF NOT EXISTS user_favorites (user_id INT, drama_url VARCHAR(255), PRIMARY KEY (user_id, drama_url), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (drama_url) REFERENCES dramas(url) ON DELETE CASCADE)`,
    `CREATE TABLE IF NOT EXISTS user_statuses (user_id INT, drama_url VARCHAR(255), status VARCHAR(255), currentEpisode INT, PRIMARY KEY (user_id, drama_url), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (drama_url) REFERENCES dramas(url) ON DELETE CASCADE)`,
    `CREATE TABLE IF NOT EXISTS user_episode_reviews (user_id INT, drama_url VARCHAR(255), episode_number INT, review_text TEXT, updated_at BIGINT, PRIMARY KEY (user_id, drama_url, episode_number), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (drama_url) REFERENCES dramas(url) ON DELETE CASCADE)`
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
    const [completedMigrations] = await db.query('SELECT name FROM migrations');
    const completedNames = new Set(completedMigrations.map(m => m.name));
    
    const pendingMigrations = migrations.filter((_, index) => !completedNames.has(`migration_${index}`));
    if (pendingMigrations.length === 0) {
        console.log("Database schema is up to date.");
        return;
    }

    console.log(`Found ${pendingMigrations.length} pending migrations. Applying...`);
    for (let i = 0; i < migrations.length; i++) {
        if (!completedNames.has(`migration_${i}`)) {
            try {
                await db.execute(migrations[i]);
                await db.execute('INSERT INTO migrations (name) VALUES (?)', [`migration_${i}`]);
                console.log(`Applied migration_${i}`);
            } catch (migrationErr) {
                console.error(`Failed to apply migration_${i}:`, migrationErr);
                throw migrationErr;
            }
        }
    }
    console.log("All pending migrations applied successfully.");
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
        console.log("Default admin user not found. Creating 'admin' user...");
        const hashedPassword = bcrypt.hashSync('admin', 8);
        await db.execute('INSERT INTO users (username, password, is_admin, is_banned) VALUES (?, ?, ?, ?)', ['admin', hashedPassword, 1, 0]);
        console.log("Default admin user 'admin' created successfully.");
    }
}

async function seedDatabase() {
    if (!fs.existsSync('dramas.json')) {
        throw new Error('dramas.json not found in the backend directory.');
    }
    const dramas = JSON.parse(fs.readFileSync('dramas.json'));
    const sql = "INSERT INTO dramas (url, title, data) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE title=VALUES(title), data=VALUES(data)";
    
    let count = 0;
    for (const drama of dramas) {
        const { url, title, ...rest } = drama;
        await db.execute(sql, [url, title, JSON.stringify(rest)]);
        count++;
    }
    console.log(`Successfully seeded/updated ${count} dramas into the database.`);
}

async function loadDramasIntoMemory() {
    const [rows] = await db.query('SELECT url, title, data FROM dramas');
    inMemoryDramas = rows.map(row => {
        const data = row.data; // Already parsed by mysql2 if JSON type
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
}

const authMiddleware = (req, res, next) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ message: 'Authentication required' });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
};

const adminAuthMiddleware = (req, res, next) => {
    if (!req.user || !req.user.isAdmin) {
        return res.status(403).json({ message: 'Forbidden: Administrator access required.' });
    }
    next();
};

function emitToUserRoom(userId, event, payload) {
    const room = `user_${userId}`;
    io.to(room).emit(event, payload);
    console.log(`[Socket.IO Emit] Emitted event '${event}' to room '${room}'`);
}

async function fetchUserData(userId) {
    if (!userId) throw new Error("User ID is required.");
    const userData = { favorites: [], statuses: {}, reviews: {}, episodeReviews: {} };
    
    const [favRows] = await db.query('SELECT drama_url FROM user_favorites WHERE user_id = ?', [userId]);
    userData.favorites = favRows.map(f => f.drama_url);

    const [statusRows] = await db.query('SELECT * FROM user_statuses WHERE user_id = ?', [userId]);
    statusRows.forEach(s => { userData.statuses[s.drama_url] = { status: s.status, currentEpisode: s.currentEpisode }; });

    const [reviewRows] = await db.query('SELECT * FROM user_episode_reviews WHERE user_id = ?', [userId]);
    reviewRows.forEach(r => {
        if (!userData.episodeReviews[r.drama_url]) userData.episodeReviews[r.drama_url] = {};
        userData.episodeReviews[r.drama_url][r.episode_number] = { text: r.review_text, updatedAt: r.updated_at };
    });

    return userData;
}

// --- EXPRESS & SOCKET.IO SERVER SETUP ---
const app = express();
const server = http.createServer(app);
app.use(helmet());
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
const authLimiter = rateLimit({ windowMs: 30 * 60 * 1000, max: 10 });
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());
const io = new Server(server, { cors: corsOptions, path: SOCKET_IO_PATH });
console.log(`Socket.IO server listening on path: ${SOCKET_IO_PATH}`);

// --- SOCKET.IO MIDDLEWARE & LISTENERS ---
io.use((socket, next) => {
    const cookies = cookie.parse(socket.handshake.headers.cookie || '');
    const token = cookies.token;
    if (!token) return next(new Error('Authentication error: Token cookie not found.'));
    
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return next(new Error('Authentication error: Invalid token.'));
        socket.user = decoded;
        next();
    });
});
io.on('connection', (socket) => {
    console.log(`[Socket.IO Connect] Client connected: '${socket.user.username}' (ID: ${socket.user.id})`);
    socket.join(`user_${socket.user.id}`);
    
    socket.onAny((event) => {
        console.warn(`[Socket.IO Security] Received unexpected event '${event}' from user '${socket.user.username}'. Disconnecting.`);
        socket.disconnect(true);
    });

    socket.on('disconnect', (reason) => {
        console.log(`[Socket.IO Disconnect] Client disconnected: ${socket.user.username}. Reason: ${reason}.`);
    });
});

// --- API ENDPOINTS ---
app.get('/api/health', (req, res) => res.status(200).json({ status: 'ok' }));
app.get('/api/dramas/metadata', apiLimiter, (req, res) => res.json(inMemoryMetadata));

// Drama listing endpoint (same logic as before)
app.get('/api/dramas', apiLimiter, (req, res) => {
    const { page = '1', limit = '24', search = '', minRating = '0', genres = '', excludeGenres = '', tags = '', excludeTags = '', countries = '', cast = '', sort = '[]' } = req.query;
    // Filtering and sorting logic is CPU-bound, so it remains largely unchanged from the SQLite version.
    const filters = {
        genres: genres ? genres.split(',') : [], excludeGenres: excludeGenres ? excludeGenres.split(',') : [],
        tags: tags ? tags.split(',') : [], excludeTags: excludeTags ? excludeTags.split(',') : [],
        countries: countries ? countries.split(',') : [], cast: cast ? cast.split(',') : [],
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
    const paginatedItems = result.slice((parseInt(page) - 1) * parseInt(limit), parseInt(page) * parseInt(limit));
    res.json({
        totalItems,
        dramas: paginatedItems.map(({ genresSet, tagsSet, castSet, score, ...rest }) => rest),
    });
});


app.use('/api/auth', authLimiter);

app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        // More permissive regex to allow email-like usernames.
        const usernameRegex = /^[a-zA-Z0-9_.\-@+]{3,50}$/;
        if (!usernameRegex.test(username) || !password || password.length < 6) {
            return res.status(400).json({ message: "Invalid input. Username must be 3-50 characters. Password must be at least 6 characters." });
        }
        const hashedPassword = bcrypt.hashSync(password, 8);
        
        // Insert the new user
        const [result] = await db.execute('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword]);
        const newUserId = result.insertId;

        // Fetch the newly created user to get all details
        const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [newUserId]);
        const user = rows[0];

        if (!user) {
            return res.status(500).json({ message: "Failed to create and retrieve user." });
        }

        // Automatically log the user in by creating a session
        const token = jwt.sign({ id: user.id, username: user.username, isAdmin: !!user.is_admin }, JWT_SECRET, { expiresIn: '24h' });
        res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 24 * 60 * 60 * 1000 });
        
        // Respond with the complete user payload (user object and initial data)
        // to streamline the frontend logic and avoid a second API call.
        res.status(201).json({ 
            user: { username: user.username, isAdmin: !!user.is_admin },
            data: { favorites: [], statuses: {}, reviews: {}, episodeReviews: {} } // A new user has empty data
        });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: "Username already exists." });
        }
        console.error("Registration error:", err);
        res.status(500).json({ message: "An internal server error occurred during registration." });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const [rows] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
        const user = rows[0];

        if (!user || !bcrypt.compareSync(password, user.password)) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        if (user.is_banned) return res.status(403).json({ message: 'This account has been banned.' });
        
        const token = jwt.sign({ id: user.id, username: user.username, isAdmin: !!user.is_admin }, JWT_SECRET, { expiresIn: '24h' });
        res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 24 * 60 * 60 * 1000 });
        res.json({ user: { username: user.username, isAdmin: !!user.is_admin } });
    } catch (err) {
        res.status(500).json({ message: "Database error" });
    }
});

app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('token').status(200).json({ message: "Logged out successfully" });
});

app.use('/api/user', authMiddleware, apiLimiter); 

app.get('/api/user/data', async (req, res) => {
    try {
        const data = await fetchUserData(req.user.id);
        res.json({ user: { username: req.user.username, isAdmin: !!req.user.isAdmin }, data });
    } catch (err) {
        res.status(500).json({ message: "Failed to fetch user data." });
    }
});

app.post('/api/user/favorites', async (req, res) => {
    const { dramaUrl, isFavorite } = req.body;
    const sql = isFavorite ? 'INSERT IGNORE INTO user_favorites (user_id, drama_url) VALUES (?, ?)' : 'DELETE FROM user_favorites WHERE user_id = ? AND drama_url = ?';
    const [result] = await db.execute(sql, [req.user.id, dramaUrl]);
    if (result.affectedRows > 0) emitToUserRoom(req.user.id, 'favorite_updated', { dramaUrl, isFavorite });
    res.status(200).json({ success: true });
});

app.post('/api/user/statuses', async (req, res) => {
    const { dramaUrl, status, currentEpisode } = req.body;
    const statusInfo = { status, currentEpisode: currentEpisode || 0 };
    if (!status) {
        const [result] = await db.execute('DELETE FROM user_statuses WHERE user_id = ? AND drama_url = ?', [req.user.id, dramaUrl]);
        if (result.affectedRows > 0) emitToUserRoom(req.user.id, 'status_updated', { dramaUrl, statusInfo: null });
    } else {
        const [result] = await db.execute('INSERT INTO user_statuses (user_id, drama_url, status, currentEpisode) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE status=VALUES(status), currentEpisode=VALUES(currentEpisode)', [req.user.id, dramaUrl, status, currentEpisode || 0]);
        if (result.affectedRows > 0) emitToUserRoom(req.user.id, 'status_updated', { dramaUrl, statusInfo });
    }
    res.status(200).json({ success: true });
});

app.post('/api/user/reviews/episodes', async (req, res) => {
    const { dramaUrl, episodeNumber, text, clientUpdatedAt, force } = req.body;
    if (text.trim() === '') {
        const [result] = await db.execute('DELETE FROM user_episode_reviews WHERE user_id = ? AND drama_url = ? AND episode_number = ?', [req.user.id, dramaUrl, episodeNumber]);
        if (result.affectedRows > 0) emitToUserRoom(req.user.id, 'episode_review_updated', { dramaUrl, episodeNumber, review: null });
        return res.status(200).json({ success: true });
    }
    
    const [rows] = await db.query('SELECT updated_at, review_text FROM user_episode_reviews WHERE user_id = ? AND drama_url = ? AND episode_number = ?', [req.user.id, dramaUrl, episodeNumber]);
    const serverVersion = rows[0];

    if (!force && serverVersion && serverVersion.updated_at > clientUpdatedAt) {
        return res.status(409).json({ message: 'Conflict detected.', serverVersion: { text: serverVersion.review_text, updatedAt: serverVersion.updated_at } });
    }

    const newUpdatedAt = Date.now();
    const [result] = await db.execute('INSERT INTO user_episode_reviews (user_id, drama_url, episode_number, review_text, updated_at) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE review_text=VALUES(review_text), updated_at=VALUES(updated_at)', [req.user.id, dramaUrl, episodeNumber, text, newUpdatedAt]);
    
    if (result.affectedRows > 0) {
        emitToUserRoom(req.user.id, 'episode_review_updated', { dramaUrl, episodeNumber, review: { text, updatedAt: newUpdatedAt } });
    }
    res.status(200).json({ success: true, newUpdatedAt });
});


// --- ADMIN API ENDPOINTS ---
app.use('/api/admin', authMiddleware, adminAuthMiddleware, apiLimiter);

app.get('/api/admin/users', async (req, res) => {
    const [rows] = await db.query('SELECT id, username, is_banned, is_admin FROM users');
    res.json(rows.map(user => ({ ...user, isAdmin: !!user.is_admin, is_banned: !!user.is_banned })));
});

app.get('/api/admin/stats/registrations', async (req, res) => {
    const [rows] = await db.query(`
        SELECT DATE(created_at) as registration_date, COUNT(id) as count
        FROM users WHERE created_at >= CURDATE() - INTERVAL 14 DAY
        GROUP BY registration_date ORDER BY registration_date ASC
    `);
    const statsMap = new Map(rows.map(row => [new Date(row.registration_date).toISOString().split('T')[0], row.count]));
    const result = Array.from({ length: 14 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (13 - i));
        const dateString = date.toISOString().split('T')[0];
        return { date: dateString, count: statsMap.get(dateString) || 0 };
    });
    res.json(result);
});

app.get('/api/admin/users/:id/data', async (req, res) => {
    res.json(await fetchUserData(parseInt(req.params.id, 10)));
});

app.post('/api/admin/users/:id/admin', async (req, res) => {
    const userId = parseInt(req.params.id, 10);
    if (req.user.id === userId && !req.body.isAdmin) return res.status(403).json({ message: 'Cannot demote your own account.' });
    await db.execute('UPDATE users SET is_admin = ? WHERE id = ?', [req.body.isAdmin ? 1 : 0, userId]);
    res.status(200).json({ success: true });
});

app.post('/api/admin/users/:id/ban', async (req, res) => {
    const userId = parseInt(req.params.id, 10);
    const [rows] = await db.query('SELECT is_admin FROM users WHERE id = ?', [userId]);
    if (rows[0] && rows[0].is_admin) return res.status(403).json({ message: 'Cannot ban an administrator.' });
    await db.execute('UPDATE users SET is_banned = ? WHERE id = ?', [req.body.ban ? 1 : 0, userId]);
    res.status(200).json({ success: true });
});

app.delete('/api/admin/users/:id', async (req, res) => {
    const userId = parseInt(req.params.id, 10);
    const [rows] = await db.query('SELECT is_admin FROM users WHERE id = ?', [userId]);
    if (rows[0] && rows[0].is_admin) return res.status(403).json({ message: 'Cannot delete an administrator.' });
    await db.execute('DELETE FROM users WHERE id = ?', [userId]);
    res.status(200).json({ success: true });
});

app.post('/api/admin/users/:id/reset-password', async (req, res) => {
    const userId = parseInt(req.params.id, 10);
    const newPassword = crypto.randomBytes(8).toString('hex');
    const hashedPassword = bcrypt.hashSync(newPassword, 8);
    await db.execute('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, userId]);
    res.status(200).json({ success: true, newPassword });
});

// --- ERROR HANDLING & SERVER START ---
app.use((err, req, res, next) => {
    console.error("An unexpected error occurred:", err);
    res.status(500).json({ message: 'Something broke! A server error occurred.' });
});

async function startServer() {
    try {
        await initializeDatabase();
        await runMigrations();
        await seedAdminUser();
        await loadDramasIntoMemory();
        server.listen(PORT, () => {
            console.log(`Server with MySQL and real-time support is running on http://localhost:${PORT}`);
        });
    } catch (err) {
        console.error("Failed to start server:", err);
        if (db) await db.end();
        process.exit(1);
    }
}

// --- SEED SCRIPT RUNNER ---
if (process.argv.includes('--seed')) {
    (async () => {
        try {
            await initializeDatabase();
            await seedDatabase();
            console.log("Seeding complete.");
        } catch (err) {
            console.error("Seeding failed:", err);
        } finally {
            if (db) await db.end();
            process.exit(0);
        }
    })();
} else {
    startServer();
}

process.on('SIGINT', async () => {
    console.log('SIGINT signal received: closing server and database pool.');
    server.close(async () => {
        console.log('HTTP server closed.');
        if (db) await db.end();
        console.log('Database connection pool closed.');
        process.exit(0);
    });
});
```

## 5. Running the Backend

1.  **Start MySQL Container**: Open a terminal in the `/backend` directory and run:
    ```bash
    docker-compose up -d
    ```
    This will download the MySQL image (if you don't have it) and start the database container in the background. It will be ready to accept connections on `localhost:3307`.

2.  **Install Node Dependencies**:
    ```bash
    npm install
    ```

3.  **Start the Server for Development**:
    ```bash
    npm run dev
    ```
    The first time you run this, the server will:
    a. Connect to the MySQL Docker container.
    b. Automatically run all necessary schema migrations.
    c. Create the default `admin` user if it doesn't exist.
    d. Load the drama data into memory.

4.  **Seed the Database with Data (One-Time Command)**:
    This command populates the `dramas` table with data from `dramas.json`.
    ```bash
    npm run seed
    ```

Your MySQL-powered backend is now running! The frontend will connect to it as long as `BACKEND_MODE` is enabled in your frontend configuration.