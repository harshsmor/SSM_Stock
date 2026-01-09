import dotenv from 'dotenv';
dotenv.config();

console.log('Loaded Environment Variables keys:');
Object.keys(process.env).forEach(key => {
    if (key.includes('SUPABASE') || key.includes('VITE') || key.includes('KEY') || key.includes('URL')) {
        console.log(key);
    }
});
