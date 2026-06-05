const SCHEMA_VERSION = 1;

// Validate a parsed backup envelope. Pure — no I/O. Returns { ok: true } or
// { ok: false, error }.
const validateBackup = (obj) => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, error: 'Not a valid Flame backup file.' };
  }
  if (obj.flameBackup !== true) {
    return { ok: false, error: 'This file is not a Flame backup.' };
  }
  if (obj.schemaVersion !== SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Unsupported backup version (${obj.schemaVersion}). This Flame expects version ${SCHEMA_VERSION}.`,
    };
  }
  if (!obj.data || typeof obj.data !== 'object' || Array.isArray(obj.data)) {
    return { ok: false, error: 'Backup is missing its data section.' };
  }
  for (const key of ['apps', 'categories', 'bookmarks']) {
    if (obj.data[key] !== undefined && !Array.isArray(obj.data[key])) {
      return { ok: false, error: `Backup field "${key}" must be a list.` };
    }
  }
  return { ok: true };
};

module.exports = { SCHEMA_VERSION, validateBackup };
