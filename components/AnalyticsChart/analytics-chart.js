document.addEventListener('DOMContentLoaded', function () {
  const panels = document.querySelectorAll('.analytics-root');
  panels.forEach(function (panel) {
    const fillNodes = panel.querySelectorAll('.analytics-fill');
    fillNodes.forEach(function (fillNode) {
      const width = fillNode.style.width || '0%';
      fillNode.style.width = '0%';
      requestAnimationFrame(function () {
        fillNode.style.transition = 'width 0.5s ease';
        fillNode.style.width = width;
      });
    });
  });

  function buildReportCsv() {
    const rows = Array.isArray(window.analyticsData) ? window.analyticsData : [];
    const header = ['Date', 'Time', 'Student', 'Roll No', 'College', 'Branch', 'Year', 'Section', 'Status'];
    const csvRows = [header.join(',')];

    rows.forEach(function (record) {
      const line = [
        record && record.Date ? record.Date : '',
        record && record.Time ? record.Time : '',
        record && record.sname ? record.sname : '',
        record && record.rno ? record.rno : '',
        record && record.clg ? record.clg : '',
        record && record.brch ? record.brch : '',
        record && record.year ? record.year : '',
        record && record.sec ? record.sec : '',
        record && record.status ? record.status : '',
      ].map(function (value) {
        const normalized = String(value).replace(/"/g, '""');
        return '"' + normalized + '"';
      });
      csvRows.push(line.join(','));
    });

    return csvRows.join('\n');
  }

  const exportButtons = document.querySelectorAll('.analytics-export-btn');
  exportButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      const exportType = button.dataset.export || 'csv';

      if (exportType === 'print') {
        window.print();
        return;
      }

      const csvContent = buildReportCsv();
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'gbr-summary-report.csv';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    });
  });
});
