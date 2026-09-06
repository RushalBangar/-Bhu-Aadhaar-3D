import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getFirestore, collection, getDocs, query, where, limit, or } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

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

export async function fetchBuildings() {
    try {
        const q = query(collection(db, 'buildings'), limit(50));
        const querySnapshot = await getDocs(q);
        const data = [];
        querySnapshot.forEach((doc) => {
            const docData = doc.data();
            if (typeof docData.footprint_geojson === 'string') {
                try { docData.footprint_geojson = JSON.parse(docData.footprint_geojson); } catch(e) {}
            }
            data.push({ id: doc.id, ...docData });
        });
        return data;
    } catch (error) {
        console.error('Error fetching buildings:', error);
        return [];
    }
}

export async function fetchParcels() {
    try {
        // 1. Fetch primary demo and adjacent parcels directly around 73.7898, 19.9975
        const q1 = query(collection(db, 'parcels'), 
            where('ulpin_2d', '>=', '14MH27042918'), 
            where('ulpin_2d', '<=', '14MH27042918\uf8ff')
        );
        const snapshot1 = await getDocs(q1);
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
        const snapshot2 = await getDocs(q2);
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

// Floor Slider
const floorSlider = document.getElementById('floorSlider');
const floorValue = document.getElementById('floorValue');

floorSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    floorValue.textContent = val >= 9 ? 'All' : `F${val}`;
    window.dispatchEvent(new CustomEvent('filter-floors', { detail: val }));
});

// Loading overlay dismiss
window.addEventListener('scene-ready', () => {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.classList.add('hidden');
});

// Update data stats
window.addEventListener('stats-update', (e) => {
    const { parcels, amenities } = e.detail;
    if (parcels !== undefined) {
        const el = document.getElementById('statParcels');
        if (el) el.textContent = parcels.toLocaleString();
    }
    if (amenities !== undefined) {
        const el = document.getElementById('statAmenities');
        if (el) el.textContent = amenities.toLocaleString();
    }
});

// === SEARCH AUTO-COMPLETE ===
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
let searchDebounce = null;

searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    if (query.length < 3) {
        searchResults.style.display = 'none';
        return;
    }

    // Debounce to avoid hammering Firebase
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(async () => {
        try {
            // Firebase doesn't have an exact equivalent to ilike. We'll use prefix match 
            // for ulpin_2d and ulpin_3d, and fetch some results to filter on the client.
            const queryUpper = query.toUpperCase();
            
            const qParcels = query(collection(db, 'parcels'), 
                or(
                    where('ulpin_2d', '>=', queryUpper),
                    where('survey_number', '>=', queryUpper)
                ),
                limit(10)
            );
            
            const qUnits = query(collection(db, 'units'), 
                or(
                    where('ulpin_3d', '>=', queryUpper),
                    where('unit_number', '>=', queryUpper)
                ),
                limit(10)
            );

            const [parcelRes, unitRes] = await Promise.all([
                getDocs(qParcels),
                getDocs(qUnits)
            ]);

            let parcels = [];
            parcelRes.forEach(doc => {
                const data = doc.data();
                if ((data.ulpin_2d && data.ulpin_2d.includes(queryUpper)) || 
                    (data.survey_number && data.survey_number.toUpperCase().includes(queryUpper))) {
                    parcels.push(data);
                }
            });
            parcels = parcels.slice(0, 4);
            
            let units = [];
            unitRes.forEach(doc => {
                const data = doc.data();
                if ((data.ulpin_3d && data.ulpin_3d.includes(queryUpper)) || 
                    (data.unit_number && data.unit_number.toUpperCase().includes(queryUpper)) ||
                    (data.owner_name && data.owner_name.toUpperCase().includes(queryUpper))) {
                    units.push(data);
                }
            });
            units = units.slice(0, 4);

            if (parcels.length === 0 && units.length === 0) {
                searchResults.style.display = 'none';
                return;
            }

            let html = '';
            units.forEach(u => {
                html += `
                    <div class="search-result-item" data-type="unit" data-ulpin="${u.ulpin_3d}" data-unit="${u.unit_number}">
                        <div class="ulpin"><span style="color: #10B981; font-weight: 700;">[3D Unit ${u.unit_number}]</span> ${u.ulpin_3d}</div>
                        <div class="meta">Owner: ${u.owner_name} | Click to inspect 3D volume</div>
                    </div>
                `;
            });

            parcels.forEach(p => {
                html += `
                    <div class="search-result-item" data-type="parcel" data-ulpin="${p.ulpin_2d}">
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
                    searchInput.value = ulpin;
                    searchResults.style.display = 'none';

                    if (itemType === 'unit') {
                        const unitNum = item.getAttribute('data-unit');
                        window.dispatchEvent(new CustomEvent('select-unit', { 
                            detail: { ulpin3d: ulpin, unitNumber: unitNum } 
                        }));
                    } else {
                        document.getElementById('activeParcelId').textContent = ulpin;
                        if (ulpin === '14MH2704291845') {
                            window.dispatchEvent(new CustomEvent('select-unit', { 
                                detail: { unitNumber: '402' } 
                            }));
                        }
                    }
                });
            });
        } catch (err) {
            console.error('Search error:', err);
            searchResults.style.display = 'none';
        }
    }, 250);
});

// Hide search results when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) {
        searchResults.style.display = 'none';
    }
});
// Execute direct search for typed ULPIN
function executeSearch() {
    const query = searchInput.value.trim().toUpperCase();
    if (!query) return;
    
    // Hide autocomplete results
    searchResults.style.display = 'none';

    // Dispatch select-unit which scene3d.js listens to
    window.dispatchEvent(new CustomEvent('select-unit', { 
        detail: { ulpin3d: query, unitNumber: query } 
    }));
}

// Search button click
document.getElementById('searchBtn').addEventListener('click', executeSearch);

// Enter key press
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        executeSearch();
    }
});
// Download PDF
document.getElementById('downloadPdfBtn').addEventListener('click', () => {
    const ulpin = propUlpin.textContent;
    if (!ulpin || ulpin === '-') {
        alert('Please select a unit first.');
        return;
    }
    alert(`Downloading Official 3D Property Card for ${ulpin}`);
});
