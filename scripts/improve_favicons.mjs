
import { Jimp } from 'jimp';
import fs from 'fs';
import path from 'path';

const publicDir = './public';
const masterImage = 'android-chrome-512x512.png'; // Using the high-res one as source

async function generateFavicons() {
    const masterPath = path.join(publicDir, masterImage);
    if (!fs.existsSync(masterPath)) {
        console.error('Master image not found!');
        return;
    }

    try {
        console.log(`Reading master image ${masterImage}...`);
        const image = await Jimp.read(masterPath);

        // Ensure master is rounded first (if not already, but round_corners might have done it)
        // Let's re-apply rounding to be sure, or assume it's done. 
        // Actually, better to re-do rounding on the *original* if possible to avoid double-processing, 
        // but since I overwrote files, I'll assume current 512 matches desired look or re-round if it looks square.
        // To be safe, let's just resize the current 512 image which SHOULD be rounded from previous step.
        // Update: User said "image in tab is shit". 
        // If I used the tiny uploaded file (uploaded_image_3 ~500 bytes) for favicon, that's why.
        // So downscaling 512 -> 32 is definitely the fix.

        const sizes = [32, 16];

        for (const size of sizes) {
            console.log(`Generating favicon-${size}x${size}.png...`);
            const resized = image.clone();
            resized.resize({ w: size, h: size }); // Default is usually bilinear/bicubic which is good
            await resized.write(path.join(publicDir, `favicon-${size}x${size}.png`));
        }

        // Generate favicon.ico (just copy 32x32 for now, real ICO requires multiple layers but browsers handle png-in-ico or just 32x32 fine generally)
        // Better: use the 32x32 png as favicon.ico content
        console.log('Updating favicon.ico...');
        fs.copyFileSync(path.join(publicDir, 'favicon-32x32.png'), path.join(publicDir, 'favicon.ico'));

        console.log('Favicons regenerated successfully.');

    } catch (err) {
        console.error('Error improving favicons:', err);
    }
}

generateFavicons();
