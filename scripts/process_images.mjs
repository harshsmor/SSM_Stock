
import fs from 'fs';
import path from 'path';

const publicDir = './public';
const files = fs.readdirSync(publicDir).filter(f => f.startsWith('uploaded_image_'));

function getDimensions(filePath) {
    try {
        const buffer = fs.readFileSync(filePath);
        const hex = buffer.toString('hex');
        const i = hex.indexOf('49484452'); // IHDR chunk
        if (i > -1) {
            const w = parseInt(hex.substr(i + 8, 8), 16);
            const h = parseInt(hex.substr(i + 16, 8), 16);
            return { w, h };
        }
    } catch (e) {
        console.error('Error reading', filePath, e);
    }
    return null;
}

files.forEach(file => {
    const filePath = path.join(publicDir, file);
    const dims = getDimensions(filePath);
    if (!dims) return;

    console.log(`Processing ${file}: ${dims.w}x${dims.h}`);

    let newName = '';
    if (dims.w === 512) newName = 'android-chrome-512x512.png';
    else if (dims.w === 192) newName = 'android-chrome-192x192.png';
    else if (dims.w === 180 || dims.w === 192) newName = 'apple-touch-icon.png'; // Fallback
    else if (dims.w === 32) newName = 'favicon-32x32.png';
    else if (dims.w === 16) newName = 'favicon-16x16.png';
    else if (dims.w > 200) newName = 'logo.png'; // Generic large

    // Fallback logic if exact match fails but likely candidate
    if (!newName) {
        if (dims.w > 400) newName = 'android-chrome-512x512.png';
        else if (dims.w > 100) newName = 'android-chrome-192x192.png';
        else newName = 'favicon-32x32.png';
    }

    if (newName) {
        // If file exists, don't overwrite blindly, but here we want to replace
        try {
            fs.copyFileSync(filePath, path.join(publicDir, newName));
            console.log(`Copied ${file} to ${newName}`);
        } catch (err) {
            console.error(err);
        }
    }
});

// Create favicon.ico from 32x32 if possible
if (fs.existsSync(path.join(publicDir, 'favicon-32x32.png'))) {
    fs.copyFileSync(path.join(publicDir, 'favicon-32x32.png'), path.join(publicDir, 'favicon.ico'));
    console.log('Created favicon.ico');
}
