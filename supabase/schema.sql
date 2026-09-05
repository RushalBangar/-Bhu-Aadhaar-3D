-- 1. Base 2D Land Parcel Table
CREATE TABLE parcels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ulpin_2d VARCHAR(14) UNIQUE NOT NULL,
    survey_number VARCHAR(50) NOT NULL,
    state VARCHAR(50) DEFAULT 'Maharashtra',
    district VARCHAR(50) NOT NULL,
    taluka VARCHAR(50) NOT NULL,
    village VARCHAR(50) NOT NULL,
    boundary_geojson JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Building Structure Table
CREATE TABLE buildings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parcel_id UUID REFERENCES parcels(id) ON DELETE CASCADE,
    building_name VARCHAR(100) NOT NULL,
    total_floors INTEGER NOT NULL,
    basement_floors INTEGER DEFAULT 1,
    height_meters NUMERIC(6, 2) NOT NULL,
    footprint_geojson JSONB NOT NULL
);

-- 3. Individual 3D Units (Flats / Commercial Units)
CREATE TABLE units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    building_id UUID REFERENCES buildings(id) ON DELETE CASCADE,
    ulpin_3d VARCHAR(50) UNIQUE NOT NULL,
    unit_number VARCHAR(20) NOT NULL,
    floor_number INTEGER NOT NULL,
    elevation_bottom_z NUMERIC(6, 2) NOT NULL,
    elevation_top_z NUMERIC(6, 2) NOT NULL,
    carpet_area_sqft NUMERIC(8, 2) NOT NULL,
    bounding_box_3d JSONB NOT NULL, -- Coordinates: [minX, minY, minZ, maxX, maxY, maxZ]
    owner_name VARCHAR(100) NOT NULL,
    owner_aadhaar_hash VARCHAR(64),
    property_tax_id VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Parking Allocations (Basement / Stilt)
CREATE TABLE parking_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    building_id UUID REFERENCES buildings(id) ON DELETE CASCADE,
    slot_number VARCHAR(20) NOT NULL,
    floor_level VARCHAR(10) NOT NULL, -- e.g., 'B1', 'B2', 'Stilt'
    assigned_unit_id UUID REFERENCES units(id) ON DELETE SET NULL,
    slot_coordinates_3d JSONB NOT NULL,
    CONSTRAINT unique_slot_per_building UNIQUE (building_id, slot_number)
);

-- 5. Encumbrance / Bank Mortgage Registry
CREATE TABLE encumbrances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id UUID REFERENCES units(id) ON DELETE CASCADE,
    bank_name VARCHAR(100) NOT NULL,
    loan_account_number VARCHAR(50) NOT NULL,
    loan_amount NUMERIC(12, 2) NOT NULL,
    status VARCHAR(20) DEFAULT 'ACTIVE', -- 'ACTIVE' or 'DISCHARGED'
    registration_date DATE NOT NULL
);

-- 6. Public Amenities (Drinking Water, etc.)
CREATE TABLE amenities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    amenity_type VARCHAR(50) NOT NULL,
    name VARCHAR(100),
    location_geojson JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
