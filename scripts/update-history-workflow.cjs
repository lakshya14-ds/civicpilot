const path = require('path');
const sqlite3 = require(path.resolve(__dirname, '../.n8n-runtime/node_modules/sqlite3'));
const db = new sqlite3.Database(path.resolve(__dirname, '../.n8n-local/.n8n/database.sqlite'));

db.get('SELECT nodes FROM workflow_history WHERE versionId = ?', ['5becabc8-4a41-44b6-b9c4-47285db6835f'], (err, row) => {
  if (err || !row) {
    console.error('History record not found:', err);
    process.exit(1);
  }
  const nodes = JSON.parse(row.nodes);
  const gemini = nodes.find(n => n.name === 'Gemini AI Structured Extraction');
  console.log('Old URL in workflow_history:', gemini.parameters.url);
  gemini.parameters.url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent';

  db.run('UPDATE workflow_history SET nodes = ? WHERE versionId = ?', [JSON.stringify(nodes), '5becabc8-4a41-44b6-b9c4-47285db6835f'], function(updateErr) {
    if (updateErr) {
      console.error('Update error:', updateErr);
      process.exit(1);
    }
    console.log('Successfully updated workflow_history nodes to gemini-3.8-flash! Rows affected:', this.changes);
    db.close();
  });
});
