from flask import Flask, request, jsonify, render_template, Response
import tensorflow as tf
import numpy as np
from PIL import Image
import os
import cv2

app = Flask(__name__)

model = tf.keras.models.load_model('model/road_damage_model.h5')

def predict_image(img_path):
    img = Image.open(img_path).convert('RGB')
    img = img.resize((128, 128))
    img_array = np.array(img) / 255.0
    img_array = np.expand_dims(img_array, axis=0)
    prediction = model.predict(img_array, verbose=0)[0][0]
    return float(prediction)

def predict_frame(frame):
    img = cv2.resize(frame, (128, 128))
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    img_array = np.array(img) / 255.0
    img_array = np.expand_dims(img_array, axis=0)
    prediction = model.predict(img_array, verbose=0)[0][0]
    return float(prediction)

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
        confidence = predict_frame(frame)
        result, severity, color = get_result(confidence)
        label = f"{result} ({round(confidence*100,1)}%)"
        box_color = (0, 0, 255) if color == "red" else (0, 255, 0)
        cv2.putText(frame, label, (10, 40),
                    cv2.FONT_HERSHEY_SIMPLEX, 1, box_color, 2)
        cv2.putText(frame, f"Severity: {severity}", (10, 80),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, box_color, 2)
        ret, buffer = cv2.imencode('.jpg', frame)
        frame_bytes = buffer.tobytes()
        yield (b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/predict', methods=['POST'])
def predict():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'})
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'})
    os.makedirs('uploads', exist_ok=True)
    filepath = os.path.join('uploads', file.filename)
    file.save(filepath)
    confidence = predict_image(filepath)
    result, severity, color = get_result(confidence)
    return jsonify({
        'result': result,
        'confidence': round(confidence * 100, 2),
        'severity': severity,
        'color': color
    })

@app.route('/video_feed')
def video_feed():
    return Response(generate_frames(),
                    mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/stop_camera', methods=['POST'])
def stop_camera():
    global camera
    if camera:
        camera.release()
        camera = None
    return jsonify({'status': 'Camera stopped'})

if __name__ == '__main__':
    app.run(debug=True)

@app.route('/predict_video', methods=['POST'])
def predict_video():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'})
    file = request.files['file']
    os.makedirs('uploads', exist_ok=True)
    filepath = os.path.join('uploads', file.filename)
    file.save(filepath)
    cap = cv2.VideoCapture(filepath)
    total_frames = 0
    damaged_frames = 0
    confidences = []
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        if total_frames % 10 == 0:
            confidence = predict_frame(frame)
            confidences.append(confidence)
            if confidence > 0.5:
                damaged_frames += 1
        total_frames += 1
    cap.release()
    if not confidences:
        return jsonify({'error': 'Could not process video'})
    avg_confidence = sum(confidences) / len(confidences)
    result, severity, color = get_result(avg_confidence)
    return jsonify({
        'result': result,
        'confidence': round(avg_confidence * 100, 2),
        'severity': severity,
        'color': color,
        'total_frames': len(confidences),
        'damaged_frames': damaged_frames
    })
