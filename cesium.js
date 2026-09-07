import { generate3DUlpin } from './app.js';

// Initialize Cesium
Cesium.Ion.defaultAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6InVIZEhIWl9hRGRRSTR1Yi0iLCJqdGkiOiI1ZTBkZDE3NS0wMWM4LTQ5MzEtODc1Ny1kMDQzMzQ0YmNhZWMiLCJpZCI6NDgyNjg5LCJpc3MiOiJodHRwczovL2FwaS5jZXNpdW0uY29tIiwiYXVkIjoidW5kZWZpbmVkX2RlZmF1bHQiLCJpYXQiOjE3ODg3ODkzODd9.l1Q3r70LMXErOTN31T_h2nVOmrEtwaVgR4uTOTOo-I8";

// Wait for DOM to be ready, since we inject it via module
let viewer;

export function initCesium() {
    if (viewer) return; // Already initialized

    viewer = new Cesium.Viewer('cesiumContainer', {
        terrain: Cesium.Terrain.fromWorldTerrain(), // Use the new API for terrain
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        infoBox: false,
        sceneModePicker: false,
        selectionIndicator: false,
        navigationHelpButton: false,
        animation: false,
        timeline: false,
        fullscreenButton: false,
    });

    // Load OSM Buildings
    async function addBuildings() {
        try {
            const buildingsTileset = await Cesium.createOsmBuildingsAsync();
            viewer.scene.primitives.add(buildingsTileset);
        } catch (error) {
            console.error("Error loading OSM buildings:", error);
        }
    }
    addBuildings();

    // Set initial position immediately
    viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(73.7898, 19.9975, 800), // Longitude, Latitude, Height
        orientation: {
            heading: Cesium.Math.toRadians(0.0),
            pitch: Cesium.Math.toRadians(-45.0),
            roll: 0.0
        }
    });
}

export function flyToBuilding() {
    if (!viewer) return;
    viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(73.7898, 19.9975, 800),
        orientation: {
            heading: Cesium.Math.toRadians(0.0),
            pitch: Cesium.Math.toRadians(-45.0),
            roll: 0.0
        },
        duration: 1.5
    });
}
