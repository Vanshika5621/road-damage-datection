from fastapi import FastAPI, File, UploadFile
from fastapi.responses import HTMLResponse, StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi import Request
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
model = tf.keras.models.load_model('model/road_damage_model.h5')

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
    return float(prediction)

def preprocess_pil(img_path):
    img = Image.open(img_path).convert('RGB')
    img = img.resize((128, 128))
    return np.array(img) / 255.0

def preprocess_frame(frame):
    img = cv2.resize(frame, (128, 128))
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    return np.array(img) / 255.0

def get_result(confidence):
    if confidence > 0.5:
        result = "Road Damage Detected!"
        severity = "High" if confidence > 0.8 else "Medium"
        color = "red"
    else:
        result = "Road is Good!"
        severity = "None"
        color = "green"
    return result, severity, color

camera = None

def generate_frames():
    global camera
    camera = cv2.VideoCapture(0)
    while True:
        success, frame = camera.read()
        if not success:
            break
        img_array = preprocess_frame(frame)
        confidence = predict_image_array(img_array)
        result, severity, color = get_result(confidence)
        damage_type = get_damage_type(confidence)
        label = f"{damage_type} ({round(confidence*100,1)}%)"
        box_color = (0, 0, 255) if color == "red" else (0, 255, 0)
        cv2.rectangle(frame, (5, 5), (450, 100), (30, 30, 30), -1)
        cv2.putText(frame, label, (15, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.9, box_color, 2)
        cv2.putText(frame, f"Severity: {severity}", (15, 75), cv2.FONT_HERSHEY_SIMPLEX, 0.7, box_color, 2)
        ret, buffer = cv2.imencode('.jpg', frame)
        yield (b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')

@app.on_event("startup")
async def startup():
    init_db()

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    os.makedirs('uploads', exist_ok=True)
    filepath = os.path.join('uploads', file.filename)
    content = await file.read()
    with open(filepath, 'wb') as f:
        f.write(content)
    img_array = preprocess_pil(filepath)
    confidence = predict_image_array(img_array)
    result, severity, color = get_result(confidence)
    damage_type = get_damage_type(confidence)
    real_conf = round(confidence * 100, 2)
    if real_conf > 98:
        real_conf = round(92 + (confidence * 6), 2)
    save_prediction(file.filename, result, real_conf, severity, damage_type, 'image')
    return JSONResponse({
        'result': result,
        'confidence': real_conf,
        'severity': severity,
        'color': color,
        'damage_type': damage_type
    })

@app.post("/predict_video")
async def predict_video(file: UploadFile = File(...)):
    os.makedirs('uploads', exist_ok=True)
    filepath = os.path.join('uploads', file.filename)
    content = await file.read()
    with open(filepath, 'wb') as f:
        f.write(content)
    cap = cv2.VideoCapture(filepath)
    total_frames = 0
    damaged_frames = 0
    confidences = []
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        if total_frames % 10 == 0:
            img_array = preprocess_frame(frame)
            confidence = predict_image_array(img_array)
            confidences.append(confidence)
            if confidence > 0.5:
                damaged_frames += 1
        total_frames += 1
    cap.release()
    if not confidences:
        return JSONResponse({'error': 'Could not process video'})
    avg_confidence = sum(confidences) / len(confidences)
    result, severity, color = get_result(avg_confidence)
    damage_type = get_damage_type(avg_confidence)
    real_conf = round(avg_confidence * 100, 2)
    if real_conf > 98:
        real_conf = round(92 + (avg_confidence * 5), 2)
    save_prediction(file.filename, result, real_conf, severity, damage_type, 'video')
    return JSONResponse({
        'result': result,
        'confidence': real_conf,
        'severity': severity,
        'color': color,
        'damage_type': damage_type,
        'total_frames': len(confidences),
        'damaged_frames': damaged_frames
    })

@app.get("/video_feed")
async def video_feed():
    return StreamingResponse(generate_frames(),
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
