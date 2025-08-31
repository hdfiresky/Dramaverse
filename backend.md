

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

-   **Functionality**:
    -   Handles user registration and login.
    -   Provides authenticated endpoints for users to manage their data.
    -   **Automatic Migrations**: The database schema is automatically created and updated on server startup.
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
    npm install express sqlite3 cors bcryptjs jsonwebtoken socket.io helmet express-rate-limit dotenv
    ```

4.  **Install Development Dependency**: Install `nodemon` for automatic server restarts during development.
    ```bash
    npm install --save-dev nodemon
    ```

5.  **Create Environment File**: Create a new file named `.env` in the `backend` directory. This file will store your secret keys and configuration. **This file should never be committed to version control.**
    ```env
    # The port the server will run on
    PORT=3001

    # A long, random, and secret string for signing JWTs
    # IMPORTANT: Change this to your own unique secret!
    JWT_SECRET="replace-this-with-a-very-long-and-random-string"
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
This single file contains all the logic for the database, authentication, API routes, and real-time communication. It now loads configuration from the `.env` file.

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

// --- CONFIGURATION ---
dotenv.config(); // Load environment variables from .env file

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET;
const DB_SOURCE = "dramas.db";

// Security check: Ensure JWT_SECRET is set before starting
if (!JWT_SECRET || JWT_SECRET === "replace-this-with-a-very-long-and-random-string") {
    console.error("FATAL ERROR: JWT_SECRET is not set or is set to the default value in the .env file.");
    console.error("Please set it to a long, random, and unique string for security.");
    process.exit(1);
}

// --- DATABASE MIGRATIONS ---
// New migrations can be added to this array. They will be run in order.
const migrations = [
    `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT)`,
    `CREATE TABLE IF NOT EXISTS dramas (url TEXT PRIMARY KEY, title TEXT, data TEXT)`,
    `CREATE TABLE IF NOT EXISTS user_favorites (user_id INTEGER, drama_url TEXT, PRIMARY KEY (user_id, drama_url), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (drama_url) REFERENCES dramas(url) ON DELETE CASCADE)`,
    `CREATE TABLE IF NOT EXISTS user_statuses (user_id INTEGER, drama_url TEXT, status TEXT, currentEpisode INTEGER, PRIMARY KEY (user_id, drama_url), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (drama_url) REFERENCES dramas(url) ON DELETE CASCADE)`,
    `CREATE TABLE IF NOT EXISTS user_episode_reviews (user_id INTEGER, drama_url TEXT, episode_number INTEGER, review_text TEXT, updated_at INTEGER, PRIMARY KEY (user_id, drama_url, episode_number), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (drama_url) REFERENCES dramas(url) ON DELETE CASCADE)`
];

// --- DATABASE SETUP ---
const db = new sqlite3.Database(DB_SOURCE, (err) => {
    if (err) {
        console.error("Error connecting to database:", err.message);
        throw err;
    }
    console.log('Connected to the SQLite database.');
});

// Function to run migrations
async function runMigrations() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE)`);
            
            db.all('SELECT name FROM migrations', async (err, completedMigrations) => {
                if (err) return reject(err);

                const completedNames = new Set(completedMigrations.map(m => m.name));
                const pendingMigrations = migrations.filter((_, index) => !completedNames.has(`migration_${index}`));

                if (pendingMigrations.length === 0) {
                    console.log("Database schema is up to date.");
                    return resolve();
                }

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
        if (!fs.existsSync('dramas.json')) {
            return reject(new Error('dramas.json not found in the backend directory. Please copy it from /public/data.'));
        }
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

// Check for command line flag to run seed
if (process.argv.includes('--seed')) {
    seedDatabase().then(() => db.close()).catch(err => console.error("Seeding failed:", err));
    return; // Exit the script after seeding
}

// --- EXPRESS & SOCKET.IO SERVER SETUP ---
const app = express();
const server = http.createServer(app);

// --- SECURITY MIDDLEWARE ---
app.use(helmet());
const allowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) callback(null, true);
        else callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false, message: 'Too many requests, please try again after 15 minutes.' });
const authLimiter = rateLimit({ windowMs: 30 * 60 * 1000, max: 10, message: 'Too many authentication attempts, please try again after 30 minutes.' });

app.use('/api/user', apiLimiter);
app.use(express.json());

const io = new Server(server, { cors: corsOptions });

// --- AUTHENTICATION MIDDLEWARE ---
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
app.post('/api/auth/register', authLimiter, (req, res) => {
    const { username, password } = req.body;
    if (typeof username !== 'string' || typeof password !== 'string' || username.length < 3 || password.length < 6) {
        return res.status(400).json({ message: "Invalid input: Username must be at least 3 characters and password at least 6 characters." });
    }
    const hashedPassword = bcrypt.hashSync(password, 8);
    db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword], function(err) {
        if (err) return res.status(409).json({ message: "Username already exists" });
        const userId = this.lastID;
        const token = jwt.sign({ id: userId, username: username }, JWT_SECRET, { expiresIn: '24h' });
        res.status(201).json({ message: "User created successfully", user: { username }, token });
    });
});

app.post('/api/auth/login', authLimiter, (req, res) => {
    const { username, password } = req.body;
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
        return res.status(400).json({ message: "Username and password are required." });
    }
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
    if (typeof dramaUrl !== 'string' || typeof isFavorite !== 'boolean') return res.status(400).json({ message: 'Invalid payload.' });
    const sql = isFavorite 
        ? 'INSERT OR IGNORE INTO user_favorites (user_id, drama_url) VALUES (?, ?)'
        : 'DELETE FROM user_favorites WHERE user_id = ? AND drama_url = ?';
    db.run(sql, [req.user.id, dramaUrl], function(err) {
        if (err) return res.status(500).json({ message: 'Database error' });
        if (this.changes > 0) emitUserDataUpdate(req.user.id);
        res.status(200).json({ success: true });
    });
});

app.post('/api/user/statuses', authMiddleware, (req, res) => {
    const { dramaUrl, status, currentEpisode } = req.body;
    if (typeof dramaUrl !== 'string' || typeof status !== 'string' || (currentEpisode !== undefined && typeof currentEpisode !== 'number')) {
         return res.status(400).json({ message: 'Invalid payload.' });
    }
    if (!status) {
        db.run('DELETE FROM user_statuses WHERE user_id = ? AND drama_url = ?', [req.user.id, dramaUrl], function(err) {
            if (err) return res.status(500).json({ message: 'Database error' });
            if (this.changes > 0) emitUserDataUpdate(req.user.id);
            res.status(200).json({ success: true });
        });
    } else {
        db.run('INSERT OR REPLACE INTO user_statuses (user_id, drama_url, status, currentEpisode) VALUES (?, ?, ?, ?)', [req.user.id, dramaUrl, status, currentEpisode || 0], function(err) {
            if (err) return res.status(500).json({ message: 'Database error' });
            if (this.changes > 0) emitUserDataUpdate(req.user.id);
            res.status(200).json({ success: true });
        });
    }
});

app.post('/api/user/reviews/episodes', authMiddleware, (req, res) => {
    const { dramaUrl, episodeNumber, text, clientUpdatedAt, force } = req.body;
    if (typeof dramaUrl !== 'string' || typeof episodeNumber !== 'number' || typeof text !== 'string' || typeof clientUpdatedAt !== 'number' || (force !== undefined && typeof force !== 'boolean')) {
        return res.status(400).json({ message: 'Invalid payload.' });
    }
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

// --- SERVER START & GRACEFUL SHUTDOWN ---
async function startServer() {
    try {
        await runMigrations();
        server.listen(PORT, () => {
            console.log(`Server with real-time support is running on http://localhost:${PORT}`);
        });
    } catch (err) {
        console.error("Failed to start server due to migration error:", err);
        process.exit(1);
    }
}

startServer();

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
    ```bash
    npm run dev
    ```
    The first time you run this, the server will automatically create the `dramas.db` file and run all necessary schema migrations before starting.

2.  **Seed the Database with Data (One-Time Command)**:
    This command now only populates the tables with data from `dramas.json`. You only need to run this once after the initial setup, or again if you update `dramas.json`.
    ```bash
    npm run seed
    ```

## 6. Production Deployment with PM2

For production, it is highly recommended to use a process manager like PM2 and to set your `JWT_SECRET` as an environment variable rather than in the `.env` file.

1.  **Install PM2 Globally**:
    ```bash
    npm install pm2 -g
    ```

2.  **Start the Production Server**:
    From your `/backend` directory, run the following command. The server will automatically pick up the `PORT` from your `.env` file, but we will override the `JWT_SECRET` directly on the command line for better security.

    ```bash
    JWT_SECRET="your-long-random-super-secret-string-for-production" pm2 start server.js -i max --name "dramaverse-backend"
    ```
    -   `JWT_SECRET=...`: **Crucially, replace this with your own long, random secret.** Setting it here overrides any value in `.env`.
    -   `-i max`: Enables cluster mode to use all available CPU cores.
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
-   Run your Node.js application behind a reverse proxy like Nginx in production.