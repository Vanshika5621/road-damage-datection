import os
import numpy as np
import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Conv2D, MaxPooling2D, Flatten, Dense, Dropout
from PIL import Image
import xml.etree.ElementTree as ET

IMG_SIZE = 128
BATCH_SIZE = 16
EPOCHS = 10
DATASET_PATH = "dataset/annotated-images"

def has_damage(xml_path):
    try:
        tree = ET.parse(xml_path)
        root = tree.getroot()
        return len(root.findall('object')) > 0
    except:
        return False

def load_data():
    images, labels = [], []
    files = os.listdir(DATASET_PATH)
    jpg_files = [f for f in files if f.endswith('.jpg')]
    for jpg in jpg_files:
        xml = jpg.replace('.jpg', '.xml')
        xml_path = os.path.join(DATASET_PATH, xml)
        jpg_path = os.path.join(DATASET_PATH, jpg)
        if not os.path.exists(xml_path):
            continue
        try:
            img = Image.open(jpg_path).convert('RGB')
            img = img.resize((IMG_SIZE, IMG_SIZE))
            img_array = np.array(img) / 255.0
            images.append(img_array)
            labels.append(1 if has_damage(xml_path) else 0)
        except:
            continue
    return np.array(images), np.array(labels)

print("Loading data...")
X, y = load_data()
print(f"Total: {len(X)}, Damaged: {sum(y)}, Normal: {len(y)-sum(y)}")

split = int(0.8 * len(X))
X_train, X_test = X[:split], X[split:]
y_train, y_test = y[:split], y[split:]

model = Sequential([
    Conv2D(32, (3,3), activation='relu', input_shape=(IMG_SIZE, IMG_SIZE, 3)),
    MaxPooling2D(2,2),
    Conv2D(64, (3,3), activation='relu'),
    MaxPooling2D(2,2),
    Conv2D(128, (3,3), activation='relu'),
    MaxPooling2D(2,2),
    Flatten(),
    Dense(128, activation='relu'),
    Dropout(0.5),
    Dense(1, activation='sigmoid')
])

model.compile(optimizer='adam', loss='binary_crossentropy', metrics=['accuracy'])
model.summary()

print("Training...")
model.fit(X_train, y_train, epochs=EPOCHS, batch_size=BATCH_SIZE, validation_data=(X_test, y_test))

os.makedirs('model', exist_ok=True)
model.save('model/road_damage_model.h5')
print("Model saved!")