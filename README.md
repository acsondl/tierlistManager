# Tier List Manager(self-hosted)

A full-stack, local-first web application for creating, managing, and exporting custom drag-and-drop tier lists. 

This project was built to solve the issue of high-latency and bloatware from business-owned tierMaker. By utilizing an optimistic UI and local browser caching, the frontend provides a 0ms response time while silently syncing to a remote Go server in the background.

## Features
- **Local-First Architecture:** Leverages `localStorage` and background asynchronous syncing to mask high network latency.
- **Client-Side Compression:** Hijacks the HTML5 `<canvas>` API to automatically compress and resize raw image uploads into lightweight (~20KB) WebP files before network transmission.
- **Optimized Mobile UX:** Implements a sticky bottom-drawer interface and lazy-loading for heavy image rendering on mobile viewports.
- **Zero-Latency Drag & Drop:** Custom implementations of `dnd-kit` for complex sorting between tiers and unranked pools.
- **High-Res Export:** Native DOM-to-PNG generation using `html-to-image`.

## Tech Stack
- **Frontend:** React, TypeScript, Tailwind CSS, `@dnd-kit/core`
- **Backend:** Go, Gorm
- **Database:** PostgreSQL
- **Infrastructure:** PM2 (Process Management), Tailscale (Zero-config VPN & HTTPS Reverse Proxy)

---

## Self-Hosting Guide

This application is designed to be self-hosted on a 24/7 Linux server. The following guide uses PM2 for background process management and Tailscale for secure, zero-config remote access.

### Prerequisites
- Node.js & npm
- Go (1.20+)
- PostgreSQL (Native or via Docker)
- PM2 (`sudo npm install -g pm2`)
- Tailscale (installed and authenticated)

### 1. Database Setup
Ensure you have a PostgreSQL instance running. If using Docker, you can spin one up quickly:
```bash
docker run -d --name tierlist_postgres -e POSTGRES_PASSWORD=yourpassword -p 5432:5432 postgres:16-alpine
```
*Note: Ensure your Go backend's database connection string is updated with your PostgreSQL credentials and port.*

### 2. Build and Start the Backend
Navigate to the backend directory, compile the Go binary, and launch it in the background using PM2.
```bash
cd backend
go build -o tierlist-backend main.go
pm2 start ./tierlist-backend --name "tierlist-backend"
```
*(The backend defaults to port `8085`)*

### 3. Build and Start the Frontend
Before building the frontend, update the API URLs to point to your secure backend URL. 
1. Open `frontend/src/pages/Home.tsx` and `frontend/src/pages/Editor.tsx`.
2. Update the `BACKEND_URL` and `API_BASE` constants to point to your backend.

Compile the static files and serve them as a Single Page Application (SPA) using PM2.
```bash
cd frontend
npm install
npm run build
pm2 serve dist 5173 --name "tierlist-frontend" --spa
```
*(The frontend will now be served on port `5173`)*

### 4. Lock PM2 to Survive Reboots
Save your PM2 configuration so your frontend and backend automatically start if the server loses power or restarts:
```bash
pm2 save
pm2 startup
```
*(Run the custom command that `pm2 startup` outputs to your terminal to finalize).*

### 5. Secure Routing with Tailscale (Reverse Proxy)
Instead of opening ports to the public internet, use Tailscale Serve to route traffic through your private tailnet with automatic HTTPS.

**Route the Frontend (Port 8445):**
```bash
tailscale serve --bg --port 8445 [http://127.0.0.1:5173](http://127.0.0.1:5173)
```

**Route the Backend API (Port 8444):**
```bash
tailscale serve --bg --port 8444 [http://127.0.0.1:8085](http://127.0.0.1:8085)
```

You can now access your application securely from anywhere in the world by navigating to your Tailscale machine's MagicDNS URL (e.g., `https://your-server-name.tailnet-xxxx.ts.net:8445`).
