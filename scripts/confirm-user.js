import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

dotenv.config();

const { Client } = pg;

// Use the DIRECT connection string from migrate-db.js
const DIRECT_CONNECTION_STRING = `postgres://postgres.vrstgahcoyppskjlcmru:${encodeURIComponent('shyammetals@123')}@db.vrstgahcoyppskjlcmru.supabase.co:5432/postgres`;

async function confirmUser() {
    console.log('Connecting to database to confirm user...');
    const client = new Client({
        connectionString: DIRECT_CONNECTION_STRING,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        await client.connect();
        console.log('Connected successfully.');

        // Update the user's email_confirmed_at field
        const query = `
      UPDATE auth.users 
      SET email_confirmed_at = now() 
      WHERE email = 'ssm.admin@gmail.com' AND email_confirmed_at IS NULL;
    `;

        const res = await client.query(query);

        if (res.rowCount > 0) {
            console.log(`Success: Confirmed email for ${res.rowCount} user(s).`);
        } else {
            console.log('Info: User already confirmed or not found.');
        }

    } catch (err) {
        console.error('Operation failed:', err);
    } finally {
        await client.end();
    }
}

confirmUser();
