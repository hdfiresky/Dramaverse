# Dramaverse Backend Setup Guide

This document provides a comprehensive guide to setting up and running the optional backend server for the Dramaverse application. When enabled, the backend provides persistent storage for drama and user data, moving beyond the browser's `localStorage`.

## 1. Overview

-   **Technology Stack**:
    -   **Runtime**: Node.js
    -   **Framework**: Express.js
    -   **Database**: SQLite3 (a lightweight, file-based SQL database)
    -   **Authentication**: JSON Web Tokens (JWT) for secure sessions.
    -   **Password Hashing**: `bcryptjs` to securely store user passwords.

-   **Functionality**:
    -   Serves the entire drama library from a database.
    -   Handles user registration and login.
    -   Provides authenticated endpoints for users to manage their favorites, drama statuses, and episode reviews.

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
    npm install express sqlite3 cors bcryptjs jsonwebtoken
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
├── authMiddleware.js   # Middleware for JWT verification
├── database.js         # DB connection and schema setup
├── seed.js             # Script to populate DB from JSON
├── server.js           # Main Express server file
├── dramas.json         # Copied from the frontend
└── package.json
```

## 4. Code Implementation

Create the following files inside the `backend` directory and add the code provided.

### `database.js`
This file initializes the SQLite database connection and creates all the necessary tables.

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
This script reads your `dramas.json` file and populates the `dramas` table. It's designed to be run once during setup.

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
This is an Express middleware to protect routes by verifying the JWT sent by the client.

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
This is the main server file that ties everything together.

```javascript
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./database.js');
const authMiddleware = require('./authMiddleware.js');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3001;
const JWT_SECRET = 'your-super-secret-key-change-me';

// --- Drama Data Endpoints ---
app.get('/api/dramas', (req, res) => {
    db.all("SELECT * FROM dramas", [], (err, rows) => {
        if (err) {
            res.status(500).json({ "error": err.message });
            return;
        }
        const dramas = rows.map(row => {
            const data = JSON.parse(row.data);
            return {
                url: row.url,
                title: row.title,
                ...data
            };
        });
        res.json(dramas);
    });
});

// --- Auth Endpoints ---
app.post('/api/auth/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
    }
    const hashedPassword = bcrypt.hashSync(password, 8);
    db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword], function(err) {
        if (err) {
            return res.status(409).json({ message: "Username already exists" });
        }
        res.status(201).json({ message: "User created successfully" });
    });
});

app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (err || !user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        const passwordIsValid = bcrypt.compareSync(password, user.password);
        if (!passwordIsValid) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ user: { username: user.username }, token });
    });
});

// --- User Data Endpoints (Protected) ---
app.get('/api/user/data', authMiddleware, (req, res) => {
    const userId = req.user.id;
    const userData = { favorites: [], statuses: {}, reviews: {}, episodeReviews: {} };
    
    const queries = [
        new Promise(resolve => db.all('SELECT drama_url FROM user_favorites WHERE user_id = ?', [userId], (err, rows) => resolve(rows || []))),
        new Promise(resolve => db.all('SELECT * FROM user_statuses WHERE user_id = ?', [userId], (err, rows) => resolve(rows || []))),
        new Promise(resolve => db.all('SELECT * FROM user_episode_reviews WHERE user_id = ?', [userId], (err, rows) => resolve(rows || []))),
    ];

    Promise.all(queries).then(([favorites, statuses, episodeReviews]) => {
        userData.favorites = favorites.map(f => f.drama_url);
        statuses.forEach(s => {
            userData.statuses[s.drama_url] = { status: s.status, currentEpisode: s.currentEpisode };
        });
        episodeReviews.forEach(r => {
            if (!userData.episodeReviews[r.drama_url]) {
                userData.episodeReviews[r.drama_url] = {};
            }
            userData.episodeReviews[r.drama_url][r.episode_number] = { text: r.review_text, updatedAt: r.updated_at };
        });
        res.json(userData);
    }).catch(err => res.status(500).json({ message: "Failed to fetch user data" }));
});

app.post('/api/user/favorites', authMiddleware, (req, res) => {
    const { dramaUrl, isFavorite } = req.body;
    const userId = req.user.id;
    if (isFavorite) {
        db.run('INSERT OR IGNORE INTO user_favorites (user_id, drama_url) VALUES (?, ?)', [userId, dramaUrl], (err) => {
            if (err) return res.status(500).json({ message: 'Database error' });
            res.status(200).json({ success: true });
        });
    } else {
        db.run('DELETE FROM user_favorites WHERE user_id = ? AND drama_url = ?', [userId, dramaUrl], (err) => {
             if (err) return res.status(500).json({ message: 'Database error' });
             res.status(200).json({ success: true });
        });
    }
});

app.post('/api/user/statuses', authMiddleware, (req, res) => {
    const { dramaUrl, status, currentEpisode } = req.body;
    const userId = req.user.id;
    if (!status) { // Remove status
        db.run('DELETE FROM user_statuses WHERE user_id = ? AND drama_url = ?', [userId, dramaUrl], (err) => {
            if (err) return res.status(500).json({ message: 'Database error' });
            res.status(200).json({ success: true });
        });
    } else {
        db.run('INSERT OR REPLACE INTO user_statuses (user_id, drama_url, status, currentEpisode) VALUES (?, ?, ?, ?)', [userId, dramaUrl, status, currentEpisode || 0], (err) => {
            if (err) return res.status(500).json({ message: 'Database error' });
            res.status(200).json({ success: true });
        });
    }
});

app.post('/api/user/reviews/episodes', authMiddleware, (req, res) => {
    const { dramaUrl, episodeNumber, text } = req.body;
    const userId = req.user.id;
    if (text.trim() === '') {
        db.run('DELETE FROM user_episode_reviews WHERE user_id = ? AND drama_url = ? AND episode_number = ?', [userId, dramaUrl, episodeNumber], (err) => {
             if (err) return res.status(500).json({ message: 'Database error' });
             res.status(200).json({ success: true });
        });
    } else {
        const updatedAt = Date.now();
        db.run('INSERT OR REPLACE INTO user_episode_reviews (user_id, drama_url, episode_number, review_text, updated_at) VALUES (?, ?, ?, ?, ?)', [userId, dramaUrl, episodeNumber, text, updatedAt], (err) => {
             if (err) return res.status(500).json({ message: 'Database error' });
             res.status(200).json({ success: true });
        });
    }
});


// --- Server Start ---
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
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
    Your backend server is now running on `http://localhost:3001`. You can now go to the frontend code, set `BACKEND_MODE` to `true`, and the application will connect to this server.
