import { generate3DUlpin, fetchAmenities, fetchParcels, fetchBuildings } from './app.js';

// 1. Setup Three.js Scene
const container = document.getElementById('canvas-container') || document.body;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0B0F19); // Rich Dark Navy

const width = container.clientWidth || window.innerWidth;
const height = container.clientHeight || window.innerHeight;

// 2. Camera
const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 2000);
camera.position.set(40, 50, 60);

// 3. Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(width, height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

// 4. Controls
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxPolarAngle = Math.PI / 2 - 0.02;
controls.target.set(0, 10, 0);

// 5. Lighting (Bright & Clear)
const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(100, 150, 100);
scene.add(dirLight);

const secondaryLight = new THREE.DirectionalLight(0x3B82F6, 0.8);
secondaryLight.position.set(-100, 50, -100);
scene.add(secondaryLight);

// 6. Ground Grid
const gridHelper = new THREE.GridHelper(300, 60, 0x3B82F6, 0x1F2937);
gridHelper.position.y = 0;
scene.add(gridHelper);

// 7. Groups & Materials
const buildingGroup = new THREE.Group();
buildingGroup.name = 'buildings';
scene.add(buildingGroup);

const parcelGroup = new THREE.Group();
parcelGroup.name = 'parcels';
scene.add(parcelGroup);

const units = [];

const materialDefault = new THREE.MeshStandardMaterial({
    color: 0x1E40AF,
    transparent: true,
    opacity: 0.8,
    roughness: 0.3,
    metalness: 0.2
});
const materialSelected = new THREE.MeshStandardMaterial({
    color: 0x10B981,
    emissive: 0x10B981,
    emissiveIntensity: 0.8,
    transparent: true,
    opacity: 0.95
});
const materialHover = new THREE.MeshStandardMaterial({
    color: 0x3B82F6,
    transparent: true,
    opacity: 0.9
});

// Scale factor to convert lat/long degrees to Three.js meters
const centerLng = 73.7898;
const centerLat = 19.9975;
const coordScale = 100000;

// Hide Loading Overlay
function hideLoading() {
    const loader = document.getElementById('loading-spinner') || document.querySelector('.loading');
    if (loader) loader.style.display = 'none';
}

// Procedural Fallback Building (Guarantees demo works even if fetch fails)
function createFallbackDemoTower() {
    const bGroup = new THREE.Group();
    const floors = 10;
    const floorH = 3.0;
    const bW = 22;
    const bD = 18;

    for (let f = 1; f <= floors; f++) {
        const y = (f - 1) * floorH;
        const offsets = [
            { num: 1, x: -bW / 4, z: -bD / 4 },
            { num: 2, x:  bW / 4, z: -bD / 4 },
            { num: 3, x: -bW / 4, z:  bD / 4 },
            { num: 4, x:  bW / 4, z:  bD / 4 }
        ];

        offsets.forEach(u => {
            const geo = new THREE.BoxGeometry(bW / 2 - 0.5, floorH - 0.2, bD / 2 - 0.5);
            const mesh = new THREE.Mesh(geo, materialDefault.clone());
            mesh.position.set(u.x, y + floorH / 2, u.z);

            const floorNumber = f;
            const unitNumber = `${f}0${u.num}`;
            const zBottom = y;
            const zTop = y + floorH;

            mesh.userData = {
                isUnit: true,
                floorNumber,
                unitNumber,
                zBottom,
                zTop,
                owner: f % 2 === 0 ? "Ramesh Patil" : "Sunita Deshmukh",
                carpetArea: 780 + (u.num * 30),
                parking: `P-${f * 2 + u.num}`,
                hasLien: f === 4,
                originalMaterial: materialDefault.clone(),
                ulpin3d: generate3DUlpin({
                    parcelUlpin2d: '14MH2704291845',
                    floorNumber,
                    unitNumber,
                    elevationBottomZ: zBottom,
                    elevationTopZ: zTop
                }),
                originalY: y + floorH / 2,
                floorIndex: f,
                targetY: y + floorH / 2
            };

            const edges = new THREE.EdgesGeometry(geo);
            const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x38BDF8 }));
            mesh.add(line);

            units.push(mesh);
            bGroup.add(mesh);
        });
    }

    // Add Basement
    const baseGeo = new THREE.BoxGeometry(bW + 4, 3, bD + 4);
    const baseMesh = new THREE.Mesh(baseGeo, new THREE.MeshStandardMaterial({ color: 0x374151, transparent: true, opacity: 0.6 }));
    baseMesh.position.set(0, -1.5, 0);
    baseMesh.userData = { originalY: -1.5, targetY: -1.5, floorIndex: 0 };
    bGroup.add(baseMesh);

    buildingGroup.add(bGroup);
}

// Main Data Loading & Building Extrusion
(async () => {
    try {
        console.log('Scene3D: Starting data load...');
        
        let parcels = [];
        try { parcels = await fetchParcels(); } catch (e) { console.warn("Fetch parcels failed", e); }

        let buildings = [];
        try { buildings = await fetchBuildings(); } catch (e) { console.warn("Fetch buildings failed", e); }

        // If buildings are empty, check if parcels have building polygons to extrude
        const rawBuildingData = (buildings && buildings.length > 0) ? buildings : parcels;

        if (rawBuildingData && rawBuildingData.length > 0) {
            rawBuildingData.forEach((item, bIdx) => {
                // Accepts BOTH footprint_geojson and boundary_geojson:
                const geom = item.footprint_geojson || item.boundary_geojson;
                if (!geom) return;

                let ring = null;
                if (geom.type === 'Polygon' && geom.coordinates?.length > 0) {
                    ring = geom.coordinates[0];
                } else if (geom.type === 'MultiPolygon' && geom.coordinates?.length > 0) {
                    ring = geom.coordinates[0][0];
                }

                if (!ring || ring.length < 3) return;

                const shape = new THREE.Shape();
                let validCoords = 0;

                ring.forEach((coord, idx) => {
                    if (!coord || isNaN(coord[0]) || isNaN(coord)) return;
                    const x = (coord[0] - centerLng) * coordScale;
                    const z = -(coord - centerLat) * coordScale;
                    
                    if (idx === 0) shape.moveTo(x, -z);
                    else shape.lineTo(x, -z);
                    validCoords++;
                });

                if (validCoords < 3) return;

                let numFloors = parseInt(item.total_floors) || (Math.floor(Math.random() * 4) + 4);
                const floorHeight = 3.0;

                const extrudeSettings = { depth: floorHeight - 0.2, bevelEnabled: false };
                const floorGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
                const bGroup = new THREE.Group();

                for (let i = 0; i < numFloors; i++) {
                    const unitMesh = new THREE.Mesh(floorGeo, materialDefault.clone());
                    unitMesh.rotation.x = -Math.PI / 2;
                    unitMesh.position.y = i * floorHeight;

                    const floorNumber = i + 1;
                    const unitNumber = `${floorNumber}01`;
                    const zBottom = i * floorHeight;
                    const zTop = (i + 1) * floorHeight;

                    unitMesh.userData = {
                        isUnit: true,
                        floorNumber,
                        unitNumber,
                        zTop,
                        zBottom,
                        owner: `Owner ${unitNumber}`,
                        carpetArea: 750,
                        parking: `P-${floorNumber}`,
                        hasLien: false,
                        originalMaterial: materialDefault.clone(),
                        ulpin3d: generate3DUlpin({
                            parcelUlpin2d: item.ulpin_2d || `14MH27${1000 + bIdx}`,
                            floorNumber,
                            unitNumber,
                            elevationBottomZ: zBottom,
                            elevationTopZ: zTop
                        }),
                        originalY: i * floorHeight,
                        floorIndex: i,
                        targetY: i * floorHeight
                    };

                    const edges = new THREE.EdgesGeometry(floorGeo);
                    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x38BDF8 }));
                    unitMesh.add(line);

                    units.push(unitMesh);
                    bGroup.add(unitMesh);
                }
                buildingGroup.add(bGroup);
            });
        }

        // If still no buildings created, load demo tower
        if (units.length === 0) {
            console.log("No GeoJSON buildings in view, loading demo tower...");
            createFallbackDemoTower();
        }

        // Center Camera on Loaded Buildings
        const box = new THREE.Box3().setFromObject(buildingGroup);
        if (!box.isEmpty()) {
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z, 40);

            controls.target.copy(center);
            camera.position.set(center.x + maxDim * 1.2, center.y + maxDim * 1.0, center.z + maxDim * 1.2);
            camera.lookAt(center);
            controls.update();
        }

        // Dispatch updated stats
        let totalFloors = 0;
        buildingGroup.children.forEach(bg => {
            totalFloors = Math.max(totalFloors, bg.children.length);
        });
        window.dispatchEvent(new CustomEvent('stats-update', { 
            detail: { parcels: buildingGroup.children.length, floors: totalFloors, units: units.length } 
        }));

    } catch (err) {
        console.error('Error in Scene3D init:', err);
        if (units.length === 0) createFallbackDemoTower();
    } finally {
        hideLoading();
        console.log('Scene3D: Scene Ready.');
        window.dispatchEvent(new CustomEvent('scene-ready'));
    }
})();

// Raycasting Interaction (Click flat -> Highlight & open inspector)
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let hoveredUnit = null;
let selectedUnit = null;

function getIntersectedUnit(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(units);
    return intersects.length > 0 ? intersects[0].object : null;
}

export function selectUnitMesh(unitMesh) {
    if (!unitMesh) return;
    if (selectedUnit) {
        selectedUnit.material.copy(selectedUnit.userData.originalMaterial);
    }
    selectedUnit = unitMesh;
    selectedUnit.material.copy(materialSelected);

    // Open Property Inspector Panel
    window.dispatchEvent(new CustomEvent('unit-selected', { detail: selectedUnit.userData }));
}

renderer.domElement.addEventListener('click', (e) => {
    const hit = getIntersectedUnit(e.clientX, e.clientY);
    if (hit) selectUnitMesh(hit);
});

renderer.domElement.addEventListener('mousemove', (e) => {
    const hit = getIntersectedUnit(e.clientX, e.clientY);
    if (hit) {
        if (hoveredUnit !== hit) {
            if (hoveredUnit && hoveredUnit !== selectedUnit) hoveredUnit.material.copy(hoveredUnit.userData.originalMaterial);
            hoveredUnit = hit;
            if (hoveredUnit !== selectedUnit) hoveredUnit.material.copy(materialHover);
            renderer.domElement.style.cursor = 'pointer';
        }
    } else {
        if (hoveredUnit && hoveredUnit !== selectedUnit) hoveredUnit.material.copy(hoveredUnit.userData.originalMaterial);
        hoveredUnit = null;
        renderer.domElement.style.cursor = 'grab';
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
        if (Math.hypot(dx, dy) < 10) {
            const hit = getIntersectedUnit(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
            if (hit) selectUnitMesh(hit);
        }
    }
}, { passive: true });

// Select unit by search event
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
        camera.position.set(pos.x + 20, pos.y + 20, pos.z + 20);
        controls.target.copy(pos);
        controls.update();
    } else {
        console.warn('No matching 3D Unit or Parcel found.');
    }
});

// UI Event Listeners for Layer Toggles
window.addEventListener('toggle-buildings', (e) => {
    buildingGroup.visible = e.detail;
});

window.addEventListener('toggle-basements', (e) => {
    buildingGroup.children.forEach(bGroup => {
        bGroup.children.forEach(floor => {
            if (floor.userData.floorIndex === 0 || floor.userData.originalY < 0) {
                floor.visible = e.detail;
            }
        });
    });
});

window.addEventListener('toggle-parcels', (e) => {
    if (parcelGroup) parcelGroup.visible = e.detail;
});

window.addEventListener('toggle-amenities', (e) => {
    if (typeof amenityGroup !== 'undefined' && amenityGroup) amenityGroup.visible = e.detail;
});

window.addEventListener('filter-floors', (e) => {
    const maxFloor = e.detail;
    buildingGroup.children.forEach(bGroup => {
        bGroup.children.forEach(floor => {
            floor.visible = maxFloor === 0 || floor.userData.floorIndex <= maxFloor;
        });
    });
});

let isExploded = false;
const explodeBtn = document.getElementById('explodeBtn');
const mobileExplodeBtn = document.getElementById('mobileExplodeBtn');

function toggleExplodedView() {
    isExploded = !isExploded;
    const spacing = isExploded ? 3.0 : 0;
    if (explodeBtn) explodeBtn.classList.toggle('active', isExploded);
    if (mobileExplodeBtn) mobileExplodeBtn.classList.toggle('active', isExploded);

    buildingGroup.children.forEach(bGroup => {
        bGroup.children.forEach((floor, idx) => {
            floor.userData.targetY = floor.userData.originalY + (idx * spacing);
        });
    });
}
if (explodeBtn) explodeBtn.addEventListener('click', toggleExplodedView);
if (mobileExplodeBtn) mobileExplodeBtn.addEventListener('click', toggleExplodedView);

// Camera Controls (Orbit / Pan / Reset)
const btnOrbit = document.getElementById('btnOrbit');
const btnPan = document.getElementById('btnPan');
if (btnOrbit && btnPan) {
    btnOrbit.addEventListener('click', () => {
        btnOrbit.classList.add('active');
        btnPan.classList.remove('active');
        controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
        if (controls.touches) controls.touches.ONE = THREE.TOUCH.ROTATE;
    });

    btnPan.addEventListener('click', () => {
        btnPan.classList.add('active');
        btnOrbit.classList.remove('active');
        controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
        if (controls.touches) controls.touches.ONE = THREE.TOUCH.PAN;
    });
}

const btnReset = document.getElementById('btnReset');
if (btnReset) {
    btnReset.addEventListener('click', () => {
        const box = new THREE.Box3().setFromObject(buildingGroup);
        if (!box.isEmpty()) {
            const center = box.getCenter(new THREE.Vector3());
            camera.position.set(center.x + 40, center.y + 50, center.z + 60);
            controls.target.copy(center);
            controls.update();
        }
    });
}

// Shake unit on conflict
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

window.addEventListener('resize', () => {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
});

// Animation Render Loop
function animate() {
    requestAnimationFrame(animate);
    controls.update();

    buildingGroup.children.forEach(bGroup => {
        bGroup.children.forEach(floor => {
            if (floor.userData.targetY !== undefined) {
                floor.position.y += (floor.userData.targetY - floor.position.y) * 0.1;
            }
        });
    });

    renderer.render(scene, camera);
}
animate();