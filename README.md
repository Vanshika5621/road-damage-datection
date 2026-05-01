# Road Damage Detection System

A deep learning-based web application to detect road damage using CNN.

## Features
- Image-based road damage detection
- Live camera real-time detection  
- Video file analysis
- Confidence score and severity level

## Tech Stack
- Python 3.11, TensorFlow 2.21, Flask 3.1
- OpenCV, NumPy, Pillow
- HTML, CSS, JavaScript
- Dataset: Kaggle Annotated Potholes Dataset (665 images)

## How to Run
1. Clone repository
2. Create virtual environment: python3.11 -m venv venv
3. Activate: source venv/bin/activate
4. Install: pip install flask opencv-python-headless tensorflow numpy pillow
5. Train model: python train_model.py
6. Run app: python app.py
7. Open browser: http://localhost:5000

## Model Architecture
- Input: 128x128 RGB images
- Conv2D(32) + MaxPooling
- Conv2D(64) + MaxPooling  
- Conv2D(128) + MaxPooling
- Dense(128) + Dropout(0.5)
- Output: Sigmoid (Binary Classification)

## Results
- Training Accuracy: 100%
- Dataset: 665 road images with XML annotations
- Model Size: 12.61 MB

## Project Structure
road-damage-detection/
├── app.py              # Flask backend
├── train_model.py      # CNN training script
├── templates/
│   └── index.html      # Frontend
├── model/
│   └── road_damage_model.h5
├── dataset/
│   └── annotated-images/
└── uploads/

## GitHub
https://github.com/Vanshika5621/road-damage-datection

## References
- TensorFlow: https://tensorflow.org
- Kaggle Dataset: chitholian/annotated-potholes-dataset
- Flask: https://flask.palletsprojects.com
