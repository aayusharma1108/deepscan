# DeepScan

DeepScan is a deepfake detection demo that pairs a cinematic frontend with a Flask API, simulated RNN-style analysis output, and optional MongoDB-backed result history.

## Highlights

- Upload images or videos and get a simulated deepfake verdict with confidence metrics
- View a multi-step analysis flow with landmark, blink, texture, and temporal indicators
- Store analysis history in MongoDB Atlas when configured
- Fall back to in-memory storage automatically when MongoDB is unavailable
- Explore a polished single-page UI built with vanilla HTML, CSS, and JavaScript

## Tech Stack

- Frontend: HTML, CSS, vanilla JavaScript
- Backend: Flask, Flask-CORS
- Data: MongoDB Atlas via `pymongo` with in-memory fallback
- Config: `python-dotenv`

## Getting Started

### 1. Install dependencies

```bash
npm run setup
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Update `MONGODB_URI` in `.env` with your MongoDB Atlas connection string.

### 3. Start the app

```bash
npm start
```

Open `http://127.0.0.1:5000` in your browser.

## Environment Variables

| Variable | Description |
| --- | --- |
| `MONGODB_URI` | MongoDB Atlas connection string |
| `MONGODB_DB_NAME` | Database name for saved analyses |
| `MONGODB_COLLECTION` | Collection name for saved analyses |
| `PORT` | Flask server port, defaults to `5000` |
| `HOST` | Flask bind address, defaults to `0.0.0.0` |
| `FLASK_DEBUG` | Enables debug mode unless set to `0`, `false`, or `no` |

If `MONGODB_URI` is missing or invalid, the app still works and stores results in memory for the current session.

## Available Scripts

| Command | Description |
| --- | --- |
| `npm run setup` | Install Python dependencies from `requirements.txt` |
| `npm start` | Start the Flask app |
| `npm run dev` | Start the Flask app in debug mode |

## API Endpoints

| Endpoint | Method | Description |
| --- | --- | --- |
| `/` | `GET` | Serve the frontend |
| `/style.css` | `GET` | Serve stylesheet |
| `/app.js` | `GET` | Serve frontend logic |
| `/api/analyze` | `POST` | Analyze an uploaded file or demo payload |
| `/api/history` | `GET` | Fetch recent analysis history |
| `/api/stats` | `GET` | Fetch aggregate session statistics |

## Project Structure

```text
.
├── app.py
├── app.js
├── index.html
├── style.css
├── package.json
├── requirements.txt
└── vectors/
```

## Notes

- This project currently simulates model output for demo purposes.
- Uploaded files are used to generate analysis results, but no real deep learning model is executed yet.
- MongoDB connectivity is optional and only affects persistence.
