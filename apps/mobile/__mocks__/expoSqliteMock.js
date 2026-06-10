// Minimal stub of expo-sqlite for the `services` Jest project. db/client.ts
// imports `drizzle-orm/expo-sqlite` (which pulls in expo-sqlite) at module load;
// services tests that need only CREATE_SQL/MIGRATIONS never open a real DB, so an
// empty shim is sufficient to let the module graph resolve under babel-jest.
module.exports = {
  openDatabaseSync: () => ({
    execSync: () => {},
    runSync: () => {},
    getAllSync: () => [],
    getFirstSync: () => null,
  }),
}
