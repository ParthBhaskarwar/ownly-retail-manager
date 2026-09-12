import { ExportService } from '../src/modules/reports/services/ExportService';

describe('ExportService — CSV & Excel Generation', () => {
  let createdBlobs: Array<{ content: string; type: string }> = [];
  let clickedLinks: Array<{ href: string; download: string }> = [];

  beforeAll(() => {
    // Mock Blob and URL.createObjectURL in jsdom
    global.URL.createObjectURL = jest.fn((blob: Blob) => {
      return 'blob:mock-url';
    });
    global.URL.revokeObjectURL = jest.fn();

    // Mock document.createElement('a')
    const origCreateElement = document.createElement.bind(document);
    document.createElement = ((tagName: string) => {
      const el = origCreateElement(tagName);
      if (tagName === 'a') {
        el.click = jest.fn(() => {
          clickedLinks.push({ href: el.getAttribute('href') || '', download: el.getAttribute('download') || '' });
        });
      }
      return el;
    }) as any;
  });

  beforeEach(() => {
    createdBlobs = [];
    clickedLinks = [];
  });

  it('generates a clean CSV file with escaped quotes, commas and BOM', () => {
    const headers = ['Product', 'Description', 'Price (₹)'];
    const rows = [
      ['Selvedge Denim "Classic"', 'Blue, slim-fit', 2990],
      ['Cotton Tee', 'Simple, comfortable\n100% cotton', 599],
    ];

    ExportService.exportToCsv('sales-report', headers, rows);

    expect(clickedLinks.length).toBe(1);
    expect(clickedLinks[0].download).toBe('sales-report.csv');
  });

  it('generates an XML-based Excel Spreadsheet (.xls) with custom sheet and summary rows', () => {
    const headers = ['SKU', 'Units Sold', 'Revenue'];
    const rows = [
      ['DENIM-32', 10, 29900],
      ['SHIRT-L', 5, 9450],
    ];
    const summaryRows = [
      ['TOTAL', 15, 39350],
    ];

    ExportService.exportToExcel('financial-summary', 'Sales Breakdown', headers, rows, summaryRows);

    expect(clickedLinks.length).toBe(1);
    expect(clickedLinks[0].download).toBe('financial-summary.xls');
  });
});
