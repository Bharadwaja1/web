const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

async function writeTestReport(file, suite, rows, metadata = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Mood Tunes automated testing';
  workbook.created = new Date();
  const summary = workbook.addWorksheet('Summary');
  const counts = rows.reduce((out, row) => {
    const key = row.status || 'Not Run'; out[key] = (out[key] || 0) + 1; return out;
  }, {});
  summary.addRows([
    ['Test suite', suite], ['Generated at', new Date().toISOString()],
    ['Total cases', rows.length], ...Object.entries(counts).map(([key, value]) => [key, value]),
    ...Object.entries(metadata).map(([key, value]) => [key, String(value)])
  ]);
  summary.columns = [{ width: 28 }, { width: 80 }];
  summary.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  summary.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF173B57' } };

  const details = workbook.addWorksheet('Test Details', { views: [{ state: 'frozen', ySplit: 1 }] });
  details.columns = [
    ['Execution Date', 22], ['Test Case ID', 16], ['Module', 22], ['Test Description', 52],
    ['Expected Result', 55], ['Priority', 14], ['Status', 14], ['Preconditions', 38],
    ['Test Steps', 70], ['Actual Result', 55], ['Duration ms', 14], ['Error', 65]
  ].map(([header, width]) => ({ header, key: header.toLowerCase().replaceAll(' ', '_'), width }));
  for (const row of rows) details.addRow({
    execution_date: row.executionDate || new Date().toISOString().replace('T', ' ').slice(0, 19),
    test_case_id: row.id, module: row.category, test_description: row.title,
    expected_result: row.expected, priority: row.priority || 'Medium', status: String(row.status || 'Not Run').toUpperCase(),
    preconditions: row.preconditions, test_steps: Array.isArray(row.steps) ? row.steps.join('\n') : row.steps,
    actual_result: row.actual || '',
    duration_ms: row.durationMs ?? '', error: row.error || ''
  });
  details.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  details.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF173B57' } };
  details.autoFilter = { from: 'A1', to: 'L1' };
  details.eachRow((row, index) => {
    if (index <= 1) return;
    row.alignment = { vertical: 'top', wrapText: true };
    const status = String(row.getCell(7).value || '').toUpperCase();
    const colors = { PASSED: 'FFC6EFCE', FAILED: 'FFFFC7CE', ERROR: 'FFFFC7CE', SKIPPED: 'FFFFEB9C', PLANNED: 'FFDDEBF7', 'NOT RUN': 'FFDDEBF7' };
    row.getCell(7).font = { bold: true };
    if (colors[status]) row.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors[status] } };
  });
  await workbook.xlsx.writeFile(file);

  const htmlFile = file.replace(/\.xlsx$/i, '.html');
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
  const statusClass = status => String(status || 'Not Run').toLowerCase().replace(/[^a-z]+/g, '-');
  const metadataRows = Object.entries(metadata)
    .map(([key, value]) => `<tr><th>${escape(key)}</th><td>${escape(value)}</td></tr>`).join('');
  const detailRows = rows.map(row => `<tr>
    <td>${escape(row.id)}</td><td>${escape(row.category)}</td><td>${escape(row.title)}</td>
    <td>${escape(row.priority || 'Medium')}</td><td class="status ${statusClass(row.status)}">${escape(row.status || 'Not Run')}</td>
    <td>${escape(row.expected)}</td><td>${escape(row.actual)}</td><td>${escape(row.durationMs ?? '')}</td><td>${escape(row.error)}</td>
  </tr>`).join('');
  const countCards = Object.entries(counts)
    .map(([key, value]) => `<div class="card"><strong>${escape(value)}</strong><span>${escape(key)}</span></div>`).join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escape(suite)} report</title><style>
  :root{font-family:Inter,system-ui,sans-serif;color:#152536;background:#f4f7fa}body{margin:0;padding:2rem}main{max-width:1500px;margin:auto}
  h1{margin-bottom:.25rem}.muted{color:#607080}.cards{display:flex;gap:1rem;flex-wrap:wrap;margin:1.5rem 0}.card{background:white;border-radius:10px;padding:1rem 1.5rem;box-shadow:0 2px 10px #18334d18}.card strong{font-size:1.6rem;display:block}.card span{color:#607080}
  .table-wrap{overflow:auto;background:white;border-radius:10px;box-shadow:0 2px 10px #18334d18;margin:1.5rem 0}table{border-collapse:collapse;width:100%;font-size:.88rem}th,td{text-align:left;padding:.7rem;border-bottom:1px solid #e5ebf0;vertical-align:top}thead th{position:sticky;top:0;background:#173b57;color:white}.status{font-weight:700}.passed{color:#15723b}.failed,.error{color:#b42318}.skipped{color:#8a5a00}
  .metadata{max-width:850px}.metadata th{width:220px;background:#edf3f7}</style></head><body><main>
  <h1>${escape(suite)}</h1><p class="muted">Generated ${escape(new Date().toISOString())} · ${rows.length} executed cases</p>
  <section class="cards"><div class="card"><strong>${rows.length}</strong><span>Total</span></div>${countCards}</section>
  <div class="table-wrap metadata"><table><tbody>${metadataRows}</tbody></table></div>
  <div class="table-wrap"><table><thead><tr><th>ID</th><th>Module</th><th>Description</th><th>Priority</th><th>Status</th><th>Expected</th><th>Actual</th><th>ms</th><th>Error</th></tr></thead><tbody>${detailRows}</tbody></table></div>
  </main></body></html>`;
  fs.writeFileSync(htmlFile, html);
}

module.exports = { writeTestReport };
