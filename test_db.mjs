import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, limit } from "firebase/firestore";

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

async function check() {
    const q = query(collection(db, 'parcels'), limit(5));
    const snapshot = await getDocs(q);
    snapshot.forEach(doc => {
        console.log("Doc ID:", doc.id);
        const data = doc.data();
        console.log("Keys:", Object.keys(data));
        console.log("Geom:", typeof data.boundary_geojson, data.boundary_geojson?.substring(0, 50));
    });
    process.exit(0);
}

check();
