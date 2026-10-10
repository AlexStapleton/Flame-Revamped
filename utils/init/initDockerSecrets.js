const fs = require('fs');
const path = require('path');
const Logger = require('../Logger');
const logger = new Logger();

const SECRET_DIR = '/run/secrets';

// Read Docker secrets: one file per secret in secretDir, named after the
// secret, value trimmed. Subdirectories are skipped and a missing dir yields
// {}. Same behavior as the docker-secret package this replaces (its 2.x
// releases ship babel-jest as a runtime dependency, ~900 packages).
const getSecrets = (secretDir = SECRET_DIR) => {
  const secrets = {};
  if (!fs.existsSync(secretDir)) return secrets;
  for (const file of fs.readdirSync(secretDir)) {
    const fullPath = path.join(secretDir, file);
    if (fs.lstatSync(fullPath).isDirectory()) continue;
    secrets[file] = fs.readFileSync(fullPath, 'utf8').trim();
  }
  return secrets;
};

const initDockerSecrets = (secretDir) => {
  try {
    const secrets = getSecrets(secretDir);

    for (const property in secrets) {
      const upperProperty = property.toUpperCase();

      process.env[upperProperty] = secrets[property];

      logger.log(`${upperProperty} was overwritten with docker secret value`);
    }
  } catch (e) {
    logger.log(`Failed to initialize docker secrets. Error: ${e}`, 'ERROR');
  }
};

initDockerSecrets.getSecrets = getSecrets;

module.exports = initDockerSecrets;
