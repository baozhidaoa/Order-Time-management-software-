const { parentPort, workerData } = require("worker_threads");
const StorageManager = require("./storage-manager.js");

const app = {
  getName: () => workerData.appName,
  getPath: (name) => {
    if (name === "documents") return workerData.documentsPath;
    return workerData.userDataPath;
  },
};

async function run() {
  const storageManager = new StorageManager(app);
  const result = await storageManager.rebuildSidecarIndex(
    workerData.storagePath,
    workerData.request,
  );
  parentPort.postMessage({ ok: true, result });
  parentPort.close();
}

run().catch((error) => {
  parentPort.postMessage({
    ok: false,
    error: error?.stack || error?.message || String(error),
  });
  parentPort.close();
});
