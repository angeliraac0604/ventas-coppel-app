import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function getAllDetails() {
  const usersSnap = await getDocs(collection(db, 'users'));
  console.log(`\n=== USUARIOS (${usersSnap.size}) ===`);
  usersSnap.docs.forEach((d) => {
    const u = d.data();
    console.log(`- ID: ${d.id} | Email: ${u.email} | Nombre: ${u.fullName || u.full_name} | Rol: ${u.role} | Tienda: ${u.storeId}`);
  });

  const storesSnap = await getDocs(collection(db, 'stores'));
  console.log(`\n=== TIENDAS (${storesSnap.size}) ===`);
  storesSnap.docs.forEach((d) => {
    const s = d.data();
    console.log(`- ID: ${d.id} | Nombre: ${s.name} | Ubicación: ${s.location}`);
  });

  const salesSnap = await getDocs(collection(db, 'sales'));
  console.log(`\n=== VENTAS (${salesSnap.size}) ===`);
  salesSnap.docs.forEach((d, i) => {
    const s = d.data();
    console.log(`[${i + 1}] ID: ${d.id} | Fecha: ${s.date} | Cliente: ${s.customerName} | Factura: ${s.invoiceNumber} | Folio: ${s.transactionFolio} | Marca: ${s.brand} | Precio: $${s.price} | Creador: ${s.createdBy} | Tienda: ${s.storeId}`);
  });
}

getAllDetails().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
