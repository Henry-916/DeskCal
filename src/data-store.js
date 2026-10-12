const fs = require('node:fs');
const path = require('node:path');
const DataModel = require('./data-model');

const DEFAULT_BACKUP_INTERVAL_MS = 10 * 60 * 1000;

function saveStore(dataPath, data, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const backupIntervalMs =
    typeof options.backupIntervalMs === 'number'
      ? options.backupIntervalMs
      : DEFAULT_BACKUP_INTERVAL_MS;
  const shouldBackup = options.backup !== false;

  const serialized = JSON.stringify(data, null, 2);

  fs.mkdirSync(path.dirname(dataPath), { recursive: true });

  const bakPath = `${dataPath}.bak`;
  if (shouldBackup && fs.existsSync(dataPath)) {
    let doBackup = false;
    if (!fs.existsSync(bakPath)) {
      doBackup = true;
    } else {
      try {
        const bakStat = fs.statSync(bakPath);
        if (now.getTime() - bakStat.mtimeMs >= backupIntervalMs) {
          doBackup = true;
        }
      } catch {
        doBackup = true;
      }
    }

    if (doBackup) {
      fs.copyFileSync(dataPath, bakPath);
      fs.utimesSync(bakPath, now, now);
    }
  }

  const tempPath = `${dataPath}.tmp`;
  fs.writeFileSync(tempPath, serialized, 'utf8');

  try {
    fs.renameSync(tempPath, dataPath);
  } catch (err) {
    if (err.code === 'EPERM' || err.code === 'EBUSY' || err.code === 'EACCES') {
      fs.copyFileSync(tempPath, dataPath);
      fs.unlinkSync(tempPath);
    } else {
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch {
        // Ignore unlink error on failure
      }
      throw err;
    }
  }
}

function parseStoreFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return { exists: false, valid: false, content: null };
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { exists: true, valid: false, content: null };
    }
    return { exists: true, valid: true, content: parsed };
  } catch {
    return { exists: true, valid: false, content: null };
  }
}

function loadStore(dataPath, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const bakPath = `${dataPath}.bak`;

  const mainStatus = parseStoreFile(dataPath);
  const bakStatus = parseStoreFile(bakPath);

  let source = 'default';
  let corruptPath = null;
  let rawData = null;

  if (mainStatus.exists && mainStatus.valid) {
    source = 'main';
    rawData = mainStatus.content;
    const migrated = DataModel.migrateData(rawData, now);
    if (
      rawData.schemaVersion !== DataModel.SCHEMA_VERSION ||
      JSON.stringify(rawData) !== JSON.stringify(migrated)
    ) {
      saveStore(dataPath, migrated, { ...options, now });
    }
    return { data: migrated, source, corruptPath: null };
  }

  if (mainStatus.exists && !mainStatus.valid) {
    corruptPath = `${dataPath}.corrupt-${now.getTime()}`;
    fs.copyFileSync(dataPath, corruptPath);
  }

  if (bakStatus.exists && bakStatus.valid) {
    source = 'backup';
    rawData = bakStatus.content;
  } else {
    source = 'default';
    rawData = DataModel.DEFAULT_DATA;
  }

  const migrated = DataModel.migrateData(rawData, now);
  saveStore(dataPath, migrated, { ...options, now, backup: false });

  return { data: migrated, source, corruptPath };
}

module.exports = {
  saveStore,
  loadStore
};
