import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function initAuth() {
    const email = 'ssm@ssm.com';
    const password = 'ssm@123';

    console.log(`Initializing auth user (Admin API): ${email}`);

    // 1. Check if user exists
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();

    if (listError) {
        console.error('Error listing users:', listError);
        return;
    }

    const existingUser = users.find(u => u.email === email);

    if (existingUser) {
        console.log('User already exists.');
        if (!existingUser.email_confirmed_at) {
            console.log('Confirming email for existing user...');
            const { error: updateError } = await supabase.auth.admin.updateUserById(
                existingUser.id,
                { email_confirm: true, user_metadata: { username: 'ssm' } }
            );
            if (updateError) console.error('Error confirming user:', updateError);
            else console.log('User confirmed successfully.');
        } else {
            console.log('User is already confirmed.');
        }
    } else {
        console.log('Creating new user...');
        const { data, error: createError } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { username: 'ssm' }
        });

        if (createError) {
            console.error('Error creating user:', createError);
        } else {
            console.log('User created and confirmed successfully ID:', data.user.id);
        }
    }
}

initAuth();
