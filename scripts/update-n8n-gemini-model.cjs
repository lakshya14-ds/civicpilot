const path = require('path');
const sqlite3 = require(path.resolve(__dirname, '../.n8n-runtime/node_modules/sqlite3'));

const dbPath = path.resolve(__dirname, '../.n8n-local/.n8n/database.sqlite');
const db = new sqlite3.Database(dbPath);

db.get('SELECT id, nodes FROM workflow_entity WHERE id = ?', ['9Oem6iOlrtVsXXRD'], (err, row) => {
  if (err) {
    console.error('Query error:', err);
    process.exit(1);
  }
  if (!row) {
    console.error('Workflow not found');
    process.exit(1);
  }
  const nodes = JSON.parse(row.nodes);
  const gemini = nodes.find(n => n.name === 'Gemini AI Structured Extraction');
  console.log('Current URL in active workflow:', gemini.parameters.url);
  gemini.parameters.url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent';

  db.run('UPDATE workflow_entity SET nodes = ? WHERE id = ?', [JSON.stringify(nodes), '9Oem6iOlrtVsXXRD'], function(updateErr) {
    if (updateErr) {
      console.error('Update error:', updateErr);
      process.exit(1);
    }
    console.log('Successfully updated active workflow 9Oem6iOlrtVsXXRD to gemini-3.8-flash. Rows affected:', this.changes);
    db.close();
  });
});
