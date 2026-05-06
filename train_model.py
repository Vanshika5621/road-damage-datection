import os
import numpy as np
import tensorflow as tf
from tensorflow.keras.applications import MobileNetV2
from tensorflow.keras.models import Sequential, Model
from tensorflow.keras.layers import GlobalAveragePooling2D, Dense, Dropout, BatchNormalization
from tensorflow.keras.optimizers import Adam
from tensorflow.keras.preprocessing.image import ImageDataGenerator
from tensorflow.keras.callbacks import EarlyStopping, ModelCheckpoint, ReduceLROnPlateau
from PIL import Image
import xml.etree.ElementTree as ET

# Use standard MobileNetV2 size for better feature extraction
IMG_SIZE = 224
BATCH_SIZE = 16
DATASET_PATH = "dataset/annotated-images"
GOOD_ROADS_PATH = "dataset/good-roads"

def has_damage(xml_path):
    try:
        tree = ET.parse(xml_path)
        root = tree.getroot()
        return len(root.findall('object')) > 0
    except:
        return False

def load_images_from_dir(directory, label):
    """Load images from a directory with given label"""
    images, labels = [], []
    if not os.path.exists(directory):
        return images, labels
    
    files = os.listdir(directory)
    jpg_files = [f for f in files if f.endswith('.jpg')]
    for jpg in jpg_files:
        xml = jpg.replace('.jpg', '.xml')
        xml_path = os.path.join(directory, xml)
        jpg_path = os.path.join(directory, jpg)
        if not os.path.exists(xml_path):
            continue
        try:
            img = Image.open(jpg_path).convert('RGB')
            img = img.resize((IMG_SIZE, IMG_SIZE))
            img_array = np.array(img) / 255.0
            images.append(img_array)
            labels.append(label)
        except:
            continue
    return images, labels

def load_data():
    images, labels = [], []
    
    # Load damaged roads (label=1) from annotated-images
    damaged_imgs, damaged_lbls = load_images_from_dir(DATASET_PATH, 1)
    print(f"Damaged roads: {len(damaged_imgs)} images")
    images.extend(damaged_imgs)
    labels.extend(damaged_lbls)
    
    # Load good roads (label=0) from good-roads
    good_imgs, good_lbls = load_images_from_dir(GOOD_ROADS_PATH, 0)
    print(f"Good roads: {len(good_imgs)} images")
    images.extend(good_imgs)
    labels.extend(good_lbls)
    
    return np.array(images), np.array(labels)

print("Loading data...")
X, y = load_data()
print(f"Total: {len(X)}, Damaged: {sum(y)}, Normal: {len(y)-sum(y)}")

if len(X) == 0:
    print("ERROR: No images found! Check dataset/annotated-images/")
    exit(1)

# Class balancing: compute sample weights
class_weight = {
    0: len(X) / (2.0 * (len(y) - sum(y)) + 1e-6),
    1: len(X) / (2.0 * sum(y) + 1e-6)
}
print(f"Class weights: {class_weight}")

split = int(0.8 * len(X))
X_train, X_test = X[:split], X[split:]
y_train, y_test = y[:split], y[split:]

# Data augmentation for training data
datagen = ImageDataGenerator(
    rotation_range=20,
    width_shift_range=0.2,
    height_shift_range=0.2,
    horizontal_flip=True,
    zoom_range=0.2,
    fill_mode='nearest'
)

# Load the MobileNetV2 base model, pre-trained on ImageNet
print("Building Transfer Learning model...")
base_model = MobileNetV2(weights='imagenet', include_top=False, input_shape=(IMG_SIZE, IMG_SIZE, 3))

# Freeze the base model initially
base_model.trainable = False

# Add custom classification head with MORE regularization
x = base_model.output
x = GlobalAveragePooling2D()(x)
x = Dense(64, activation='relu')(x)  # Reduced from 128 to prevent overfitting
x = BatchNormalization()(x)
x = Dropout(0.6)(x)  # Increased dropout from 0.5 to 0.6
x = Dense(32, activation='relu')(x)  # Added another layer with regularization
x = Dropout(0.5)(x)
predictions = Dense(1, activation='sigmoid')(x)

model = Model(inputs=base_model.input, outputs=predictions)

# Compile the model
optimizer = Adam(learning_rate=0.0005)  # Reduced learning rate
model.compile(optimizer=optimizer, loss='binary_crossentropy', metrics=['accuracy', 'AUC'])

# Callbacks to prevent overfitting and save the best model
os.makedirs('model', exist_ok=True)
checkpoint = ModelCheckpoint('model/road_damage_model_best.h5', monitor='val_auc', save_best_only=True, mode='max', verbose=1)
early_stop = EarlyStopping(monitor='val_auc', patience=5, restore_best_weights=True, mode='max', verbose=1)
reduce_lr = ReduceLROnPlateau(monitor='val_loss', factor=0.2, patience=3, min_lr=1e-6, verbose=1)

print("Training head layers (Transfer Learning Phase 1)...")
history1 = model.fit(
    datagen.flow(X_train, y_train, batch_size=BATCH_SIZE),
    steps_per_epoch=len(X_train) // BATCH_SIZE,
    epochs=15,
    validation_data=(X_test, y_test),
    class_weight=class_weight,
    callbacks=[checkpoint, early_stop, reduce_lr],
    verbose=1
)

# Fine-tuning phase - BE MORE CONSERVATIVE
print("Fine-tuning top layers of base model (Phase 2)...")
# Only unfreeze top 10 layers (not 20) to prevent overfitting
base_model.trainable = True
for layer in base_model.layers[:-10]:
    layer.trainable = False

# Recompile with a much lower learning rate
model.compile(optimizer=Adam(learning_rate=1e-5), loss='binary_crossentropy', metrics=['accuracy', 'AUC'])

# Phase 2 with more epochs but early stopping
history2 = model.fit(
    datagen.flow(X_train, y_train, batch_size=BATCH_SIZE),
    steps_per_epoch=len(X_train) // BATCH_SIZE,
    epochs=20,  # More epochs but early stopping will prevent overfitting
    validation_data=(X_test, y_test),
    class_weight=class_weight,
    callbacks=[checkpoint, early_stop, reduce_lr],
    verbose=1
)

# Load the best weights
if os.path.exists('model/road_damage_model_best.h5'):
    model.load_weights('model/road_damage_model_best.h5')

# Save the final model in the expected location
model.save('model/road_damage_model.h5')
print("Model saved successfully as model/road_damage_model.h5")

# Evaluate on test set
test_loss, test_acc, test_auc = model.evaluate(X_test, y_test, verbose=0)
print(f"\nFinal Test Accuracy: {test_acc:.4f}, Test AUC: {test_auc:.4f}, Test Loss: {test_loss:.4f}")

# Test predictions on a few samples
print("\nSample predictions on test set:")
preds = model.predict(X_test[:10])
for i in range(min(5, len(X_test))):
    print(f"  Sample {i}: actual={y_test[i]}, predicted={preds[i][0]:.4f}")