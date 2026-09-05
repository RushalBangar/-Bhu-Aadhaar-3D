import json
import urllib.request
import os
import hashlib
import time

SUPABASE_URL = "https://tucpybvcrusbmtsdsvik.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1Y3B5YnZjcnVzYm10c2RzdmlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1ODk4MzksImV4cCI6MjEwNDE2NTgzOX0.KmSQcLxnaG4HVR5KMAGoaiHMo9DzktUKpgoigkIhSSs"

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

def post(endpoint, data):
    url = f"{SUPABASE_URL}/rest/v1/{endpoint}"
    req = urllib.request.Request(url, data=json.dumps(data).encode('utf-8'), headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode('utf-8')
        print(f"HTTP Error {e.code} on {endpoint}: {err_body}")
        raise e

def get(endpoint):
    url = f"{SUPABASE_URL}/rest/v1/{endpoint}"
    req = urllib.request.Request(url, headers=headers, method='GET')
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode('utf-8'))

print("=== Starting Supabase Comprehensive Seeding ===")

# -------------------------------------------------------------
# 1. Ensure Demo Parcel 14MH2704291845 exists
# -------------------------------------------------------------
demo_ulpin = "14MH2704291845"
existing_demo = get(f"parcels?ulpin_2d=eq.{demo_ulpin}")

if existing_demo:
    demo_parcel_id = existing_demo[0]["id"]
    print(f"Found existing demo parcel {demo_ulpin}: {demo_parcel_id}")
else:
    demo_parcel_data = [{
        "ulpin_2d": demo_ulpin,
        "survey_number": "Plot 402/A",
        "state": "Maharashtra",
        "district": "Pune",
        "taluka": "Pune City",
        "village": "Shivajinagar",
        "boundary_geojson": {
            "type": "Polygon",
            "coordinates": [[
                [73.7895, 19.9972],
                [73.7901, 19.9972],
                [73.7901, 19.9978],
                [73.7895, 19.9978],
                [73.7895, 19.9972]
            ]]
        }
    }]
    inserted = post("parcels", demo_parcel_data)
    demo_parcel_id = inserted[0]["id"]
    print(f"Created demo parcel {demo_ulpin}: {demo_parcel_id}")

# Fetch 4 other parcels to create additional buildings
other_parcels = get("parcels?limit=4&ulpin_2d=neq." + demo_ulpin)
print(f"Fetched {len(other_parcels)} other parcels for multi-building demonstration.")

# -------------------------------------------------------------
# 2. Seed Amenities from export.geojson
# -------------------------------------------------------------
print("\n--- Seeding Amenities ---")
with open("info/export.geojson", "r", encoding="utf-8") as f:
    geojson_data = json.load(f)

amenity_features = [f for f in geojson_data.get("features", []) if "amenity" in f.get("properties", {})]
print(f"Found {len(amenity_features)} amenities in export.geojson.")

amenities_to_insert = []
for f in amenity_features:
    props = f.get("properties", {})
    geom = f.get("geometry", {})
    if not geom:
        continue
    
    # Calculate point if geometry is Polygon
    if geom.get("type") == "Polygon":
        coords = geom.get("coordinates", [[]])[0]
        if coords:
            avg_lng = sum(c[0] for c in coords) / len(coords)
            avg_lat = sum(c[1] for c in coords) / len(coords)
            point_geom = {"type": "Point", "coordinates": [round(avg_lng, 6), round(avg_lat, 6)]}
        else:
            continue
    elif geom.get("type") == "Point":
        point_geom = geom
    else:
        continue

    amenity_type = props.get("amenity", "civic_amenity")
    name = props.get("name") or f"{amenity_type.replace('_', ' ').title()} Center"
    
    amenities_to_insert.append({
        "amenity_type": amenity_type[:50],
        "name": name[:100],
        "location_geojson": point_geom
    })

# Also add explicit drinking water points around the demo parcel
water_points = [
    {"amenity_type": "drinking_water", "name": "Municipal Water Kiosk 101", "location_geojson": {"type": "Point", "coordinates": [73.7896, 19.9976]}},
    {"amenity_type": "drinking_water", "name": "Public RO Drinking Station", "location_geojson": {"type": "Point", "coordinates": [73.7900, 19.9973]}},
    {"amenity_type": "drinking_water", "name": "Civic Hydro-Dispenser A3", "location_geojson": {"type": "Point", "coordinates": [73.7899, 19.9979]}}
]
amenities_to_insert.extend(water_points)

# Upload amenities in chunks of 50
inserted_amenities = 0
for i in range(0, len(amenities_to_insert), 50):
    chunk = amenities_to_insert[i:i+50]
    res = post("amenities", chunk)
    inserted_amenities += len(res)

print(f"Successfully inserted {inserted_amenities} amenities into 'amenities' table.")

# -------------------------------------------------------------
# 3. Seed Buildings
# -------------------------------------------------------------
print("\n--- Seeding Buildings ---")
buildings_to_create = [
    {
        "parcel_id": demo_parcel_id,
        "building_name": "Galaxy Heights (Tower A)",
        "total_floors": 10,
        "basement_floors": 1,
        "height_meters": 30.00,
        "footprint_geojson": {
            "type": "Polygon",
            "coordinates": [[
                [73.7896, 19.9973],
                [73.7900, 19.9973],
                [73.7900, 19.9977],
                [73.7896, 19.9977],
                [73.7896, 19.9973]
            ]]
        }
    }
]

building_names = ["Shivaji Residency", "Mayur Heritage Tower", "Saraswati Commercial Plaza", "Vasant Kunj Heights"]
for i, p in enumerate(other_parcels):
    b_name = building_names[i % len(building_names)]
    buildings_to_create.append({
        "parcel_id": p["id"],
        "building_name": b_name,
        "total_floors": 6 + i * 2,
        "basement_floors": 1,
        "height_meters": (6 + i * 2) * 3.0,
        "footprint_geojson": p["boundary_geojson"]
    })

created_buildings = post("buildings", buildings_to_create)
print(f"Created {len(created_buildings)} buildings.")
demo_building = created_buildings[0]
demo_building_id = demo_building["id"]

# -------------------------------------------------------------
# 4. Seed Units for Galaxy Heights (10 Floors x 4 Units = 40 Units)
# -------------------------------------------------------------
print("\n--- Seeding 3D Units ---")
owners = [
    ("Rajesh Patil", "AADH-9812-4412"),
    ("Sunita Deshmukh", "AADH-1029-3829"),
    ("Amit Sharma", "AADH-7712-9011"),
    ("Pooja Kulkarni", "AADH-3490-1284"),
    ("Vikram Joshi", "AADH-5521-8832"),
    ("Neha Kadam", "AADH-9021-3419"),
    ("Sachin Tendulkar", "AADH-1111-2222"),
    ("Dr. Anand Shinde", "AADH-8823-4410"),
    ("Priya Nair", "AADH-6671-2390"),
    ("Rohan Mehta", "AADH-4412-9901")
]

units_to_create = []
floor_height = 3.0

for floor in range(10): # Floors 0 to 9 (1 to 10)
    for u in range(4): # 4 units per floor
        unit_num = f"{floor + 1}0{u + 1}"
        z_bottom = floor * floor_height
        z_top = (floor + 1) * floor_height
        carpet = 720.0 + (u * 110.0) + (floor * 15.0)
        owner_info = owners[(floor * 4 + u) % len(owners)]
        owner_name = owner_info[0]
        aadhaar_hash = hashlib.sha256(owner_info[1].encode()).hexdigest()
        tax_id = f"PUN-TAX-2024-F{floor+1}U{u+1}"

        floor_fmt = f"FL{floor + 1:02d}"
        ulpin_3d = f"{demo_ulpin}-{floor_fmt}-U{unit_num}-Z{z_bottom:.1f}-{z_top:.1f}M"

        # Bounding box 3D: [minX, minY, minZ, maxX, maxY, maxZ]
        min_x = -10.0 if u % 2 == 0 else 0.0
        max_x = 0.0 if u % 2 == 0 else 10.0
        min_y = -10.0 if u < 2 else 0.0
        max_y = 0.0 if u < 2 else 10.0
        min_z = z_bottom
        max_z = z_top

        units_to_create.append({
            "building_id": demo_building_id,
            "ulpin_3d": ulpin_3d,
            "unit_number": unit_num,
            "floor_number": floor,
            "elevation_bottom_z": z_bottom,
            "elevation_top_z": z_top,
            "carpet_area_sqft": carpet,
            "bounding_box_3d": [min_x, min_y, min_z, max_x, max_y, max_z],
            "owner_name": owner_name,
            "owner_aadhaar_hash": aadhaar_hash,
            "property_tax_id": tax_id
        })

created_units = post("units", units_to_create)
print(f"Created {len(created_units)} units for building {demo_building['building_name']}.")

# Also create sample units for the other buildings
other_units_to_create = []
for b in created_buildings[1:]:
    for fl in range(b["total_floors"]):
        for un in range(2):
            unit_num = f"{fl + 1}0{un + 1}"
            z_bottom = fl * 3.0
            z_top = (fl + 1) * 3.0
            p_ulpin = [p["ulpin_2d"] for p in other_parcels if p["id"] == b["parcel_id"]][0]
            ulpin_3d = f"{p_ulpin}-FL{fl+1:02d}-U{unit_num}-Z{z_bottom:.1f}-{z_top:.1f}M"
            other_units_to_create.append({
                "building_id": b["id"],
                "ulpin_3d": ulpin_3d,
                "unit_number": unit_num,
                "floor_number": fl,
                "elevation_bottom_z": z_bottom,
                "elevation_top_z": z_top,
                "carpet_area_sqft": 850.0,
                "bounding_box_3d": [-5.0, -5.0, z_bottom, 5.0, 5.0, z_top],
                "owner_name": f"Owner of {unit_num}",
                "owner_aadhaar_hash": hashlib.sha256(f"owner_{unit_num}".encode()).hexdigest(),
                "property_tax_id": f"TAX-{b['building_name'][:3].upper()}-{unit_num}"
            })
created_other_units = post("units", other_units_to_create)
print(f"Created {len(created_other_units)} units across remaining buildings.")

# -------------------------------------------------------------
# 5. Seed Parking Slots
# -------------------------------------------------------------
print("\n--- Seeding Parking Slots ---")
parking_slots_to_create = []

# Map demo units by unit_number
unit_map = {u["unit_number"]: u["id"] for u in created_units}

# B1 Basement Parking (Slots P-B1-01 to P-B1-20)
for slot_idx in range(1, 21):
    slot_no = f"P-B1-{slot_idx:02d}"
    # Assign to corresponding unit if within count
    assigned_unit = created_units[(slot_idx - 1) % len(created_units)]["id"]
    parking_slots_to_create.append({
        "building_id": demo_building_id,
        "slot_number": slot_no,
        "floor_level": "B1",
        "assigned_unit_id": assigned_unit,
        "slot_coordinates_3d": [-12.0 + (slot_idx * 1.2), -2.8, -12.0]
    })

# Stilt Level Parking (Slots P-0-0 to P-0-3, etc. matching UI demo pattern)
for fl in range(10):
    for u in range(4):
        slot_no = f"P-{fl}-{u}"
        assigned_unit = created_units[(fl * 4 + u) % len(created_units)]["id"]
        parking_slots_to_create.append({
            "building_id": demo_building_id,
            "slot_number": slot_no,
            "floor_level": "Stilt" if fl == 0 else "Podium",
            "assigned_unit_id": assigned_unit,
            "slot_coordinates_3d": [fl * 2.0 - 10.0, 0.0, u * 2.5 - 5.0]
        })

# Upload parking slots in chunks
inserted_slots = 0
for i in range(0, len(parking_slots_to_create), 50):
    chunk = parking_slots_to_create[i:i+50]
    res = post("parking_slots", chunk)
    inserted_slots += len(res)

print(f"Created {inserted_slots} parking slots in 'parking_slots' table.")

# -------------------------------------------------------------
# 6. Seed Encumbrances (Bank Mortgages / Clean Titles)
# -------------------------------------------------------------
print("\n--- Seeding Encumbrances ---")
encumbrances_to_create = []

# Give active mortgages to ~35% of units
banks = ["State Bank of India", "HDFC Bank", "Bank of Baroda", "ICICI Bank", "Axis Bank", "Punjab National Bank"]

for idx, u in enumerate(created_units):
    if idx % 3 == 0: # Every 3rd unit has an active bank mortgage
        bank = banks[idx % len(banks)]
        encumbrances_to_create.append({
            "unit_id": u["id"],
            "bank_name": bank,
            "loan_account_number": f"{bank[:3].upper()}-HL-2023-{880000 + idx}",
            "loan_amount": 4500000.0 + (idx * 250000.0),
            "status": "ACTIVE",
            "registration_date": "2023-06-15"
        })
    elif idx % 7 == 0: # Discharged mortgage
        encumbrances_to_create.append({
            "unit_id": u["id"],
            "bank_name": "Canara Bank",
            "loan_account_number": f"CNRB-HL-2018-{120000 + idx}",
            "loan_amount": 3200000.0,
            "status": "DISCHARGED",
            "registration_date": "2018-03-20"
        })

created_encumbrances = post("encumbrances", encumbrances_to_create)
print(f"Created {len(created_encumbrances)} encumbrance records in 'encumbrances' table.")

print("\n=======================================================")
print("  ALL TABLES IN SUPABASE HAVE BEEN SUCCESSFULLY SEEDED!")
print("=======================================================")
