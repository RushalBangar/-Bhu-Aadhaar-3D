# Bhu-Aadhaar 3D (3D-VLAD)
### 3D Volumetric Land Administration & Vertical Property Mapping System
**Problem Statement ID: SIH26011**  
**Department of Land Resources (DoLR), Ministry of Rural Development, Government of India**

---

## 📌 Executive Summary
**Bhu-Aadhaar 3D** transforms India's traditional 2D land registry system into an interactive, volumetric 3D digital cadastre for high-rise buildings, apartment units, basements, and parking spaces. It eliminates multi-mortgage fraud, illegal terrace constructions, and vertical boundary disputes by assigning legally standard **3D-ULPIN** (Unique Land Parcel Identification Number) identifiers with meter-accurate $Z$-axis elevation bounds.

---

## 🚀 Key Features

- **🌐 Interactive Three.js 3D Digital Twin**: High-performance WebGL scene rendering multi-story buildings, translucent apartment units, and real ground parcel boundaries with post-processing bloom glow.
- **🆔 Algorithmic 3D ULPIN Generation**: Real-time generation of unambiguous volumetric identifiers following the national standard:
  $$\text{ULPIN}_{\text{3D}} = \text{Base 2D ULPIN} - \text{Floor Number} - \text{Unit Number} - \text{Elevation Span (Z)}$$
  *Example:* `14MH2704291845-FL04-U402-Z9.0-12.0M`
- **🏢 Exploded View Animation**: Dynamically separates building floors along the $Z$-axis to inspect interior units and layout configurations effortlessly.
- **🔍 Universal Search & Auto-Complete**: Real-time debounced search querying across 46,000+ land parcels, building addresses, and individual 3D units in Supabase.
- **🛡️ Duplicate Allocation & Conflict Detection**: Live query against the spatial parking allocation registry to detect double-allocations and prevent fraudulent collateral registrations with haptic shake feedback.
- **🏦 Bank Mortgage & Encumbrance Verification**: Instant collateral audit against active bank liens (SBI, HDFC, Bank of Baroda, etc.) to prevent multi-bank mortgage fraud.
- **🚰 Civic Amenities Integration**: Real GIS mapping of civic infrastructure and public drinking water points.

---

## 🗄️ Database Architecture (Supabase PostgreSQL / PostGIS)

The backend is powered by Supabase with six core relational tables:
1. `parcels`: 2D base cadastral plots with polygon geometry (46,700+ records).
2. `buildings`: Structural footprints, floor counts, and physical heights.
3. `units`: Volumetric 3D spatial apartments with 3D bounding boxes, $Z$-axis elevation, and owner hashes.
4. `parking_slots`: Basement/stilt parking allocations mapped directly to units.
5. `encumbrances`: Real-time bank mortgage and lien registry.
6. `amenities`: Civic infrastructure and municipal drinking water locations.

---

## 🛠️ Technology Stack

- **Client**: HTML5, Modern CSS3 (Glassmorphism), Vanilla JavaScript (ES6 Modules)
- **3D Graphics**: Three.js, OrbitControls, EffectComposer, UnrealBloomPass
- **Database**: Supabase PostgreSQL + PostGIS (`@supabase/supabase-js`)
- **Spatial Data**: GeoJSON cadastral boundaries and OpenStreetMap GIS features

---

## 🏃 Getting Started Locally

1. **Clone the repository:**
   ```bash
   git clone https://github.com/RushalBangar/-Bhu-Aadhaar-3D.git
   cd -Bhu-Aadhaar-3D
   ```

2. **Start a local HTTP server:**
   ```bash
   python -m http.server 8000
   ```

3. **Open in browser:**
   Navigate to [http://localhost:8000](http://localhost:8000)

---

## 📜 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
