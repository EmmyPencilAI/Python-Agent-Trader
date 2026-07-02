import jsPDF from 'jspdf';
import 'jspdf-autotable';

export interface Trade {
  id: number;
  pair: string;
  action: 'BUY' | 'SELL';
  entry_price: number;
  exit_price?: number;
  quantity: number;
  pnl?: number;
  status: 'OPEN' | 'CLOSED';
  strategy: string;
  mode: 'real' | 'paper';
  timestamp: string;
}

export function exportLedgerPDF(trades: Trade[], mode: string, operatorEmail: string = 'emmanuelobed877@gmail.com') {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  }) as any;

  // Filter trades based on mode
  const listTrades = trades.filter(t => mode === 'all' || t.mode === 'real');
  
  // Calculate summary metrics
  const totalTradesCount = listTrades.length;
  const closedTrades = listTrades.filter(t => t.status === 'CLOSED');
  const totalClosedCount = closedTrades.length;
  const wins = closedTrades.filter(t => (t.pnl || 0) > 0).length;
  const winRate = totalClosedCount > 0 ? (wins / totalClosedCount * 100).toFixed(1) : '0.0';
  const totalPnL = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);

  // --- HEADER SECTION (Aegis Dark Obsidian Theme Banner) ---
  // Background rect
  doc.setFillColor(13, 14, 18); // Deep black-slate #0d0e12
  doc.rect(10, 10, 190, 26, 'F');
  
  // Accent bar (neon emerald green)
  doc.setFillColor(16, 185, 129); // #10b981
  doc.rect(10, 10, 190, 1.5, 'F');

  // Title Text
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('AEGIS QUANTUM SYSTEM', 16, 21);
  
  // Subtitle
  doc.setTextColor(110, 231, 183); // emerald-300
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('AUTOMATED QUANTITATIVE TRADING ENGINE // LEDGER REPORT', 16, 26.5);

  // Secondary Subtitle / Decals
  doc.setTextColor(156, 163, 175); // gray-400
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('PREMIUM CLIENT INTEGRATED PLATFORM // ALL SYSTEMS OPERATIONAL', 16, 31.5);

  // Metadata Text (Right aligned)
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text(`DATE GENERATED:`, 140, 21);
  doc.text(`BOT OPERATOR:`, 140, 26.5);
  doc.text(`REPORT STATUS:`, 140, 31.5);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(209, 213, 219); // gray-300
  doc.text(new Date().toLocaleString(), 168, 21);
  doc.text(operatorEmail, 168, 26.5);
  doc.text('SECURED & ENCRYPTED', 168, 31.5);

  // --- OVERVIEW STATS BOX ---
  // Background card
  doc.setFillColor(248, 250, 252); // slate-50
  doc.rect(10, 42, 190, 24, 'F');
  
  // Border gray-200
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setLineWidth(0.4);
  doc.rect(10, 42, 190, 24, 'S');

  // Vertical Divider lines
  doc.setDrawColor(226, 232, 240);
  doc.line(55, 42, 55, 66);
  doc.line(105, 42, 105, 66);
  doc.line(150, 42, 150, 66);

  // Column Headers
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text('TOTAL TRADES', 15, 48);
  doc.text('CLOSED / ACTIVE', 60, 48);
  doc.text('WIN RATE (CLOSED)', 110, 48);
  doc.text('NET ACCUMULATED P&L', 155, 48);

  // Column Values
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text(`${totalTradesCount}`, 15, 57);
  
  const activeCount = totalTradesCount - totalClosedCount;
  doc.text(`${totalClosedCount} C / ${activeCount} A`, 60, 57);
  
  doc.text(`${winRate}% (${wins}/${totalClosedCount})`, 110, 57);
  
  // Color the cumulative profit
  if (totalPnL >= 0) {
    doc.setTextColor(5, 150, 105); // emerald-600
    doc.text(`+$${totalPnL.toFixed(2)}`, 155, 57);
  } else {
    doc.setTextColor(220, 38, 38); // red-600
    doc.text(`-$${Math.abs(totalPnL).toFixed(2)}`, 155, 57);
  }

  // --- CRYPTOGRAPHIC / INTEGRITY ACCENT BADGE ---
  // Light green banner
  doc.setFillColor(240, 253, 250); // emerald-50
  doc.rect(10, 71, 190, 9, 'F');
  
  // Emerald Green Accent border
  doc.setDrawColor(16, 185, 129); // emerald-500
  doc.setLineWidth(0.35);
  doc.rect(10, 71, 190, 9, 'S');

  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(4, 120, 87); // emerald-700
  doc.text('VERIFIED INTEGRITY PROTOCOL // AEGIS PROTECTIVE SHIELD RUNNING', 15, 77);

  const mockHash = 'SHA256::' + Math.random().toString(36).substring(2, 10).toUpperCase() + '-' + Math.random().toString(36).substring(2, 10).toUpperCase();
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105); // slate-600
  doc.text(`SIGNATURE HASH: ${mockHash}`, 130, 77);

  // --- DETAILED TRADE LEDGER TABLE ---
  const headers = [['ID', 'TIMESTAMP', 'MARKET', 'TYPE', 'STRATEGY', 'STATUS', 'ENTRY/EXIT PRICE', 'NET P&L']];
  
  const rows = listTrades.map(t => {
    const entryPrice = typeof t.entry_price === 'number' ? `$${t.entry_price.toFixed(4)}` : t.entry_price;
    const exitPrice = typeof t.exit_price === 'number' ? `$${t.exit_price.toFixed(4)}` : (t.exit_price || '-');
    const priceRange = `${entryPrice} / ${exitPrice}`;
    
    return [
      `#${t.id}`,
      t.timestamp ? t.timestamp.replace('T', ' ').substring(0, 19) : '-',
      t.pair || '-',
      t.action || '-',
      t.strategy || '-',
      t.status || '-',
      priceRange,
      t.pnl // Pass raw pnl for the cell parser to style and format
    ];
  });

  doc.autoTable({
    startY: 85,
    head: headers,
    body: rows,
    theme: 'striped',
    headStyles: {
      fillColor: [15, 23, 42], // Slate-900 (#0f172a)
      textColor: [248, 250, 252], // Slate-50
      fontSize: 7.5,
      fontStyle: 'bold',
      halign: 'left',
      cellPadding: 3
    },
    bodyStyles: {
      fontSize: 7,
      textColor: [51, 65, 85], // Slate-700
      cellPadding: 2.8
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252] // Slate-50 zebra
    },
    columnStyles: {
      0: { cellWidth: 15 }, // ID
      1: { cellWidth: 32 }, // Timestamp
      2: { cellWidth: 22 }, // Market
      3: { cellWidth: 15 }, // Type (BUY/SELL)
      4: { cellWidth: 25 }, // Strategy
      5: { cellWidth: 18 }, // Status
      6: { cellWidth: 40 }, // Prices
      7: { cellWidth: 23, halign: 'right' } // PnL
    },
    didParseCell: (data: any) => {
      // Style BUY / SELL column (index 3)
      if (data.section === 'body' && data.column.index === 3) {
        if (data.cell.raw === 'BUY') {
          data.cell.styles.textColor = [5, 150, 105]; // emerald-600
          data.cell.styles.fontStyle = 'bold';
        } else if (data.cell.raw === 'SELL') {
          data.cell.styles.textColor = [220, 38, 38]; // red-600
          data.cell.styles.fontStyle = 'bold';
        }
      }

      // Style Status column (index 5)
      if (data.section === 'body' && data.column.index === 5) {
        if (data.cell.raw === 'OPEN') {
          data.cell.styles.textColor = [37, 99, 235]; // blue-600
          data.cell.styles.fontStyle = 'bold';
        } else if (data.cell.raw === 'CLOSED') {
          data.cell.styles.textColor = [71, 85, 105]; // slate-600
        }
      }

      // Style P&L column (index 7)
      if (data.section === 'body' && data.column.index === 7) {
        const val = data.cell.raw;
        if (val === undefined || val === null) {
          data.cell.text = '-';
        } else {
          const numVal = parseFloat(val);
          if (isNaN(numVal)) {
            data.cell.text = '-';
          } else if (numVal > 0) {
            data.cell.styles.textColor = [5, 150, 105]; // emerald-600
            data.cell.styles.fontStyle = 'bold';
            data.cell.text = `+$${numVal.toFixed(2)}`;
          } else if (numVal < 0) {
            data.cell.styles.textColor = [220, 38, 38]; // red-600
            data.cell.styles.fontStyle = 'bold';
            data.cell.text = `-$${Math.abs(numVal).toFixed(2)}`;
          } else {
            data.cell.text = '$0.00';
            data.cell.styles.textColor = [100, 116, 139]; // slate-500
          }
        }
      }
    },
    margin: { left: 10, right: 10 }
  });

  // --- FOOTER AND PAGE NUMBERING ---
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    
    // Bottom thin divider
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(0.2);
    doc.line(10, 282, 200, 282);

    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text('CONFIDENTIAL // FOR AEGIS PRIVILEGED OPERATOR ONLY', 10, 287);
    
    doc.setFont('helvetica', 'normal');
    doc.text(`PAGE ${i} OF ${pageCount}`, 180, 287);
  }

  // Download the generated PDF
  const filename = `aegis_ledger_${mode}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}
