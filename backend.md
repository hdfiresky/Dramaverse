# Dramaverse Backend Setup Guide

This document provides a comprehensive guide to setting up and running the optional backend server for the Dramaverse application. When enabled, the backend provides persistent storage and **real-time, multi-device data synchronization**.

## 1. Overview

-   **Technology Stack**:
    -   **Runtime**: Node.js
    -   **Framework**: Express.js
    -   **Real-Time**: Socket.IO for WebSocket communication.
    -   **Database**: SQLite3 (a lightweight, file-based SQL database)
    -   **Authentication**: JSON Web Tokens (JWT) for secure sessions.
    -   **Password Hashing**: `bcryptjs` to securely store user passwords.

-   **Functionality**:
    -   Serves the entire drama library from a database.
    -   Handles user registration and login.
    -   Provides authenticated endpoints for users to manage their data.
    -   **Real-Time Sync**: When a user makes a change on one device, the server instantly pushes the update to all of that user's other logged-in devices.
    -   Includes logic for **conflict resolution** to support multi-device, offline-first usage.

## 2. Initial Setup

### Prerequisites
-   Ensure you have [Node.js](https://nodejs.org/) installed (version 16 or higher is recommended).

### Steps
1.  **Create a Backend Directory**: In the root of your project, create a new folder named `backend`. All the following commands and file creations will happen inside this `backend` directory.

2.  **Initialize the Project**: Open a terminal inside the `backend` directory and run:
    ```bash
    npm init -y
    ```

3.  **Install Dependencies**: Install the necessary packages for the server.
    ```bash
    npm install express sqlite3 cors bcryptjs jsonwebtoken socket.io
    ```

4.  **Install Development Dependency**: Install `nodemon` for automatic server restarts during development.
    ```bash
    npm install --save-dev nodemon
    ```

5.  **Configure `package.json`**: Open the `package.json` file and add the following `scripts`:
    ```json
    "scripts": {
      "start": "node server.js",
      "dev": "nodemon server.js",
      "setup-db": "node database.js && node seed.js"
    },
    ```

6.  **Copy Drama Data**: Copy the `dramas.json` file from `/public/data/dramas.json` into your new `/backend` directory. The seed script will use this file to populate the database.

## 3. Project Structure

After setup, your `backend` directory should look like this:

```
/backend
├── authMiddleware.js   # Middleware for JWT verification (for HTTP routes)
├── database.js         # DB connection and schema setup
├── seed.js             # Script to populate DB from JSON
├── server.js           # Main Express & Socket.IO server file
├── dramas.json         # Copied from the frontend
└── package.json
```

## 4. Code Implementation

Create the following files inside the `backend` directory and add the code provided.

### `database.js`
This file initializes the SQLite database connection and creates all the necessary tables. (No changes from previous version).

```javascript
const sqlite3 = require('sqlite3').verbose();
const DB_SOURCE = "dramas.db";

const db = new sqlite3.Database(DB_SOURCE, (err) => {
    if (err) {
      console.error(err.message);
      throw err;
    } else {
        console.log('Connected to the SQLite database.');
        db.run(`PRAGMA foreign_keys = ON;`);
        createTables();
    }
});

function createTables() {
    db.serialize(() => {
        console.log("Creating tables...");

        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS dramas (
            url TEXT PRIMARY KEY,
            title TEXT,
            data TEXT
        )`);
        
        db.run(`CREATE TABLE IF NOT EXISTS user_favorites (
            user_id INTEGER,
            drama_url TEXT,
            PRIMARY KEY (user_id, drama_url),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (drama_url) REFERENCES dramas(url) ON DELETE CASCADE
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS user_statuses (
            user_id INTEGER,
            drama_url TEXT,
            status TEXT,
            currentEpisode INTEGER,
            PRIMARY KEY (user_id, drama_url),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (drama_url) REFERENCES dramas(url) ON DELETE CASCADE
        )`);
        
        db.run(`CREATE TABLE IF NOT EXISTS user_episode_reviews (
            user_id INTEGER,
            drama_url TEXT,
            episode_number INTEGER,
            review_text TEXT,
            updated_at INTEGER,
            PRIMARY KEY (user_id, drama_url, episode_number),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (drama_url) REFERENCES dramas(url) ON DELETE CASCADE
        )`);

        console.log("Tables created successfully (if they didn't exist).");
    });
}

module.exports = db;
```

### `seed.js`
This script reads your `dramas.json` file and populates the `dramas` table. (No changes from previous version).

```javascript
const fs = require('fs');
const db = require('./database.js');

const dramas = JSON.parse(fs.readFileSync('dramas.json'));

db.serialize(() => {
    const stmt = db.prepare("INSERT OR REPLACE INTO dramas (url, title, data) VALUES (?, ?, ?)");
    let count = 0;
    dramas.forEach(drama => {
        const { url, title, ...rest } = drama;
        stmt.run(url, title, JSON.stringify(rest), (err) => {
            if(err) {
                console.error(`Failed to insert ${title}`, err);
            }
        });
        count++;
    });
    stmt.finalize((err) => {
        if (!err) {
            console.log(`Successfully seeded ${count} dramas into the database.`);
        }
        db.close();
    });
});
```

### `authMiddleware.js`
This is an Express middleware to protect HTTP routes by verifying the JWT. (No changes from previous version).

```javascript
const jwt = require('jsonwebtoken');
const JWT_SECRET = 'your-super-secret-key-change-me'; // Use an environment variable in production!

module.exports = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Authentication token required' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // Adds user payload (e.g., { id: 1, username: 'test' }) to the request
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
};
```

### `server.js`
This is the main server file that ties everything together. It now includes the Socket.IO server and logic for real-time broadcasts.

```javascript
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./database.js');
const authMiddleware = require('./authMiddleware.js');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Configure this for production
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.json());

const PORT = 3001;
const JWT_SECRET = 'your-super-secret-key-change-me';

// --- Socket.IO Middleware for Auth ---
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
        return next(new Error('Authentication error: Token not provided'));
    }
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return next(new Error('Authentication error: Invalid token'));
        }
        socket.user = decoded;
        next();
    });
});

// --- Socket.IO Connection Handling ---
io.on('connection', (socket) => {
    console.log(`Real-time client connected: ${socket.user.username} (ID: ${socket.user.id})`);
    // Each user joins a private room. We broadcast updates to this room.
    socket.join(`user_${socket.user.id}`);
    
    socket.on('disconnect', () => {
        console.log(`Real-time client disconnected: ${socket.user.username}`);
    });
});

// --- Helper function to fetch and emit user data ---
async function emitUserDataUpdate(userId) {
    if (!userId) return;
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
        
        io.to(`user_${userId}`).emit('user_data_updated', userData);
        console.log(`Emitted data update to user room: user_${userId}`);
    } catch (error) {
        console.error(`Failed to emit user data for user ID ${userId}:`, error);
    }
}

// --- Drama Data Endpoints ---
app.get('/api/dramas', (req, res) => {
    db.all("SELECT * FROM dramas", [], (err, rows) => {
        if (err) return res.status(500).json({ "error": err.message });
        const dramas = rows.map(row => ({ url: row.url, title: row.title, ...JSON.parse(row.data) }));
        res.json(dramas);
    });
});

// --- Auth Endpoints ---
app.post('/api/auth/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: "Username and password are required" });
    const hashedPassword = bcrypt.hashSync(password, 8);
    db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword], (err) => {
        if (err) return res.status(409).json({ message: "Username already exists" });
        res.status(201).json({ message: "User created successfully" });
    });
});

app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (err || !user || !bcrypt.compareSync(password, user.password)) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ user: { username: user.username }, token });
    });
});

// --- User Data Endpoints (Protected) ---
app.get('/api/user/data', authMiddleware, (req, res) => {
    emitUserDataUpdate(req.user.id)
      .then(() => res.status(202).json({ message: "Data fetch initiated and will be sent via WebSocket." }))
      .catch(() => res.status(500).json({ message: "Failed to fetch user data." }));
});


app.post('/api/user/favorites', authMiddleware, (req, res) => {
    const { dramaUrl, isFavorite } = req.body;
    const userId = req.user.id;
    const sql = isFavorite 
        ? 'INSERT OR IGNORE INTO user_favorites (user_id, drama_url) VALUES (?, ?)'
        : 'DELETE FROM user_favorites WHERE user_id = ? AND drama_url = ?';
        
    db.run(sql, [userId, dramaUrl], (err) => {
        if (err) return res.status(500).json({ message: 'Database error' });
        emitUserDataUpdate(userId);
        res.status(200).json({ success: true });
    });
});

app.post('/api/user/statuses', authMiddleware, (req, res) => {
    const { dramaUrl, status, currentEpisode } = req.body;
    const userId = req.user.id;
    if (!status) {
        db.run('DELETE FROM user_statuses WHERE user_id = ? AND drama_url = ?', [userId, dramaUrl], function(err) {
            if (err) return res.status(500).json({ message: 'Database error' });
            if (this.changes > 0) emitUserDataUpdate(userId);
            res.status(200).json({ success: true });
        });
    } else {
        db.run('INSERT OR REPLACE INTO user_statuses (user_id, drama_url, status, currentEpisode) VALUES (?, ?, ?, ?)', [userId, dramaUrl, status, currentEpisode || 0], (err) => {
            if (err) return res.status(500).json({ message: 'Database error' });
            emitUserDataUpdate(userId);
            res.status(200).json({ success: true });
        });
    }
});

app.post('/api/user/reviews/episodes', authMiddleware, (req, res) => {
    const { dramaUrl, episodeNumber, text, clientUpdatedAt, force } = req.body;
    const userId = req.user.id;
    
    if (text.trim() === '') {
        db.run('DELETE FROM user_episode_reviews WHERE user_id = ? AND drama_url = ? AND episode_number = ?', [userId, dramaUrl, episodeNumber], function(err) {
             if (err) return res.status(500).json({ message: 'Database error' });
             if (this.changes > 0) emitUserDataUpdate(userId);
             res.status(200).json({ success: true });
        });
        return;
    }

    db.get('SELECT updated_at, review_text FROM user_episode_reviews WHERE user_id = ? AND drama_url = ? AND episode_number = ?', [userId, dramaUrl, episodeNumber], (err, row) => {
        if (err) return res.status(500).json({ message: 'Database query failed.' });

        if (!force && row && row.updated_at !== clientUpdatedAt) {
            return res.status(409).json({ message: 'Conflict detected.', serverVersion: { text: row.review_text, updatedAt: row.updated_at } });
        }

        const newUpdatedAt = Date.now();
        db.run('INSERT OR REPLACE INTO user_episode_reviews (user_id, drama_url, episode_number, review_text, updated_at) VALUES (?, ?, ?, ?, ?)', [userId, dramaUrl, episodeNumber, text, newUpdatedAt], (err) => {
             if (err) return res.status(500).json({ message: 'Database error' });
             emitUserDataUpdate(userId);
             res.status(200).json({ success: true, newUpdatedAt });
        });
    });
});

// --- Server Start ---
server.listen(PORT, () => {
    console.log(`Server with real-time support is running on http://localhost:${PORT}`);
});
```

## 5. Running the Backend

Follow these steps in your terminal, from inside the `/backend` directory:

1.  **Set up the Database (One-Time Command)**: This command chains the database creation and seeding scripts.
    ```bash
    npm run setup-db
    ```
    This will create a `dramas.db` file and populate it with all the drama data. You only need to run this once, or again if you update `dramas.json`.

2.  **Start the Server**:
    ```bash
    npm run dev
    ```
    Your backend server is now running on `http://localhost:3001`. You can now go to the frontend code, set `BACKEND_MODE` to `true`, and the application will connect to this server for both HTTP requests and real-time WebSocket communication.