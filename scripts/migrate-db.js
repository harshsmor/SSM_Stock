import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbConfig = {
  connectionString: process.env.VITE_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? `postgres://postgres.vrstgahcoyppskjlcmru:${encodeURIComponent('shyammetals@123')}@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`
    : null,
};

// Note: Using the connection string format for Supabase transaction pool or session pool. 
// Usually: postgres://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
// Or direct: postgres://postgres.[ref]:[password]@db.[ref].supabase.co:5432/postgres
// Based on typical Supabase setup:
const CONNECTION_STRING = `postgres://postgres.vrstgahcoyppskjlcmru:${encodeURIComponent('shyammetals@123')}@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true`;

// Using Direct Connection for Schema changes (Port 5432) is better to avoid Prepared Statement issues with PgBouncer if transaction mode is on.
const DIRECT_CONNECTION_STRING = `postgres://postgres.vrstgahcoyppskjlcmru:${encodeURIComponent('shyammetals@123')}@db.vrstgahcoyppskjlcmru.supabase.co:5432/postgres`;


const SQL_SCHEMA = `
-- 1. Enable UUID extension
create extension if not exists "uuid-ossp";

-- 2. Material Types (Standard Densities)
create table if not exists material_types (
  id uuid default uuid_generate_v4() primary key,
  name text not null, -- 'Plate', 'Circle', 'Billet'
  density float default 7.85 -- g/cm3
);

-- 3. Product Master (The Recipe Book)
create table if not exists product_master (
  id uuid default uuid_generate_v4() primary key,
  sku_name text not null,
  required_raw_od float,
  required_raw_id float,
  generated_billa_od float, -- Size of the inner circle
  is_billa_viable boolean default false,
  compatible_child_sku_id uuid references product_master(id) -- Self-referencing FK
);

-- 4. Raw Inventory (The Bone Bank)
create table if not exists inventory_raw (
  id uuid default uuid_generate_v4() primary key,
  material_type_id uuid references material_types(id),
  shape_data jsonb not null, -- Stores {length, width, thickness} or {od, thickness}
  weight_per_piece float not null,
  quantity_pieces int default 0,
  total_weight_kg float generated always as (quantity_pieces * weight_per_piece) stored,
  created_at timestamp with time zone default now()
);

-- 5. Finished Goods
create table if not exists inventory_finished (
  id uuid default uuid_generate_v4() primary key,
  product_master_id uuid references product_master(id),
  quantity int default 0,
  updated_at timestamp with time zone default now()
);

-- 6. Scrap Log (The Waste Bin)
create table if not exists scrap_log (
  id uuid default uuid_generate_v4() primary key,
  scrap_type text check (scrap_type in ('Melting_Chips', 'Plate_Skeleton', 'Offcuts')),
  weight_kg float not null,
  created_at timestamp with time zone default now()
);

-- 7. Seed Data
-- Only insert if empty to avoid duplicates
insert into material_types (name, density) 
select 'MS Plate', 7.85 
where not exists (select 1 from material_types where name = 'MS Plate');

insert into material_types (name, density) 
select 'MS Circle', 7.85 
where not exists (select 1 from material_types where name = 'MS Circle');
`;

async function migrate() {
  console.log('Connecting to database...');
  // Try connecting
  const client = new Client({
    connectionString: DIRECT_CONNECTION_STRING,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log('Connected successfully. Running schema...');

    await client.query(SQL_SCHEMA);

    console.log('Schema migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await client.end();
  }
}

migrate();
