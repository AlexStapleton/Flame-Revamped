const { useDocker, useKubernetes } = require('../controllers/apps/docker');
const loadConfig = require('./loadConfig');

// Sync apps discovered from the Docker / Kubernetes APIs into the database.
// This used to run inline on every public GET /api/apps (an external round-trip
// plus N writes on the hottest read path); it now runs on a schedule and on an
// explicit authenticated request instead. Reads stay pure reads.
const syncApps = async () => {
  const { dockerApps, kubernetesApps } = await loadConfig();

  if (dockerApps) {
    await useDocker();
  }

  if (kubernetesApps) {
    await useKubernetes();
  }
};

module.exports = syncApps;
