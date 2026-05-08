from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import PlainTextResponse
from fastapi.responses import HTMLResponse, StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi import Request
from typing import List
import logging
import tensorflow as tf
import numpy as np
from PIL import Image
import os
import cv2
import sqlite3
from datetime import datetime
import io

app = FastAPI(title="Road Damage Detection API")
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")
# disable Jinja2 caching to avoid unhashable dict cache keys in some envs
templates.env.cache_size = 0
# ensure the cache mapping is a plain dict (avoid Jinja using unhashable keys)
templates.env.cache = {}
model = None

# configure basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def init_db():
    conn = sqlite3.connect('database.db')
    cursor = conn.cursor()
    cursor.execute('''CREATE TABLE IF NOT EXISTS predictions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        result TEXT NOT NULL,
        confidence REAL NOT NULL,
        severity TEXT NOT NULL,
        damage_type TEXT NOT NULL,
        detection_type TEXT NOT NULL,
        timestamp TEXT NOT NULL)''')
    conn.commit()
    conn.close()

def save_prediction(filename, result, confidence, severity, damage_type, detection_type):
    conn = sqlite3.connect('database.db')
    cursor = conn.cursor()
    cursor.execute('''INSERT INTO predictions 
        (filename, result, confidence, severity, damage_type, detection_type, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)''',
        (filename, result, confidence, severity, damage_type, detection_type,
         datetime.now().strftime('%Y-%m-%d %H:%M:%S')))
    conn.commit()
    conn.close()

def get_damage_type(confidence):
    if confidence < 0.5:
        return "No Damage"
    elif confidence > 0.85:
        return "Pothole"
    else:
        return "Surface Crack"

def predict_image_array(img_array):
    img_array = np.expand_dims(img_array, axis=0)
    prediction = model.predict(img_array, verbose=0)[0][0]
    logger.info(f'Raw model prediction: {prediction}')
    return float(prediction)

def preprocess_pil(img_path):
    img = Image.open(img_path).convert('RGB')
    img = img.resize((224, 224))
    return np.array(img) / 255.0

def preprocess_frame(frame):
    img = cv2.resize(frame, (224, 224))
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    return np.array(img) / 255.0

def calibrate_confidence(raw_confidence):
    """Calibration for IMAGES - balanced threshold at 0.82 raw = 50% calibrated."""
    
    if raw_confidence > 0.90:
        # Very high = clearly damaged (90-100% → 75-100%)
        calibrated = 0.75 + (raw_confidence - 0.90) * 2.5
    elif raw_confidence > 0.82:
        # High = damaged (82-90% → 50-75%)
        calibrated = 0.5 + (raw_confidence - 0.82) * 3.125
    elif raw_confidence > 0.75:
        # Medium-High = uncertain (75-82% → 30-50%)
        calibrated = 0.3 + (raw_confidence - 0.75) * 2.86
    elif raw_confidence > 0.68:
        # Medium = likely good (68-75% → 15-30%)
        calibrated = 0.15 + (raw_confidence - 0.68) * 2.14
    elif raw_confidence > 0.60:
        # Medium-Low = good (60-68% → 5-15%)
        calibrated = 0.05 + (raw_confidence - 0.60) * 1.25
    else:
        # Low = good (<60% → 0-5%)
        calibrated = raw_confidence * 0.083
    return min(max(calibrated, 0.0), 1.0)

def calibrate_video_confidence(raw_confidence):
    """STRICT Calibration for VIDEOS - threshold at 0.88 raw = 50% calibrated.
    Highways give ~0.85 raw, so they stay <50% (Good).
    Damaged roads give ~0.90+ raw, so they go >50% (Damaged)."""
    
    if raw_confidence > 0.93:
        # Very high = clearly damaged (93-100% → 75-100%)
        calibrated = 0.75 + (raw_confidence - 0.93) * 3.57
    elif raw_confidence > 0.88:
        # High = damaged (88-93% → 50-75%)
        calibrated = 0.5 + (raw_confidence - 0.88) * 5
    elif raw_confidence > 0.83:
        # Medium-High = uncertain (83-88% → 30-50%)
        calibrated = 0.3 + (raw_confidence - 0.83) * 4
    elif raw_confidence > 0.78:
        # Medium = likely good (78-83% → 15-30%)
        calibrated = 0.15 + (raw_confidence - 0.78) * 3
    elif raw_confidence > 0.70:
        # Medium-Low = good (70-78% → 5-15%)
        calibrated = 0.05 + (raw_confidence - 0.70) * 1.25
    else:
        # Low = good (<70% → 0-5%)
        calibrated = raw_confidence * 0.071
    return min(max(calibrated, 0.0), 1.0)

def get_result(confidence):
    # Calibrate the confidence to fix model bias
    calibrated = calibrate_confidence(confidence)
    if calibrated > 0.5:
        result = "Road Damage Detected!"
        severity = "High" if calibrated > 0.8 else "Medium"
        color = "red"
    else:
        result = "Road is Good!"
        severity = "None"
        color = "green"
    return result, severity, color, round(calibrated * 100, 2)

camera = None

def generate_frames():
    """Generator that captures frames from the default camera and yields MJPEG chunks.

    This function is defensive: it checks that the capture opened successfully,
    breaks if the global `camera` is set to None (e.g. via `/stop_camera`),
    and ensures the capture is released on exit.
    """
    global camera
    camera = cv2.VideoCapture(0)
    if not camera or not camera.isOpened():
        logger.error('Could not open video capture (camera not available).')
        camera = None
        return
    try:
        while True:
            # If another endpoint requested camera stop, break gracefully
            if camera is None:
                logger.info('Camera set to None, stopping frame generator.')
                break
            success, frame = camera.read()
            if not success or frame is None:
                logger.info('Camera read failed or returned no frame, stopping generator.')
                break
            try:
                img_array = preprocess_frame(frame)
                raw_confidence = predict_image_array(img_array) if model is not None else 0.0
                result, severity, color, calibrated_conf = get_result(raw_confidence)
                damage_type = get_damage_type(raw_confidence)
                label = f"{damage_type} ({calibrated_conf}%)"
                box_color = (0, 0, 255) if color == "red" else (0, 255, 0)
                cv2.rectangle(frame, (5, 5), (450, 100), (30, 30, 30), -1)
                cv2.putText(frame, label, (15, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.9, box_color, 2)
                cv2.putText(frame, f"Severity: {severity}", (15, 75), cv2.FONT_HERSHEY_SIMPLEX, 0.7, box_color, 2)
                ret, buffer = cv2.imencode('.jpg', frame)
                if not ret:
                    logger.warning('Failed to encode frame to JPEG, skipping frame.')
                    continue
                yield (b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
            except Exception:
                logger.exception('Error processing frame, continuing to next frame.')
                continue
    finally:
        try:
            if camera:
                camera.release()
        except Exception:
            logger.exception('Error releasing camera resource')
        camera = None

@app.on_event("startup")
async def startup():
    init_db()
    global model
    if model is None:
        try:
            # Try loading best model first, fallback to regular model
            if os.path.exists('model/road_damage_model_best.h5'):
                logger.info('Loading best model from model/road_damage_model_best.h5')
                model = tf.keras.models.load_model('model/road_damage_model_best.h5')
            else:
                logger.info('Loading model from model/road_damage_model.h5')
                model = tf.keras.models.load_model('model/road_damage_model.h5')
            logger.info('Model loaded successfully')
        except Exception as e:
            logger.exception('Failed to load model on startup: %s', e)

# allow CORS from localhost for frontend testing
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:8000", "http://localhost:8000", "http://127.0.0.1:5000", "http://localhost:5000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Basic health and readiness endpoints
@app.get('/health')
async def health():
    return JSONResponse({'status': 'ok'})

@app.get('/ready')
async def ready():
    if model is None:
        return JSONResponse({'ready': False}, status_code=503)
    return JSONResponse({'ready': True})

@app.post("/test_predict")
async def test_predict(file: UploadFile = File(...)):
    """Debug endpoint to see raw model predictions"""
    if model is None:
        return JSONResponse({'error': 'Model not loaded'}, status_code=503)
    os.makedirs('uploads', exist_ok=True)
    filepath = os.path.join('uploads', file.filename)
    content = await file.read()
    with open(filepath, 'wb') as f:
        f.write(content)
    img_array = preprocess_pil(filepath)
    raw_pred = predict_image_array(img_array)
    confidence = raw_pred * 100
    return JSONResponse({
        'raw_prediction': raw_pred,
        'confidence_percent': round(confidence, 2),
        'threshold_used': 0.5,
        'would_be_classified_as': 'Damaged' if raw_pred > 0.5 else 'Good',
        'note': 'If this shows >0.9 for both good and bad roads, model needs retraining'
    })


# global exception handlers to return JSON/plain text
@app.exception_handler(Exception)
async def generic_exception_handler(request, exc):
    logger.exception('Unhandled exception: %s', exc)
    return JSONResponse({'error': 'Internal server error'}, status_code=500)

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    return JSONResponse({'error': 'Invalid request', 'details': exc.errors()}, status_code=422)

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    # Serve the static index.html directly to avoid Jinja2 cache key issues
    try:
        with open(os.path.join('templates', 'index.html'), 'r', encoding='utf-8') as fh:
            return HTMLResponse(fh.read())
    except Exception as e:
        logger.exception('Failed to read index.html: %s', e)
        return HTMLResponse('<h1>Internal Server Error</h1>', status_code=500)

@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    if model is None:
        return JSONResponse({'error': 'Model not loaded'}, status_code=503)
    os.makedirs('uploads', exist_ok=True)
    filepath = os.path.join('uploads', file.filename)
    content = await file.read()
    with open(filepath, 'wb') as f:
        f.write(content)
    img_array = preprocess_pil(filepath)
    raw_confidence = predict_image_array(img_array)
    result, severity, color, calibrated_conf = get_result(raw_confidence)
    
    # Get detailed damage classification
    damage_info = classify_damage_detailed(raw_confidence, img_array)
    damage_type = damage_info['type']
    
    # Use calibrated confidence for display
    save_prediction(file.filename, result, calibrated_conf, severity, damage_type, 'image')
    return JSONResponse({
        'result': result,
        'confidence': calibrated_conf,
        'severity': severity,
        'color': color,
        'damage_type': damage_type,
        'damage_details': damage_info
    })

@app.post("/predict_batch")
async def predict_batch(files: List[UploadFile] = File(...)):
    """Process multiple images/videos in batch."""
    if model is None:
        return JSONResponse({'error': 'Model not loaded'}, status_code=503)
    
    results = []
    os.makedirs('uploads', exist_ok=True)
    
    for file in files:
        try:
            filepath = os.path.join('uploads', file.filename)
            content = await file.read()
            with open(filepath, 'wb') as f:
                f.write(content)
            
            # Check if image or video
            if file.filename.lower().endswith(('.mp4', '.avi', '.mov', '.mkv')):
                # Video processing
                result = await process_video_file(filepath, file.filename)
            else:
                # Image processing
                result = await process_image_file(filepath, file.filename)
            
            results.append(result)
            
        except Exception as e:
            results.append({
                'filename': file.filename,
                'error': str(e)
            })
    
    return JSONResponse({
        'total_files': len(files),
        'results': results
    })

async def process_image_file(filepath: str, filename: str):
    """Process a single image file."""
    img_array = preprocess_pil(filepath)
    raw_confidence = predict_image_array(img_array)
    
    # Get detailed damage classification
    damage_info = classify_damage_detailed(raw_confidence, img_array)
    
    result, severity, color, calibrated_conf = get_result(raw_confidence)
    damage_type = damage_info['type']
    
    save_prediction(filename, result, calibrated_conf, severity, damage_type, 'image')
    
    return {
        'filename': filename,
        'type': 'image',
        'result': result,
        'confidence': calibrated_conf,
        'severity': severity,
        'color': color,
        'damage_type': damage_type,
        'damage_details': damage_info
    }

async def process_video_file(filepath: str, filename: str):
    """Process a single video file."""
    cap = cv2.VideoCapture(filepath)
    total_frames = 0
    confidences = []
    
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        if total_frames % 30 == 0:
            img_array = preprocess_frame(frame)
            raw_confidence = predict_image_array(img_array)
            confidences.append(raw_confidence)
        total_frames += 1
    cap.release()
    
    if not confidences:
        return {'filename': filename, 'error': 'Could not process video'}
    
    avg_raw_confidence = sum(confidences) / len(confidences)
    calibrated = calibrate_video_confidence(avg_raw_confidence)
    
    if calibrated > 0.5:
        result = "Road Damage Detected!"
        severity = "High" if calibrated > 0.8 else "Medium"
        color = "red"
    else:
        result = "Road is Good!"
        severity = "None"
        color = "green"
    
    calibrated_conf = round(calibrated * 100, 2)
    damage_type = get_damage_type(avg_raw_confidence)
    
    save_prediction(filename, result, calibrated_conf, severity, damage_type, 'video')
    
    return {
        'filename': filename,
        'type': 'video',
        'result': result,
        'confidence': calibrated_conf,
        'severity': severity,
        'color': color,
        'damage_type': damage_type,
        'total_frames': len(confidences)
    }

def classify_damage_detailed(raw_confidence, img_array):
    """Detailed damage classification with confidence-based categorization."""
    
    # Base damage type from raw confidence
    if raw_confidence > 0.90:
        base_type = "Major Damage"
        description = "Severe road damage detected - immediate repair needed"
    elif raw_confidence > 0.82:
        base_type = "Moderate Damage"
        description = "Significant road damage detected - repair recommended"
    elif raw_confidence > 0.70:
        base_type = "Minor Damage"
        description = "Minor wear and tear detected - monitor condition"
    else:
        base_type = "Good Condition"
        description = "Road is in good condition"
    
    # Estimate damage category based on confidence levels
    if raw_confidence > 0.88:
        category = "Pothole/Crack"
        repair_urgency = "High"
    elif raw_confidence > 0.80:
        category = "Surface Crack"
        repair_urgency = "Medium"
    elif raw_confidence > 0.70:
        category = "Wear & Tear"
        repair_urgency = "Low"
    else:
        category = "None"
        repair_urgency = "None"
    
    return {
        'type': base_type,
        'category': category,
        'description': description,
        'repair_urgency': repair_urgency,
        'raw_confidence': round(raw_confidence * 100, 2)
    }

@app.post("/predict_video")
async def predict_video(file: UploadFile = File(...)):
    if model is None:
        return JSONResponse({'error': 'Model not loaded'}, status_code=503)
    os.makedirs('uploads', exist_ok=True)
    filepath = os.path.join('uploads', file.filename)
    content = await file.read()
    with open(filepath, 'wb') as f:
        f.write(content)
    
    cap = cv2.VideoCapture(filepath)
    total_frames = 0
    confidences = []
    
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        if total_frames % 30 == 0:
            img_array = preprocess_frame(frame)
            raw_confidence = predict_image_array(img_array)
            confidences.append(raw_confidence)
        total_frames += 1
    cap.release()
    
    if not confidences:
        return JSONResponse({'error': 'Could not process video'})
    
    avg_raw_confidence = sum(confidences) / len(confidences)
    
    # Use VIDEO-specific calibration (stricter for highways)
    calibrated = calibrate_video_confidence(avg_raw_confidence)
    
    # Get result based on calibrated confidence
    if calibrated > 0.5:
        result = "Road Damage Detected!"
        severity = "High" if calibrated > 0.8 else "Medium"
        color = "red"
    else:
        result = "Road is Good!"
        severity = "None"
        color = "green"
    
    calibrated_conf = round(calibrated * 100, 2)
    
    # Get detailed damage classification
    damage_info = classify_damage_detailed(avg_raw_confidence, None)
    damage_type = damage_info['type']
    
    save_prediction(file.filename, result, calibrated_conf, severity, damage_type, 'video')
    
    return JSONResponse({
        'result': result,
        'confidence': calibrated_conf,
        'severity': severity,
        'color': color,
        'damage_type': damage_type,
        'damage_details': damage_info,
        'total_frames': len(confidences)
    })

@app.get("/video_feed")
async def video_feed():
    if model is None:
        return JSONResponse({'error': 'Model not loaded'}, status_code=503)
    gen = generate_frames()
    if gen is None:
        logger.warning('video_feed requested but camera generator unavailable')
        return JSONResponse({'error': 'Camera not available'}, status_code=503)
    return StreamingResponse(gen,
        media_type='multipart/x-mixed-replace; boundary=frame')

@app.post("/stop_camera")
async def stop_camera():
    global camera
    if camera:
        camera.release()
        camera = None
    return JSONResponse({'status': 'Camera stopped'})

@app.get("/history")
async def history():
    conn = sqlite3.connect('database.db')
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM predictions ORDER BY id DESC LIMIT 20')
    rows = cursor.fetchall()
    conn.close()
    data = []
    for row in rows:
        data.append({
            'id': row[0], 'filename': row[1], 'result': row[2],
            'confidence': row[3], 'severity': row[4],
            'damage_type': row[5], 'type': row[6], 'timestamp': row[7]
        })
    return JSONResponse(data)

@app.get("/stats")
async def stats():
    conn = sqlite3.connect('database.db')
    cursor = conn.cursor()
    cursor.execute('SELECT COUNT(*) FROM predictions')
    total = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM predictions WHERE result LIKE '%Damage%'")
    damaged = cursor.fetchone()[0]
    cursor.execute('SELECT timestamp, confidence FROM predictions ORDER BY id DESC LIMIT 7')
    trend = cursor.fetchall()
    conn.close()
    return JSONResponse({
        'total': total,
        'damaged': damaged,
        'good': total - damaged,
        'trend': [{'time': t[0][-8:], 'conf': t[1]} for t in reversed(trend)]
    })

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=5000)
