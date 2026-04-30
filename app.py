from flask import Flask, request, jsonify, render_template
import tensorflow as tf
import numpy as np
from PIL import Image
import os

app = Flask(__name__)

model = tf.keras.models.load_model('model/road_damage_model.h5')

def predict_image(img_path):
    img = Image.open(img_path).convert('RGB')
    img = img.resize((128, 128))
    img_array = np.array(img) / 255.0
    img_array = np.expand_dims(img_array, axis=0)
    prediction = model.predict(img_array)[0][0]
    return float(prediction)

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
    if confidence > 0.5:
        result = "Road Damage Detected!"
        severity = "High" if confidence > 0.8 else "Medium"
        color = "red"
    else:
        result = "Road is Good!"
        severity = "None"
        color = "green"
    return jsonify({
        'result': result,
        'confidence': round(confidence * 100, 2),
        'severity': severity,
        'color': color
    })

if __name__ == '__main__':
    app.run(debug=True)
