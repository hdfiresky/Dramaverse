// --- DEPENDENCIES ---
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const mysql = require('mysql2/promise');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt =require('jsonwebtoken');
const fs = require('fs').promises;
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const cookie = require('cookie');
const crypto = require('crypto');
const multer = require('multer');

// --- CONFIGURATION ---
dotenv.config();

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET;
const SOCKET_IO_PATH = process.env.SOCKET_IO_PATH || '/socket.io/';
const DRAMAS_JSON_PATH = path.join(__dirname, 'dramas.json');
const BACKUPS_DIR = path.join(__dirname, 'backups');
const UPLOAD_DIR = path.join(__dirname, 'uploads');


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
            CREATE TABLE IF NOT EXISTS users (id INT PRIMARY KEY AUTO_INCREMENT, username VARCHAR(255) UNIQUE NOT NULL, password VARCHAR(255) NOT NULL, is_admin TINYINT(1) DEFAULT 0 NOT NULL, is_banned TINYINT(1) DEFAULT 0 NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE IF NOT EXISTS dramas (url VARCHAR(255) PRIMARY KEY, title VARCHAR(255), data JSON);
            CREATE TABLE IF NOT EXISTS user_favorites (user_id INT, drama_url VARCHAR(255), PRIMARY KEY (user_id, drama_url), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (drama_url) REFERENCES dramas(url) ON DELETE CASCADE);
            CREATE TABLE IF NOT EXISTS user_statuses (user_id INT, drama_url VARCHAR(255), status VARCHAR(255), currentEpisode INT, PRIMARY KEY (user_id, drama_url), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (drama_url) REFERENCES dramas(url) ON DELETE CASCADE);
            CREATE TABLE IF NOT EXISTS user_episode_reviews (user_id INT, drama_url VARCHAR(255), episode_number INT, review_text TEXT, updated_at BIGINT, PRIMARY KEY (user_id, drama_url, episode_number), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (drama_url) REFERENCES dramas(url) ON DELETE CASCADE);
        `
    },
    {
        name: '002_add_updated_at_to_favorites',
        up: `ALTER TABLE user_favorites ADD COLUMN updated_at BIGINT;`
    },
    {
        name: '003_add_updated_at_to_statuses',
        up: `ALTER TABLE user_statuses ADD COLUMN updated_at BIGINT;`
    }
];

// --- DATABASE & CACHE SETUP ---
let db;
let cachedMetadata = null;

async function initializeDatabase() {
    db = await mysql.createPool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        supportBigNumbers: true,
        bigNumberStrings: true,
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
                        if (statementErr.code === 'ER_DUP_FIELDNAME') {
                            console.warn(`  ...WARN: Column in statement already exists. Skipping. Statement: "${statement}"`);
                        } else {
                            throw statementErr;
                        }
                    }
                }
                await connection.execute('INSERT INTO migrations (name) VALUES (?)', [migration.name]);
                await connection.commit();
            } catch (err) {
                await connection.rollback(); 
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
        }
    } else {
        const hashedPassword = bcrypt.hashSync('admin', 8);
        await db.execute('INSERT INTO users (username, password, is_admin, is_banned) VALUES (?, ?, ?, ?)', ['admin', hashedPassword, 1, 0]);
    }
}

async function seedDatabase() {
    try {
        await fs.access(DRAMAS_JSON_PATH);
        const dramas = JSON.parse(await fs.readFile(DRAMAS_JSON_PATH));
        const sql = "INSERT INTO dramas (url, title, data) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE title=VALUES(title), data=VALUES(data)";
        for (const drama of dramas) {
            const { url, title, ...rest } = drama;
            await db.execute(sql, [url, title, JSON.stringify(rest)]);
        }
        console.log(`Successfully seeded/updated ${dramas.length} dramas.`);
        cachedMetadata = null; // Invalidate metadata cache after seeding
    } catch {
        throw new Error('dramas.json not found.');
    }
}

async function getMetadata() {
    if (cachedMetadata) return cachedMetadata;
    const queries = {
        genres: `SELECT DISTINCT JSON_UNQUOTE(genre_item.genre) AS genre FROM dramas, JSON_TABLE(data->'$.genres', '$[*]' COLUMNS(genre VARCHAR(255) PATH '$')) AS genre_item WHERE JSON_UNQUOTE(genre_item.genre) IS NOT NULL ORDER BY genre`,
        tags: `SELECT DISTINCT JSON_UNQUOTE(tag_item.tag) AS tag FROM dramas, JSON_TABLE(data->'$.tags', '$[*]' COLUMNS(tag VARCHAR(255) PATH '$')) AS tag_item WHERE JSON_UNQUOTE(tag_item.tag) IS NOT NULL ORDER BY tag`,
        countries: `SELECT DISTINCT JSON_UNQUOTE(JSON_EXTRACT(data, '$.country')) AS country FROM dramas WHERE JSON_UNQUOTE(JSON_EXTRACT(data, '$.country')) IS NOT NULL ORDER BY country`,
        cast: `SELECT DISTINCT JSON_UNQUOTE(cast_item.actor_name) AS actor_name FROM dramas, JSON_TABLE(data->'$.cast', '$[*]' COLUMNS(actor_name VARCHAR(255) PATH '$.actor_name')) AS cast_item WHERE JSON_UNQUOTE(cast_item.actor_name) IS NOT NULL ORDER BY actor_name`
    };
    const [genresRows] = await db.query(queries.genres);
    const [tagsRows] = await db.query(queries.tags);
    const [countriesRows] = await db.query(queries.countries);
    const [castRows] = await db.query(queries.cast);
    cachedMetadata = {
        genres: genresRows.map(r => r.genre),
        tags: tagsRows.map(r => r.tag),
        countries: countriesRows.map(r => r.country),
        cast: castRows.map(r => r.actor_name),
    };
    return cachedMetadata;
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
}

async function fetchUserData(userId) {
    if (!userId) throw new Error("User ID is required.");
    const userData = { favorites: [], statuses: {}, reviews: {}, episodeReviews: {}, listUpdateTimestamps: {} };
    const [favRows] = await db.query('SELECT drama_url, updated_at FROM user_favorites WHERE user_id = ? ORDER BY updated_at DESC', [userId]);
    userData.favorites = favRows.map(f => f.drama_url);
    if (favRows.length > 0) userData.listUpdateTimestamps['Favorites'] = parseInt(favRows[0].updated_at, 10);
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
const upload = multer({ dest: UPLOAD_DIR });

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
});

// --- API ENDPOINTS ---
app.get('/api/health', (req, res) => res.status(200).json({ status: 'ok' }));
app.get('/api/dramas/metadata', apiLimiter, async (req, res) => res.json(await getMetadata()));

app.get('/api/dramas', apiLimiter, async (req, res) => {
    try {
        const { page = '1', limit = '24', search = '', minRating = '0', genres = '', excludeGenres = '', tags = '', excludeTags = '', countries = '', cast = '', sort = '[]', sortMode = 'weighted' } = req.query;
        let whereClauses = ['1=1'], params = [];
        if (search) { whereClauses.push('title LIKE ?'); params.push(`%${search}%`); }
        if (parseFloat(minRating) > 0) { whereClauses.push(`JSON_EXTRACT(data, '$.rating') >= ?`); params.push(parseFloat(minRating)); }
        if (countries) { whereClauses.push(`JSON_EXTRACT(data, '$.country') IN (?)`); params.push(countries.split(',')); }
        if (genres) genres.split(',').forEach(g => { whereClauses.push(`JSON_CONTAINS(data->'$.genres', CAST(? AS JSON))`); params.push(JSON.stringify(g)); });
        if (excludeGenres) excludeGenres.split(',').forEach(g => { whereClauses.push(`NOT JSON_CONTAINS(data->'$.genres', CAST(? AS JSON))`); params.push(JSON.stringify(g)); });
        if (tags) tags.split(',').forEach(t => { whereClauses.push(`JSON_CONTAINS(data->'$.tags', CAST(? AS JSON))`); params.push(JSON.stringify(t)); });
        if (excludeTags) excludeTags.split(',').forEach(t => { whereClauses.push(`NOT JSON_CONTAINS(data->'$.tags', CAST(? AS JSON))`); params.push(JSON.stringify(t)); });
        if (cast) cast.split(',').forEach(actor => { whereClauses.push(`JSON_SEARCH(data, 'one', ?, NULL, '$.cast[*].actor_name') IS NOT NULL`); params.push(actor); });
        const whereString = whereClauses.join(' AND ');
        const [[{ total }]] = await db.query(`SELECT COUNT(*) as total FROM dramas WHERE ${whereString}`, params);
        
        const allowedSortKeys = ['rating', 'popularity_rank', 'watchers', 'aired_date'];
        const allowedSortOrders = ['asc', 'desc'];
        let orderBy = `CAST(JSON_EXTRACT(data, '$.popularity_rank') AS UNSIGNED) ASC`; // Default sort

        if (sortMode === 'random') {
            orderBy = 'RAND()';
        } else {
            try {
                const sortPriorities = JSON.parse(sort);
                if (Array.isArray(sortPriorities) && sortPriorities.length > 0) {
                    const orderByParts = sortPriorities
                        .map(p => {
                            if (!p || typeof p !== 'object' || !p.key || !p.order || !allowedSortKeys.includes(p.key) || !allowedSortOrders.includes(p.order)) {
                                return null;
                            }
                            const order = p.order.toUpperCase();
                            let columnExpression;
                            let finalOrder = order;

                            if (p.key === 'aired_date') {
                                columnExpression = `STR_TO_DATE(SUBSTRING_INDEX(JSON_UNQUOTE(JSON_EXTRACT(data, '$.aired_date')), ' - ', 1), '%b %d, %Y')`;
                            } else {
                                const castType = p.key === 'rating' ? 'DECIMAL(10,1)' : 'UNSIGNED';
                                columnExpression = `CAST(JSON_EXTRACT(data, '$.${p.key}') AS ${castType})`;
                            }
                            
                            if (p.key === 'popularity_rank') {
                                finalOrder = order === 'ASC' ? 'DESC' : 'ASC';
                            }
                            
                            return `${columnExpression} ${finalOrder}`;
                        })
                        .filter(Boolean);

                    if (orderByParts.length > 0) {
                        orderBy = orderByParts.join(', ');
                    }
                }
            } catch (e) {
                console.warn("Could not parse 'sort' query parameter. Using default sort.");
            }
        }
        const pageNum = parseInt(page), limitNum = parseInt(limit), offset = (pageNum - 1) * limitNum;
        const [rows] = await db.query(`SELECT url, title, data FROM dramas WHERE ${whereString} ORDER BY ${orderBy} LIMIT ? OFFSET ?`, [...params, limitNum, offset]);
        res.json({ totalItems: total, dramas: rows.map(r => ({ ...JSON.parse(r.data), url: r.url, title: r.title })), currentPage: pageNum, totalPages: Math.ceil(total / limitNum) });
    } catch (err) {
        console.error("Error in /api/dramas:", err);
        res.status(500).json({ message: "An error occurred while fetching dramas." });
    }
});

app.get('/api/dramas/by-actor/:actorName', apiLimiter, async (req, res) => {
    const sql = `SELECT url, title, data FROM dramas WHERE JSON_SEARCH(data, 'one', ?, NULL, '$.cast[*].actor_name') IS NOT NULL`;
    const [rows] = await db.query(sql, [req.params.actorName]);
    res.json(rows.map(r => ({...JSON.parse(r.data), url: r.url, title: r.title})));
});

app.post('/api/dramas/by-urls', apiLimiter, async (req, res) => {
    const { urls } = req.body;
    if (!Array.isArray(urls) || urls.length === 0) return res.json([]);
    const [rows] = await db.query(`SELECT url, title, data FROM dramas WHERE url IN (?)`, [urls]);
    res.json(rows.map(r => ({...JSON.parse(r.data), url: r.url, title: r.title})));
});

app.get('/api/dramas/recommendations/curated/:url', apiLimiter, async (req, res) => {
    const [[drama]] = await db.query(`SELECT data FROM dramas WHERE url = ?`, [req.params.url]);
    if (!drama) return res.status(404).json([]);
    const recUrls = JSON.parse(drama.data).recommendations.map(r => r.url);
    if (recUrls.length === 0) return res.json([]);
    const [rows] = await db.query(`SELECT url, title, data FROM dramas WHERE url IN (?)`, [recUrls]);
    res.json(rows.map(r => ({...JSON.parse(r.data), url: r.url, title: r.title})));
});

app.get('/api/dramas/recommendations/similar/:url', apiLimiter, async (req, res) => {
    const baseDramaUrl = req.params.url;
    const { criteria } = req.query;
    const selectedCriteria = criteria ? criteria.split(',') : [];
    if (selectedCriteria.length === 0) return res.json([]);

    const weights = { genres: 25, tags: 30, cast: 15, rating: 10 };
    let scoreClauses = [], params = [];

    const [[baseDramaRow]] = await db.query('SELECT data FROM dramas WHERE url = ?', [baseDramaUrl]);
    if (!baseDramaRow) return res.status(404).json([]);
    const baseDrama = JSON.parse(baseDramaRow.data);

    if (selectedCriteria.includes('genres') && baseDrama.genres.length > 0) {
        scoreClauses.push(`(SELECT COUNT(*) FROM JSON_TABLE(?, '$[*]' COLUMNS(val VARCHAR(255) PATH '$')) AS j1 JOIN JSON_TABLE(d2.data->'$.genres', '$[*]' COLUMNS(val VARCHAR(255) PATH '$')) AS j2 ON j1.val = j2.val) * ?`);
        params.push(JSON.stringify(baseDrama.genres), weights.genres / baseDrama.genres.length);
    }
    if (selectedCriteria.includes('tags') && baseDrama.tags.length > 0) {
        scoreClauses.push(`(SELECT COUNT(*) FROM JSON_TABLE(?, '$[*]' COLUMNS(val VARCHAR(255) PATH '$')) AS j1 JOIN JSON_TABLE(d2.data->'$.tags', '$[*]' COLUMNS(val VARCHAR(255) PATH '$')) AS j2 ON j1.val = j2.val) * ?`);
        params.push(JSON.stringify(baseDrama.tags), weights.tags / baseDrama.tags.length);
    }
    if (selectedCriteria.includes('cast') && baseDrama.cast.length > 0) {
        const actorNames = JSON.stringify(baseDrama.cast.map(c => c.actor_name));
        scoreClauses.push(`(SELECT COUNT(*) FROM JSON_TABLE(?, '$[*]' COLUMNS(val VARCHAR(255) PATH '$')) AS j1 JOIN JSON_TABLE(d2.data->'$.cast', '$[*]' COLUMNS(val VARCHAR(255) PATH '$.actor_name')) AS j2 ON j1.val = j2.val) * ?`);
        params.push(actorNames, weights.cast / baseDrama.cast.length);
    }
    if (selectedCriteria.includes('rating')) {
        scoreClauses.push(`(1 - (ABS(? - JSON_UNQUOTE(JSON_EXTRACT(d2.data, '$.rating'))) / 10)) * ?`);
        params.push(baseDrama.rating, weights.rating);
    }

    if (scoreClauses.length === 0) return res.json([]);

    const scoreCalculation = scoreClauses.join(' + ');
    const sql = `
        SELECT d2.url, d2.title, d2.data, (${scoreCalculation}) AS score
        FROM dramas d2
        WHERE d2.url != ?
        HAVING score > 10
        ORDER BY score DESC
        LIMIT 10;
    `;
    params.push(baseDramaUrl);

    const [results] = await db.query(sql, params);
    res.json(results.map(r => ({ drama: {...JSON.parse(r.data), url: r.url, title: r.title}, score: Math.round(r.score) })));
});


app.use('/api/auth', authLimiter);
app.post('/api/auth/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password || password.length < 6) return res.status(400).json({ message: "Invalid input." });
    const hashedPassword = bcrypt.hashSync(password, 8);
    try {
        const [result] = await db.execute('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword]);
        const newUser = { id: result.insertId, username, isAdmin: false };
        const token = jwt.sign(newUser, JWT_SECRET, { expiresIn: '24h' });
        res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 24 * 60 * 60 * 1000 });
        const data = await fetchUserData(newUser.id);
        res.status(201).json({ user: { username, isAdmin: false }, data });
    } catch (e) { res.status(409).json({ message: "Username already exists." }); }
});
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    const [[user]] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
    if (!user || !bcrypt.compareSync(password, user.password)) return res.status(401).json({ message: 'Invalid credentials' });
    if (user.is_banned) return res.status(403).json({ message: 'This account has been banned.' });
    const token = jwt.sign({ id: user.id, username: user.username, isAdmin: !!user.is_admin }, JWT_SECRET, { expiresIn: '24h' });
    res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 24*60*60*1000 });
    const data = await fetchUserData(user.id);
    res.json({ user: { username: user.username, isAdmin: !!user.is_admin }, data });
});
app.post('/api/auth/logout', (req, res) => res.clearCookie('token').sendStatus(200));

app.use('/api/user', authMiddleware, apiLimiter); 
app.get('/api/user/data', async (req, res) => res.json({ user: { username: req.user.username, isAdmin: !!req.user.isAdmin }, data: await fetchUserData(req.user.id) }));
app.post('/api/user/favorites', async (req, res) => {
    const { dramaUrl, isFavorite } = req.body;
    const now = Date.now();
    const sql = isFavorite ? 'INSERT INTO user_favorites (user_id, drama_url, updated_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE updated_at=?' : 'DELETE FROM user_favorites WHERE user_id = ? AND drama_url = ?';
    const [result] = await db.execute(sql, isFavorite ? [req.user.id, dramaUrl, now, now] : [req.user.id, dramaUrl]);
    if (result.affectedRows > 0) emitToUserRoom(req.user.id, 'favorite_updated', { dramaUrl, isFavorite, updatedAt: now });
    res.sendStatus(200);
});
app.post('/api/user/statuses', async (req, res) => {
    const { dramaUrl, status, currentEpisode } = req.body;
    const now = Date.now();
    const sql = status ? 'INSERT INTO user_statuses (user_id, drama_url, status, currentEpisode, updated_at) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE status=VALUES(status), currentEpisode=VALUES(currentEpisode), updated_at=VALUES(updated_at)' : 'DELETE FROM user_statuses WHERE user_id = ? AND drama_url = ?';
    const params = status ? [req.user.id, dramaUrl, status, currentEpisode || 0, now] : [req.user.id, dramaUrl];
    const [result] = await db.execute(sql, params);
    if (result.affectedRows > 0) emitToUserRoom(req.user.id, 'status_updated', { dramaUrl, statusInfo: status ? { status, currentEpisode: currentEpisode || 0, updatedAt: now } : null });
    res.sendStatus(200);
});
app.post('/api/user/reviews/track_progress', async (req, res) => {
    const { dramaUrl, episodeNumber, text, totalEpisodes, clientUpdatedAt, force } = req.body;
    const now = Date.now(), userId = req.user.id;
    const connection = await db.getConnection();
    try {
        if (!force && text.trim() && clientUpdatedAt) {
            const [[serverReview]] = await connection.query('SELECT updated_at, review_text FROM user_episode_reviews WHERE user_id = ? AND drama_url = ? AND episode_number = ?', [userId, dramaUrl, episodeNumber]);
            if (serverReview && serverReview.updated_at > clientUpdatedAt) {
                 connection.release();
                 return res.status(409).json({ message: 'Conflict detected.', serverVersion: { text: serverReview.review_text, updatedAt: parseInt(serverReview.updated_at) } });
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
        let statusUpdated = false, finalStatusInfo = null;
        if (text.trim() !== '') {
            const [[oldStatusInfo]] = await connection.query('SELECT * FROM user_statuses WHERE user_id = ? AND drama_url = ? FOR UPDATE', [userId, dramaUrl]);
            let newStatus = oldStatusInfo?.status || 'Watching', newEp = Math.max(oldStatusInfo?.currentEpisode || 0, episodeNumber);
            if (newStatus === 'Plan to Watch') newStatus = 'Watching';
            if (episodeNumber === totalEpisodes) { newStatus = 'Completed'; newEp = totalEpisodes; }
            if (!oldStatusInfo || newStatus !== oldStatusInfo.status || newEp !== oldStatusInfo.currentEpisode) {
                const [statusResult] = await connection.execute('INSERT INTO user_statuses (user_id, drama_url, status, currentEpisode, updated_at) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE status=VALUES(status), currentEpisode=VALUES(currentEpisode), updated_at=VALUES(updated_at)', [userId, dramaUrl, newStatus, newEp, now]);
                if (statusResult.affectedRows > 0) { statusUpdated = true; finalStatusInfo = { status: newStatus, currentEpisode: newEp, updatedAt: now }; }
            }
        }
        await connection.commit();
        if (reviewUpdated) emitToUserRoom(userId, 'episode_review_updated', { dramaUrl, episodeNumber, review: text.trim() ? { text, updatedAt: now } : null });
        if (statusUpdated) emitToUserRoom(userId, 'status_updated', { dramaUrl, statusInfo: finalStatusInfo });
        res.status(200).json({ success: true });
    } catch (e) { await connection.rollback(); res.status(500).json({ message: 'Failed to update.' }); }
     finally { connection.release(); }
});
app.post('/api/user/change-password', async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const [[user]] = await db.query('SELECT password FROM users WHERE id = ?', [req.user.id]);
    if (!user || !bcrypt.compareSync(currentPassword, user.password)) return res.status(401).json({ message: 'Incorrect current password.' });
    await db.execute('UPDATE users SET password = ? WHERE id = ?', [bcrypt.hashSync(newPassword, 8), req.user.id]);
    res.sendStatus(200);
});

// Admin endpoints...
app.use('/api/admin', authMiddleware, adminAuthMiddleware, apiLimiter);
app.get('/api/admin/users', async (req, res) => { const [rows] = await db.query('SELECT id, username, is_banned, is_admin FROM users'); res.json(rows.map(u => ({ ...u, isAdmin: !!u.is_admin, is_banned: !!u.is_banned }))); });
app.get('/api/admin/stats', async (req, res) => {
    const [[{c:u}]] = await db.query('SELECT COUNT(*) as c FROM users');
    const [[{c:d}]] = await db.query('SELECT COUNT(*) as c FROM dramas');
    const [[{c:r}]] = await db.query('SELECT COUNT(*) as c FROM user_episode_reviews');
    const [reg] = await db.query(`SELECT DATE(created_at) as d, COUNT(id) as c FROM users WHERE created_at >= CURDATE() - INTERVAL 13 DAY GROUP BY d ORDER BY d ASC`);
    const regMap = new Map(reg.map(row => [new Date(row.d).toISOString().split('T')[0], row.c]));
    const regStats = Array.from({ length: 14 }, (_, i) => { const day = new Date(); day.setDate(day.getDate() - i); const str = day.toISOString().split('T')[0]; return { date: str, count: regMap.get(str) || 0 }; }).reverse();
    res.json({ totalUsers: u, totalDramas: d, totalReviews: r, registrationStats: regStats });
});
app.get('/api/admin/users/:id/data', async (req, res) => res.json(await fetchUserData(parseInt(req.params.id))));
app.post('/api/admin/users/:id/admin', async (req, res) => { if (req.user.id === parseInt(req.params.id)) return res.status(403).json({m:'Cannot demote self.'}); await db.execute('UPDATE users SET is_admin = ? WHERE id = ?', [req.body.isAdmin ? 1 : 0, req.params.id]); res.sendStatus(200); });
app.post('/api/admin/users/:id/ban', async (req, res) => { const [[u]] = await db.query('SELECT is_admin FROM users WHERE id = ?', [req.params.id]); if (u?.is_admin) return res.status(403).json({m:'Cannot ban admin.'}); await db.execute('UPDATE users SET is_banned = ? WHERE id = ?', [req.body.ban ? 1 : 0, req.params.id]); res.sendStatus(200); });
app.delete('/api/admin/users/:id', async (req, res) => { const [[u]] = await db.query('SELECT is_admin FROM users WHERE id = ?', [req.params.id]); if (u?.is_admin) return res.status(403).json({m:'Cannot delete admin.'}); await db.execute('DELETE FROM users WHERE id = ?', [req.params.id]); res.sendStatus(200); });
app.post('/api/admin/users/:id/reset-password', async (req, res) => { const p = crypto.randomBytes(8).toString('hex'); await db.execute('UPDATE users SET password = ? WHERE id = ?', [bcrypt.hashSync(p, 8), req.params.id]); res.json({ newPassword: p }); });
app.post('/api/admin/dramas/upload-preview', upload.single('dramaFile'), async (req, res) => {
    try {
        const uploaded = JSON.parse(await fs.readFile(req.file.path, 'utf-8'));
        const [existingRows] = await db.query('SELECT url, data FROM dramas');
        const existing = new Map(existingRows.map(r => [r.url, JSON.parse(r.data)]));
        const results = { new: [], updated: [], unchanged: [], errors: [] };
        for (const [i, d] of uploaded.entries()) {
            if (!d.url || !d.title) { results.errors.push({ index: i, drama: d, error: 'Missing url or title.' }); continue; }
            if (existing.has(d.url)) { const {url,title,...rest}=d; if(JSON.stringify(rest)===JSON.stringify(existing.get(d.url))) results.unchanged.push(d); else results.updated.push({ old:{url,title,...existing.get(d.url)},new:d}); }
            else results.new.push(d);
        }
        res.json(results);
    } catch (e) { res.status(400).json({ message: e.message }); } finally { await fs.unlink(req.file.path); }
});
app.post('/api/admin/dramas/import', async (req, res) => {
    const { dramasToImport } = req.body;
    const connection = await db.getConnection();
    try {
        const backupFilename = `dramas-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        if ((await fs.readdir(path.dirname(DRAMAS_JSON_PATH))).includes(path.basename(DRAMAS_JSON_PATH))) {
             await fs.writeFile(path.join(BACKUPS_DIR, backupFilename), await fs.readFile(DRAMAS_JSON_PATH, 'utf-8'));
        }
        await connection.beginTransaction();
        const sql = "INSERT INTO dramas (url, title, data) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE title=VALUES(title), data=VALUES(data)";
        for (const {url, title, ...rest} of dramasToImport) await connection.execute(sql, [url, title, JSON.stringify(rest)]);
        await connection.commit();
        cachedMetadata = null; // Invalidate cache
        res.json({ message: `${dramasToImport.length} dramas imported successfully.`, backupFilename });
    } catch (e) { await connection.rollback(); res.status(500).json({ message: e.message }); } finally { connection.release(); }
});
app.get('/api/admin/dramas/backups', async (req, res) => {
    try {
        const files = await fs.readdir(BACKUPS_DIR);
        const backups = await Promise.all(files.filter(f => f.endsWith('.json')).map(async f => ({ filename: f, createdAt: (await fs.stat(path.join(BACKUPS_DIR, f))).birthtime })));
        res.json(backups.sort((a,b) => b.createdAt - a.createdAt));
    } catch { res.json([]); }
});
app.get('/api/admin/dramas/download/:filename', (req, res) => {
    const { filename } = req.params;
    const p = (filename.startsWith('dramas-') && filename.endsWith('.json')) ? path.join(BACKUPS_DIR, filename) : (filename === 'dramas.json' ? DRAMAS_JSON_PATH : null);
    if (!p) return res.status(400).json({ message: 'Invalid filename.' });
    res.download(p, filename, (err) => { if (err) res.status(404).json({ message: 'File not found.' }); });
});
app.post('/api/admin/dramas/rollback', async (req, res) => {
    const backupPath = path.join(BACKUPS_DIR, req.body.filename);
    try {
        await fs.copyFile(backupPath, DRAMAS_JSON_PATH);
        await db.execute('DELETE FROM dramas');
        await seedDatabase();
        res.json({ message: `Rolled back to ${req.body.filename}.`});
    } catch (e) { res.status(500).json({ message: `Rollback failed: ${e.message}` }); }
});

app.use((err, req, res, next) => res.status(500).json({ message: 'Server error.' }));

async function startServer() {
    try {
        await Promise.all([fs.mkdir(BACKUPS_DIR, { recursive: true }), fs.mkdir(UPLOAD_DIR, { recursive: true })]);
        await initializeDatabase();
        await runMigrations();
        await seedAdminUser();
        server.listen(PORT, () => console.log(`Server with MySQL running on http://localhost:${PORT}`));
    } catch (err) {
        if (db) await db.end();
        process.exit(1);
    }
}
if (process.argv.includes('--seed')) { (async () => { try { await initializeDatabase(); await seedDatabase(); } catch (err) { console.error("Seeding failed:", err); } finally { if (db) await db.end(); process.exit(0); } })(); }
else { startServer(); }
process.on('SIGINT', async () => server.close(async () => { if (db) await db.end(); process.exit(0); }));
