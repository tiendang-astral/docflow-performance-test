/**
 * HTML report helper — wrap k6-reporter cho handleSummary.
 *
 * Dùng trong test file:
 *
 *   import { buildSummary } from '../../lib/report.js';
 *   export const handleSummary = buildSummary('luong-01-smoke');
 *
 * Output: results/luong-01-smoke-2026-05-13T10-30-00.html
 *         + coloured text summary trên stdout
 */

import { htmlReport } from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';

export function buildSummary(testName) {
  return function handleSummary(data) {
    const ts = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    return {
      [`results/${testName}-${ts}.html`]: htmlReport(data),
      [`results/${testName}-${ts}.json`]: JSON.stringify(data),
      stdout: textSummary(data, { indent: ' ', enableColors: true }),
    };
  };
}
