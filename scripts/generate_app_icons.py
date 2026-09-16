import os
from PIL import Image, ImageDraw

def generate_icons():
    workspace = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    assets_dir = os.path.join(workspace, "assets")
    src_path = os.path.join(assets_dir, "robot_hero.jpg")
    
    print(f"Loading source hero image: {src_path}")
    src = Image.open(src_path).convert("RGBA")
    w, h = src.size
    
    # 1. Square crop centered on the robot character
    crop_size = h  # 768
    crop_x = (w - crop_size) // 2
    square_hero = src.crop((crop_x, 0, crop_x + crop_size, crop_size))
    
    # Brand background color
    brand_bg_rgba = (8, 8, 8, 255)
    
    # ─── 1. Android Adaptive Launcher Icon: android-icon-foreground.png (Rule 15 & Rule 19) ───
    # Must be centered on 512x512 canvas with target icon height of 96px (bounding box ~80x96px),
    # providing ~72% clean breathing room so Samsung One UI squircle masks and standard Android launcher
    # cutouts never crop or zoom into the icon.
    target_fg_h = 96
    target_fg_w = 96
    hero_fg_scaled = square_hero.resize((target_fg_w, target_fg_h), Image.Resampling.LANCZOS)
    
    # Rounded emblem styling for the launcher foreground
    mask_fg = Image.new("L", (target_fg_w, target_fg_h), 0)
    draw_fg = ImageDraw.Draw(mask_fg)
    draw_fg.rounded_rectangle([(0, 0), (target_fg_w, target_fg_h)], radius=22, fill=255)
    
    emblem_fg = Image.new("RGBA", (target_fg_w, target_fg_h), (0, 0, 0, 0))
    emblem_fg.paste(hero_fg_scaled, (0, 0), mask_fg)
    
    adaptive_foreground = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    fg_offset_x = (512 - target_fg_w) // 2
    fg_offset_y = (512 - target_fg_h) // 2
    adaptive_foreground.paste(emblem_fg, (fg_offset_x, fg_offset_y), emblem_fg)
    
    # ─── 2. Android Adaptive Launcher Background: android-icon-background.png ───
    adaptive_background = Image.new("RGBA", (512, 512), brand_bg_rgba)
    
    # ─── 3. Android Adaptive Launcher Monochrome: android-icon-monochrome.png ───
    mono_emblem = emblem_fg.convert("LA")
    adaptive_monochrome = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    adaptive_monochrome.paste(mono_emblem, (fg_offset_x, fg_offset_y), emblem_fg)
    
    # ─── 4. In-App Brand Icon / App Store Icon: icon.png (Rule 15 & Rule 19) ───
    # Must be 1024x1024 canvas with 800px prominent brand symbol so in-app usages
    # (UpdateModal, AppHeader, Splash, Profile) remain sharp, bold, and readable.
    target_1024_h = 800
    target_1024_w = 800
    hero_1024_scaled = square_hero.resize((target_1024_w, target_1024_h), Image.Resampling.LANCZOS)
    
    mask_1024 = Image.new("L", (target_1024_w, target_1024_h), 0)
    draw_1024 = ImageDraw.Draw(mask_1024)
    draw_1024.rounded_rectangle([(0, 0), (target_1024_w, target_1024_h)], radius=180, fill=255)
    
    emblem_1024 = Image.new("RGBA", (target_1024_w, target_1024_h), (0, 0, 0, 0))
    emblem_1024.paste(hero_1024_scaled, (0, 0), mask_1024)
    
    app_icon_1024 = Image.new("RGBA", (1024, 1024), brand_bg_rgba)
    offset_1024_x = (1024 - target_1024_w) // 2
    offset_1024_y = (1024 - target_1024_h) // 2
    app_icon_1024.paste(emblem_1024, (offset_1024_x, offset_1024_y), emblem_1024)
    
    # ─── 5. Adaptive Icon: adaptive-icon.png (1024x1024) ───
    adaptive_icon_1024 = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    target_adapt_h = 720
    target_adapt_w = 720
    hero_adapt_scaled = square_hero.resize((target_adapt_w, target_adapt_h), Image.Resampling.LANCZOS)
    mask_adapt = Image.new("L", (target_adapt_w, target_adapt_h), 0)
    draw_adapt = ImageDraw.Draw(mask_adapt)
    draw_adapt.rounded_rectangle([(0, 0), (target_adapt_w, target_adapt_h)], radius=160, fill=255)
    emblem_adapt = Image.new("RGBA", (target_adapt_w, target_adapt_h), (0, 0, 0, 0))
    emblem_adapt.paste(hero_adapt_scaled, (0, 0), mask_adapt)
    adaptive_icon_1024.paste(emblem_adapt, ((1024 - target_adapt_w) // 2, (1024 - target_adapt_h) // 2), emblem_adapt)
    
    # ─── 6. Splash Screen: splash.png (1242x2436 canvas with centered brand icon) ───
    splash_img = Image.new("RGBA", (1242, 2436), brand_bg_rgba)
    splash_icon_size = 540
    hero_splash_scaled = square_hero.resize((splash_icon_size, splash_icon_size), Image.Resampling.LANCZOS)
    mask_splash = Image.new("L", (splash_icon_size, splash_icon_size), 0)
    draw_splash = ImageDraw.Draw(mask_splash)
    draw_splash.rounded_rectangle([(0, 0), (splash_icon_size, splash_icon_size)], radius=120, fill=255)
    emblem_splash = Image.new("RGBA", (splash_icon_size, splash_icon_size), (0, 0, 0, 0))
    emblem_splash.paste(hero_splash_scaled, (0, 0), mask_splash)
    
    splash_offset_x = (1242 - splash_icon_size) // 2
    splash_offset_y = (2436 - splash_icon_size) // 2 - 80
    splash_img.paste(emblem_splash, (splash_offset_x, splash_offset_y), emblem_splash)
    
    # ─── 7. Favicon: favicon.png (192x192) ───
    fav_size = 192
    fav_icon_size = 150
    favicon_img = Image.new("RGBA", (fav_size, fav_size), brand_bg_rgba)
    hero_fav_scaled = square_hero.resize((fav_icon_size, fav_icon_size), Image.Resampling.LANCZOS)
    mask_fav = Image.new("L", (fav_icon_size, fav_icon_size), 0)
    draw_fav = ImageDraw.Draw(mask_fav)
    draw_fav.rounded_rectangle([(0, 0), (fav_icon_size, fav_icon_size)], radius=34, fill=255)
    emblem_fav = Image.new("RGBA", (fav_icon_size, fav_icon_size), (0, 0, 0, 0))
    emblem_fav.paste(hero_fav_scaled, (0, 0), mask_fav)
    favicon_img.paste(emblem_fav, ((fav_size - fav_icon_size) // 2, (fav_size - fav_icon_size) // 2), emblem_fav)
    
    # Save all generated files
    files_to_save = [
        ("android-icon-foreground.png", adaptive_foreground),
        ("android-icon-background.png", adaptive_background),
        ("android-icon-monochrome.png", adaptive_monochrome),
        ("icon.png", app_icon_1024),
        ("adaptive-icon.png", adaptive_icon_1024),
        ("splash.png", splash_img),
        ("favicon.png", favicon_img),
    ]
    
    for filename, img_obj in files_to_save:
        out_path = os.path.join(assets_dir, filename)
        img_obj.save(out_path, "PNG")
        print(f"Generated: {filename} ({img_obj.size})")

if __name__ == "__main__":
    generate_icons()
