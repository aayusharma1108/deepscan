# DeepScan — Deepfake Detection Platform

AI-powered deepfake detection with RNN temporal analysis, 3D facial landmark recognition, and MongoDB vector storage.

## Quick Start

```bash
cd /Users/jimmy/Documents/Deep\ scan
npm run setup
npm start
```

This will:
1. Check if port 5000 is available
2. Start the Flask server
3. **Automatically open your browser** at `http://127.0.0.1:5000`

## MongoDB Setup

1. Copy [`.env.example`](/Users/jimmy/Documents/Deep scan/deepscan/.env.example) to `deepscan/.env`
2. Paste your MongoDB Atlas connection string into `MONGODB_URI`
3. Optional: change `MONGODB_DB_NAME` and `MONGODB_COLLECTION`
4. Run:

```bash
cd /Users/jimmy/Documents/Deep\ scan
npm run setup
npm start
```

If `MONGODB_URI` is missing or invalid, the app still runs but falls back to in-memory storage. In the UI you will see `API Online (Memory)` instead of `API + Mongo Online`.

## Project Structure

```
deepscan/
├── app.py              ← Flask server
├── index.html          ← Frontend page
├── style.css           ← All styles
├── app.js              ← All frontend JS + API calls
├── requirements.txt    ← Python dependencies
├── package.json        ← NPM scripts
└── vectors/            ← SVG vector assets
    ├── logo.svg
    ├── neural-network.svg
    ├── face-landmarks.svg
    └── shield-check.svg
```

## NPM Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start server + auto-open browser |
| `npm run dev` | Start with debug mode |
| `npm run setup` | Install Python dependencies |

## Using a Different Port

If port 5000 is busy (macOS AirPlay Receiver uses it by default):

```bash
PORT=8080 npm start
```

Then manually open: `http://127.0.0.1:8080`

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Serves index.html |
| `/style.css` | GET | Serves CSS |
| `/app.js` | GET | Serves JavaScript |
| `/api/analyze` | POST | Run deepfake detection |
| `/api/history` | GET | Last 20 results (JSON) |
| `/api/stats` | GET | Aggregate stats (JSON) |

## Troubleshooting

### Port already in use

The startup script will automatically detect this and either:
- Kill stale Python processes and retry
- Show instructions if macOS AirPlay Receiver is blocking the port

### Browser didn't open automatically

Manually navigate to the URL shown in the terminal, e.g.:
```
http://127.0.0.1:5000
