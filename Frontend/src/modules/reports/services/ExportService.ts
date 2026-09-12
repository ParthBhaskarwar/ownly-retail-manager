/**
 * ExportService — Handles multi-format data export:
 * 1. RFC 4180 CSV Export with UTF-8 BOM.
 * 2. Formatted Excel XML / HTML Spreadsheet (.xls) with custom styling and summary rows.
 * 3. Print-optimized reports for physical print / PDF generation.
 */

function escapeCsvField(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export const ExportService = {
  /**
   * Generates and downloads a clean RFC 4180 CSV file with UTF-8 BOM.
   */
  exportToCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]): void {
    if (typeof window === 'undefined') return;

    const headerLine = headers.map(escapeCsvField).join(',');
    const dataLines = rows.map((row) => row.map(escapeCsvField).join(','));
    const csvContent = '\uFEFF' + [headerLine, ...dataLines].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const safeName = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    const a = document.createElement('a');
    a.href = url;
    a.download = safeName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /**
   * Generates and downloads a styled Excel Spreadsheet (.xls XML format).
   * Opens natively in Microsoft Excel, LibreOffice Calc, Apple Numbers, and Google Sheets.
   */
  exportToExcel(
    filename: string,
    sheetName: string,
    headers: string[],
    rows: (string | number | null | undefined)[][],
    summaryRows?: (string | number | null | undefined)[][]
  ): void {
    if (typeof window === 'undefined') return;

    const safeSheet = sheetName.replace(/[\\/*?:[\]]/g, '').slice(0, 31) || 'Report';

    // Build XML Spreadsheet 2003
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:html="http://www.w3.org/TR/REC-html40">
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Alignment ss:Vertical="Center"/>
      <Borders/>
      <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Color="#1C1917"/>
      <Interior/>
      <NumberFormat/>
      <Protection/>
    </Style>
    <Style ss:ID="HeaderStyle">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#2D4A78"/>
      </Borders>
      <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Color="#FFFFFF" ss:Bold="1"/>
      <Interior ss:Color="#3B5B8C" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="SummaryStyle">
      <Alignment ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#3B5B8C"/>
        <Border ss:Position="Bottom" ss:LineStyle="Double" ss:Weight="3" ss:Color="#3B5B8C"/>
      </Borders>
      <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Color="#1C1917" ss:Bold="1"/>
      <Interior ss:Color="#F5F2EF" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="CurrencyStyle">
      <NumberFormat ss:Format="₹#,##0.00"/>
    </Style>
    <Style ss:ID="IntegerStyle">
      <NumberFormat ss:Format="#,##0"/>
    </Style>
  </Styles>
  <Worksheet ss:Name="${safeSheet}">
    <Table ss:DefaultColumnWidth="120" ss:DefaultRowHeight="20">
`;

    // Header Row
    xml += '      <Row ss:StyleID="HeaderStyle" ss:Height="24">\n';
    for (const h of headers) {
      xml += `        <Cell><Data ss:Type="String">${escapeXml(h)}</Data></Cell>\n`;
    }
    xml += '      </Row>\n';

    // Data Rows
    for (const row of rows) {
      xml += '      <Row ss:Height="20">\n';
      for (const val of row) {
        if (typeof val === 'number') {
          xml += `        <Cell><Data ss:Type="Number">${val}</Data></Cell>\n`;
        } else {
          xml += `        <Cell><Data ss:Type="String">${escapeXml(String(val ?? ''))}</Data></Cell>\n`;
        }
      }
      xml += '      </Row>\n';
    }

    // Optional Summary Rows
    if (summaryRows && summaryRows.length > 0) {
      for (const sRow of summaryRows) {
        xml += '      <Row ss:StyleID="SummaryStyle" ss:Height="22">\n';
        for (const val of sRow) {
          if (typeof val === 'number') {
            xml += `        <Cell><Data ss:Type="Number">${val}</Data></Cell>\n`;
          } else {
            xml += `        <Cell><Data ss:Type="String">${escapeXml(String(val ?? ''))}</Data></Cell>\n`;
          }
        }
        xml += '      </Row>\n';
      }
    }

    xml += `    </Table>
  </Worksheet>
</Workbook>`;

    const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const safeName = filename.endsWith('.xls') || filename.endsWith('.xlsx') ? filename : `${filename}.xls`;
    const a = document.createElement('a');
    a.href = url;
    a.download = safeName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /**
   * Triggers browser print dialog for printable export.
   */
  printCurrentView(): void {
    if (typeof window !== 'undefined') {
      window.print();
    }
  },
};

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
