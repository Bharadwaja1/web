const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const source = path.resolve(process.env.K6_SUMMARY || 'test-results/k6-summary.json');
const target = path.resolve(process.env.LOAD_REPORT || 'FINAL REPORTS/Load_Test_Report.xlsx');
const data = JSON.parse(fs.readFileSync(source, 'utf8'));
const metric = name => data.metrics?.[name]?.values || {};
const duration = metric('http_req_duration');
const requests = metric('http_reqs');
const failed = metric('http_req_failed');
const checks = metric('checks');
const durationSeconds = Number(data.state?.testRunDurationMs || 60000) / 1000;

const wb = new ExcelJS.Workbook();
const summary = wb.addWorksheet('Summary');
summary.addRows([
  ['Baseline load-test result', 'Value'], ['Virtual users', 100], ['Configured duration', '1 minute'],
  ['Total requests', requests.count || 0], ['Requests/second', requests.rate || 0],
  ['Average response time (ms)', duration.avg || 0], ['Minimum response time (ms)', duration.min || 0],
  ['Maximum response time (ms)', duration.max || 0], ['p(95) response time (ms)', duration['p(95)'] || 0],
  ['Failed request rate', failed.rate || 0], ['Check success rate', checks.rate || 0], ['Measured duration (seconds)', durationSeconds]
]);
summary.columns = [{ width: 36 }, { width: 24 }];
summary.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
summary.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF173B57' } };
const details = wb.addWorksheet('Metric Details');
details.columns = [{ header: 'Metric', key: 'metric', width: 34 }, { header: 'Statistic', key: 'stat', width: 24 }, { header: 'Value', key: 'value', width: 24 }];
for (const [name, body] of Object.entries(data.metrics || {})) for (const [stat, value] of Object.entries(body.values || {})) details.addRow({ metric: name, stat, value });
details.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
details.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF173B57' } };
fs.mkdirSync(path.dirname(target), { recursive: true });
const htmlTarget = target.replace(/\.xlsx$/i, '.html');
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const summaryRows = [
  ['Virtual users', 100], ['Configured duration', '1 minute'], ['Total requests', requests.count || 0],
  ['Requests/second', requests.rate || 0], ['Average response time (ms)', duration.avg || 0],
  ['p(95) response time (ms)', duration['p(95)'] || 0], ['Failed request rate', failed.rate || 0],
  ['Check success rate', checks.rate || 0], ['Measured duration (seconds)', durationSeconds]
];
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Load Test Report</title><style>body{font:15px system-ui;background:#f4f7fa;color:#152536;padding:2rem}main{max-width:1000px;margin:auto}table{border-collapse:collapse;width:100%;background:#fff}th,td{padding:.75rem;border-bottom:1px solid #dce4ea;text-align:left}th{background:#173b57;color:#fff}</style></head><body><main><h1>Load Test Report</h1><p>Generated ${new Date().toISOString()}</p><table><thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody>${summaryRows.map(([name,value]) => `<tr><td>${escape(name)}</td><td>${escape(value)}</td></tr>`).join('')}</tbody></table></main></body></html>`;
wb.xlsx.writeFile(target).then(() => {
  fs.writeFileSync(htmlTarget, html);
  console.log(`Load reports: ${target}, ${htmlTarget}`);
});
