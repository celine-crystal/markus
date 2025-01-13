from PIL import Image, ImageDraw

def create_rounded_image(input_path, output_path, radius=100):
    """
    Create a rounded corner version of the input image.
    
    :param input_path: Path to the input image (1024x1024 pixels recommended)
    :param output_path: Path to save the output image
    :param radius: Radius of the rounded corners
    """
    # Open the input image
    img = Image.open(input_path).convert("RGBA")
    
    # Create a mask for the rounded corners
    mask = Image.new("L", img.size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, img.size[0], img.size[1]), radius=radius, fill=255)
    
    # Apply the rounded corner mask
    rounded_img = Image.new("RGBA", img.size)
    rounded_img.paste(img, (0, 0), mask)
    
    # Save the rounded image
    rounded_img.save(output_path, format="PNG")
    print(f"Rounded image saved to {output_path}")

# Example usage
input_image = "build/icon_origin_bk.png"  # Replace with your input image path
output_image = "build/icon_corner.png"  # Replace with your desired output path
create_rounded_image(input_image, output_image, radius=150)
