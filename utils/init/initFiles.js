const createFile = require('./createFile');
const { files } = require('./initialFiles.json');

const initFiles = async () => {
  for (const file of files) {
    await createFile(file);
  }
};

module.exports = initFiles;
