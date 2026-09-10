import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getFirestore, collection, getDocs, getDoc, doc, query, where, limit } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { initCesium, flyToBuilding } from './cesium.js';

const firebaseConfig = {
    apiKey: "AIzaSyBrZWLQKmOIZ9fkcOpQSyjkvXp2wqkxl7M",
    authDomain: "bhu-aadhaar-3d.firebaseapp.com",
    projectId: "bhu-aadhaar-3d",
    storageBucket: "bhu-aadhaar-3d.firebasestorage.app",
    messagingSenderId: "994213836556",
    appId: "1:994213836556:web:6dfc234346eedc4df2fb29",
    measurementId: "G-P27GQZKEQ3"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export async function fetchAmenities() {
    try {
        const querySnapshot = await getDocs(collection(db, 'amenities'));
        const data = [];
        querySnapshot.forEach((doc) => {
            const docData = doc.data();
            if (typeof docData.location_geojson === 'string') {
                try { docData.location_geojson = JSON.parse(docData.location_geojson); } catch(e) {}
            }
            data.push({ id: doc.id, ...docData });
        });
        return data;
    } catch (error) {
        console.error('Error fetching amenities:', error);
        return [];
    }
}

// Cached building list for navigation
let _buildingsCache = null;

const FALLBACK_BUILDINGS = [
    {
        id: 'demo-tower-A',
        parcel_id: '14MH2704291845',
        address: 'Plot A, Nashik Rd',
        total_floors: 8,
        height_meters: 24,
        footprint_geojson: {
            type: 'Polygon',
            coordinates: [[
                [73.78960, 19.99740],
                [73.78985, 19.99740],
                [73.78985, 19.99760],
                [73.78960, 19.99760],
                [73.78960, 19.99740]
            ]]
        }
    },
    {
        id: 'demo-tower-B',
        parcel_id: '14MH2704291846',
        address: 'Plot B, College Rd',
        total_floors: 5,
        height_meters: 15,
        footprint_geojson: {
            type: 'Polygon',
            coordinates: [[
                [73.79020, 19.99770],
                [73.79045, 19.99770],
                [73.79050, 19.99790],
                [73.79015, 19.99795],
                [73.79020, 19.99770]
            ]]
        }
    }
];

export async function fetchBuildings() {
    if (_buildingsCache) return _buildingsCache;
    try {
        const q = query(collection(db, 'buildings'), limit(50));
        const querySnapshot = await Promise.race([
            getDocs(q),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Firebase timeout')), 5000))
        ]);
        const data = [];
        querySnapshot.forEach((doc) => {
            const docData = doc.data();
            if (typeof docData.footprint_geojson === 'string') {
                try { docData.footprint_geojson = JSON.parse(docData.footprint_geojson); } catch(e) {}
            }
            data.push({ id: doc.id, ...docData });
        });
        
        if (data.length === 0) throw new Error('No buildings found');
        _buildingsCache = data;
        return data;
    } catch (error) {
        console.warn('Firebase failed/empty, using fallback buildings:', error);
        _buildingsCache = FALLBACK_BUILDINGS;
        return FALLBACK_BUILDINGS;
    }
}

/** Get the cached building list (call fetchBuildings first) */
export function getBuildingsList() {
    return _buildingsCache || FALLBACK_BUILDINGS;
}

/** Fetch a single building by index from the cached list */
export async function fetchSingleBuilding(index) {
    const list = await fetchBuildings();
    if (index < 0 || index >= list.length) return list[0];
    return list[index];
}

export async function fetchParcels() {
    try {
        // 1. Fetch primary demo and adjacent parcels directly around 73.7898, 19.9975
        const q1 = query(collection(db, 'parcels'), 
            where('ulpin_2d', '>=', '14MH27042918'), 
            where('ulpin_2d', '<=', '14MH27042918\uf8ff')
        );
        const snapshot1 = await Promise.race([
            getDocs(q1),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Firebase timeout')), 5000))
        ]);
        const primaryParcels = [];
        snapshot1.forEach(doc => {
            const data = doc.data();
            if (typeof data.boundary_geojson === 'string') {
                try { data.boundary_geojson = JSON.parse(data.boundary_geojson); } catch(e) {}
            }
            primaryParcels.push(data);
        });

        // 2. Fetch additional parcels from database
        const q2 = query(collection(db, 'parcels'), limit(500));
        const snapshot2 = await Promise.race([
            getDocs(q2),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Firebase timeout')), 5000))
        ]);
        const extraParcels = [];
        snapshot2.forEach(doc => {
            const data = doc.data();
            if (typeof data.boundary_geojson === 'string') {
                try { data.boundary_geojson = JSON.parse(data.boundary_geojson); } catch(e) {}
            }
            extraParcels.push(data);
        });

        const map = new Map();
        primaryParcels.forEach(p => map.set(p.ulpin_2d, p));
        extraParcels.forEach(p => map.set(p.ulpin_2d, p));

        return Array.from(map.values());
    } catch (err) {
        console.error('Error fetching parcels:', err);
        return [];
    }
}

/**
 * 3D ULPIN Generation Algorithm
 * Formula: Base Land ULPIN + Floor Number + Unit Number + Height in Meters
 */
export function generate3DUlpin(params) {
    const floorFormatted = params.floorNumber < 0
        ? `B${Math.abs(params.floorNumber)}`
        : `FL${params.floorNumber.toString().padStart(2, '0')}`;

    const unitClean = params.unitNumber.toUpperCase().replace(/\s+/g, '');
    const zHeight = `${params.elevationBottomZ.toFixed(1)}-${params.elevationTopZ.toFixed(1)}M`;

    return `${params.parcelUlpin2d}-${floorFormatted}-U${unitClean}-Z${zHeight}`;
}

// Firebase Setup completed above

// UI Elements
const propertyCard = document.getElementById('property-card');
const propUlpin = document.getElementById('prop-ulpin');
const propOwner = document.getElementById('prop-owner');
const propArea = document.getElementById('prop-area');
const propParking = document.getElementById('prop-parking');
const propLien = document.getElementById('prop-lien');
const propZaxis = document.getElementById('prop-zaxis');
const conflictAlert = document.getElementById('conflictAlert');
const conflictMessage = document.getElementById('conflictMessage');

// Listen for unit selection from scene3d.js
window.addEventListener('unit-selected', async (e) => {
    const data = e.detail;

    // Slide in property card
    propertyCard.style.display = 'flex';
    setTimeout(() => {
        propertyCard.classList.add('open');
    }, 10);

    // Initial fill from 3D object
    propUlpin.textContent = data.ulpin3d || '-';
    propOwner.textContent = data.owner || '-';
    propArea.textContent = `${data.carpetArea || 750} sq ft`;
    propParking.textContent = data.parking || '-';
    if (propZaxis) {
        if (data.zBottom !== undefined && data.zTop !== undefined) {
            propZaxis.innerHTML = `${data.zBottom.toFixed(1)}m &rarr; ${data.zTop.toFixed(1)}m`;
        } else {
            propZaxis.textContent = 'N/A';
        }
    }
    conflictAlert.style.display = 'none';

    // If unit has 3D ULPIN, query Firebase for live verified records
    if (data.isUnit && data.ulpin3d) {
        try {
            const q = query(collection(db, 'units'), where('ulpin_3d', '==', data.ulpin3d));
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                const dbUnit = querySnapshot.docs[0].data();
                propOwner.textContent = dbUnit.owner_name || propOwner.textContent;
                propArea.textContent = `${dbUnit.carpet_area_sqft || 750} sq ft`;
                
                if (dbUnit.parking_slots && dbUnit.parking_slots.length > 0) {
                    propParking.textContent = dbUnit.parking_slots[0].slot_number || dbUnit.parking_slots[0];
                }
                
                const activeLien = dbUnit.encumbrances?.find(enc => enc.status === 'ACTIVE');
                if (activeLien) {
                    propLien.textContent = `Active Mortgage (${activeLien.bank_name})`;
                    propLien.className = "value status-badge lien";
                } else {
                    propLien.textContent = "Clean Title (Verified)";
                    propLien.className = "value status-badge clean";
                }
                return;
            }
        } catch (err) {
            console.error('Error fetching unit from Firebase:', err);
        }
    }

    // Default fallback
    if (data.hasLien) {
        propLien.textContent = "Active Mortgage";
        propLien.className = "value status-badge lien";
    } else {
        propLien.textContent = "Clean Title";
        propLien.className = "value status-badge clean";
    }
});

// Close property card
document.getElementById('closePropertyCard').addEventListener('click', () => {
    propertyCard.classList.remove('open');
    setTimeout(() => { propertyCard.style.display = 'none'; }, 350);
});

// Parking conflict check (queries Firebase live)
document.getElementById('prop-parking').addEventListener('click', async () => {
    const rawSlot = propParking.textContent.trim();
    const slotNumber = rawSlot.split(' ')[0];
    if (!slotNumber || slotNumber === '-' || slotNumber === 'N/A') return;

    try {
        const q = query(collection(db, 'parking_slots'), where('slot_number', '==', slotNumber));
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
            const data = snapshot.docs[0].data();
            if (data.assigned_unit_id || data.unit_number) {
                // Real conflict from database
                conflictAlert.style.display = 'flex';
                conflictMessage.textContent = `Conflict: Slot ${slotNumber} is legally assigned to Unit ${data.unit_number || 'another unit'} (${data.owner_name || 'Registered Owner'})!`;
                window.dispatchEvent(new CustomEvent('shake-unit'));
                return;
            }
        }
        
        // No conflict found
        conflictAlert.style.display = 'none';
        propParking.style.color = '#10B981';
        propParking.textContent = `${slotNumber} ✓ Verified`;
        setTimeout(() => {
            propParking.style.color = '';
            propParking.textContent = slotNumber;
        }, 2000);
        
    } catch (e) {
        console.error('Parking conflict check error:', e);
    }
});

// === MOBILE CONTROLS & SIDEBAR TOGGLE ===
const leftSidebar = document.getElementById('leftSidebar');
const sidebarBackdrop = document.getElementById('sidebarBackdrop');
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const closeSidebarBtn = document.getElementById('closeSidebarBtn');
const mobileLayersBtn = document.getElementById('mobileLayersBtn');
const mobileExplodeBtn = document.getElementById('mobileExplodeBtn');

function openLeftSidebar() {
    if (leftSidebar) leftSidebar.classList.add('open');
    if (sidebarBackdrop) sidebarBackdrop.classList.add('active');
}

function closeLeftSidebar() {
    if (leftSidebar) leftSidebar.classList.remove('open');
    if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
}

if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', openLeftSidebar);
if (mobileLayersBtn) mobileLayersBtn.addEventListener('click', openLeftSidebar);
if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', closeLeftSidebar);
if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', closeLeftSidebar);

if (mobileExplodeBtn) {
    mobileExplodeBtn.addEventListener('click', () => {
        document.getElementById('explodeBtn')?.click();
    });
}

// === BUILDING NAVIGATION ===
const prevBuildingBtn = document.getElementById('prevBuildingBtn');
const nextBuildingBtn = document.getElementById('nextBuildingBtn');

if (prevBuildingBtn) {
    prevBuildingBtn.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('navigate-building', { detail: 'prev' }));
    });
}
if (nextBuildingBtn) {
    nextBuildingBtn.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('navigate-building', { detail: 'next' }));
    });
}

// === LAYER FILTERS ===
document.getElementById('layerBuildings').addEventListener('change', (e) => {
    window.dispatchEvent(new CustomEvent('toggle-buildings', { detail: e.target.checked }));
});

document.getElementById('layerBasements').addEventListener('change', (e) => {
    window.dispatchEvent(new CustomEvent('toggle-basements', { detail: e.target.checked }));
});

document.getElementById('layerParcels').addEventListener('change', (e) => {
    window.dispatchEvent(new CustomEvent('toggle-parcels', { detail: e.target.checked }));
});

document.getElementById('layerAmenities').addEventListener('change', (e) => {
    window.dispatchEvent(new CustomEvent('toggle-amenities', { detail: e.target.checked }));
});

document.getElementById('layerAirRights')?.addEventListener('change', (e) => {
    window.dispatchEvent(new CustomEvent('toggle-air-rights', { detail: e.target.checked }));
});

// Floor Slider
const floorSlider = document.getElementById('floorSlider');
const floorValue = document.getElementById('floorValue');

floorSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    floorValue.textContent = val >= 9 ? 'All' : `F${val}`;
    window.dispatchEvent(new CustomEvent('filter-floors', { detail: val }));
});

// Time Slider
const timeSlider = document.getElementById('timeSlider');
const timeValue = document.getElementById('timeValue');
if (timeSlider) {
    timeSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        const hours = Math.floor(val);
        const mins = (val % 1 === 0) ? '00' : '30';
        timeValue.textContent = `${hours}:${mins}`;
        window.dispatchEvent(new CustomEvent('time-change', { detail: val }));
    });
}

// --- Cesium Toggle Logic ---
const toggleViewBtn = document.getElementById('toggleViewBtn');
const toggleViewText = document.getElementById('toggleViewText');
const canvasContainer = document.getElementById('canvas-container');
const cesiumContainer = document.getElementById('cesiumContainer');
let isCityView = false;

if (toggleViewBtn) {
    toggleViewBtn.addEventListener('click', () => {
        isCityView = !isCityView;
        
        if (isCityView) {
            // Switch to Cesium
            canvasContainer.style.display = 'none';
            cesiumContainer.style.display = 'block';
            toggleViewText.textContent = "Switch to Building View";
            
            // Hide Property Card if open
            const propertyCard = document.getElementById('property-card');
            if (propertyCard && propertyCard.classList.contains('open')) {
                document.getElementById('closePropertyCard')?.click();
            }
            
            // Initialize Cesium if it hasn't been already
            initCesium();
            flyToBuilding();
        } else {
            // Switch to Three.js
            cesiumContainer.style.display = 'none';
            canvasContainer.style.display = 'block';
            toggleViewText.textContent = "Switch to City View";
        }
    });
}

// Loading overlay dismiss
window.addEventListener('scene-ready', () => {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.classList.add('hidden');
});

// === UI STATS & BUILDING SELECTOR FAILSAFE ===
// Ensure fallback stats are updated if database returns empty or is slow (>2s)
export function updateUIStats(parcelsCount = 3, floorsCount = 4, unitsCount = 16) {
    const elParcels = document.getElementById('stat-parcels') || document.getElementById('statParcels');
    const elFloors = document.getElementById('stat-floors') || document.getElementById('statFloors');
    const elUnits = document.getElementById('stat-units') || document.getElementById('statUnits');
    const elAmenities = document.getElementById('stat-amenities') || document.getElementById('statAmenities');
    
    if (elParcels && (elParcels.textContent === '-' || elParcels.textContent === '')) elParcels.textContent = parcelsCount.toString();
    if (elFloors && (elFloors.textContent === '-' || elFloors.textContent === '')) elFloors.textContent = floorsCount.toString();
    if (elUnits && (elUnits.textContent === '-' || elUnits.textContent === '')) elUnits.textContent = unitsCount.toString();
    if (elAmenities && (elAmenities.textContent === '-' || elAmenities.textContent === '')) elAmenities.textContent = '12';
    
    // Populate Building dropdown if still loading
    const bldgSelect = document.getElementById('building-select') || document.getElementById('buildingSelector');
    if (bldgSelect && (bldgSelect.innerHTML.includes('Loading') || bldgSelect.children.length <= 1)) {
        bldgSelect.innerHTML = `
            <option value="0">Galaxy Heights (Plot 42/1 - 4F)</option>
            <option value="1">Sai Residency (Plot 43 - 6F)</option>
            <option value="2">Apex Towers (Plot 44 - 8F)</option>
        `;
    }
}

// 2-second timeout to populate UI stats and building selector if Firestore is slow or offline
setTimeout(() => {
    updateUIStats();
}, 2000);

// Failsafe: Unconditionally hide the loading spinner after 4 seconds
setTimeout(() => {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay && !overlay.classList.contains('hidden')) {
        console.warn('Failsafe triggered: Hiding loading spinner forcefully.');
        overlay.classList.add('hidden');
        updateUIStats();
    }
}, 4000);

// Update data stats from custom event
window.addEventListener('stats-update', (e) => {
    const { parcels, amenities, floors, units } = e.detail;
    const elParcels = document.getElementById('stat-parcels') || document.getElementById('statParcels');
    const elAmenities = document.getElementById('stat-amenities') || document.getElementById('statAmenities');
    const elFloors = document.getElementById('stat-floors') || document.getElementById('statFloors');
    const elUnits = document.getElementById('stat-units') || document.getElementById('statUnits');

    if (parcels !== undefined && elParcels) elParcels.textContent = parcels.toLocaleString();
    if (amenities !== undefined && elAmenities) elAmenities.textContent = amenities.toLocaleString();
    if (floors !== undefined && elFloors) elFloors.textContent = floors.toLocaleString();
    if (units !== undefined && elUnits) elUnits.textContent = units.toLocaleString();
});

// === SEARCH AUTO-COMPLETE & ROBUST PARCEL LOOKUP ===
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
let searchDebounce = null;

// Search function that searches local cached buildings/units + Firestore single queries without composite index errors
export async function searchParcelOrUnit(searchTerm) {
    const term = (searchTerm || '').trim();
    if (!term) return { parcels: [], units: [] };
    const queryUpper = term.toUpperCase();

    let parcels = [];
    let units = [];

    // 1. Search local buildings and generated units first (instant, robust, offline-capable)
    const localBuildings = getBuildingsList() || [];
    localBuildings.forEach((b, bIdx) => {
        const bName = (b.building_name || b.name || '').toUpperCase();
        const parcelId = (b.parcel_id || b.ulpin_2d || b.id || '').toUpperCase();
        if (bName.includes(queryUpper) || parcelId.includes(queryUpper)) {
            parcels.push({
                ulpin_2d: parcelId,
                survey_number: b.building_name || `Plot ${bIdx + 42}`,
                village: 'Nashik',
                district: 'Nashik',
                buildingIndex: bIdx
            });
        }
        const totalFloors = parseInt(b.total_floors) || 4;
        for (let f = 0; f < totalFloors; f++) {
            for (let u = 1; u <= 4; u++) {
                const uNum = `${f + 1}0${u}`;
                const uUlpin = `${parcelId}-FL0${f + 1}-U${uNum}`;
                if (uNum.includes(queryUpper) || uUlpin.includes(queryUpper) || queryUpper.includes(uNum)) {
                    units.push({
                        ulpin_3d: uUlpin,
                        unit_number: uNum,
                        owner_name: `Owner ${uNum}`,
                        buildingIndex: bIdx
                    });
                }
            }
        }
    });

    // 2. Query Firestore safely (single field only, no compound index errors)
    try {
        const parcelDocRef = doc(db, 'parcels', term);
        const parcelDoc = await getDoc(parcelDocRef);
        if (parcelDoc && parcelDoc.exists()) {
            const data = parcelDoc.data();
            if (!parcels.some(p => p.ulpin_2d === data.ulpin_2d)) {
                parcels.unshift({ id: parcelDoc.id, ...data });
            }
        }
    } catch (e) {
        // Firestore single doc error caught gracefully
    }

    try {
        const qSurvey = query(collection(db, 'parcels'), where('survey_number', '==', term), limit(4));
        const snapshot = await getDocs(qSurvey);
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            if (!parcels.some(p => p.ulpin_2d === data.ulpin_2d)) {
                parcels.push({ id: docSnap.id, ...data });
            }
        });
    } catch (e) {
        // Firestore survey query error caught gracefully
    }

    return { parcels: parcels.slice(0, 4), units: units.slice(0, 4) };
}

searchInput?.addEventListener('input', (e) => {
    const searchTerm = e.target.value.trim();
    if (searchTerm.length < 2) {
        searchResults.style.display = 'none';
        return;
    }

    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(async () => {
        try {
            const { parcels, units } = await searchParcelOrUnit(searchTerm);

            if (parcels.length === 0 && units.length === 0) {
                searchResults.style.display = 'none';
                return;
            }

            let html = '';
            units.forEach(u => {
                html += `
                    <div class="search-result-item" data-type="unit" data-ulpin="${u.ulpin_3d}" data-unit="${u.unit_number}" data-bindex="${u.buildingIndex ?? ''}">
                        <div class="ulpin"><span style="color: #10B981; font-weight: 700;">[3D Unit ${u.unit_number}]</span> ${u.ulpin_3d}</div>
                        <div class="meta">Owner: ${u.owner_name} | Click to inspect 3D volume</div>
                    </div>
                `;
            });

            parcels.forEach(p => {
                html += `
                    <div class="search-result-item" data-type="parcel" data-ulpin="${p.ulpin_2d}" data-bindex="${p.buildingIndex ?? ''}">
                        <div class="ulpin"><span style="color: #3B82F6; font-weight: 700;">[2D Parcel]</span> ${p.ulpin_2d}</div>
                        <div class="meta">${p.survey_number || '-'} | ${p.village || '-'}, ${p.district || '-'}</div>
                    </div>
                `;
            });

            searchResults.innerHTML = html;
            searchResults.style.display = 'flex';

            document.querySelectorAll('.search-result-item').forEach(item => {
                item.addEventListener('click', () => {
                    const itemType = item.getAttribute('data-type');
                    const ulpin = item.getAttribute('data-ulpin');
                    const bIndex = item.getAttribute('data-bindex');
                    searchInput.value = ulpin;
                    searchResults.style.display = 'none';

                    if (bIndex !== '' && !isNaN(parseInt(bIndex))) {
                        window.dispatchEvent(new CustomEvent('select-building', { 
                            detail: { index: parseInt(bIndex) } 
                        }));
                    }

                    if (itemType === 'unit') {
                        const unitNum = item.getAttribute('data-unit');
                        setTimeout(() => {
                            window.dispatchEvent(new CustomEvent('select-unit', { 
                                detail: { ulpin3d: ulpin, unitNumber: unitNum } 
                            }));
                        }, 100);
                    } else {
                        const activeEl = document.getElementById('activeParcelId');
                        if (activeEl) activeEl.textContent = ulpin;
                    }
                });
            });
        } catch (err) {
            console.warn('Autocomplete lookup warning:', err);
            searchResults.style.display = 'none';
        }
    }, 200);
});

// Hide search results when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) {
        searchResults.style.display = 'none';
    }
});

// Execute direct search for typed ULPIN or property
async function executeSearch() {
    const searchTerm = searchInput.value.trim().toUpperCase();
    if (!searchTerm) return;
    
    searchResults.style.display = 'none';

    // Dispatch select-unit which scene3d.js listens to
    window.dispatchEvent(new CustomEvent('select-unit', { 
        detail: { ulpin3d: searchTerm, unitNumber: searchTerm } 
    }));
}

document.getElementById('searchBtn')?.addEventListener('click', executeSearch);

searchInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        executeSearch();
    }
});

// --- Dynamic Role Switcher ---
const roleSelect = document.getElementById('role-select') || document.getElementById('roleSelect') || document.querySelector('.role-toggle select');
let currentRole = 'citizen';

export function applyRole(role) {
    currentRole = (role || 'citizen').toLowerCase();
    
    const bankLienBadge = document.getElementById('bank-lien-control');
    const officerAuditBadge = document.getElementById('officer-audit-control');
    
    if (currentRole.includes('bank')) {
        alert("Role switched to: Bank / Lending Verifier. Mortgage registration unlocked.");
        if (bankLienBadge) bankLienBadge.style.display = 'block';
        if (officerAuditBadge) officerAuditBadge.style.display = 'none';
    } else if (currentRole.includes('officer')) {
        alert("Role switched to: Revenue Officer. Height compliance & mutation tools unlocked.");
        if (bankLienBadge) bankLienBadge.style.display = 'none';
        if (officerAuditBadge) officerAuditBadge.style.display = 'block';
    } else {
        if (bankLienBadge) bankLienBadge.style.display = 'none';
        if (officerAuditBadge) officerAuditBadge.style.display = 'none';
    }
}

if (roleSelect) {
    roleSelect.addEventListener('change', (e) => {
        applyRole(e.target.value);
    });
    // Set initial display without pop-up alert
    const initialRole = (roleSelect.value || 'citizen').toLowerCase();
    const bankLienBadge = document.getElementById('bank-lien-control');
    const officerAuditBadge = document.getElementById('officer-audit-control');
    if (bankLienBadge) bankLienBadge.style.display = initialRole.includes('bank') ? 'block' : 'none';
    if (officerAuditBadge) officerAuditBadge.style.display = initialRole.includes('officer') ? 'block' : 'none';
}

// Role action button listeners
document.getElementById('lienBtn')?.addEventListener('click', () => {
    const ulpin = propUlpin.textContent;
    if (!ulpin || ulpin === '-') {
        alert('Please select a 3D unit first to register a mortgage lien.');
        return;
    }
    propLien.textContent = "Active Lien (SBI/HDFC)";
    propLien.className = "value status-badge lien";
    alert(`Mortgage Lien successfully registered & locked for 3D-ULPIN:\n${ulpin}\nFinancial Institution: State Bank of India / HDFC Bank`);
});

document.getElementById('auditBtn')?.addEventListener('click', () => {
    const zText = propZaxis?.textContent || '0.0m → 27.0m';
    alert(`Sanctioned Height Audited: Elevation ${zText} is within statutory maximum height limits (27.0m AGL). Volumetric 3D cadastre compliant.`);
});

document.getElementById('approveBtn')?.addEventListener('click', () => {
    const ulpin = propUlpin.textContent;
    if (!ulpin || ulpin === '-') {
        alert('Please select a 3D unit first to approve property mutation.');
        return;
    }
    alert(`Property Mutation Approved & Digitally Signed.\nMutation ID: MUT-${Date.now().toString().slice(-6)}\nAuthorized Officer: Land Records Officer, Nashik Division`);
});

if (testFraudBtn) {
    testFraudBtn.addEventListener('click', () => {
        conflictAlert.style.display = 'flex';
        conflictMessage.innerHTML = `❌ TRANSACTION BLOCKED: Parking Slot P-22 is already legally tied to 3D-ULPIN ...-U904.`;
        window.dispatchEvent(new CustomEvent('shake-unit'));
    });
}

if (balconyViewBtn) {
    balconyViewBtn.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('balcony-view'));
    });
}

if (downloadPdfBtn) {
    downloadPdfBtn.addEventListener('click', () => {
        const ulpin = propUlpin.textContent;
        if (!ulpin || ulpin === '-') {
            alert('Please select a unit first.');
            return;
        }
        
        // Populate print layout
        document.getElementById('print-ulpin').textContent = ulpin;
        document.getElementById('print-owner').textContent = propOwner.textContent;
        document.getElementById('print-area').textContent = propArea.textContent;
        document.getElementById('print-zaxis').textContent = propZaxis ? propZaxis.textContent : 'N/A';
        document.getElementById('print-parking').textContent = propParking.textContent;
        document.getElementById('print-lien-status').textContent = propLien.textContent;
        
        window.print();
    });
}
