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
    -   **File Uploads**: `multer` configured for secure disk storage.

-   **Key Features**:
    -   **Database-Driven**: All data operations (filtering, sorting, metadata) are performed with efficient SQL queries, removing any in-memory drama cache to support massive datasets.
    -   **Dockerized Database**: The MySQL server runs in an isolated Docker container with a persistent volume, ensuring data is never lost.
    -   **Automatic Migrations**: The database schema is automatically created and updated on server startup.
    -   **Full Admin Panel Backend**: Provides protected API endpoints for admins to manage all users and perform advanced data management.
    -   **Robust Data Import**: Securely handles large `dramas.json` file uploads (up to 40MB+) using temporary disk storage to prevent server memory overload.
    -   **Real-Time Sync**: When a user makes a change on one device, the server instantly pushes a granular update event to all of that user's other logged-in devices.
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

3.  **Install Dependencies**: Install the necessary packages for the server, including the `mysql2` driver and `multer` for file uploads.
    ```bash
    npm install express mysql2 cors bcryptjs jsonwebtoken socket.io helmet express-rate-limit dotenv cookie-parser cookie multer
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
    backups/
    uploads/
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
├── docker-compose.yml
├── server.js            # The self-contained server file (MySQL version)
├── dramas.json
└── package.json
```

## 4. Code Implementation

Create a file named `server.js` inside the `backend` directory. The code for this file has been provided in the main response. It is a refactored version designed to work with MySQL and handle large datasets efficiently.

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

Your MySQL-powered backend is now running! The frontend will connect to it as long as `BACKEND_MODE` is enabled in your frontend configuration.## 6. Production Deployment with PM2

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
-   Update the `CORS_ALLOWED_ORIGINS` variable in your `.env` file for your production domain.
-   Use a strong, secret `JWT_SECRET` set via an environment variable.
-   Run your Node.js application behind a reverse proxy like Nginx in production.