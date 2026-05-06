import os
import numpy as np
from PIL import Image, ImageFilter, ImageEnhance
import xml.etree.ElementTree as ET

DATASET_PATH = "dataset/annotated-images"

def create_negative_xml(xml_path):
    """Create an empty XML file (no damage objects)"""
    root = ET.Element('annotation')
    with open(xml_path, 'w') as f:
        f.write(ET.tostring(root, encoding='unicode'))

def generate_negative_samples(num_negatives=100):
    """Generate synthetic 'good road' images by blurring/modifying existing ones"""
    files = os.listdir(DATASET_PATH)
    jpg_files = [f for f in files if f.endswith('.jpg')]
    
    print(f"Generating {num_negatives} negative (good road) samples...")
    
    for i in range(num_negatives):
        # Pick a random existing image
        src_jpg = np.random.choice(jpg_files)
        src_path = os.path.join(DATASET_PATH, src_jpg)
        
        # Generate new filename
        new_idx = 300 + i  # Start from 300 to avoid conflicts
        new_jpg = f"img-{new_idx}.jpg"
        new_xml = f"img-{new_idx}.xml"
        new_jpg_path = os.path.join(DATASET_PATH, new_jpg)
        new_xml_path = os.path.join(DATASET_PATH, new_xml)
        
        try:
            # Load image and apply heavy blur (simulates smooth road)
            img = Image.open(src_path).convert('RGB')
            
            # Apply Gaussian blur to remove damage details
            img = img.filter(ImageFilter.GaussianBlur(radius=5))
            img = img.filter(ImageFilter.GaussianBlur(radius=3))
            
            # Adjust brightness/contrast to look more like good roads
            enhancer = ImageEnhance.Brightness(img)
            img = enhancer.enhance(0.9)
            
            # Save as new negative sample
            img.save(new_jpg_path)
            
            # Create empty XML (no damage objects)
            create_negative_xml(new_xml_path)
            
            if (i + 1) % 10 == 0:
                print(f"  Generated {i+1}/{num_negatives}")
        except Exception as e:
            print(f"  Error on sample {i}: {e}")
    
    print(f"✓ Generated {num_negatives} negative samples!")

if __name__ == "__main__":
    generate_negative_samples(150)
