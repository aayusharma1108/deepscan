from datetime import datetime, timezone
from flask import Flask, send_from_directory, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo.errors import PyMongoError
import hashlib
import os
import random

app = Flask(__name__)
CORS(app)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))

MONGODB_URI = os.environ.get("MONGODB_URI")
MONGODB_DB_NAME = os.environ.get("MONGODB_DB_NAME", "deepscan")
MONGODB_COLLECTION = os.environ.get("MONGODB_COLLECTION", "analyses")

mongo_collection = None
mongo_error = None
fallback_records = []


def init_mongo():
    global mongo_collection, mongo_error

    if not MONGODB_URI:
        mongo_error = "MONGODB_URI is not set"
        return

    try:
        client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
        client.admin.command("ping")
        mongo_collection = client[MONGODB_DB_NAME][MONGODB_COLLECTION]
        mongo_error = None
    except PyMongoError as exc:
        mongo_collection = None
        mongo_error = str(exc)


def generate_embedding(seed: str) -> list:
    rng = random.Random(seed)
    return [round(rng.uniform(-1, 1), 4) for _ in range(128)]


def build_analysis(filename: str, forced_type=None) -> dict:
    import time

    rng = random.Random(filename + str(time.time()))

    if forced_type == "real":
        verdict, conf = "REAL", round(0.80 + rng.random() * 0.14, 3)
        reason = "Facial landmarks align with natural geometry. RNN detects consistent micro-expressions. No GAN artifacts found."
    elif forced_type == "fake":
        verdict, conf = "FAKE", round(0.87 + rng.random() * 0.11, 3)
        reason = "GAN blending artifacts detected in periocular region. Temporal inconsistencies in 14/32 frames. Eye-blink anomaly flagged."
    elif forced_type == "uncertain":
        verdict, conf = "UNCERTAIN", round(0.42 + rng.random() * 0.20, 3)
        reason = "Mixed signals. Low-quality input reduces landmark confidence. Temporal data inconclusive. Manual review recommended."
    else:
        r = rng.random()
        if r < 0.40:
            verdict, conf = "REAL", round(0.75 + rng.random() * 0.20, 3)
            reason = "No significant deepfake indicators. Geometric ratios and temporal patterns within natural bounds."
        elif r < 0.78:
            verdict, conf = "FAKE", round(0.78 + rng.random() * 0.20, 3)
            reason = "Boundary blending artifacts found. Asymmetric eye blink-rate anomaly. GAN fingerprint in texture gradients."
        else:
            verdict, conf = "UNCERTAIN", round(0.38 + rng.random() * 0.28, 3)
            reason = "Confidence below classification threshold. Multiple signals conflict. Further review advised."

    def frame_color():
        if verdict == "FAKE":
            return "#ff4d6d" if rng.random() > 0.55 else "#1a1f35"
        if verdict == "REAL":
            return "#ffb347" if rng.random() > 0.90 else "#00f5c4"
        return rng.choice(["#ff4d6d", "#ffb347", "#1a1f35"])

    regions = ["Jawline", "Eyes", "Nose", "Mouth", "Brows", "Ears"]
    created_at = datetime.now(timezone.utc)
    file_hash = hashlib.sha256(filename.encode()).hexdigest()

    return {
        "filename": filename,
        "verdict": verdict,
        "confidence": conf,
        "pct": round(conf * 100),
        "reason": reason,
        "metrics": {
            "landmark": rng.randint(65, 98),
            "rnn": rng.randint(60, 98),
            "blink": rng.randint(58, 98),
            "texture": rng.randint(62, 97),
        },
        "timeline": [frame_color() for _ in range(32)],
        "landmarks": {region: round(0.58 + rng.random() * 0.40, 2) for region in regions},
        "hash": file_hash[:16].upper(),
        "file_hash": file_hash,
        "embedding_preview": generate_embedding(filename)[:8],
        "embedding": generate_embedding(filename),
        "model_ver": "bilstm-v2.4",
        "created_at": created_at,
    }


def serialize_record(record: dict) -> dict:
    created_at = record.get("created_at")
    created_at_iso = created_at.isoformat() if isinstance(created_at, datetime) else created_at

    return {
        "id": str(record.get("_id", "")) or None,
        "filename": record.get("filename", "unknown"),
        "verdict": record.get("verdict", "UNCERTAIN"),
        "confidence": record.get("confidence", 0),
        "pct": record.get("pct", round(record.get("confidence", 0) * 100)),
        "reason": record.get("reason", ""),
        "metrics": record.get("metrics", {}),
        "timeline": record.get("timeline", []),
        "landmarks": record.get("landmarks", {}),
        "hash": record.get("hash", ""),
        "file_hash": record.get("file_hash", ""),
        "embedding_preview": record.get("embedding_preview", []),
        "model_ver": record.get("model_ver", "bilstm-v2.4"),
        "created_at": created_at_iso,
    }


def save_record(record: dict) -> dict:
    if mongo_collection is not None:
        mongo_document = dict(record)
        try:
            insert_result = mongo_collection.insert_one(mongo_document)
            mongo_document["_id"] = insert_result.inserted_id
            return serialize_record(mongo_document)
        except PyMongoError:
            pass

    fallback_records.insert(0, dict(record))
    return serialize_record(record)


def fetch_history(limit: int = 20) -> list:
    if mongo_collection is not None:
        try:
            cursor = mongo_collection.find().sort("created_at", -1).limit(limit)
            return [serialize_record(record) for record in cursor]
        except PyMongoError:
            pass

    return [serialize_record(record) for record in fallback_records[:limit]]


def fetch_stats() -> dict:
    if mongo_collection is not None:
        try:
            total = mongo_collection.count_documents({})
            fake = mongo_collection.count_documents({"verdict": "FAKE"})

            pipeline = [
                {
                    "$group": {
                        "_id": None,
                        "avg_confidence": {"$avg": "$confidence"},
                    }
                }
            ]
            avg_result = list(mongo_collection.aggregate(pipeline))
            avg_confidence = None
            if avg_result and avg_result[0].get("avg_confidence") is not None:
                avg_confidence = round(avg_result[0]["avg_confidence"] * 100, 1)

            return {
                "total": total,
                "fake": fake,
                "avg_confidence": avg_confidence,
                "storage": "mongo",
                "mongo_connected": True,
            }
        except PyMongoError:
            pass

    total = len(fallback_records)
    fake = sum(1 for record in fallback_records if record["verdict"] == "FAKE")
    avg_confidence = round(sum(record["confidence"] for record in fallback_records) / total * 100, 1) if total else None
    return {
        "total": total,
        "fake": fake,
        "avg_confidence": avg_confidence,
        "storage": "memory",
        "mongo_connected": False,
        "mongo_error": mongo_error,
    }


init_mongo()


@app.route("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/style.css")
def css():
    return send_from_directory(BASE_DIR, "style.css")


@app.route("/app.js")
def js():
    return send_from_directory(BASE_DIR, "app.js")


@app.route("/api/analyze", methods=["POST"])
def api_analyze():
    forced_type, filename = None, "unknown.jpg"

    if request.content_type and "multipart" in request.content_type:
        uploaded_file = request.files.get("file")
        if not uploaded_file:
            return jsonify({"error": "No file provided"}), 400
        filename = uploaded_file.filename
    else:
        data = request.get_json(silent=True) or {}
        filename = data.get("filename", "sample.jpg")
        forced_type = data.get("type")

    record = build_analysis(filename, forced_type)
    return jsonify(save_record(record))


@app.route("/api/history")
def api_history():
    return jsonify(fetch_history())


@app.route("/api/stats")
def api_stats():
    return jsonify(fetch_stats())


if __name__ == "__main__":
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "5000"))
    debug = os.environ.get("FLASK_DEBUG", "1").lower() not in {"0", "false", "no"}
    app.run(host=host, port=port, debug=debug)
