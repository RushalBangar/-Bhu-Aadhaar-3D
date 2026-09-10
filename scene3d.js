import { generate3DUlpin, fetchBuildings, fetchSingleBuilding, getBuildingsList } from './app.js?v=2.2.0';

// ──────────────────────────────────────────────────────────
// 1. SCENE SETUP
// ──────────────────────────────────────────────────────────
const container = document.getElementById('canvas-container') || document.body;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0B0F19);
scene.fog = new THREE.FogExp2(0x0B0F19, 0.004);

const width = container.clientWidth || window.innerWidth;
const height = container.clientHeight || window.innerHeight;

// Camera
const camera = new THREE.PerspectiveCamera(50, width / height, 0.5, 1000);
camera.position.set(35, 40, 50);

// Safe WebGL Renderer Initialization
let renderer = null;
let controls = null;

try {
    renderer = new THREE.WebGLRenderer({
        antialias: false, // Disabling antialias prevents context creation failures on integrated GPUs
        alpha: true,
        powerPreference: "default",
        failIfMajorPerformanceCaveat: false,
        preserveDrawingBuffer: true
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    controls.minDistance = 10;
    controls.maxDistance = 200;
    controls.target.set(0, 10, 0);
} catch (e) {
    console.warn("WebGL initialization failed:", e);
    const errorBanner = document.getElementById('webgl-error-banner');
    if (errorBanner) errorBanner.style.display = 'block';
    window.dispatchEvent(new CustomEvent('scene-ready'));
}

// ──────────────────────────────────────────────────────────
// 2. POST-PROCESSING (Bloom)
// ──────────────────────────────────────────────────────────
let composer = null;
if (renderer) {
    try {
        const renderPass = new THREE.RenderPass(scene, camera);
        const bloomPass = new THREE.UnrealBloomPass(
            new THREE.Vector2(width, height), 0.4, 0.6, 0.85
        );
        composer = new THREE.EffectComposer(renderer);
        composer.addPass(renderPass);
        composer.addPass(bloomPass);
    } catch (e) {
        console.warn('Post-processing unavailable, falling back to standard renderer:', e.message);
    }
}

// ──────────────────────────────────────────────────────────
// 3. LIGHTING
// ──────────────────────────────────────────────────────────
const ambientLight = new THREE.AmbientLight(0xb0c4de, 0.6);
scene.add(ambientLight);

const hemiLight = new THREE.HemisphereLight(0x6088c6, 0x1a1a2e, 0.5);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xffeedd, 1.6);
dirLight.position.set(40, 100, 60);
dirLight.castShadow = true;
dirLight.shadow.camera.left = -60;
dirLight.shadow.camera.right = 60;
dirLight.shadow.camera.top = 60;
dirLight.shadow.camera.bottom = -60;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 250;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.bias = -0.0005;
scene.add(dirLight);

const fillLight = new THREE.DirectionalLight(0x4488ff, 0.4);
fillLight.position.set(-30, 20, -40);
scene.add(fillLight);

const rimLight = new THREE.PointLight(0x3B82F6, 0.6, 100);
rimLight.position.set(0, 50, -30);
scene.add(rimLight);

// ──────────────────────────────────────────────────────────
// 4. GROUND PLANE & GRID
// ──────────────────────────────────────────────────────────
const gridHelper = new THREE.GridHelper(120, 40, 0x1E3A5F, 0x111827);
gridHelper.position.y = -0.01;
scene.add(gridHelper);

const groundGeo = new THREE.PlaneGeometry(200, 200);
const groundMat = new THREE.MeshStandardMaterial({
    color: 0x0d1117,
    roughness: 0.95,
    metalness: 0.05
});
const groundMesh = new THREE.Mesh(groundGeo, groundMat);
groundMesh.rotation.x = -Math.PI / 2;
groundMesh.position.y = -0.02;
groundMesh.receiveShadow = true;
scene.add(groundMesh);

// Air Rights Ceiling (hidden by default)
const airRightsMat = new THREE.MeshBasicMaterial({
    color: 0xFF4444, transparent: true, opacity: 0.15, side: THREE.DoubleSide
});
const airRightsGeo = new THREE.PlaneGeometry(80, 80);
const airRightsMesh = new THREE.Mesh(airRightsGeo, airRightsMat);
airRightsMesh.rotation.x = -Math.PI / 2;
airRightsMesh.position.y = 27.0;
airRightsMesh.visible = false;
scene.add(airRightsMesh);

// ──────────────────────────────────────────────────────────
// 5. MATERIALS
// ──────────────────────────────────────────────────────────
const FLOOR_COLORS = [
    0x1E40AF, 0x1D4ED8, 0x2563EB, 0x3B82F6,
    0x1E3A8A, 0x1E40AF, 0x1D4ED8, 0x2563EB,
    0x3B82F6, 0x60A5FA, 0x1E3A8A, 0x1D4ED8
];

function createFloorMaterial(floorIndex) {
    const color = FLOOR_COLORS[floorIndex % FLOOR_COLORS.length];
    return new THREE.MeshStandardMaterial({
        color,
        transparent: true,
        opacity: 0.82,
        roughness: 0.25,
        metalness: 0.15,
        side: THREE.DoubleSide
    });
}

const materialSelected = new THREE.MeshStandardMaterial({
    color: 0x10B981,
    emissive: 0x10B981,
    emissiveIntensity: 0.5,
    transparent: true,
    opacity: 0.95,
    roughness: 0.2,
    metalness: 0.1,
    side: THREE.DoubleSide
});

const materialHover = new THREE.MeshStandardMaterial({
    color: 0x60A5FA,
    emissive: 0x3B82F6,
    emissiveIntensity: 0.3,
    transparent: true,
    opacity: 0.9,
    roughness: 0.2,
    metalness: 0.1,
    side: THREE.DoubleSide
});

const basementMaterial = new THREE.MeshStandardMaterial({
    color: 0x374151,
    transparent: true,
    opacity: 0.6,
    roughness: 0.8,
    metalness: 0.05,
    side: THREE.DoubleSide
});

const edgeMaterial = new THREE.LineBasicMaterial({
    color: 0x38BDF8,
    transparent: true,
    opacity: 0.6
});

// ──────────────────────────────────────────────────────────
// 6. BUILDING GROUP & STATE
// ──────────────────────────────────────────────────────────
const buildingGroup = new THREE.Group();
buildingGroup.name = 'buildings';
scene.add(buildingGroup);

const parcelGroup = new THREE.Group();
parcelGroup.name = 'parcels';
scene.add(parcelGroup);

let units = [];
let currentBuildingIndex = 0;
let currentBuildingData = null;

// Coordinate conversion constants (at ~20°N latitude)
const DEG_TO_METERS_LAT = 111320;
const DEG_TO_METERS_LNG = 111320 * Math.cos(20.0 * Math.PI / 180);

// ──────────────────────────────────────────────────────────
// 7. BUILDING RENDERING — THE CORE FIX
// ──────────────────────────────────────────────────────────

/**
 * Convert a GeoJSON polygon ring to local-space XZ coordinates (meters).
 * Subtracts the centroid so the building is centered at origin.
 */
function geoRingToLocalCoords(ring) {
    // Compute centroid
    let cLng = 0, cLat = 0, n = 0;
    for (const coord of ring) {
        if (!coord || isNaN(coord[0]) || isNaN(coord[1])) continue;
        cLng += coord[0];
        cLat += coord[1];
        n++;
    }
    if (n === 0) return null;
    cLng /= n;
    cLat /= n;

    // Convert to local meters relative to centroid
    const points = [];
    for (const coord of ring) {
        if (!coord || isNaN(coord[0]) || isNaN(coord[1])) continue;
        const x = (coord[0] - cLng) * DEG_TO_METERS_LNG;
        const z = -(coord[1] - cLat) * DEG_TO_METERS_LAT;
        points.push({ x, z });
    }

    return { points, centroidLng: cLng, centroidLat: cLat };
}

/**
 * Build a THREE.Shape from local coordinate points
 */
function createShapeFromPoints(points) {
    if (points.length < 3) return null;
    const shape = new THREE.Shape();
    shape.moveTo(points[0].x, points[0].z);
    for (let i = 1; i < points.length; i++) {
        shape.lineTo(points[i].x, points[i].z);
    }
    shape.closePath();
    return shape;
}

/**
 * Split a bounding box into 4 quadrant shapes for multi-unit floors.
 * For a polygon footprint, we create 4 sub-rectangles within the bounding box.
 */
function createUnitShapes(footprintShape, points) {
    // Get bounding box of the footprint
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of points) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minZ = Math.min(minZ, p.z);
        maxZ = Math.max(maxZ, p.z);
    }

    const midX = (minX + maxX) / 2;
    const midZ = (minZ + maxZ) / 2;
    const gap = 0.3; // Gap between units

    const quadrants = [
        { label: 'A', x1: minX, x2: midX - gap, z1: minZ, z2: midZ - gap },
        { label: 'B', x1: midX + gap, x2: maxX, z1: minZ, z2: midZ - gap },
        { label: 'C', x1: minX, x2: midX - gap, z1: midZ + gap, z2: maxZ },
        { label: 'D', x1: midX + gap, x2: maxX, z1: midZ + gap, z2: maxZ },
    ];

    return quadrants.map(q => {
        const shape = new THREE.Shape();
        shape.moveTo(q.x1, q.z1);
        shape.lineTo(q.x2, q.z1);
        shape.lineTo(q.x2, q.z2);
        shape.lineTo(q.x1, q.z2);
        shape.closePath();
        return { shape, label: q.label, centerX: (q.x1 + q.x2) / 2, centerZ: (q.z1 + q.z2) / 2 };
    });
}

/**
 * Clear the current building from the scene
 */
function clearBuilding() {
    while (buildingGroup.children.length > 0) {
        const child = buildingGroup.children[0];
        buildingGroup.remove(child);
        child.traverse(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                else obj.material.dispose();
            }
        });
    }
    units = [];
}

/**
 * MAIN: Render a single building into the scene
 */
function renderBuilding(buildingData) {
    clearBuilding();
    currentBuildingData = buildingData;

    const geom = buildingData.footprint_geojson || buildingData.boundary_geojson;
    if (!geom) {
        console.error('No GeoJSON geometry for building:', buildingData.id);
        return;
    }

    // Extract ring
    let ring = null;
    if (geom.type === 'Polygon' && geom.coordinates?.length > 0) {
        ring = geom.coordinates[0];
    } else if (geom.type === 'MultiPolygon' && geom.coordinates?.length > 0) {
        ring = geom.coordinates[0][0];
    }
    if (!ring || ring.length < 3) return;

    // Convert to local coords
    const local = geoRingToLocalCoords(ring);
    if (!local) return;

    const { points } = local;
    const footprintShape = createShapeFromPoints(points);
    if (!footprintShape) return;

    // Get building dimensions from bounding box
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of points) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minZ = Math.min(minZ, p.z);
        maxZ = Math.max(maxZ, p.z);
    }
    const bldgWidth = maxX - minX;
    const bldgDepth = maxZ - minZ;

    const numFloors = parseInt(buildingData.total_floors) || (Math.floor(Math.random() * 5) + 4);
    const floorHeight = 3.0;
    const totalHeight = numFloors * floorHeight;
    const ulpin2d = buildingData.parcel_id || buildingData.ulpin_2d || `14MH27${buildingData.id?.slice(-4) || '0001'}`;

    // Create unit shapes (4 per floor)
    const unitShapes = createUnitShapes(footprintShape, points);
    const extrudeSettings = { depth: floorHeight - 0.3, bevelEnabled: false };

    const bGroup = new THREE.Group();

    // === BASEMENT ===
    const basementExtrudeSettings = { depth: 2.8, bevelEnabled: false };
    const basementGeo = new THREE.ExtrudeGeometry(footprintShape, basementExtrudeSettings);
    const basementMesh = new THREE.Mesh(basementGeo, basementMaterial.clone());
    basementMesh.rotation.x = -Math.PI / 2;
    basementMesh.position.y = -3.0;
    basementMesh.castShadow = true;
    basementMesh.receiveShadow = true;
    basementMesh.userData = {
        isBasement: true,
        floorIndex: 0,
        originalY: -3.0,
        targetY: -3.0
    };

    const basementEdges = new THREE.EdgesGeometry(basementGeo);
    const basementLines = new THREE.LineSegments(basementEdges, edgeMaterial.clone());
    basementMesh.add(basementLines);
    bGroup.add(basementMesh);

    // === FLOORS ===
    for (let f = 0; f < numFloors; f++) {
        const floorY = f * floorHeight;

        unitShapes.forEach((uData, uIdx) => {
            const unitGeo = new THREE.ExtrudeGeometry(uData.shape, extrudeSettings);
            const mat = createFloorMaterial(f);
            const unitMesh = new THREE.Mesh(unitGeo, mat);
            unitMesh.rotation.x = -Math.PI / 2;
            unitMesh.position.y = floorY;
            unitMesh.castShadow = true;
            unitMesh.receiveShadow = true;

            const floorNumber = f + 1;
            const unitNumber = `${floorNumber}0${uIdx + 1}`;
            const zBottom = floorY;
            const zTop = floorY + floorHeight;

            unitMesh.userData = {
                isUnit: true,
                floorNumber,
                unitNumber,
                unitLabel: uData.label,
                zBottom,
                zTop,
                owner: `Owner ${unitNumber}`,
                carpetArea: Math.round((bldgWidth * bldgDepth / 4) * 10.764), // sq ft
                parking: `P-${floorNumber * 4 + uIdx + 1}`,
                hasLien: f === 3 && uIdx === 0,
                originalMaterial: mat.clone(),
                ulpin3d: generate3DUlpin({
                    parcelUlpin2d: ulpin2d,
                    floorNumber,
                    unitNumber,
                    elevationBottomZ: zBottom,
                    elevationTopZ: zTop
                }),
                originalY: floorY,
                floorIndex: f + 1,
                targetY: floorY
            };

            // Edge wireframe
            const edges = new THREE.EdgesGeometry(unitGeo);
            const line = new THREE.LineSegments(edges, edgeMaterial.clone());
            unitMesh.add(line);

            units.push(unitMesh);
            bGroup.add(unitMesh);
        });
    }

    // === ROOF ===
    const roofGeo = new THREE.ExtrudeGeometry(footprintShape, { depth: 0.4, bevelEnabled: false });
    const roofMat = new THREE.MeshStandardMaterial({
        color: 0x1F2937, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide
    });
    const roofMesh = new THREE.Mesh(roofGeo, roofMat);
    roofMesh.rotation.x = -Math.PI / 2;
    roofMesh.position.y = totalHeight;
    roofMesh.castShadow = true;
    roofMesh.userData = {
        floorIndex: numFloors + 1,
        originalY: totalHeight,
        targetY: totalHeight
    };
    const roofEdges = new THREE.EdgesGeometry(roofGeo);
    roofMesh.add(new THREE.LineSegments(roofEdges, edgeMaterial.clone()));
    bGroup.add(roofMesh);

    buildingGroup.add(bGroup);

    // === POSITION CAMERA ===
    const maxBldgDim = Math.max(bldgWidth, bldgDepth, totalHeight);
    const camDist = Math.max(maxBldgDim * 1.8, 30);

    if (controls) {
        controls.target.set(0, totalHeight * 0.4, 0);
        camera.position.set(camDist * 0.7, camDist * 0.6, camDist * 0.8);
        camera.lookAt(controls.target);
        controls.update();
    } else {
        camera.position.set(camDist * 0.7, camDist * 0.6, camDist * 0.8);
        camera.lookAt(0, totalHeight * 0.4, 0);
    }

    // Update air-rights plane position
    airRightsMesh.position.y = totalHeight + 3;

    // === DISPATCH STATS ===
    window.dispatchEvent(new CustomEvent('stats-update', {
        detail: {
            parcels: getBuildingsList().length,
            floors: numFloors,
            units: units.length
        }
    }));

    // Update building info in status bar
    const activeIdEl = document.getElementById('activeParcelId');
    if (activeIdEl) activeIdEl.textContent = ulpin2d;
}

// ──────────────────────────────────────────────────────────
// 8. INITIALIZATION
// ──────────────────────────────────────────────────────────
(async () => {
    try {
        console.log('Scene3D: Loading building data...');
        const buildings = await fetchBuildings();

        if (buildings && buildings.length > 0) {
            // Populate building selector
            populateBuildingSelector(buildings);
            // Render the first building
            renderBuilding(buildings[0]);
        }
    } catch (err) {
        console.error('Scene3D: Critical error during init:', err);
    } finally {
        // Hide loading overlay
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.classList.add('hidden');
        window.dispatchEvent(new CustomEvent('scene-ready'));
        console.log('Scene3D: Ready.');
    }
})();

/**
 * Populate the building selector dropdown in the sidebar
 */
function populateBuildingSelector(buildings) {
    const selector = document.getElementById('buildingSelector');
    if (!selector) return;

    selector.innerHTML = '';
    buildings.forEach((b, i) => {
        const option = document.createElement('option');
        option.value = i;
        const label = b.address || b.parcel_id || b.id || `Building ${i + 1}`;
        const floors = b.total_floors || '?';
        option.textContent = `${label} (${floors}F)`;
        selector.appendChild(option);
    });

    selector.addEventListener('change', (e) => {
        const idx = parseInt(e.target.value);
        currentBuildingIndex = idx;
        const list = getBuildingsList();
        if (list[idx]) renderBuilding(list[idx]);
    });
}

// Building navigation via events
window.addEventListener('navigate-building', (e) => {
    const dir = e.detail; // 'next' or 'prev'
    const list = getBuildingsList();
    if (dir === 'next') {
        currentBuildingIndex = (currentBuildingIndex + 1) % list.length;
    } else {
        currentBuildingIndex = (currentBuildingIndex - 1 + list.length) % list.length;
    }
    renderBuilding(list[currentBuildingIndex]);

    const selector = document.getElementById('buildingSelector');
    if (selector) selector.value = currentBuildingIndex;
});

// ──────────────────────────────────────────────────────────
// 9. RAYCASTING & INTERACTION
// ──────────────────────────────────────────────────────────
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let hoveredUnit = null;
let selectedUnit = null;

function getIntersectedUnit(clientX, clientY) {
    if (!renderer || !renderer.domElement) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(units);
    return intersects.length > 0 ? intersects[0].object : null;
}

export function selectUnitMesh(unitMesh) {
    if (!unitMesh) return;
    // Deselect previous
    if (selectedUnit && selectedUnit !== unitMesh) {
        selectedUnit.material.copy(selectedUnit.userData.originalMaterial);
    }
    selectedUnit = unitMesh;
    selectedUnit.material.copy(materialSelected);

    window.dispatchEvent(new CustomEvent('unit-selected', { detail: selectedUnit.userData }));
}

if (renderer && renderer.domElement) {
    renderer.domElement.addEventListener('click', (e) => {
        const hit = getIntersectedUnit(e.clientX, e.clientY);
        if (hit) selectUnitMesh(hit);
    });

    renderer.domElement.addEventListener('mousemove', (e) => {
        const hit = getIntersectedUnit(e.clientX, e.clientY);
        if (hit) {
            if (hoveredUnit !== hit) {
                if (hoveredUnit && hoveredUnit !== selectedUnit) {
                    hoveredUnit.material.copy(hoveredUnit.userData.originalMaterial);
                }
                hoveredUnit = hit;
                if (hoveredUnit !== selectedUnit) hoveredUnit.material.copy(materialHover);
                renderer.domElement.style.cursor = 'pointer';
            }
        } else {
            if (hoveredUnit && hoveredUnit !== selectedUnit) {
                hoveredUnit.material.copy(hoveredUnit.userData.originalMaterial);
            }
            hoveredUnit = null;
            renderer.domElement.style.cursor = 'grab';
        }
    });

    // Touch support
    let touchStartX = 0, touchStartY = 0;
    renderer.domElement.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        }
    }, { passive: true });

    renderer.domElement.addEventListener('touchend', (e) => {
        if (e.changedTouches.length === 1) {
            const dx = e.changedTouches[0].clientX - touchStartX;
            const dy = e.changedTouches[0].clientY - touchStartY;
            if (Math.hypot(dx, dy) < 10) {
                const hit = getIntersectedUnit(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
                if (hit) selectUnitMesh(hit);
            }
        }
    }, { passive: true });
}

// ──────────────────────────────────────────────────────────
// 10. SEARCH / UNIT SELECTION BY EVENT
// ──────────────────────────────────────────────────────────
window.addEventListener('select-unit', (e) => {
    const targetUlpin = e.detail?.ulpin3d;
    const targetNum = e.detail?.unitNumber;
    const match = units.find(u =>
        (targetUlpin && u.userData.ulpin3d === targetUlpin) ||
        (targetNum && u.userData.unitNumber === targetNum)
    );
    if (match) {
        selectUnitMesh(match);
        const pos = new THREE.Vector3();
        match.getWorldPosition(pos);
        camera.position.set(pos.x + 15, pos.y + 10, pos.z + 15);
        if (controls) {
            controls.target.copy(pos);
            controls.update();
        }
    }
});

// ──────────────────────────────────────────────────────────
// 11. UI EVENT LISTENERS
// ──────────────────────────────────────────────────────────
window.addEventListener('toggle-buildings', (e) => {
    buildingGroup.visible = e.detail;
});

window.addEventListener('toggle-basements', (e) => {
    buildingGroup.children.forEach(bGroup => {
        bGroup.children.forEach(floor => {
            if (floor.userData.isBasement || floor.userData.originalY < 0) {
                floor.visible = e.detail;
            }
        });
    });
});

window.addEventListener('toggle-parcels', (e) => {
    parcelGroup.visible = e.detail;
});

window.addEventListener('toggle-amenities', () => {
    // Amenities layer placeholder
});

window.addEventListener('filter-floors', (e) => {
    const maxFloor = e.detail;
    buildingGroup.children.forEach(bGroup => {
        bGroup.children.forEach(floor => {
            if (floor.userData.floorIndex !== undefined) {
                floor.visible = maxFloor >= 9 || floor.userData.floorIndex <= maxFloor;
            }
        });
    });
});

window.addEventListener('time-change', (e) => {
    const time = e.detail; // 6 to 18
    const angle = ((time - 6) / 12) * Math.PI - (Math.PI / 2);
    const radius = 100;
    dirLight.position.x = radius * Math.sin(angle);
    dirLight.position.y = Math.abs(radius * Math.cos(angle));
    dirLight.position.z = 60;
    dirLight.intensity = Math.max(0.3, Math.cos(angle) * 1.6);

    // Warm sunrise/sunset vs cool midday
    const warmth = 1.0 - Math.abs(time - 12) / 6;
    dirLight.color.setHSL(0.08 + warmth * 0.03, 0.5, 0.7 + warmth * 0.2);
});

window.addEventListener('toggle-air-rights', (e) => {
    airRightsMesh.visible = e.detail;
});

window.addEventListener('balcony-view', () => {
    if (selectedUnit) {
        const box = new THREE.Box3().setFromObject(selectedUnit);
        const center = box.getCenter(new THREE.Vector3());
        camera.position.set(center.x, center.y, center.z + 3);
        if (controls) {
            controls.target.set(center.x + 20, center.y - 3, center.z + 25);
            controls.update();
        }
    }
});

// ──────────────────────────────────────────────────────────
// 12. EXPLODED VIEW
// ──────────────────────────────────────────────────────────
let isExploded = false;
const explodeBtn = document.getElementById('explodeBtn');
const mobileExplodeBtn = document.getElementById('mobileExplodeBtn');

function toggleExplodedView() {
    isExploded = !isExploded;
    const spacing = isExploded ? 4.0 : 0;
    if (explodeBtn) explodeBtn.classList.toggle('active', isExploded);
    if (mobileExplodeBtn) mobileExplodeBtn.classList.toggle('active', isExploded);

    buildingGroup.children.forEach(bGroup => {
        bGroup.children.forEach((floor, idx) => {
            if (floor.userData.originalY !== undefined) {
                floor.userData.targetY = floor.userData.originalY + (idx * spacing);
            }
        });
    });
}

if (explodeBtn) explodeBtn.addEventListener('click', toggleExplodedView);
if (mobileExplodeBtn) mobileExplodeBtn.addEventListener('click', toggleExplodedView);

// ──────────────────────────────────────────────────────────
// 13. CAMERA CONTROLS
// ──────────────────────────────────────────────────────────
const btnOrbit = document.getElementById('btnOrbit');
const btnPan = document.getElementById('btnPan');

if (btnOrbit && btnPan) {
    btnOrbit.addEventListener('click', () => {
        btnOrbit.classList.add('active');
        btnPan.classList.remove('active');
        if (controls) {
            controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
            if (controls.touches) controls.touches.ONE = THREE.TOUCH.ROTATE;
        }
    });
    btnPan.addEventListener('click', () => {
        btnPan.classList.add('active');
        btnOrbit.classList.remove('active');
        if (controls) {
            controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
            if (controls.touches) controls.touches.ONE = THREE.TOUCH.PAN;
        }
    });
}

const btnReset = document.getElementById('btnReset');
if (btnReset) {
    btnReset.addEventListener('click', () => {
        const box = new THREE.Box3().setFromObject(buildingGroup);
        if (!box.isEmpty()) {
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z, 20);
            camera.position.set(maxDim * 0.7, maxDim * 0.6, maxDim * 0.8);
            if (controls) {
                controls.target.copy(center);
                controls.update();
            }
        }
    });
}

// Shake animation on conflict
window.addEventListener('shake-unit', () => {
    if (selectedUnit) {
        const originalX = selectedUnit.position.x;
        let count = 0;
        const interval = setInterval(() => {
            selectedUnit.position.x = originalX + (Math.random() - 0.5) * 1.0;
            count++;
            if (count > 12) {
                clearInterval(interval);
                selectedUnit.position.x = originalX;
            }
        }, 25);
    }
});

// ──────────────────────────────────────────────────────────
// 14. RESIZE
// ──────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (renderer) renderer.setSize(w, h);
    if (composer) composer.setSize(w, h);
});

// ──────────────────────────────────────────────────────────
// 15. ANIMATION LOOP
// ──────────────────────────────────────────────────────────
function animate() {
    requestAnimationFrame(animate);

    // Only update controls if they exist and are not null:
    if (typeof controls !== 'undefined' && controls) {
        controls.update();
    }

    // Smooth Exploded View interpolation
    if (buildingGroup && buildingGroup.children) {
        buildingGroup.children.forEach(bGroup => {
            bGroup.children.forEach(floor => {
                if (floor.userData && floor.userData.targetY !== undefined) {
                    floor.position.y += (floor.userData.targetY - floor.position.y) * 0.1;
                }
            });
        });
    }

    // Safe render call:
    if (typeof composer !== 'undefined' && composer) {
        composer.render();
    } else if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}

// Only start the loop if renderer was successfully created:
if (renderer) {
    animate();
}
