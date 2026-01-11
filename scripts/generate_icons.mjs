
import { Jimp } from 'jimp';
import fs from 'fs';
import path from 'path';

const publicDir = './public';
const masterImage = 'source_master.png';

async function generateIcons() {
    const masterPath = path.join(publicDir, masterImage);
    if (!fs.existsSync(masterPath)) {
        console.error('Master source image not found!');
        process.exit(1);
    }

    try {
        console.log(`Reading master image ${masterImage}...`);
        const image = await Jimp.read(masterPath);

        // Define targets (Reduced to 3 high-quality files)
        const targets = [
            { name: 'logo.png', size: 512 },           // Main App Logo & PWA 512
            { name: 'icon-192.png', size: 192 }        // PWA 192 & High-Res Favicon
        ];

        for (const target of targets) {
            console.log(`Generating ${target.name} (${target.size}x${target.size})...`);

            // 1. Resize (Use Bezier/Bicubic for best quality)
            const resized = image.clone();
            resized.resize({ w: target.size, h: target.size, mode: Jimp.RESIZE_BEZIER });

            // 2. Round Corners (35% radius)
            // Radius in pixels = size * 0.35
            const radius = target.size * 0.35;

            // Create a mask
            const mask = new Jimp({ width: target.size, height: target.size, color: 0x00000000 }); // Transparent start

            // Draw rounded white rectangle on mask
            // Scan and set manual rounded rect? 
            // Jimp doesn't have built-in shapes easily usable for masking in one go sometimes.
            // Let's do pixel scan on the image itself, similar to previous approach.

            // Actually, scanning every pixel is easy enough.
            // Center of corners:
            // TL: (r, r)
            // TR: (w-r, r)
            // BL: (r, h-r)
            // BR: (w-r, h-r)

            const w = target.size;
            const h = target.size;
            const r = radius;

            resized.scan(0, 0, w, h, (x, y, idx) => {
                // Check if (x,y) is inside the rounded rect
                let inside = true;

                // Top Left
                if (x < r && y < r) {
                    if (Math.hypot(x - r, y - r) > r) inside = false;
                }
                // Top Right
                else if (x >= w - r && y < r) {
                    if (Math.hypot(x - (w - r), y - r) > r) inside = false;
                }
                // Bottom Left
                else if (x < r && y >= h - r) {
                    if (Math.hypot(x - r, y - (h - r)) > r) inside = false;
                }
                // Bottom Right
                else if (x >= w - r && y >= h - r) {
                    if (Math.hypot(x - (w - r), y - (h - r)) > r) inside = false;
                }

                if (!inside) {
                    resized.bitmap.data[idx + 3] = 0; // Set Alpha to 0
                }
            });

            await resized.write(path.join(publicDir, target.name));
        }



        console.log('All icons generated with 35% radius.');

    } catch (err) {
        console.error('Error generating icons:', err);
        process.exit(1);
    }
}

generateIcons();
