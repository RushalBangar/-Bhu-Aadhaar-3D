import json
import os
import urllib.request
import time

current_dir = os.path.dirname(os.path.abspath(__file__))
input_file = os.path.join(current_dir, 'bulk_parcels_with_ulpin.json')

SUPABASE_URL = "https://tucpybvcrusbmtsdsvik.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1Y3B5YnZjcnVzYm10c2RzdmlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1ODk4MzksImV4cCI6MjEwNDE2NTgzOX0.KmSQcLxnaG4HVR5KMAGoaiHMo9DzktUKpgoigkIhSSs"

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal" # Don't return the inserted rows to save bandwidth
}

print(f"Loading data from {input_file}...")
with open(input_file, 'r', encoding='utf-8') as f:
    data = json.load(f)

print(f"Loaded {len(data)} records. Preparing for bulk insert...")

# Add missing required fields and remove extra fields not in schema
processed_data = []
for item in data:
    processed_data.append({
        "ulpin_2d": item["ulpin_2d"],
        "survey_number": item["survey_number"],
        "state": "Maharashtra",
        "district": "Pune",
        "taluka": "Pune City",
        "village": "Shivajinagar",
        "boundary_geojson": item["boundary_geojson"]
    })

CHUNK_SIZE = 500
total_chunks = (len(processed_data) + CHUNK_SIZE - 1) // CHUNK_SIZE

success_count = 0
error_count = 0

endpoint = f"{SUPABASE_URL}/rest/v1/parcels"

print(f"Starting upload in {total_chunks} chunks...")

for i in range(total_chunks):
    chunk = processed_data[i * CHUNK_SIZE : (i + 1) * CHUNK_SIZE]
    
    try:
        req = urllib.request.Request(endpoint, data=json.dumps(chunk).encode('utf-8'), headers=headers, method='POST')
        with urllib.request.urlopen(req) as response:
            if response.status in (200, 201):
                success_count += len(chunk)
                print(f"[{i+1}/{total_chunks}] Uploaded {len(chunk)} records successfully. Total: {success_count}")
            else:
                error_count += len(chunk)
                print(f"[{i+1}/{total_chunks}] Error {response.status}: {response.read().decode('utf-8')}")
    except urllib.error.HTTPError as e:
        error_count += len(chunk)
        print(f"[{i+1}/{total_chunks}] HTTP Error {e.code}: {e.read().decode('utf-8')}")
    except Exception as e:
        error_count += len(chunk)
        print(f"[{i+1}/{total_chunks}] Exception occurred: {str(e)}")
        
    time.sleep(0.5)

print("\n--- Upload Summary ---")
print(f"Successfully uploaded: {success_count}")
print(f"Failed to upload: {error_count}")
