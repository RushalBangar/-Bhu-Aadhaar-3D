import json
import hashlib
import os

current_dir = os.path.dirname(os.path.abspath(__file__))
input_file = os.path.join(current_dir, 'export.geojson')
output_file = os.path.join(current_dir, 'bulk_parcels_with_ulpin.json')

with open(input_file, 'r', encoding='utf-8') as f:
    data = json.load(f)

parcels = []
features = data.get('features', [])

def extract_all_points(coords):
    points = []
    if not coords:
        return points
    if isinstance(coords[0], (int, float)) and len(coords) >= 2:
        return [coords]
    for item in coords:
        if isinstance(item, (list, tuple)):
            if len(item) >= 2 and isinstance(item[0], (int, float)):
                points.append(item)
            else:
                points.extend(extract_all_points(item))
    return points

for i, feature in enumerate(features):
    geom = feature.get('geometry')
    if not geom:
        continue
        
    coords = geom.get('coordinates', [])
    points = extract_all_points(coords)
    
    if not points:
        continue

    # Lon = pt[0], Lat = pt[1]
    avg_lon = sum(pt[0] for pt in points) / len(points)
    avg_lat = sum(pt[1] for pt in points) / len(points)
    
    # 14-digit standard 2D ULPIN
    geo_hash = hashlib.md5(f"{avg_lat:.5f},{avg_lon:.5f}".encode()).hexdigest()[:8].upper()
    ulpin_2d = f"14MH27{geo_hash}"
    
    parcels.append({
        "ulpin_2d": ulpin_2d,
        "survey_number": f"Plot {100 + i}",
        "latitude": round(avg_lat, 6),
        "longitude": round(avg_lon, 6),
        "boundary_geojson": geom
    })

with open(output_file, 'w', encoding='utf-8') as f:
    json.dump(parcels, f, indent=2)

print(f"Success! Generated {len(parcels)} real parcels in:\n{output_file}")