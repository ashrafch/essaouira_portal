import Dexie from "dexie";

const db = new Dexie("essaouira_offline");

db.version(1).stores({
  units: "id",
  bookings: "id",
});

export default db;
