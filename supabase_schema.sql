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
