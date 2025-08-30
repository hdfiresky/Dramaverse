
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

-   **Functionality**:
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
      "setup-db": "node server.js --setup-db"
    },
    ```

6.  **Copy Drama Data**: Copy the `dramas.json` file from `/public/data/dramas.json` into your new `/backend` directory. The setup script will use this file.

## 3. Project Structure

After setup, your `backend` directory will have a very simple structure:

```
/backend
├── server.js       # The single, self-contained server file
├── dramas.json     # Copied from the frontend
└── package.json
```

## 4. Code Implementation

Create a file named `server.js` inside the `backend` directory and paste the entire code block below into it.

### `server.js`
This single file contains all the logic for the database, authentication, API routes, and real-time communication.

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

// --- CONFIGURATION ---
const PORT = 3001;
const DB_SOURCE = "dramas.db";
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-me';

// --- DATABASE SETUP ---
const db = new sqlite3.Database(DB_SOURCE, (err) => {
    if (err) {
        console.error("Error connecting to database:", err.message);
        throw err;
    }
    console.log('Connected to the SQLite database.');
});

function createTables() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            console.log("Creating tables...");
            db.run(`PRAGMA foreign_keys = ON;`);
            db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT)`);
            db.run(`CREATE TABLE IF NOT EXISTS dramas (url TEXT PRIMARY KEY, title TEXT, data TEXT)`);
            db.run(`CREATE TABLE IF NOT EXISTS user_favorites (user_id INTEGER, drama_url TEXT, PRIMARY KEY (user_id, drama_url), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (drama_url) REFERENCES dramas(url) ON DELETE CASCADE)`);
            db.run(`CREATE TABLE IF NOT EXISTS user_statuses (user_id INTEGER, drama_url TEXT, status TEXT, currentEpisode INTEGER, PRIMARY KEY (user_id, drama_url), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (drama_url) REFERENCES dramas(url) ON DELETE CASCADE)`);
            db.run(`CREATE TABLE IF NOT EXISTS user_episode_reviews (user_id INTEGER, drama_url TEXT, episode_number INTEGER, review_text TEXT, updated_at INTEGER, PRIMARY KEY (user_id, drama_url, episode_number), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (drama_url) REFERENCES dramas(url) ON DELETE CASCADE)`,
            (err) => {
                if (err) return reject(err);
                console.log("Tables created successfully.");
                resolve();
            });
        });
    });
}

function seedDatabase() {
    return new Promise((resolve, reject) => {
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
                console.log(`Successfully seeded ${count} dramas into the database.`);
                resolve();
            });
        });
    });
}

async function setupDatabase() {
    try {
        await createTables();
        await seedDatabase();
        db.close();
        console.log("Database setup complete.");
    } catch (err) {
        console.error("Database setup failed:", err);
    }
}

// Check for command line flags to run setup
if (process.argv.includes('--setup-db')) {
    setupDatabase();
    return; // Exit the script after setup
}

// --- EXPRESS & SOCKET.IO SERVER SETUP ---
const app = express();
const server = http.createServer(app);

const allowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
};

const io = new Server(server, { cors: corsOptions });

app.use(cors(corsOptions));
app.use(express.json());


// --- AUTHENTICATION MIDDLEWARE ---
const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Authentication token required' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
};

io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication error: Token not provided'));
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return next(new Error('Authentication error: Invalid token'));
        socket.user = decoded;
        next();
    });
});

// --- REAL-TIME & DATA HELPERS ---
io.on('connection', (socket) => {
    console.log(`Real-time client connected: ${socket.user.username} (ID: ${socket.user.id})`);
    socket.join(`user_${socket.user.id}`);
    socket.on('disconnect', () => console.log(`Real-time client disconnected: ${socket.user.username}`));
});

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

async function emitUserDataUpdate(userId) {
    if (!userId) return;
    try {
        const userData = await fetchUserData(userId);
        io.to(`user_${userId}`).emit('user_data_updated', userData);
        console.log(`Emitted data update to user room: user_${userId}`);
    } catch (error) {
        console.error(`Failed to emit data for user ID ${userId}:`, error);
    }
}

// --- API ENDPOINTS ---
app.post('/api/auth/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: "Username and password are required" });
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
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (err || !user || !bcrypt.compareSync(password, user.password)) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ user: { username: user.username }, token });
    });
});

app.get('/api/user/data', authMiddleware, async (req, res) => {
    try {
        const userData = await fetchUserData(req.user.id);
        res.json(userData);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch user data." });
    }
});

app.post('/api/user/favorites', authMiddleware, (req, res) => {
    const { dramaUrl, isFavorite } = req.body;
    const sql = isFavorite 
        ? 'INSERT OR IGNORE INTO user_favorites (user_id, drama_url) VALUES (?, ?)'
        : 'DELETE FROM user_favorites WHERE user_id = ? AND drama_url = ?';
    db.run(sql, [req.user.id, dramaUrl], (err) => {
        if (err) return res.status(500).json({ message: 'Database error' });
        emitUserDataUpdate(req.user.id);
        res.status(200).json({ success: true });
    });
});

app.post('/api/user/statuses', authMiddleware, (req, res) => {
    const { dramaUrl, status, currentEpisode } = req.body;
    if (!status) {
        db.run('DELETE FROM user_statuses WHERE user_id = ? AND drama_url = ?', [req.user.id, dramaUrl], function(err) {
            if (err) return res.status(500).json({ message: 'Database error' });
            if (this.changes > 0) emitUserDataUpdate(req.user.id);
            res.status(200).json({ success: true });
        });
    } else {
        db.run('INSERT OR REPLACE INTO user_statuses (user_id, drama_url, status, currentEpisode) VALUES (?, ?, ?, ?)', [req.user.id, dramaUrl, status, currentEpisode || 0], (err) => {
            if (err) return res.status(500).json({ message: 'Database error' });
            emitUserDataUpdate(req.user.id);
            res.status(200).json({ success: true });
        });
    }
});

app.post('/api/user/reviews/episodes', authMiddleware, (req, res) => {
    const { dramaUrl, episodeNumber, text, clientUpdatedAt, force } = req.body;
    if (text.trim() === '') {
        db.run('DELETE FROM user_episode_reviews WHERE user_id = ? AND drama_url = ? AND episode_number = ?', [req.user.id, dramaUrl, episodeNumber], function(err) {
             if (err) return res.status(500).json({ message: 'Database error' });
             if (this.changes > 0) emitUserDataUpdate(req.user.id);
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
        db.run('INSERT OR REPLACE INTO user_episode_reviews (user_id, drama_url, episode_number, review_text, updated_at) VALUES (?, ?, ?, ?, ?)', [req.user.id, dramaUrl, episodeNumber, text, newUpdatedAt], (err) => {
             if (err) return res.status(500).json({ message: 'Database error' });
             emitUserDataUpdate(req.user.id);
             res.status(200).json({ success: true, newUpdatedAt });
        });
    });
});

// --- SERVER START ---
server.listen(PORT, () => {
    console.log(`Server with real-time support is running on http://localhost:${PORT}`);
});

```

## 5. Running the Backend

Follow these steps in your terminal, from inside the `/backend` directory:

1.  **Set up the Database (One-Time Command)**: This command executes the `setupDatabase` function in `server.js` and then exits.
    ```bash
    npm run setup-db
    ```
    This will create a `dramas.db` file and populate it with all the drama data. You only need to run this once, or again if you update `dramas.json`.

2.  **Start the Server for Development**:
    ```bash
    npm run dev
    ```
    Your backend server is now running on `http://localhost:3001` with `nodemon`, which will automatically restart on file changes.

## 6. Production Deployment with PM2

For a production environment, use a process manager like [PM2](https://pm2.keymetrics.io/) to keep your application alive, enable clustering, and manage logs.

1.  **Install PM2 Globally**:
    ```bash
    npm install pm2 -g
    ```

2.  **Start the Production Server**:
    From your `/backend` directory, run the following command. This starts the app in "cluster" mode to use all available CPU cores and sets a secure JWT secret as an environment variable.

    ```bash
    JWT_SECRET="your-long-random-super-secret-string-for-production" pm2 start server.js -i max --name "dramaverse-backend"
    ```
    -   `JWT_SECRET=...`: **Crucially, replace this with your own long, random secret.**
    -   `-i max`: Enables cluster mode.
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
-   Update the `allowedOrigins` array in `server.js` for your production domain.
-   Use a strong, secret `JWT_SECRET` set via an environment variable.
-   Consider implementing rate limiting for sensitive endpoints.
-   Run your Node.js application behind a reverse proxy like Nginx in production.
