
import { Jimp } from 'jimp';
import fs from 'fs';
import path from 'path';

const publicDir = './public';
const files = [
    'logo.png',
    'android-chrome-192x192.png',
    'android-chrome-512x512.png',
    'apple-touch-icon.png',
    'favicon-32x32.png',
    'favicon-16x16.png'
];

async function processImage(filename) {
    const filePath = path.join(publicDir, filename);
    if (!fs.existsSync(filePath)) {
        console.log(`Skipping ${filename} (not found)`);
        return;
    }

    try {
        console.log(`Processing ${filename}...`);
        const image = await Jimp.read(filePath);

        // Create a mask
        const mask = new Jimp({ width: image.width, height: image.height, color: 0x00000000 });

        // Draw a rounded rectangle on the mask (white = opaque, black = transparent)
        // Actually Jimp masking works: mask (white) keeps content, black/transparent removes it?
        // Let's use standard logic: 
        // 1. Create fully transparent image
        // 2. Draw white rounded rect
        // 3. Mask original with this

        const radius = Math.min(image.width, image.height) * 0.2; // 20% radius

        // Jimp doesn't have a direct "draw rounded rect" easily without plugin?
        // Alternative: Iterate pixels or use circle for small ones?
        // Radius logic manually:

        // Easier approach with Jimp: use circle for favicons? 
        // User said "curved at edges" which implies rounded rect, not circle.
        // Let's stick to 'circle' method if simple, but 'rounded rect' is requested.
        // There isn't a built-in rounded rect mask in basic Jimp v1 without simpler drawing.
        // Let's iterate pixels to mask corners.

        // Or actually, let's just use a simple mask composition if possible.
        // Since I can't easily draw vector shapes, I'll do a simple pixel iteration for corners.

        const w = image.width;
        const h = image.height;
        const r = radius;

        image.scan(0, 0, w, h, (x, y, idx) => {
            // Check if pixel is outside the rounded corner
            let dist = 0;
            let outside = false;

            if (x < r && y < r) { // Top-left
                dist = Math.sqrt((x - r) ** 2 + (y - r) ** 2);
                if (dist > r) outside = true;
            } else if (x > w - r && y < r) { // Top-right
                dist = Math.sqrt((x - (w - r)) ** 2 + (y - r) ** 2);
                if (dist > r) outside = true;
            } else if (x < r && y > h - r) { // Bottom-left
                dist = Math.sqrt((x - r) ** 2 + (y - (h - r)) ** 2);
                if (dist > r) outside = true;
            } else if (x > w - r && y > h - r) { // Bottom-right
                dist = Math.sqrt((x - (w - r)) ** 2 + (y - (h - r)) ** 2);
                if (dist > r) outside = true;
            }

            if (outside) {
                image.bitmap.data[idx + 3] = 0; // Set alpha to 0
            }
        });

        await image.write(filePath);
        console.log(`Saved ${filename}`);

    } catch (err) {
        console.error(`Error processing ${filename}:`, err);
    }
}

async function main() {
    for (const file of files) {
        await processImage(file);
    }

    // Copy 32x32 to favicon.ico again just in case
    if (fs.existsSync(path.join(publicDir, 'favicon-32x32.png'))) {
        fs.copyFileSync(path.join(publicDir, 'favicon-32x32.png'), path.join(publicDir, 'favicon.ico'));
    }
}

main();
