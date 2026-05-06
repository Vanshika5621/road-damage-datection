#!/usr/bin/env python3
"""Create synthetic good road images for dataset balance"""
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import random
import os

def create_good_road_image(width=800, height=600, seed=None):
    """Create a synthetic good road image with asphalt texture"""
    if seed is not None:
        random.seed(seed)
        np.random.seed(seed)
    
    # Create base image with dark asphalt color
    img = Image.new('RGB', (width, height), color=(50, 50, 55))
    pixels = np.array(img)
    
    # Add asphalt texture (noise)
    noise = np.random.normal(0, 15, pixels.shape).astype(np.int16)
    pixels = np.clip(pixels + noise, 30, 80).astype(np.uint8)
    img = Image.fromarray(pixels)
    
    draw = ImageDraw.Draw(img)
    
    # Draw road lanes (perspective)
    center_x = width // 2
    road_top_width = width * 0.3
    road_bottom_width = width * 0.8
    
    # Road edges (lighter lines marking road boundaries)
    left_edge_top = int(center_x - road_top_width/2)
    left_edge_bottom = int(center_x - road_bottom_width/2)
    right_edge_top = int(center_x + road_top_width/2)
    right_edge_bottom = int(center_x + road_bottom_width/2)
    
    # Draw left edge (white line)
    draw.line([(left_edge_top, 0), (left_edge_bottom, height)], 
              fill=(200, 200, 200), width=3)
    
    # Draw right edge (white line)
    draw.line([(right_edge_top, 0), (right_edge_bottom, height)], 
              fill=(200, 200, 200), width=3)
    
    # Draw center dashed line (yellow)
    center_top = center_x
    center_bottom = center_x
    dash_length = 40
    gap_length = 30
    y = 0
    while y < height:
        segment_end = min(y + dash_length, height)
        draw.line([(center_top, y), (center_bottom, segment_end)], 
                  fill=(255, 200, 50), width=4)
        y += dash_length + gap_length
    
    # Add slight blur for realism
    img = img.filter(ImageFilter.GaussianBlur(radius=0.5))
    
    return img

def create_xml_annotation(filename, width, height):
    """Create XML annotation with NO objects (good road)"""
    xml_content = f"""<annotation>
    <folder>good-roads</folder>
    <filename>{filename}</filename>
    <path>/Users/vanshikasoni/Desktop/road-damage-detection/dataset/good-roads/{filename}</path>
    <source>
        <database>Synthetic Good Road</database>
    </source>
    <size>
        <width>{width}</width>
        <height>{height}</height>
        <depth>3</depth>
    </size>
    <segmented>0</segmented>
</annotation>
"""
    return xml_content

def main():
    output_dir = "/Users/vanshikasoni/Desktop/road-damage-detection/dataset/good-roads"
    os.makedirs(output_dir, exist_ok=True)
    
    # Create 50 good road images
    num_images = 50
    for i in range(1, num_images + 1):
        # Create image with different variations
        img = create_good_road_image(width=800, height=600, seed=i*100)
        
        jpg_filename = f"good_road_{i:03d}.jpg"
        xml_filename = f"good_road_{i:03d}.xml"
        
        # Save image
        img.save(os.path.join(output_dir, jpg_filename), quality=90)
        
        # Create XML (no objects = good road)
        xml_content = create_xml_annotation(jpg_filename, 800, 600)
        with open(os.path.join(output_dir, xml_filename), 'w') as f:
            f.write(xml_content)
        
        print(f"Created {jpg_filename} with {xml_filename}")
    
    print(f"\n✓ Created {num_images} good road images in {output_dir}")
    print("These images have NO <object> tags, so they will be labeled as class 0 (good road)")

if __name__ == "__main__":
    main()
