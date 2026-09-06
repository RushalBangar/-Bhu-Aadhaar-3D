import fs from 'fs';
import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, writeBatch, setDoc } from "firebase/firestore";

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

async function uploadData() {
    console.log("Reading export.geojson...");
    const rawData = fs.readFileSync('./info/export.geojson', 'utf8');
    const geojson = JSON.parse(rawData);
    const features = geojson.features || [];
    
    // Change this index to resume uploading if you hit quota limits (e.g. 19800)
    const startIndex = 19800;
    console.log(`Parsed ${features.length} features. Resuming from index ${startIndex}...`);
    
    let batch = writeBatch(db);
    let count = 0;
    let totalUploaded = 0;

    for (let i = startIndex; i < features.length; i++) {
        const feature = features[i];
        const props = feature.properties || {};
        
        // Handle Amenities
        if (props.amenity) {
            const amenityRef = doc(collection(db, 'amenities'));
            batch.set(amenityRef, {
                amenity_type: props.amenity,
                name: props.name || null,
                location_geojson: JSON.stringify(feature.geometry)
            });
            count++;
        }
        
        // Handle Buildings
        if (props.building) {
            const mockUlpin2d = "14MH" + Math.floor(Math.random() * 10000000000).toString().padStart(10, '0');
            const parcelRef = doc(collection(db, 'parcels'));
            
            batch.set(parcelRef, {
                ulpin_2d: mockUlpin2d,
                survey_number: `S-${Math.floor(Math.random() * 1000)}`,
                state: 'Maharashtra',
                district: 'Pune',
                taluka: 'Pune City',
                village: 'Shivajinagar',
                boundary_geojson: JSON.stringify(feature.geometry)
            });
            count++;

            const buildingRef = doc(collection(db, 'buildings'));
            batch.set(buildingRef, {
                parcel_id: parcelRef.id,
                building_name: props.name || `Building ${parcelRef.id.substring(0,4)}`,
                total_floors: props['building:levels'] ? parseInt(props['building:levels']) : Math.floor(Math.random() * 10) + 2,
                basement_floors: 1,
                height_meters: props.height ? parseFloat(props.height) : (Math.floor(Math.random() * 10) + 2) * 3,
                footprint_geojson: JSON.stringify(feature.geometry)
            });
            count++;
        }

        // Commit batch if it reaches 450 (max is 500)
        if (count >= 450) {
            await batch.commit();
            totalUploaded += count;
            console.log(`Uploaded ${totalUploaded} documents...`);
            batch = writeBatch(db);
            count = 0;
            // Short delay to avoid rate limits on standard tier
            await new Promise(r => setTimeout(r, 100));
        }
    }

    if (count > 0) {
        await batch.commit();
        totalUploaded += count;
    }

    console.log(`Upload complete! Total documents uploaded: ${totalUploaded}`);
    process.exit(0);
}

uploadData().catch(err => {
    console.error("Migration error:", err);
    process.exit(1);
});
