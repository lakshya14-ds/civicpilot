const path = require('path');
const sqlite3 = require(path.resolve(__dirname, '../.n8n-runtime/node_modules/sqlite3'));
const db = new sqlite3.Database(path.resolve(__dirname, '../.n8n-local/.n8n/database.sqlite'));

db.get('SELECT id, versionId, activeVersionId FROM workflow_entity WHERE id = ?', ['9Oem6iOlrtVsXXRD'], (err, row) => {
  console.log('Row:', row);
  db.all("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%workflow%'", (err2, tables) => {
    console.log('Tables:', tables);
    if (tables.some(t => t.name === 'workflow_history')) {
      db.all("SELECT versionId, workflowId, createdAt FROM workflow_history WHERE workflowId = ? ORDER BY createdAt DESC", ['9Oem6iOlrtVsXXRD'], (err3, history) => {
        console.log('History:', history);
        db.close();
      });
    } else {
      db.close();
    }
  });
});
