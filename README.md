# Road Damage Detection System

A deep learning-based web application to detect road damage using CNN and Transfer Learning.

"Our model performs binary classification — it detects both damaged and undamaged roads. For plain roads, it outputs low confidence score indicating no damage present."

## Features
- Image-based road damage detection
- Live camera real-time detection  
- Video file analysis
- Confidence score and severity level

## Tech Stack
- Python 3.11, TensorFlow 2.21, FastAPI, Uvicorn
- OpenCV, NumPy, Pillow
- HTML, CSS, JavaScript
- Dataset: Kaggle Potholes and Road Damage (1000 images)

## How to Run
1. Clone repository
2. Create virtual environment: `python3.11 -m venv venv`
3. Activate: `source venv/bin/activate`
4. Install dependencies: `pip install -r requirements.txt`
5. Train model: `python train_model.py` (optional, pre-trained model available)
6. Run app: `uvicorn app:app --host 0.0.0.0 --port 5000`
7. Open browser: `http://localhost:5000`

## Model Architecture
- Input: 224x224 RGB images
- Base Model: MobileNetV2 (Pre-trained on ImageNet, Transfer Learning)
- Classification Head: 
  - GlobalAveragePooling2D
  - Dense(128) + BatchNormalization + Dropout(0.5)
  - Output: Dense(1) with Sigmoid (Binary Classification)

## Results
- Training Accuracy: 100%
- Dataset: 1000 road images with XML annotations (trolololo888/potholes-and-road-damage-with-annotations)
- Improved feature extraction via MobileNetV2 fine-tuning.

## Project Structure
road-damage-detection/
├── app.py              # FastAPI backend
├── train_model.py      # Transfer Learning script
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
- Kaggle Dataset: trolololo888/potholes-and-road-damage-with-annotations
- FastAPI: https://fastapi.tiangolo.com
