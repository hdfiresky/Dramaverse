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
      "setup-db": "node database.js && node seed.js",
      "prod": "pm2 start ecosystem.config.js --env production"
    },
    ```

6.  **Copy Drama Data**: Copy the `dramas.json` file from `/public/data/dramas.json` into your new `/backend` directory. The seed script will use this file to populate the database.

## 3. Project Structure

After setup, your `backend` directory should look like this:

```
/backend
├── authMiddleware.js   # Middleware for JWT verification (for HTTP routes)
├── database.js         # DB connection and schema setup
├── ecosystem.config.js # PM2 configuration for production
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

### `ecosystem.config.js`
This file configures the PM2 process manager for production. It allows you to define environment variables, run the app in cluster mode to leverage multiple CPU cores, and manage restarts.

```javascript
module.exports = {
  apps : [{
    name   : "dramaverse-backend",
    script : "./server.js",
    instances: "max", // Creates a worker for each available CPU core
    exec_mode: "cluster",
    env_production: {
       NODE_ENV: "production",
       // Set your JWT_SECRET here for production.
       // It's more secure than a .env file for many deployment environments.
       JWT_SECRET: "your-long-random-super-secret-string-for-production" 
    }
  }]
}
```

### `authMiddleware.js`
This is an Express middleware to protect HTTP routes by verifying the JWT.

```javascript
const jwt = require('jsonwebtoken');
// The secret is now preferentially read from an environment variable for production.
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-me';

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
This is the main server file that ties everything together. It has been updated to read the `JWT_SECRET` from environment variables, which is a best practice for production.

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

// --- Security: Configure a CORS Whitelist ---
const allowedOrigins = [
    'http://localhost:5173', // Default for Vite dev server
    'http://12.0.0.1:5173',
    // 'https://your-production-frontend-domain.com'
];

const corsOptions = {
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
};

const io = new Server(server, { cors: corsOptions });

app.use(cors(corsOptions));
app.use(express.json());

const PORT = 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-me';

// --- Socket.IO Middleware for Auth ---
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication error: Token not provided'));
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return next(new Error('Authentication error: Invalid token'));
        socket.user = decoded;
        next();
    });
});

// --- Socket.IO Connection Handling ---
io.on('connection', (socket) => {
    console.log(`Real-time client connected: ${socket.user.username} (ID: ${socket.user.id})`);
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
      .then(() => {
          // Immediately fetch the data to send back in the initial HTTP response
          db.get('SELECT * FROM users WHERE id = ?', [req.user.id], async (err, user) => {
              if (err || !user) return res.status(404).json({ message: "User not found." });
              try {
                  const userData = { favorites: [], statuses: {}, reviews: {}, episodeReviews: {} };
                  const queries = [
                      new Promise((resolve, reject) => db.all('SELECT drama_url FROM user_favorites WHERE user_id = ?', [req.user.id], (err, rows) => err ? reject(err) : resolve(rows || []))),
                      new Promise((resolve, reject) => db.all('SELECT * FROM user_statuses WHERE user_id = ?', [req.user.id], (err, rows) => err ? reject(err) : resolve(rows || []))),
                      new Promise((resolve, reject) => db.all('SELECT * FROM user_episode_reviews WHERE user_id = ?', [req.user.id], (err, rows) => err ? reject(err) : resolve(rows || []))),
                  ];
                  const [favorites, statuses, episodeReviews] = await Promise.all(queries);
                  userData.favorites = favorites.map(f => f.drama_url);
                  statuses.forEach(s => { userData.statuses[s.drama_url] = { status: s.status, currentEpisode: s.currentEpisode }; });
                  episodeReviews.forEach(r => {
                      if (!userData.episodeReviews[r.drama_url]) userData.episodeReviews[r.drama_url] = {};
                      userData.episodeReviews[r.drama_url][r.episode_number] = { text: r.review_text, updatedAt: r.updated_at };
                  });
                  res.json(userData);
              } catch (error) {
                  res.status(500).json({ message: "Failed to fetch user data." });
              }
          });
      })
      .catch(() => res.status(500).json({ message: "Failed to initiate data fetch." }));
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

        if (!force && row && row.updated_at > clientUpdatedAt) {
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

2.  **Start the Server for Development**:
    ```bash
    npm run dev
    ```
    Your backend server is now running on `http://localhost:3001` with `nodemon`, which will automatically restart on file changes.

## 6. Production Deployment with PM2

For a production environment, you should use a process manager like [PM2](https://pm2.keymetrics.io/) to keep your application alive, enable clustering, and manage logs.

1.  **Install PM2 Globally**:
    ```bash
    npm install pm2 -g
    ```
2.  **Use the Ecosystem File**: We've already created an `ecosystem.config.js`. This file tells PM2 how to run the application, including setting environment variables and enabling cluster mode to take advantage of all available CPU cores for better performance.

3.  **Start the Production Server**:
    From your `/backend` directory, simply run the `prod` script:
    ```bash
    npm run prod
    ```
    This command will start the application in the background, managed by PM2.

4.  **Useful PM2 Commands**:
    -   `pm2 list`: See the status of all managed applications.
    -   `pm2 monit`: Open a real-time dashboard to monitor CPU and memory usage.
    -   `pm2 logs dramaverse-backend`: View the logs for your app.
    -   `pm2 restart dramaverse-backend`: Gracefully restart the app.
    -   `pm2 stop dramaverse-backend`: Stop the app.
    -   `pm2 delete dramaverse-backend`: Stop and remove the app from PM2's list.

## 7. Security Best Practices

To move this backend from a development setup to a production environment, consider the following critical security enhancements.

### CORS Configuration
The provided `server.js` code uses a secure CORS whitelist.

**Action Required for Production**: Before deploying, you **must** update the `allowedOrigins` array in `server.js` to include your frontend application's official domain name. Remove any `localhost` entries.

```javascript
// Example for production
const allowedOrigins = [
    'https://www.your-dramaverse-app.com',
    'https://your-dramaverse-app.com'
];
```

### Secret Keys
The `JWT_SECRET` is used to sign and verify authentication tokens. A weak or exposed secret key can compromise all user accounts.

**Action Required for Production**: The secret key should **never** be hardcoded in version control. We have configured the app to use an environment variable. The recommended way to set this is in your `ecosystem.config.js`:
```javascript
// ecosystem.config.js
// ...
env_production: {
    NODE_ENV: "production",
    JWT_SECRET: "your-long-random-super-secret-string-for-production" 
}
//...
```
Ensure this file is handled securely and not publicly exposed. For higher security, some platforms allow you to inject environment variables directly into the server environment, which PM2 can also use.

### Rate Limiting
Without rate limiting, a malicious actor could spam your login endpoints or WebSocket connection attempts, potentially leading to a Denial-of-Service (DoS) attack.

**Recommendation**: Implement rate limiting on sensitive endpoints.
-   For Express routes, a popular choice is `express-rate-limit`.
-   For Socket.IO, you can use libraries like `socket.io-rate-limit` or implement custom middleware to limit connection attempts or events per user.

### Input Validation
Always validate and sanitize any data received from a client before using it in database queries or broadcasting it to other clients. This helps prevent vulnerabilities like SQL injection or Cross-Site Scripting (XSS).

## 8. Nginx Reverse Proxy Configuration (Production)

In a production environment, you should not expose your Node.js server directly to the internet. Instead, use a battle-tested web server like Nginx as a **reverse proxy**. This allows you to handle SSL termination, serve static frontend files, and route API requests to your backend application, all from the same domain.

The following configuration is designed for when your app is served from a sub-path (e.g., `https://example.com/dramaverse/`).

### Example Nginx Server Block

Add the following to your Nginx configuration (e.g., in `/etc/nginx/sites-available/default` or a new file).

```nginx
# Assumes your frontend build files are in /var/www/dramaverse/dist
# and your domain is example.com

server {
    listen 80; # Or listen 443 ssl; for HTTPS
    server_name example.com;

    # Path to your frontend's built files (e.g., from 'npm run build')
    root /var/www/dramaverse/dist;
    index index.html;

    # --- 1. Serve the frontend application from the sub-path ---
    location /dramaverse/ {
        # This is crucial for single-page applications (SPAs) like React.
        # It tries to find a file at the requested URI. If not found,
        # it falls back to serving index.html, letting client-side routing take over.
        try_files $uri $uri/ /dramaverse/index.html;
    }

    # --- 2. Proxy API requests to the Node.js backend server ---
    location /dramaverse/api/ {
        # The trailing slash on proxy_pass is important here!
        # It maps /dramaverse/api/dramas to http://localhost:3001/api/dramas
        proxy_pass http://localhost:3001/api/; 
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # --- 3. Handle WebSocket connections for real-time updates ---
    location /dramaverse/socket.io/ {
        proxy_pass http://localhost:3001/socket.io/;
        proxy_http_version 1.1;
        
        # These headers are required to upgrade the connection to a WebSocket
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # You would typically have other configurations here, such as:
    # ssl_certificate /path/to/your/cert.pem;
    # ssl_certificate_key /path/to/your/key.pem;
    # access_log /var/log/nginx/dramaverse.access.log;
    # error_log /var/log/nginx/dramaverse.error.log;
}
```

After saving your configuration, remember to test it and reload Nginx:
```bash
sudo nginx -t
sudo systemctl reload nginx
```
With this setup, your frontend at `https://example.com/dramaverse/` will correctly send API requests to `/dramaverse/api/...`, which Nginx will route to your backend server running on port `3001`.