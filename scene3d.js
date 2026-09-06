import { generate3DUlpin, fetchAmenities, fetchParcels, fetchBuildings } from './app.js';

// Setup Three.js Scene
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0B0F19);

const width = container.clientWidth || window.innerWidth;
const height = container.clientHeight || window.innerHeight;

// Camera
const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
camera.position.set(30, 40, 50);

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(width, height);
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

// Post-Processing (Bloom)
const renderScene = new THREE.RenderPass(scene, camera);
const bloomPass = new THREE.UnrealBloomPass(
    new THREE.Vector2(width, height),
    0.8,  // strength (reduced to avoid over-bloom)
    0.4,  // radius
    0.9   // threshold
);
const composer = new THREE.EffectComposer(renderer);
composer.addPass(renderScene);
composer.addPass(bloomPass);

// Controls
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxPolarAngle = Math.PI / 2 - 0.05;
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(50, 100, 50);
scene.add(dirLight);

// Ground Plane
const gridHelper = new THREE.GridHelper(200, 50, 0x161F30, 0x161F30);
scene.add(gridHelper);

const groundGeo = new THREE.PlaneGeometry(200, 200);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x0B0F19, depthWrite: false });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// --- Procedural Building Generation ---
const buildingGroup = new THREE.Group();
scene.add(buildingGroup);

const units = [];

const materialDefault = new THREE.MeshStandardMaterial({
    color: 0x2563EB,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide
});
const materialSelected = new THREE.MeshStandardMaterial({
    color: 0x10B981,
    emissive: 0x10B981,
    emissiveIntensity: 1.5,
    transparent: true,
    opacity: 0.9
});
const materialHover = new THREE.MeshStandardMaterial({
    color: 0x2563EB,
    transparent: true,
    opacity: 0.7
});

buildingGroup.name = 'buildings';

// --- Real-world Data Integration ---
const centerLng = 73.7898;
const centerLat = 19.9975;
const coordScale = 100000;

// Groups to toggle visibility
let parcelGroup = null;
let amenityGroup = null;

window.addEventListener('DOMContentLoaded', async () => {
    try {
        // --- Load Parcels ---
        const parcels = await fetchParcels();
        parcelGroup = new THREE.Group();
        parcelGroup.name = 'parcels';
        scene.add(parcelGroup);

        const lineMat = new THREE.LineBasicMaterial({ color: 0x3B82F6, opacity: 0.8, transparent: true, linewidth: 2 });

        parcels.forEach(parcel => {
            const geom = parcel.boundary_geojson;
            if (!geom) return;

            if (geom.type === 'Polygon') {
                geom.coordinates.forEach(ring => {
                    const points = [];
                    ring.forEach(coord => {
                        const x = (coord[0] - centerLng) * coordScale;
                        const z = -(coord[1] - centerLat) * coordScale;
                        points.push(new THREE.Vector3(x, 0.05, z));
                    });
                    const isNearby = points.some(pt => Math.abs(pt.x) < 300 && Math.abs(pt.z) < 300);
                    if (isNearby) {
                        const geometry = new THREE.BufferGeometry().setFromPoints(points);
                        const line = new THREE.LineLoop(geometry, lineMat);
                        parcelGroup.add(line);
                    }
                });
            } else if (geom.type === 'Point') {
                const x = (geom.coordinates[0] - centerLng) * coordScale;
                const z = -(geom.coordinates[1] - centerLat) * coordScale;
                if (Math.abs(x) < 300 && Math.abs(z) < 300) {
                    const dotGeo = new THREE.CircleGeometry(0.8, 12);
                    const dotMat = new THREE.MeshBasicMaterial({ color: 0x3B82F6, opacity: 0.7, transparent: true });
                    const dot = new THREE.Mesh(dotGeo, dotMat);
                    dot.rotation.x = -Math.PI / 2;
                    dot.position.set(x, 0.05, z);
                    parcelGroup.add(dot);
                }
            }
        });

        window.dispatchEvent(new CustomEvent('stats-update', { detail: { parcels: parcels.length } }));

        // --- Load Buildings ---
        const buildings = await fetchBuildings();
        buildings.forEach(building => {
            const geom = building.footprint_geojson;
            if (!geom || geom.type !== 'Polygon') return;

            const ring = geom.coordinates[0];
            if (!ring || ring.length < 3) return;

            const shape = new THREE.Shape();
            let isNearby = false;

            ring.forEach((coord, index) => {
                if (!coord || isNaN(coord[0]) || isNaN(coord[1])) return;
                const x = (coord[0] - centerLng) * coordScale;
                const y = (coord[1] - centerLat) * coordScale;
                if (Math.abs(x) < 1000 && Math.abs(y) < 1000) isNearby = true;
                if (index === 0) shape.moveTo(x, y);
                else shape.lineTo(x, y);
            });

            if (!isNearby || shape.getPoints().length < 3) return;

            let numFloors = parseInt(building.total_floors);
            if (isNaN(numFloors) || numFloors < 1) {
                numFloors = Math.floor(Math.random() * 5) + 2;
            }

            let totalHeight = parseFloat(building.height_meters);
            if (isNaN(totalHeight) || totalHeight <= 0) {
                totalHeight = numFloors * 3;
            }

            const floorHeight = totalHeight / numFloors;
            const validDepth = Math.max(0.1, floorHeight - 0.2);

            const extrudeSettings = { depth: validDepth, bevelEnabled: false };
            const floorGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
            
            const bGroup = new THREE.Group();

            for (let i = 0; i < numFloors; i++) {
                const unitMesh = new THREE.Mesh(floorGeo, materialDefault.clone());
                unitMesh.rotation.x = -Math.PI / 2;
                unitMesh.position.y = i * floorHeight;

                const floorNumber = i + 1;
                const unitNumber = `${i + 1}01`;
                const zTop = (i + 1) * floorHeight;
                const zBottom = i * floorHeight;

                unitMesh.userData = {
                    isUnit: true,
                    floorNumber,
                    unitNumber,
                    zTop,
                    zBottom,
                    owner: `Resident ${unitNumber}`,
                    carpetArea: 800,
                    parking: `P-${floorNumber}`,
                    hasLien: Math.random() > 0.8,
                    originalMaterial: materialDefault.clone(),
                    ulpin3d: generate3DUlpin({
                        parcelUlpin2d: building.parcel_id || 'UNKNOWN',
                        floorNumber,
                        unitNumber,
                        elevationBottomZ: zBottom,
                        elevationTopZ: zTop
                    }),
                    originalY: i * floorHeight,
                    floorIndex: i,
                    targetY: i * floorHeight // for explode view
                };

                const edges = new THREE.EdgesGeometry(floorGeo);
                const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.8 }));
                line.visible = false;
                unitMesh.userData.edges = line;
                unitMesh.add(line);

                units.push(unitMesh);
                bGroup.add(unitMesh);
            }
            buildingGroup.add(bGroup);
        });

        // --- Load Amenities ---
        const amenities = await fetchAmenities();
        amenityGroup = new THREE.Group();
        amenityGroup.name = 'amenities';
        scene.add(amenityGroup);

        const waterMaterial = new THREE.MeshStandardMaterial({
            color: 0x38BDF8,
            emissive: 0x0284C7,
            emissiveIntensity: 0.5,
            roughness: 0.2,
            metalness: 0.8
        });
        const sphereGeo = new THREE.SphereGeometry(1.2, 16, 16);

        amenities.forEach(amenity => {
            if (amenity.location_geojson && amenity.location_geojson.type === 'Point') {
                const [lng, lat] = amenity.location_geojson.coordinates;
                const x = (lng - centerLng) * coordScale;
                const z = -(lat - centerLat) * coordScale;

                if (Math.abs(x) < 250 && Math.abs(z) < 250) {
                    const marker = new THREE.Mesh(sphereGeo, waterMaterial);
                    marker.position.set(x, 1.2, z);

                    marker.userData = {
                        isAmenity: true,
                        owner: amenity.name || 'Public Civic Facility',
                        carpetArea: 0,
                        parking: 'N/A',
                        hasLien: false,
                        ulpin3d: `AMENITY-${(amenity.amenity_type || 'CIVIC').toUpperCase()}`,
                        originalMaterial: waterMaterial.clone()
                    };

                    amenityGroup.add(marker);
                    units.push(marker);
                }
            }
        });

        window.dispatchEvent(new CustomEvent('stats-update', { detail: { amenities: amenities.length } }));

    } catch (err) {
        console.error('Error loading data:', err);
    }

    // Signal scene is ready (after all data loaded)
    window.dispatchEvent(new CustomEvent('scene-ready'));
});

// --- Interaction / Raycasting ---
const raycaster = new THREE.Raycaster();
let hoveredUnit = null;
let selectedUnit = null;

function getIntersectedUnit(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
    const intersects = raycaster.intersectObjects(units);
    return intersects.length > 0 ? intersects[0].object : null;
}

export function selectUnitMesh(unitMesh) {
    if (!unitMesh) return;
    if (selectedUnit) {
        selectedUnit.material.copy(selectedUnit.userData.originalMaterial);
        if (selectedUnit.userData.edges) selectedUnit.userData.edges.visible = false;
    }
    selectedUnit = unitMesh;
    selectedUnit.material.copy(materialSelected);
    if (selectedUnit.userData.edges) selectedUnit.userData.edges.visible = true;

    window.dispatchEvent(new CustomEvent('unit-selected', { detail: selectedUnit.userData }));
}

container.addEventListener('mousemove', (event) => {
    const hit = getIntersectedUnit(event.clientX, event.clientY);
    if (hit) {
        if (hoveredUnit !== hit) {
            if (hoveredUnit && hoveredUnit !== selectedUnit) {
                hoveredUnit.material.copy(hoveredUnit.userData.originalMaterial);
                if (hoveredUnit.userData.edges) hoveredUnit.userData.edges.visible = false;
            }
            hoveredUnit = hit;
            if (hoveredUnit !== selectedUnit) {
                hoveredUnit.material.copy(materialHover);
                if (hoveredUnit.userData.edges) hoveredUnit.userData.edges.visible = true;
            }
            container.style.cursor = 'pointer';
        }
    } else {
        if (hoveredUnit && hoveredUnit !== selectedUnit) {
            hoveredUnit.material.copy(hoveredUnit.userData.originalMaterial);
            if (hoveredUnit.userData.edges) hoveredUnit.userData.edges.visible = false;
        }
        hoveredUnit = null;
        container.style.cursor = 'grab';
    }
});

renderer.domElement.addEventListener('click', (event) => {
    const hit = getIntersectedUnit(event.clientX, event.clientY);
    if (hit) {
        selectUnitMesh(hit);
    }
});

// Touch tap selection for mobile devices
let touchStartX = 0;
let touchStartY = 0;
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
        // Clean tap with minimal drift (< 10px)
        if (Math.hypot(dx, dy) < 10) {
            const hit = getIntersectedUnit(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
            if (hit) {
                selectUnitMesh(hit);
            }
        }
    }
}, { passive: true });

// Select unit by search event
window.addEventListener('select-unit', (e) => {
    const targetUlpin = e.detail.ulpin3d;
    const targetNum = e.detail.unitNumber;
    const match = units.find(u => 
        (targetUlpin && u.userData.ulpin3d === targetUlpin) ||
        (targetNum && u.userData.unitNumber === targetNum)
    );
    if (match) {
        selectUnitMesh(match);
        // Move camera to selected unit
        const pos = new THREE.Vector3();
        match.getWorldPosition(pos);
        camera.position.set(pos.x + 20, pos.y + 20, pos.z + 20);
        controls.target.copy(pos);
        controls.update();
    } else {
        alert('No matching 3D Unit or Parcel found.');
    }
});

// --- UI Filter Listeners ---
window.addEventListener('toggle-basements', (e) => {
    buildingGroup.children.forEach(bGroup => {
        bGroup.children.forEach(floor => {
            if (floor.userData.originalY === 0) {
                floor.visible = e.detail;
            }
        });
    });
});

window.addEventListener('toggle-buildings', (e) => {
    buildingGroup.visible = e.detail;
});

window.addEventListener('toggle-parcels', (e) => {
    if (parcelGroup) parcelGroup.visible = e.detail;
});

window.addEventListener('toggle-amenities', (e) => {
    if (amenityGroup) amenityGroup.visible = e.detail;
});

window.addEventListener('filter-floors', (e) => {
    const maxFloor = e.detail;
    buildingGroup.children.forEach(bGroup => {
        bGroup.children.forEach(floor => {
            floor.visible = floor.userData.floorIndex <= maxFloor;
        });
    });
});

// --- Window Resize ---
window.addEventListener('resize', () => {
    const newWidth = container.clientWidth || window.innerWidth;
    const newHeight = container.clientHeight || window.innerHeight;
    camera.aspect = newWidth / newHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(newWidth, newHeight);
    composer.setSize(newWidth, newHeight);
});

// --- Exploded View Animation ---
let isExploded = false;
const explodeBtn = document.getElementById('explodeBtn');
const mobileExplodeBtn = document.getElementById('mobileExplodeBtn');

function toggleExplodedView() {
    isExploded = !isExploded;
    const targetSpacing = isExploded ? 2.5 : 0;
    
    if (explodeBtn) explodeBtn.classList.toggle('active', isExploded);
    if (mobileExplodeBtn) mobileExplodeBtn.classList.toggle('active', isExploded);

    buildingGroup.children.forEach(bGroup => {
        bGroup.children.forEach((floor, index) => {
            const targetY = floor.userData.originalY + (index * targetSpacing);
            floor.userData.targetY = targetY;
        });
    });
}

if (explodeBtn) explodeBtn.addEventListener('click', toggleExplodedView);
if (mobileExplodeBtn) mobileExplodeBtn.addEventListener('click', toggleExplodedView);

// --- Camera Controls ---
const btnOrbit = document.getElementById('btnOrbit');
const btnPan = document.getElementById('btnPan');
const btnReset = document.getElementById('btnReset');

if (btnOrbit && btnPan) {
    btnOrbit.addEventListener('click', () => {
        btnOrbit.classList.add('active');
        btnPan.classList.remove('active');
        controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
        controls.touches.ONE = THREE.TOUCH.ROTATE;
    });

    btnPan.addEventListener('click', () => {
        btnPan.classList.add('active');
        btnOrbit.classList.remove('active');
        controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
        controls.touches.ONE = THREE.TOUCH.PAN;
    });
}

btnReset.addEventListener('click', () => {
    camera.position.set(30, 40, 50);
    controls.target.set(0, 15, 0);
    controls.update();
});

// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);
    controls.update();

    // Exploded view interpolation
    buildingGroup.children.forEach(bGroup => {
        bGroup.children.forEach(floor => {
            if (floor.userData.targetY !== undefined) {
                floor.position.y += (floor.userData.targetY - floor.position.y) * 0.1;
            }
        });
    });

    composer.render();
}

animate();

// Helper to shake geometry on conflict
window.addEventListener('shake-unit', () => {
    if (selectedUnit) {
        const originalX = selectedUnit.position.x;
        let count = 0;
        const interval = setInterval(() => {
            selectedUnit.position.x = originalX + (Math.random() - 0.5) * 1.5;
            count++;
            if (count > 10) {
                clearInterval(interval);
                selectedUnit.position.x = originalX;
            }
        }, 30);
    }
});
