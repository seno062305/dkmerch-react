import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { QRCodeSVG } from 'qrcode.react';
import { useConfirm } from '../context/ConfirmContext';
import { useNotification } from '../context/NotificationContext';
import DkIcon, { DK_ICONS } from '../components/DkIcon';
import AdminPager, { fixedPageStyle } from './AdminPager';
import OrderStatusLegend from './OrderStatusLegend';
import { isLbcOrder } from '../utils/deliveryUtils';
import { formatOrderShortId } from '../utils/orderId';
import useBodyScrollLock from '../hooks/useBodyScrollLock';
import { getOverlayRoot } from '../utils/scrollLock';
import { validateImageFile, IMAGE_ACCEPT_NO_GIF } from '../utils/imageUpload';
import './AdminOrders.css';

const SITE_URL = 'https://dkmerchwebsite.vercel.app';

const toDateStr = (ms) => new Date(ms).toISOString().split('T')[0];
const today     = toDateStr(Date.now());

const getPaymentMethodLabel = (order) => {
  const raw = (order.paymentMethod || '').toLowerCase();
  if (raw === 'gcash' || raw.includes('gcash'))   return { label: 'GCash', brand: 'gcash', color: '#007fff' };
  if (raw === 'maya'  || raw.includes('maya') || raw.includes('paymaya')) return { label: 'Maya', brand: 'maya', color: '#00b4aa' };
  if (raw === 'card'  || raw.includes('card'))    return { label: 'Card', icon: 'fa-credit-card', color: '#6366f1' };
  if (raw === 'cash' || raw.includes('cash'))     return { label: 'Cash', icon: 'fa-money-bill-wave', color: '#059669' };
  if (raw.includes('paymongo') || raw.includes('online')) return { label: 'GCash / Maya', brands: ['gcash', 'maya'], color: '#6b7280' };
  return { label: order.paymentMethod || '—', icon: 'fa-money-bill', color: '#9ca3af' };
};

const isWalkInOrder = (o) =>
  !!o?.isWalkIn || String(o?.deliveryMethod || '').toLowerCase() === 'store';

const isPlaceholderWalkInEmail = (email) =>
  /walkin@dkmerch\.local/i.test(String(email || '').trim());

const REFUND_METHOD_LABELS = {
  gcash: { label: 'GCash', brand: 'gcash', color: '#007fff' },
  maya:  { label: 'Maya',  brand: 'maya',  color: '#00b4aa' },
};

const PaymentMethodMark = ({ pm, size = 18 }) => {
  if (!pm) return null;
  if (pm.brand) {
    return <img src={`/images/payments/${pm.brand}.svg`} alt={pm.label} style={{ width: size, height: size, borderRadius: 4, objectFit: 'cover', verticalAlign: 'middle' }} />;
  }
  if (pm.brands?.length) {
    return (
      <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
        {pm.brands.map((b) => (
          <img key={b} src={`/images/payments/${b}.svg`} alt={b} style={{ width: size, height: size, borderRadius: 4, objectFit: 'cover' }} />
        ))}
      </span>
    );
  }
  if (pm.icon) return <i className={`fas ${pm.icon}`} />;
  return null;
};

/** Bulk waybill: many lines → category summary; otherwise full product names. */
const WAYBILL_BULK_ITEM_THRESHOLD = 4;

function getWaybillItemRows(items = []) {
  const list = Array.isArray(items) ? items : [];
  if (list.length > WAYBILL_BULK_ITEM_THRESHOLD) {
    const byCat = {};
    list.forEach((item) => {
      const cat = String(item.category || item.group || 'Other').trim() || 'Other';
      if (!byCat[cat]) {
        byCat[cat] = { name: cat, quantity: 0, price: 0, subtotal: 0, isCategory: true };
      }
      const qty = Number(item.quantity) || 1;
      byCat[cat].quantity += qty;
      byCat[cat].subtotal += (Number(item.price) || 0) * qty;
    });
    return Object.values(byCat).map((row) => ({
      ...row,
      price: row.quantity ? row.subtotal / row.quantity : 0,
    }));
  }
  return list.map((item) => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.price) || 0;
    return {
      name: String(item.name || item.title || 'N/A').trim() || 'N/A',
      quantity: qty,
      price,
      subtotal: qty * price,
      isCategory: false,
    };
  });
}

/* ══════════════════════════════════════
   WAYBILL MODAL
══════════════════════════════════════ */
const WaybillModal = ({ order, onClose }) => {
  const { showNotification } = useNotification();
  const [printing, setPrinting] = useState(false);
  const products = useQuery(api.products.getAllProducts) || [];
  const enrichedItems = useMemo(() => {
    return (order?.items || []).map((item) => {
      if (item.category) return item;
      const full = products.find(
        (p) => String(p._id) === String(item.id) || String(p.id) === String(item.id)
      );
      return full?.category ? { ...item, category: full.category } : item;
    });
  }, [order?.items, products]);
  const waybillRows = useMemo(() => getWaybillItemRows(enrichedItems), [enrichedItems]);
  const isBulkWaybill = enrichedItems.length > WAYBILL_BULK_ITEM_THRESHOLD;

  const subtotal    = order.subtotal    || 0;
  const shippingFee = order.shippingFee || 0;
  const discount    = order.discountAmount || 0;
  const finalTotal  = order.finalTotal  ?? ((order.total || 0) - discount);
  const hasPromo    = !!(order.promoCode && discount > 0);

  // Same scannable link for preview + print (order-accurate; screen scans allowed)
  const trackOrderLink = `${SITE_URL}/track-order?order=${order.orderId}`;
  const shortId = formatOrderShortId(order);

  const esc = (v) => String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  /** High-res crisp PNG QR for thermal print (pure black modules). */
  const makePrintQrDataUrl = async (value, size = 512) => {
    const wrap = document.createElement('div');
    wrap.style.cssText = `position:fixed;left:0;top:0;width:${size}px;height:${size}px;opacity:0;pointer-events:none;z-index:-1;background:#fff;`;
    document.body.appendChild(wrap);
    const root = createRoot(wrap);
    await new Promise((resolve) => {
      root.render(
        <QRCodeSVG value={value} size={size} level="M" includeMargin={true} fgColor="#000000" bgColor="#ffffff" />
      );
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
    const svg = wrap.querySelector('svg');
    if (!svg) {
      root.unmount();
      wrap.remove();
      throw new Error('QR render failed');
    }
    if (!svg.getAttribute('xmlns')) svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const xml = new XMLSerializer().serializeToString(svg);
    const svgUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = svgUrl;
    });
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, 0, 0, size, size);
    const dataUrl = c.toDataURL('image/png');
    root.unmount();
    wrap.remove();
    return dataUrl;
  };

  /** Original colored HTML waybill + embedded PNG QR → Print dialog (matches on-screen layout). */
  const handlePrint = async () => {
    if (printing) return;
    setPrinting(true);
    let printWindow = null;
    try {
      // Open on click so popup blockers stay happy, then fill in the label + QR.
      printWindow = window.open('', '_blank', 'width=480,height=720');
      if (!printWindow) {
        showNotification('Pop-up blocked! Please allow pop-ups for this site.', 'error');
        return;
      }
      printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Preparing…</title>
<style>body{font-family:Arial,sans-serif;padding:24px;color:#334155;background:#f1f5f9}</style>
</head><body><p><strong>Preparing waybill…</strong></p></body></html>`);
      printWindow.document.close();

      const qrPng = await makePrintQrDataUrl(trackOrderLink, 512);
      if (!qrPng?.startsWith('data:image/png')) {
        throw new Error('QR PNG missing');
      }

      const rows = getWaybillItemRows(enrichedItems);
      const bulk = enrichedItems.length > WAYBILL_BULK_ITEM_THRESHOLD;
      const itemsHtml = rows.map((item, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td class="wb-item-name">${esc(item.name)}</td>
          <td class="td-center">${esc(item.quantity)}</td>
          <td class="td-right">₱${Number(item.price || 0).toLocaleString('en-PH')}</td>
          <td class="td-right wb-accent">₱${Number(item.subtotal || 0).toLocaleString('en-PH')}</td>
        </tr>`).join('');

      const riderHtml = order.riderInfo?.name ? `
        <div class="wb-block">
          <div class="wb-sec-lbl">Rider</div>
          <div class="wb-rider-line">${esc(order.riderInfo.name)}${order.riderInfo.phone ? ` · ${esc(order.riderInfo.phone)}` : ''}${order.riderInfo.plate ? ` · ${esc(order.riderInfo.plate)}` : ''}</div>
        </div>` : '';

      const promoHtml = hasPromo
        ? `<div class="wb-totals-row wb-promo-row"><span>Promo (${esc(order.promoCode)})</span><strong>−₱${Number(discount).toLocaleString('en-PH')}</strong></div>`
        : '';

      printWindow.document.open();
      printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Waybill — ${shortId} | DKMerch</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  @page { size: 100mm 150mm; margin: 0; }
  html, body {
    width: 100mm; height: 150mm; margin: 0; padding: 0;
    font-family: Arial, Helvetica, sans-serif; background: #fff; overflow: hidden;
    color: #000; -webkit-font-smoothing: none; font-smooth: never;
  }
  .wb-screen-bar {
    display: none; position: sticky; top: 0; z-index: 10;
    align-items: center; justify-content: space-between; gap: 12px;
    padding: 10px 14px; background: #fff; border-bottom: 1px solid #e2e8f0;
    font-family: Arial, sans-serif; -webkit-font-smoothing: antialiased;
  }
  .wb-screen-bar p { margin: 0; font-size: 12px; color: #64748b; line-height: 1.35; }
  .wb-screen-bar strong { color: #0f172a; }
  .wb-print-again {
    flex-shrink: 0; border: none; border-radius: 8px; cursor: pointer;
    background: #fc1268; color: #fff; font-weight: 700; font-size: 13px;
    padding: 10px 16px;
  }
  .wb-print-again:hover { background: #e0105c; }
  .waybill-print-root {
    width: 100mm; height: 150mm; max-height: 150mm; margin: 0; background: #fff;
    padding: 3.2mm; display: flex; flex-direction: column; gap: 2mm;
    overflow: hidden;
  }
  .wb-header { display: flex; justify-content: space-between; align-items: center; gap: 2mm; padding-bottom: 1.8mm; border-bottom: 2px solid #000; flex-shrink: 0; }
  .wb-brand-name { font-size: 16pt; font-weight: 900; color: #fc1268; line-height: 1; }
  .wb-brand-sub { font-size: 7.5pt; color: #333; font-weight: 700; margin-top: 0.6mm; }
  .wb-brand-contact { font-size: 6.5pt; color: #444; margin-top: 0.4mm; font-weight: 600; }
  .wb-qr-block { display: flex; flex-direction: column; align-items: center; gap: 1mm; flex-shrink: 0; }
  .wb-qr-block img {
    width: 22mm; height: 22mm; display: block;
    image-rendering: -webkit-optimize-contrast; image-rendering: crisp-edges; image-rendering: pixelated;
  }
  .wb-qr-label { font-size: 6.5pt; color: #000; font-weight: 900; text-transform: uppercase; letter-spacing: 0.3px; }
  .wb-block { flex-shrink: 0; }
  .wb-sec-lbl { font-size: 6.5pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.3px; color: #000; margin-bottom: 0.8mm; }
  .wb-cols { display: grid; grid-template-columns: 0.85fr 1.15fr; gap: 3mm; flex-shrink: 0; padding-bottom: 1.5mm; border-bottom: 1px solid #000; }
  .wb-field-lbl { font-size: 6pt; color: #333; font-weight: 800; text-transform: uppercase; }
  .wb-field-val { font-size: 8pt; color: #000; font-weight: 700; line-height: 1.3; word-break: break-word; white-space: normal; }
  .wb-accent { color: #fc1268; font-weight: 900; }
  .wb-rider-line { font-size: 8pt; font-weight: 700; line-height: 1.3; }
  .wb-items-box { flex: 1 1 auto; min-height: 0; overflow: visible; }
  .wb-items-hd { font-size: 6.5pt; font-weight: 900; text-transform: uppercase; padding-bottom: 0.8mm; }
  .wb-items-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .wb-items-table th { padding: 0.8mm 1mm; text-align: left; font-size: 6.5pt; font-weight: 800; color: #000; border-bottom: 1px solid #000; }
  .wb-items-table td { padding: 1mm; font-size: 7.5pt; color: #000; font-weight: 600; border-bottom: 0.5px solid #ccc; vertical-align: top; }
  .wb-item-name { font-weight: 700; white-space: normal; word-break: break-word; overflow-wrap: anywhere; line-height: 1.25; }
  .wb-items-table th:nth-child(1), .wb-items-table td:nth-child(1) { width: 6%; }
  .wb-items-table th:nth-child(2), .wb-items-table td:nth-child(2) { width: 48%; }
  .wb-items-table th:nth-child(3), .wb-items-table td:nth-child(3) { width: 10%; }
  .wb-items-table th:nth-child(4), .wb-items-table td:nth-child(4) { width: 16%; }
  .wb-items-table th:nth-child(5), .wb-items-table td:nth-child(5) { width: 20%; }
  .td-right { text-align: right; font-weight: 800; }
  .td-center { text-align: center; }
  .wb-totals { flex-shrink: 0; border-top: 1px solid #000; padding-top: 1mm; }
  .wb-totals-row { display: flex; justify-content: space-between; padding: 0.6mm 0; font-size: 8pt; font-weight: 700; color: #000; }
  .wb-grand { font-size: 10pt; font-weight: 900; color: #fc1268 !important; border-top: 1px solid #000; margin-top: 0.6mm; padding-top: 1mm; }
  .wb-promo-row { color: #000; font-weight: 800; }
  .wb-footer { text-align: center; font-size: 6.5pt; color: #000; font-weight: 700; border-top: 1px solid #000; padding-top: 1.2mm; line-height: 1.35; flex-shrink: 0; }
  @media screen {
    html, body { width: auto; height: auto; min-height: 100%; overflow: auto; background: #e2e8f0; -webkit-font-smoothing: antialiased; }
    .wb-screen-bar { display: flex; }
    .wb-screen-wrap { padding: 14px; display: flex; justify-content: center; }
    .waybill-print-root { box-shadow: 0 8px 28px rgba(15,23,42,0.14); border: 1px solid #cbd5e1; }
  }
  @media print {
    .wb-screen-bar { display: none !important; }
    .wb-screen-wrap { display: block !important; padding: 0 !important; margin: 0 !important; }
    html, body {
      width: 100mm !important; height: 150mm !important; margin: 0 !important; padding: 0 !important;
      overflow: hidden !important; background: #fff !important; color: #000 !important;
      -webkit-font-smoothing: none !important; font-smooth: never !important;
    }
    .waybill-print-root {
      display: flex !important;
      width: 100mm !important; height: 150mm !important; max-height: 150mm !important;
      margin: 0 !important; box-shadow: none !important; border: none !important;
      page-break-after: avoid; page-break-inside: avoid; break-inside: avoid;
    }
    .wb-brand-name, .wb-accent, .wb-grand, .wb-grand strong, .wb-footer strong { color: #000 !important; }
    .wb-qr-block img { image-rendering: crisp-edges !important; }
  }
</style></head><body>
<div class="wb-screen-bar">
  <p><strong>Label preview</strong> · 100 × 150 mm<br/>Cancel print to review, then press Print again for settings.</p>
  <button type="button" class="wb-print-again" onclick="goPrint()">🖨 Print</button>
</div>
<div class="wb-screen-wrap">
<div class="waybill-print-root">
  <div class="wb-header">
    <div>
      <div class="wb-brand-name">DKMerch</div>
      <div class="wb-brand-sub">K-Pop Paradise</div>
      <div class="wb-brand-contact">Manila, Philippines · support@dkmerch.com</div>
    </div>
    <div class="wb-qr-block">
      <img id="wb-qr" src="${qrPng}" alt="Waybill QR" width="512" height="512" />
      <div class="wb-qr-label">Scan / Track</div>
    </div>
  </div>
  <div class="wb-cols">
    <div class="wb-block">
      <div class="wb-sec-lbl">From</div>
      <div class="wb-field-val wb-accent">DKMerch</div>
      <div class="wb-field-val">Manila, Philippines</div>
      <div class="wb-field-val">support@dkmerch.com</div>
    </div>
    <div class="wb-block">
      <div class="wb-sec-lbl">To</div>
      <div class="wb-field-val wb-accent" style="font-family:Courier New,monospace">#${esc(shortId)}</div>
      <div class="wb-field-val" style="font-weight:900">${esc(order.customerName || 'N/A')}</div>
      <div class="wb-field-val">${esc(order.phone || 'N/A')}</div>
      <div class="wb-field-val">${esc(order.shippingAddress || 'N/A')}</div>
    </div>
  </div>
  ${riderHtml}
  <div class="wb-items-box">
    <div class="wb-items-hd">${bulk ? `Items by category (${rows.length})` : `Order items (${rows.length})`}</div>
    <table class="wb-items-table">
      <thead><tr><th>#</th><th>${bulk ? 'Category' : 'Item'}</th><th class="td-center">Qty</th><th class="td-right">Unit</th><th class="td-right">Subtotal</th></tr></thead>
      <tbody>${itemsHtml}</tbody>
    </table>
  </div>
  <div class="wb-totals">
    <div class="wb-totals-row"><span>Subtotal</span><strong>₱${Number(subtotal).toLocaleString('en-PH')}</strong></div>
    <div class="wb-totals-row"><span>Shipping</span><strong>${isLbcOrder(order) ? 'LBC · arrange with customer' : shippingFee === 0 ? 'FREE' : `₱${Number(shippingFee).toLocaleString('en-PH')}`}</strong></div>
    ${promoHtml}
    <div class="wb-totals-row wb-grand"><span>${hasPromo ? 'Total Charged' : 'Total'}</span><strong>₱${Number(finalTotal).toLocaleString('en-PH')}</strong></div>
  </div>
  <div class="wb-footer">
    <strong class="wb-accent">DKMerch</strong> · Order #${esc(shortId)} · ${esc(new Date().toLocaleDateString('en-PH'))}
  </div>
</div>
</div>
<script>
  function goPrint() {
    try { window.focus(); window.print(); } catch (e) {}
  }
  function readyPrint() {
    setTimeout(goPrint, 200);
  }
  var img = document.getElementById('wb-qr');
  if (!img || img.complete) readyPrint();
  else { img.onload = readyPrint; img.onerror = readyPrint; }
<\/script>
</body></html>`);
      printWindow.document.close();
    } catch (err) {
      console.error('Waybill print failed:', err);
      try { printWindow?.close(); } catch (_) { /* ignore */ }
      showNotification('Failed to open waybill print. Please try again.', 'error');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="waybill-overlay" onClick={onClose}>
      <div className="waybill-modal" onClick={e => e.stopPropagation()}>
        <div className="waybill-toolbar">
          <div>
            <div className="waybill-toolbar-title"><i className="fas fa-print"></i> Print Waybill — #{shortId}</div>
            <div className="waybill-size-hint">
              Size: <strong>100 × 150 mm</strong> · Same order QR on screen &amp; print · Color / B&amp;W in Print dialog
            </div>
          </div>
          <div className="waybill-toolbar-actions">
            <button className="waybill-print-btn" onClick={handlePrint} disabled={printing}>
              {printing
                ? <><i className="fas fa-spinner fa-spin"></i> Preparing…</>
                : <><i className="fas fa-print"></i> Print</>}
            </button>
            <button className="close-btn" onClick={onClose}><i className="fas fa-times"></i></button>
          </div>
        </div>
        <div className="waybill-preview-wrap">
          <div className="wb-size-hint">Label preview · 100mm × 150mm</div>
          <div className="waybill-print-root">
            <div className="wb-header">
              <div>
                <div className="wb-brand-name">DKMerch</div>
                <div className="wb-brand-sub">K-Pop Paradise</div>
                <div className="wb-brand-contact">Manila, Philippines · support@dkmerch.com</div>
              </div>
              <div className="wb-qr-block">
                <QRCodeSVG value={trackOrderLink} size={88} level="M" includeMargin={true} fgColor="#000000" bgColor="#ffffff" />
                <div className="wb-qr-label">Scan / Track</div>
              </div>
            </div>
            <div className="wb-cols">
              <div className="wb-block">
                <div className="wb-sec-lbl">From</div>
                <div className="wb-field-val" style={{ fontWeight: 800, color: '#fc1268' }}>DKMerch</div>
                <div className="wb-field-val">Manila, Philippines</div>
                <div className="wb-field-val">support@dkmerch.com</div>
              </div>
              <div className="wb-block wb-to">
                <div className="wb-sec-lbl">To</div>
                <div className="wb-field-val" style={{ fontFamily: 'Courier New, monospace', fontWeight: 800, color: '#fc1268' }}>#{shortId}</div>
                <div className="wb-field-val" style={{ fontWeight: 800 }}>{order.customerName || 'N/A'}</div>
                <div className="wb-field-val">{order.phone || 'N/A'}</div>
                <div className="wb-field-val">{order.shippingAddress || 'N/A'}</div>
              </div>
            </div>
            {order.riderInfo?.name && (
              <div className="wb-block">
                <div className="wb-sec-lbl">Rider</div>
                <div className="wb-rider-line">
                  {order.riderInfo.name}
                  {order.riderInfo.phone ? ` · ${order.riderInfo.phone}` : ''}
                  {order.riderInfo.plate ? ` · ${order.riderInfo.plate}` : ''}
                </div>
              </div>
            )}
            <div className="wb-items-box">
              <div className="wb-items-hd">
                {isBulkWaybill
                  ? `Items by category (${waybillRows.length})`
                  : `Order items (${waybillRows.length})`}
              </div>
              <table className="wb-items-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{isBulkWaybill ? 'Category' : 'Item'}</th>
                    <th className="td-center">Qty</th>
                    <th className="td-right">Unit</th>
                    <th className="td-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {waybillRows.map((item, idx) => (
                    <tr key={idx}>
                      <td style={{ color: '#9ca3af' }}>{idx + 1}</td>
                      <td className="wb-item-name">{item.name}</td>
                      <td className="td-center">{item.quantity}</td>
                      <td className="td-right">₱{(item.price || 0).toLocaleString('en-PH')}</td>
                      <td className="td-right" style={{ color: '#fc1268' }}>₱{(item.subtotal || 0).toLocaleString('en-PH')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="wb-totals">
              <div className="wb-totals-row"><span>Subtotal</span><strong>₱{subtotal.toLocaleString('en-PH')}</strong></div>
              <div className="wb-totals-row"><span>Shipping</span><strong>{isLbcOrder(order) ? 'LBC · arrange with customer' : shippingFee === 0 ? 'FREE' : `₱${shippingFee.toLocaleString('en-PH')}`}</strong></div>
              {hasPromo && <div className="wb-totals-row wb-promo-row"><span>Promo ({order.promoCode})</span><strong>−₱{discount.toLocaleString('en-PH')}</strong></div>}
              <div className="wb-totals-row wb-grand"><span>{hasPromo ? 'Total Charged' : 'Total'}</span><strong>₱{finalTotal.toLocaleString('en-PH')}</strong></div>
            </div>
            <div className="wb-footer">
              <strong style={{ color: '#fc1268' }}>DKMerch</strong> · Order #{shortId} · {new Date().toLocaleDateString('en-PH')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ══════════════════════════════════════
   MAIN ADMIN ORDERS
══════════════════════════════════════ */
const ORDER_PAGE_SIZE = 10;
const SIDE_CARD_PAGE_SIZE = 5;

const AdminOrders = () => {
  const { confirm } = useConfirm();
  const { showNotification } = useNotification();
  const [activeTab,     setActiveTab]     = useState('all');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [searchTerm,    setSearchTerm]    = useState('');
  const [statusFilter,  setStatusFilter]  = useState('all');
  const [startDate,     setStartDate]     = useState('');
  const [endDate,       setEndDate]       = useState('');
  const [page,          setPage]          = useState(0);
  const [sidePage,      setSidePage]      = useState(0);

  const orders = useQuery(api.orders.getAllOrders) || [];
  const storeSettings = useQuery(api.settings.getSettings);
  const storePin = { storeLat: storeSettings?.storeLat, storeLng: storeSettings?.storeLng };
  const updateOrderStatusMutation = useMutation(api.orders.updateOrderStatus);
  const updateOrderFieldsMutation = useMutation(api.orders.updateOrderFields);
  const approveLbcDeliveryMutation = useMutation(api.orders.approveLbcDelivery);
  const markLbcShippedMutation = useMutation(api.orders.markLbcShipped);
  const generateChatUploadUrl = useMutation(api.supportChat.generateChatUploadUrl);
  const resolveRefundMutation     = useMutation(api.orders.resolveRefund);
  const rejectCustomerCancelMutation = useMutation(api.orders.rejectCustomerCancel);
  const approveCustomerCancelAction  = useAction(api.payments.approveCustomerCancel);
  const adminCancelOrderAction       = useAction(api.payments.adminCancelOrder);
  const approveDamageRefundAction    = useAction(api.payments.approveDamageRefund);
  const [acceptingLbcId, setAcceptingLbcId] = useState(null);
  const [lbcApproveOrder, setLbcApproveOrder] = useState(null);
  const [lbcApprovePhoto, setLbcApprovePhoto] = useState('');
  const lbcProofInputRef = useRef(null);
  const [showWalkInModal, setShowWalkInModal] = useState(false);
  const createWalkInOrderMutation = useMutation(api.orders.createWalkInOrder);

  const validOrders = orders.filter(o => o.orderId && o.items?.length > 0);

  const orderTimeMs = (o) =>
    o._creationTime || new Date(o.createdAt || 0).getTime() || 0;

  /** Prefer store order number when both have it; else creation time (FIFO). */
  const cmpFifo = (a, b) => {
    const aSeq = Number(a.orderSeq) || 0;
    const bSeq = Number(b.orderSeq) || 0;
    if (aSeq > 0 && bSeq > 0) return aSeq - bSeq;
    return orderTimeMs(a) - orderTimeMs(b);
  };

  const paidTimeMs = (o) => {
    if (o.paidAt) {
      const t = new Date(o.paidAt).getTime();
      if (!Number.isNaN(t)) return t;
    }
    return orderTimeMs(o);
  };

  const isPendingStatus = (o) => {
    const st = String(o.orderStatus || 'pending').toLowerCase();
    return !o.orderStatus || st === 'pending';
  };

  const isProcessingStatus = (o) =>
    String(o.orderStatus || '').toLowerCase() === 'confirmed';

  const isShippedStatus = (o) => {
    const st = String(o.orderStatus || '').toLowerCase();
    return st === 'shipped' || st === 'out_for_delivery';
  };

  const isCancelledStatus = (o) =>
    String(o.orderStatus || '').toLowerCase() === 'cancelled';

  const isFailedDelivery = (o) =>
    String(o.status || '').toLowerCase().includes('failed');

  /** Rider + LBC successful deliveries (orderStatus completed / Delivered). */
  const isCompletedStatus = (o) => {
    if (isCancelledStatus(o) || isFailedDelivery(o)) return false;
    const os = String(o.orderStatus || '').toLowerCase();
    const st = String(o.status || '').toLowerCase();
    return os === 'completed' || st === 'delivered' || st === 'completed';
  };

  const hasRefundRequest = (o) => o.refundStatus === 'requested';
  const isRefundResolved = (o) =>
    o.refundStatus === 'approved' || o.refundStatus === 'rejected';
  const hasAnyRefund = (o) => !!o.refundStatus;

  const hasCancelRequest = (o) => o.cancelRequestStatus === 'requested';
  const hasAnyCancelRequest = (o) => !!o.cancelRequestStatus;

  const isLbcDeliveryOrder = (o) => isLbcOrder(o, storePin);
  const isLbcApproved = (o) =>
    !!o?.lbcAcceptedAt
    || (isLbcDeliveryOrder(o)
      && String(o.orderStatus || '').toLowerCase() === 'completed'
      && !!o?.deliveryProofPhoto);
  /** Paid + admin-confirmed LBC orders waiting for Approve + delivery proof. */
  const isLbcAwaitingAccept = (o) => {
    if (!isLbcDeliveryOrder(o) || isCancelledStatus(o) || isLbcApproved(o)) return false;
    if (String(o.paymentStatus || '').toLowerCase() !== 'paid') return false;
    const st = String(o.orderStatus || 'pending').toLowerCase();
    // Only after Confirm Order — unpaid/pending paid orders stay out of LBC tab
    return st === 'confirmed' || st === 'shipped' || st === 'out_for_delivery';
  };
  const matchesSearchDate = (order) => {
    const matchesSearch = !searchTerm || [order.orderId, order.customerName, order.email].some((f) =>
      f?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    let matchesDate = true;
    if (startDate || endDate) {
      const orderDate = new Date(order._creationTime || order.createdAt || 0);
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        if (orderDate < start) matchesDate = false;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        if (orderDate > end) matchesDate = false;
      }
    }
    return matchesSearch && matchesDate;
  };

  /** Newest first (desc). On Pending, paid still float to top, then newest within each group. */
  const cmpNewest = (a, b) => cmpFifo(b, a);
  const sortOrdersForTab = (list, tab) => {
    const rows = [...list];
    if (tab === 'pending') {
      return rows.sort((a, b) => {
        const aPaid = a.paymentStatus === 'paid' ? 0 : 1;
        const bPaid = b.paymentStatus === 'paid' ? 0 : 1;
        if (aPaid !== bPaid) return aPaid - bPaid;
        if (aPaid === 0) return paidTimeMs(b) - paidTimeMs(a);
        return cmpNewest(a, b);
      });
    }
    if (tab === 'refunds') {
      return rows.sort((a, b) => {
        const aTime = a.refundRequestedAt ? new Date(a.refundRequestedAt).getTime() : 0;
        const bTime = b.refundRequestedAt ? new Date(b.refundRequestedAt).getTime() : 0;
        if (aTime && bTime) return bTime - aTime;
        return cmpNewest(a, b);
      });
    }
    if (tab === 'cancelled') {
      return rows.sort((a, b) => {
        const aTime = a.cancelRequestedAt ? new Date(a.cancelRequestedAt).getTime() : 0;
        const bTime = b.cancelRequestedAt ? new Date(b.cancelRequestedAt).getTime() : 0;
        if (aTime && bTime) return bTime - aTime;
        return cmpNewest(a, b);
      });
    }
    return rows.sort(cmpNewest);
  };

  const tabCounts = {
    all:        validOrders.length,
    // Cancel requests are handled under Canceled → Request Cancel (not Pending)
    pending:    validOrders.filter((o) => isPendingStatus(o) && !hasCancelRequest(o)).length,
    confirmed:  validOrders.filter((o) => isProcessingStatus(o) && !hasCancelRequest(o)).length,
    shipped:    validOrders.filter((o) => isShippedStatus(o) && !hasCancelRequest(o) && !isLbcDeliveryOrder(o)).length,
    // LBC tab = pipeline only; finished LBC deliveries live under Completed
    lbc:        validOrders.filter((o) => isLbcAwaitingAccept(o)).length,
    completed:  validOrders.filter((o) => isCompletedStatus(o)).length,
    manual:     validOrders.filter((o) => isWalkInOrder(o)).length,
    refunds:    validOrders.filter(hasAnyRefund).length,
    cancelled:  validOrders.filter((o) => isCancelledStatus(o) || hasAnyCancelRequest(o)).length,
  };

  /** Newest order overall — highlight in list + keep Pending badge lit for new ones. */
  const latestOrderId = useMemo(() => {
    let bestId = null;
    let bestTs = -1;
    for (const o of validOrders) {
      const ts = Number(o._creationTime) || Number(o.orderSeq) || 0;
      if (ts >= bestTs) {
        bestTs = ts;
        bestId = o.orderId;
      }
    }
    return bestId;
  }, [validOrders]);

  const SEEN_ORDERS_KEY = 'dk_admin_orders_seen_at';
  const [seenOrdersAt, setSeenOrdersAt] = useState(() => {
    try { return Number(localStorage.getItem(SEEN_ORDERS_KEY) || 0); } catch { return 0; }
  });

  const hasUnseenPending = useMemo(() => {
    return validOrders.some((o) => {
      if (!isPendingStatus(o) || hasCancelRequest(o)) return false;
      const ts = Number(o._creationTime) || 0;
      return ts > seenOrdersAt;
    });
  }, [validOrders, seenOrdersAt]);

  useEffect(() => {
    if (activeTab !== 'pending') return;
    const now = Date.now();
    setSeenOrdersAt(now);
    try { localStorage.setItem(SEEN_ORDERS_KEY, String(now)); } catch { /* ignore */ }
  }, [activeTab]);

  const showStatusFilter = ['all', 'pending', 'confirmed', 'shipped'].includes(activeTab);

  const statusFilterOptions = useMemo(() => {
    if (activeTab === 'pending' || activeTab === 'confirmed') {
      return [
        { value: 'all', label: 'All Statuses' },
        { value: 'paid', label: 'Paid' },
        { value: 'unpaid', label: 'Unpaid' },
      ];
    }
    if (activeTab === 'shipped') {
      return [
        { value: 'all', label: 'All Statuses' },
        { value: 'shipped', label: 'Shipped' },
        { value: 'out_for_delivery', label: 'Out for Delivery' },
      ];
    }
    return [
      { value: 'all', label: 'All Statuses' },
      { value: 'pending', label: 'Pending' },
      { value: 'confirmed', label: 'Processing' },
      { value: 'shipped', label: 'Shipped' },
      { value: 'out_for_delivery', label: 'Out for Delivery' },
      { value: 'completed', label: 'Completed' },
      { value: 'cancelled', label: 'Canceled' },
    ];
  }, [activeTab]);

  useEffect(() => { setPage(0); setSidePage(0); }, [activeTab, searchTerm, statusFilter, startDate, endDate]);

  // Migrate removed tabs to closest match
  useEffect(() => {
    if (activeTab === 'paid') setActiveTab('pending');
    if (activeTab === 'refund') setActiveTab('refunds');
  }, [activeTab]);

  useEffect(() => {
    setStatusFilter('all');
  }, [activeTab]);

  const matchesStatusFilter = (order) => {
    if (!showStatusFilter || statusFilter === 'all') return true;
    if (statusFilter === 'paid') return order.paymentStatus === 'paid';
    if (statusFilter === 'unpaid') return order.paymentStatus !== 'paid';
    const st = String(order.orderStatus || 'pending').toLowerCase();
    return st === statusFilter;
  };

  const filteredOrders = useMemo(() => {
    const list = validOrders.filter((order) => {
      let matchesTab = false;
      if (activeTab === 'all') {
        matchesTab = true;
      } else if (activeTab === 'pending') {
        // Keep open cancel requests out of Pending — they live in Canceled → Request Cancel
        matchesTab = isPendingStatus(order) && !hasCancelRequest(order);
      } else if (activeTab === 'confirmed') {
        matchesTab = isProcessingStatus(order) && !hasCancelRequest(order);
      } else if (activeTab === 'shipped') {
        // In-transit rider deliveries only — completed go to Completed; LBC under LBC/Completed
        matchesTab = isShippedStatus(order) && !hasCancelRequest(order) && !isLbcDeliveryOrder(order);
      } else if (activeTab === 'completed') {
        // Rider + LBC successful deliveries (+ walk-ins count as completed sales)
        matchesTab = isCompletedStatus(order);
      } else if (activeTab === 'manual') {
        matchesTab = isWalkInOrder(order);
      } else if (activeTab === 'lbc') {
        // Left panel = awaiting accept; completed LBC orders are under Completed
        matchesTab = false;
      } else if (activeTab === 'refunds') {
        // Right list = resolved refunds (approved / rejected)
        matchesTab = isRefundResolved(order);
      } else if (activeTab === 'cancelled') {
        // Right list = canceled orders only (requests sit in left panel)
        matchesTab = isCancelledStatus(order);
      }
      return matchesTab && matchesSearchDate(order) && matchesStatusFilter(order);
    });
    return sortOrdersForTab(list, activeTab);
  }, [validOrders, activeTab, searchTerm, statusFilter, startDate, endDate]);

  const pagedOrders = useMemo(() => {
    const start = page * ORDER_PAGE_SIZE;
    return filteredOrders.slice(start, start + ORDER_PAGE_SIZE);
  }, [filteredOrders, page]);

  const getStatusColor = (status, order = null) => {
    if (order?.deliveryFailedFinal || String(order?.status || status || '').toLowerCase() === 'failed delivery') {
      return '#dc2626';
    }
    const colors = { pending: '#ffc107', confirmed: '#0ea5e9', shipped: '#6366f1', out_for_delivery: '#f97316', completed: '#28a745', cancelled: '#dc3545' };
    return colors[status] || '#6c757d';
  };

  const getStatusLabel = (status, order = null) => {
    if (order?.deliveryFailedFinal || String(order?.status || status || '').toLowerCase() === 'failed delivery') {
      return 'Failed Delivery';
    }
    const labels = {
      pending: 'Pending',
      confirmed: 'Processing',
      shipped: 'Shipped',
      out_for_delivery: 'Out for Delivery',
      completed: 'Completed',
      cancelled: 'Canceled',
    };
    return labels[status] || status || 'Pending';
  };

  /** Refunds tab left panel — open refund requests only. */
  const refundRequestOrders = useMemo(() => {
    return sortOrdersForTab(
      validOrders.filter((o) => hasRefundRequest(o) && matchesSearchDate(o)),
      'refunds'
    );
  }, [validOrders, searchTerm, startDate, endDate]);

  /** Canceled tab left panel — open cancel requests only. */
  const cancelRequestOrders = useMemo(() => {
    return sortOrdersForTab(
      validOrders.filter((o) => hasCancelRequest(o) && matchesSearchDate(o)),
      'cancelled'
    );
  }, [validOrders, searchTerm, startDate, endDate]);

  /** LBC tab left panel — paid LBC orders waiting for Accept. */
  const lbcAwaitingOrders = useMemo(() => {
    return sortOrdersForTab(
      validOrders.filter((o) => isLbcAwaitingAccept(o) && matchesSearchDate(o)),
      'pending'
    );
  }, [validOrders, searchTerm, startDate, endDate, storeSettings?.storeLat, storeSettings?.storeLng]);

  const sidePanelOrders = useMemo(() => {
    if (activeTab === 'refunds') return refundRequestOrders;
    if (activeTab === 'lbc') return lbcAwaitingOrders;
    if (activeTab === 'cancelled') return cancelRequestOrders;
    return [];
  }, [activeTab, refundRequestOrders, lbcAwaitingOrders, cancelRequestOrders]);

  const sideTotalPages = Math.max(1, Math.ceil(sidePanelOrders.length / SIDE_CARD_PAGE_SIZE) || 1);
  const safeSidePage = Math.min(sidePage, sideTotalPages - 1);
  const pagedSideOrders = sidePanelOrders.slice(
    safeSidePage * SIDE_CARD_PAGE_SIZE,
    safeSidePage * SIDE_CARD_PAGE_SIZE + SIDE_CARD_PAGE_SIZE
  );

  const mapStatusToTrackingStatus = (adminStatus) => {
    const statusMap = { pending: 'Processing', confirmed: 'Confirmed', shipped: 'Shipped', out_for_delivery: 'Out for Delivery', completed: 'Delivered', cancelled: 'Cancelled' };
    return statusMap[adminStatus] || 'Processing';
  };

  const openLbcApprove = (order) => {
    const st = String(order?.orderStatus || '').toLowerCase();
    if (st !== 'shipped' && st !== 'out_for_delivery') {
      showNotification('Mark this LBC order as Shipped first (View → Shipped with photo).', 'warning');
      return;
    }
    setLbcApproveOrder(order);
    setLbcApprovePhoto('');
  };

  const closeLbcApprove = () => {
    if (acceptingLbcId) return;
    setLbcApproveOrder(null);
    setLbcApprovePhoto('');
  };

  const handleLbcProofPick = (file) => {
    if (!file) return;
    const check = validateImageFile(file);
    if (check?.ok === false) {
      showNotification(check.error || 'Invalid image file.', 'warning');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => setLbcApprovePhoto(String(e.target?.result || ''));
    reader.readAsDataURL(file);
  };

  const handleApproveLbc = async () => {
    const order = lbcApproveOrder;
    if (!order?.orderId) return;
    if (!lbcApprovePhoto) {
      showNotification('Upload LBC delivery proof before approving.', 'warning');
      return;
    }
    const shortId = formatOrderShortId(order);
    setAcceptingLbcId(order.orderId);
    try {
      const result = await approveLbcDeliveryMutation({
        orderId: order.orderId,
        photo: lbcApprovePhoto,
      });
      if (!result?.success) {
        showNotification(result?.message || 'Could not approve LBC delivery.', 'error');
        return;
      }
      if (selectedOrder?.orderId === order.orderId) {
        setSelectedOrder((prev) => ({
          ...prev,
          lbcAcceptedAt: new Date().toISOString(),
          deliveryMethod: 'lbc',
          deliveryProofPhoto: lbcApprovePhoto,
          deliveryConfirmedAt: new Date().toISOString(),
          orderStatus: 'completed',
          status: 'Delivered',
        }));
      }
      setLbcApproveOrder(null);
      setLbcApprovePhoto('');
      showNotification(
        result.alreadyApproved
          ? `Order #${shortId} was already approved.`
          : `Order #${shortId} confirmed delivered via LBC. Customer notified.`,
        'success'
      );
    } catch (err) {
      console.error(err);
      showNotification('Failed to approve LBC delivery.', 'error');
    } finally {
      setAcceptingLbcId(null);
    }
  };

  const handleUpdateStatus = async (orderId, newOrderStatus) => {
    const order = orders.find(o => o.orderId === orderId) || selectedOrder;
    const shortId = formatOrderShortId(orderId);
    const customer = order?.customerName || 'the customer';

    if (newOrderStatus === 'confirmed') {
      const lbc = isLbcOrder(order, storePin);
      const ok = await confirm({
        title: 'Confirm this order?',
        message: lbc
          ? `Confirm order #${shortId} for ${customer}?\n\nThis LBC Express order will move to the LBC tab, and the customer will get an automatic chat with their order details.`
          : `Confirm order #${shortId} for ${customer}?\n\nThis marks the order as confirmed for riders, and the customer will get an automatic chat with their order details.`,
        confirmLabel: 'Confirm Order',
        cancelLabel: 'Cancel',
        variant: 'primary',
        icon: 'fa-check-circle',
      });
      if (!ok) return;
    } else {
      const ok = await confirm({
        title: 'Update order status?',
        message: `Change order #${shortId} to “${getStatusLabel(newOrderStatus)}”?`,
        confirmLabel: 'Update',
        cancelLabel: 'Cancel',
        variant: 'warning',
        icon: 'fa-tasks',
      });
      if (!ok) return;
    }

    try {
      await updateOrderStatusMutation({ orderId, status: mapStatusToTrackingStatus(newOrderStatus), orderStatus: newOrderStatus });
      if (selectedOrder?.orderId === orderId) {
        setSelectedOrder(prev => ({ ...prev, orderStatus: newOrderStatus, status: mapStatusToTrackingStatus(newOrderStatus) }));
      }
      if (newOrderStatus === 'confirmed') {
        showNotification(
          isLbcOrder(order, storePin)
            ? `Order #${shortId} confirmed — moved to LBC tab. Order details sent to customer chat.`
            : `Order #${shortId} confirmed. Order details sent to customer chat.`,
          'success'
        );
      }
    } catch (err) {
      console.error('Failed to update status:', err);
      showNotification('Failed to update order status. Please try again.', 'error');
    }
  };

  const handleCancelWithReason = async (orderId, reason) => {
    const target = orders?.find((o) => o.orderId === orderId) || selectedOrder;
    const wasPaid = String(target?.paymentStatus || '').toLowerCase() === 'paid';
    const status = String(target?.orderStatus || '').toLowerCase();
    const isUnconfirmed = !status || status === 'pending';
    // After admin confirm — cancel is locked for everyone
    if (!isUnconfirmed) {
      showNotification('This order is already confirmed — cancel is no longer allowed.', 'error');
      return;
    }
    try {
      const result = await adminCancelOrderAction({ orderId, reason });
      if (result?.success === false) {
        showNotification(result?.error || result?.message || 'Failed to cancel order.', 'error');
        return;
      }
      if (selectedOrder?.orderId === orderId) {
        setSelectedOrder((prev) => ({
          ...prev,
          orderStatus: 'cancelled',
          status: 'Cancelled',
          cancelReason: reason,
          cancelledBy: 'admin',
        }));
      }
      showNotification(
        wasPaid && result?.refunded
          ? 'Order cancelled. PayMongo refund sent to customer.'
          : wasPaid
            ? 'Order cancelled. Check refund if payment was manual.'
            : 'Order cancelled.',
        'success'
      );
    } catch (err) {
      console.error('Failed to cancel order:', err);
      showNotification(err?.data || err?.message || 'Failed to cancel order. Please try again.', 'error');
    }
  };

  const handleResolveRefund = async (orderId, refundStatus, adminNote) => {
    const shortId = formatOrderShortId(orderId);
    if (refundStatus === 'approved') {
      const amount = selectedOrder?.finalTotal ?? selectedOrder?.total ?? 0;
      const ok = await confirm({
        title: 'Pay refund via PayMongo?',
        message: `Refund ₱${Number(amount).toLocaleString('en-PH')} for order #${shortId}?\n\nPayMongo will return the payment to the customer’s GCash/Maya — same flow as their checkout payment.`,
        confirmLabel: 'Continue to PayMongo',
        cancelLabel: 'Cancel',
        variant: 'primary',
        icon: 'fa-credit-card',
      });
      if (!ok) return;
      try {
        const result = await approveDamageRefundAction({
          orderId,
          adminNote: adminNote || undefined,
        });
        if (!result?.success) {
          showNotification(result?.error || 'PayMongo refund failed.', 'error');
          return;
        }
        showNotification(
          `Refund ₱${Number(result.refundAmount || amount).toLocaleString('en-PH')} sent via PayMongo.`,
          'success'
        );
        if (selectedOrder?.orderId === orderId) {
          setSelectedOrder((prev) => ({
            ...prev,
            refundStatus: 'approved',
            refundAdminNote: adminNote,
            refundResolvedAt: new Date().toISOString(),
            refundAmount: result.refundAmount || amount,
            refundPaidAt: new Date().toISOString(),
          }));
        }
      } catch (err) {
        console.error('Failed to approve refund via PayMongo:', err);
        showNotification(err?.data || err?.message || 'PayMongo refund failed.', 'error');
      }
      return;
    }
    try {
      await resolveRefundMutation({ orderId, refundStatus, refundAdminNote: adminNote });
      if (selectedOrder?.orderId === orderId) {
        const refundAmount = selectedOrder.finalTotal ?? selectedOrder.total ?? 0;
        setSelectedOrder(prev => ({
          ...prev, refundStatus, refundAdminNote: adminNote,
          refundResolvedAt: new Date().toISOString(), refundAmount,
        }));
      }
    } catch (err) {
      console.error('Failed to resolve refund:', err);
      showNotification('Failed to resolve refund. Please try again.', 'error');
    }
  };

  const handleResolveCancelRequest = async (orderId, decision, adminNote, proofPhotoId) => {
    const shortId = formatOrderShortId(orderId);
    if (decision === 'approved') {
      const ok = await confirm({
        title: 'Approve cancel request?',
        message: `Approve cancel for order #${shortId}?\n\nIf paid, PayMongo will refund to the customer's GCash/Maya and the order will be cancelled.`,
        confirmLabel: 'Approve Cancel',
        cancelLabel: 'Back',
        variant: 'danger',
        icon: 'fa-ban',
      });
      if (!ok) return;
      try {
        const result = await approveCustomerCancelAction({
          orderId,
          adminNote,
          proofPhotoId: proofPhotoId || undefined,
        });
        if (!result?.success) {
          showNotification(result?.error || 'Failed to approve cancel.', 'error');
          return;
        }
        showNotification(
          result.refunded
            ? `Cancel approved. Refund ₱${Number(result.refundAmount || 0).toLocaleString('en-PH')} sent via PayMongo.`
            : 'Cancel approved. Order cancelled.',
          'success'
        );
        if (selectedOrder?.orderId === orderId) {
          setSelectedOrder((prev) => ({
            ...prev,
            cancelRequestStatus: 'approved',
            cancelRequestNote: adminNote,
            cancelRefundProofId: proofPhotoId || prev.cancelRefundProofId,
            cancelResolvedAt: new Date().toISOString(),
            orderStatus: 'cancelled',
            status: 'Cancelled',
          }));
        }
      } catch (err) {
        console.error('Failed to approve cancel:', err);
        showNotification(err?.data || err?.message || 'Failed to approve cancel.', 'error');
      }
      return;
    }

    try {
      const result = await rejectCustomerCancelMutation({ orderId, adminNote });
      if (!result?.success) {
        showNotification(result?.error || 'Failed to reject cancel request.', 'error');
        return;
      }
      showNotification('Cancel request declined.', 'success');
      if (selectedOrder?.orderId === orderId) {
        setSelectedOrder((prev) => ({
          ...prev,
          cancelRequestStatus: 'rejected',
          cancelRequestNote: adminNote,
          cancelResolvedAt: new Date().toISOString(),
        }));
      }
    } catch (err) {
      console.error('Failed to reject cancel:', err);
      showNotification('Failed to reject cancel request.', 'error');
    }
  };

  const clearDateFilter = () => { setStartDate(''); setEndDate(''); };

  const tabs = [
    { key: 'all',       icon: 'fa-list',         label: 'All Orders' },
    { key: 'pending',   icon: 'fa-clock',         label: 'Pending' },
    { key: 'confirmed', icon: 'fa-spinner',       label: 'Processing' },
    { key: 'shipped',   icon: 'fa-shipping-fast', label: 'Shipped' },
    { key: 'lbc',       icon: 'fa-truck',         label: 'LBC' },
    { key: 'completed', icon: 'fa-check-circle',  label: 'Completed' },
    { key: 'manual',    icon: 'fa-store',         label: 'Manual' },
    { key: 'refunds',   dkIcon: DK_ICONS.ordersRefunds, label: 'Refunds' },
    { key: 'cancelled', icon: 'fa-ban',           label: 'Canceled' },
  ];

  const emptyCopy = {
    all: 'No orders found',
    pending: 'No pending orders',
    confirmed: 'No processing orders',
    shipped: 'No shipped orders',
    lbc: 'Finished LBC deliveries are under Completed',
    completed: 'No completed orders yet',
    manual: 'No walk-in sales yet — record one above',
    refunds: 'No refunded orders yet',
    cancelled: 'No canceled orders',
  };

  const renderOrdersTable = () => (
    filteredOrders.length === 0 ? (
      <div className="orders-table-container orders-table-container--card">
        <div className="orders-table-body">
          <div className="empty-orders">
            {activeTab === 'refunds' ? (
              <DkIcon name={DK_ICONS.ordersRefunded} className="orders-dk-icon" size={28} alt="" />
            ) : activeTab === 'lbc' ? (
              <i className="fas fa-truck"></i>
            ) : activeTab === 'manual' ? (
              <i className="fas fa-store"></i>
            ) : (
              <i className={`fas ${activeTab === 'cancelled' ? 'fa-ban' : 'fa-inbox'}`}></i>
            )}
            <p>{emptyCopy[activeTab] || 'No orders found'}</p>
          </div>
        </div>
        <div className="orders-card-footer">
          <AdminPager
            total={0}
            page={0}
            pageSize={ORDER_PAGE_SIZE}
            onPageChange={setPage}
            hidePageSize
            alwaysShow
          />
        </div>
      </div>
    ) : (
      <div className="orders-table-container orders-table-container--card">
        <div className="orders-table-body">
          <table className="orders-table">
            <thead>
              <tr>
                <th>ORDER ID</th><th>CUSTOMER</th><th>ITEMS</th><th>TOTAL</th>
                <th>PAYMENT</th><th>METHOD</th><th>STATUS</th>
                {activeTab === 'refunds' && <th>REQUEST</th>}
                <th>RIDER</th><th>DATE</th><th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {pagedOrders.map((order) => {
                const pm = getPaymentMethodLabel(order);
                const refundRequested = order.refundStatus === 'requested';
                const cancelRequested = order.cancelRequestStatus === 'requested';
                const pendingRow = refundRequested || cancelRequested;
                const isLatest = order.orderId === latestOrderId;
                const canConfirm =
                  activeTab === 'pending'
                  && order.paymentStatus === 'paid'
                  && isPendingStatus(order)
                  && order.cancelRequestStatus !== 'requested';
                return (
                  <tr
                    key={order.orderId}
                    className={[
                      pendingRow ? 'row-refund-pending' : '',
                      isLatest ? 'row-latest-order' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    <td data-label="Order ID">
                      <div className="order-id-cell">
                        <strong>#{formatOrderShortId(order)}</strong>
                        {isLatest && (
                          <span className="orders-latest-flag" title="Latest order">
                            <i className="fas fa-bolt"></i> Latest
                          </span>
                        )}
                        {activeTab === 'lbc' && (
                          <span className="orders-lbc-chip"><i className="fas fa-check"></i> Completed</span>
                        )}
                        {refundRequested && (
                          <span className="orders-refund-flag" title="Refund requested">
                            <i className="fas fa-undo-alt"></i> Refund
                          </span>
                        )}
                        {cancelRequested && (
                          <span className="orders-refund-flag orders-refund-flag--cancel" title="Cancel requested">
                            <i className="fas fa-ban"></i> Cancel
                          </span>
                        )}
                      </div>
                    </td>
                    <td data-label="Customer">
                      <div className="customer-info">
                        <strong>{order.customerName || 'N/A'}</strong>
                        {isWalkInOrder(order) ? (
                          order.phone
                            ? <small>{order.phone}</small>
                            : <small>Walk-in</small>
                        ) : (
                          <small>{order.email || 'N/A'}</small>
                        )}
                      </div>
                    </td>
                    <td data-label="Items">{order.items.length} item(s)</td>
                    <td data-label="Total">
                      <strong>₱{(order.finalTotal ?? order.total ?? 0).toLocaleString('en-PH')}</strong>
                      {order.promoCode && <div style={{ fontSize: '11px', color: '#ec4899', fontWeight: 700, marginTop: '3px', display: 'flex', alignItems: 'center', gap: '3px' }}><i className="fas fa-tag"></i> {order.promoCode}</div>}
                    </td>
                    <td data-label="Payment"><span className={`payment-badge ${order.paymentStatus === 'paid' ? 'paid' : 'pending'}`}>{order.paymentStatus === 'paid' ? 'Paid' : 'Pending'}</span></td>
                    <td data-label="Method"><span className="method-badge" style={{ color: pm.color, display: 'inline-flex', alignItems: 'center', gap: 6 }}><PaymentMethodMark pm={pm} /> {pm.label}</span></td>
                    <td data-label="Status">
                      <span
                        className="status-badge"
                        style={{ backgroundColor: getStatusColor(order.orderStatus, order) }}
                      >
                        {getStatusLabel(order.orderStatus, order)}
                      </span>
                    </td>
                    {activeTab === 'refunds' && (
                      <td data-label="Request">
                        {order.refundStatus === 'approved'  && <span className="refund-table-badge refund-table-approved"><i className="fas fa-check-circle"></i> Refund Approved</span>}
                        {order.refundStatus === 'rejected'  && <span className="refund-table-badge refund-table-rejected"><i className="fas fa-times-circle"></i> Refund Rejected</span>}
                      </td>
                    )}
                    <td data-label="Rider">
                      {isWalkInOrder(order) ? (
                        <span className="orders-walkin-chip"><i className="fas fa-store"></i> Walk-in</span>
                      ) : isLbcDeliveryOrder(order) ? (
                        <span className="orders-lbc-chip orders-lbc-chip--rider"><i className="fas fa-truck"></i> LBC</span>
                      ) : order.riderInfo ? (
                        <div style={{ fontSize: '12px' }}><strong>{order.riderInfo.name}</strong><div style={{ color: '#888' }}>{order.riderInfo.plate}</div></div>
                      ) : (
                        <span style={{ color: '#ccc', fontSize: '12px' }}>-</span>
                      )}
                    </td>
                    <td data-label="Date" style={{ whiteSpace: 'nowrap', fontSize: '13px' }}>
                      {order._creationTime
                        ? new Date(order._creationTime).toLocaleString('en-PH', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true,
                          })
                        : 'N/A'}
                    </td>
                    <td data-label="Actions">
                      <div className="orders-row-actions">
                        <button className="view-btn" onClick={() => setSelectedOrder(order)}><i className="fas fa-eye"></i> View</button>
                        {canConfirm && (
                          <button
                            type="button"
                            className="orders-priority-confirm"
                            onClick={() => handleUpdateStatus(order.orderId, 'confirmed')}
                          >
                            <i className="fas fa-check"></i> Confirm
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="orders-card-footer">
          <AdminPager
            total={filteredOrders.length}
            page={page}
            pageSize={ORDER_PAGE_SIZE}
            onPageChange={setPage}
            hidePageSize
            alwaysShow
          />
        </div>
      </div>
    )
  );

  return (
    <div className="admin-orders-page">
      <div className="orders-page-intro">
        <h2>Orders</h2>
        <OrderStatusLegend />
        <button
          type="button"
          className="orders-manual-record-btn"
          onClick={() => {
            setActiveTab('manual');
            setShowWalkInModal(true);
          }}
        >
          <i className="fas fa-cash-register"></i> Manual Record
        </button>
      </div>
      <div className="orders-tabs">
        {tabs.map((t) => {
          const count = tabCounts[t.key] ?? 0;
          const isAlert = t.key === 'refunds' || t.key === 'cancelled';
          // Keep Pending badge lit even when another tab is selected
          const pendingLit = t.key === 'pending' && count > 0;
          const pendingNew = pendingLit && hasUnseenPending && activeTab !== 'pending';
          return (
            <button
              key={t.key}
              className={`tab-btn ${activeTab === t.key ? 'active' : ''} ${isAlert ? 'tab-btn-refund' : ''} ${pendingNew ? 'tab-btn-pending-alert' : ''}`}
              onClick={() => setActiveTab(t.key)}
            >
              {t.dkIcon
                ? <DkIcon name={t.dkIcon} className="orders-dk-icon" size={15} alt="" />
                : <i className={`fas ${t.icon}`}></i>}
              {t.label}
              {count > 0 && (
                <span
                  className={[
                    'tab-count-badge',
                    isAlert ? 'tab-count-badge--refund' : '',
                    pendingLit ? 'tab-count-badge--lit' : '',
                    pendingNew ? 'tab-count-badge--pulse' : '',
                  ].filter(Boolean).join(' ')}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="orders-filters">
        <div className="filter-group">
          <input
            type="text"
            className="search-input"
            placeholder="Search by Order ID, Customer Name, or Email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="date-filter-group">
          <div className="date-filter-inputs">
            <div className="date-filter-item">
              <label htmlFor="orderStart"><i className="fas fa-calendar"></i></label>
              <input type="date" id="orderStart" value={startDate} max={endDate || today} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <span className="date-filter-sep">to</span>
            <div className="date-filter-item">
              <label htmlFor="orderEnd"><i className="fas fa-calendar"></i></label>
              <input type="date" id="orderEnd" value={endDate} min={startDate} max={today} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            {(startDate || endDate) && (
              <button className="date-filter-clear" onClick={clearDateFilter}>
                <i className="fas fa-times"></i> Clear
              </button>
            )}
          </div>
        </div>
        {showStatusFilter && (
          <div className="status-filter-group">
            <select
              id="orderStatusFilter"
              className="filter-select status-filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            >
              {statusFilterOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {activeTab === 'refunds' || activeTab === 'cancelled' || activeTab === 'lbc' ? (
        <div className="orders-split">
          <aside className="orders-split-left">
            <div className="orders-priority-head">
              {activeTab === 'refunds' ? (
                <>
                  <h2>
                    <DkIcon name={DK_ICONS.ordersRefunds} className="orders-dk-icon" size={16} alt="" />
                    Request Refunds
                  </h2>
                  <p>Pending customer refund requests</p>
                </>
              ) : activeTab === 'lbc' ? (
                <>
                  <h2><i className="fas fa-truck"></i> LBC Incoming</h2>
                  <p>Ship first, then Confirm Deliver with proof</p>
                </>
              ) : (
                <>
                  <h2><i className="fas fa-ban"></i> Request Cancel</h2>
                  <p>Pending customer cancel requests</p>
                </>
              )}
            </div>

            {sidePanelOrders.length === 0 ? (
              <div className="orders-priority-empty dk-fixed-page dk-fixed-page--stack" style={fixedPageStyle(SIDE_CARD_PAGE_SIZE, { '--dk-row-h': '100px', '--dk-gap': '0px' })}>
                <i className={`fas ${activeTab === 'lbc' ? 'fa-inbox' : 'fa-check-circle'}`}></i>
                <p>
                  {activeTab === 'lbc'
                    ? 'No incoming LBC orders'
                    : activeTab === 'refunds'
                      ? 'No refund requests'
                      : 'No cancel requests'}
                </p>
              </div>
            ) : (
              <div
                className="orders-priority-list dk-fixed-page dk-fixed-page--stack"
                style={fixedPageStyle(SIDE_CARD_PAGE_SIZE, { '--dk-row-h': '100px', '--dk-gap': '0px' })}
              >
                {pagedSideOrders.map((order) => {
                  const pm = getPaymentMethodLabel(order);
                  const busy = acceptingLbcId === order.orderId;
                  const isCancelPanel = activeTab === 'cancelled';
                  const isLbcPanel = activeTab === 'lbc';
                  const lbcStatus = String(order.orderStatus || '').toLowerCase();
                  const canConfirmDeliver = isLbcPanel && (lbcStatus === 'shipped' || lbcStatus === 'out_for_delivery');
                  return (
                    <div
                      key={order.orderId}
                      className={`orders-priority-card is-awaiting${!isLbcPanel ? ' has-refund' : ''}${isCancelPanel ? ' is-cancel-request' : ''}`}
                    >
                      <div className="orders-priority-main">
                        <div className="orders-priority-card-top">
                          <strong>#{formatOrderShortId(order)}</strong>
                          {isLbcPanel ? (
                            <span className="orders-refund-flag orders-refund-flag--lbc">
                              <i className="fas fa-truck"></i> {lbcStatus === 'shipped' || lbcStatus === 'out_for_delivery' ? 'Shipped' : 'LBC'}
                            </span>
                          ) : isCancelPanel ? (
                            <span className="orders-refund-flag orders-refund-flag--cancel">
                              <i className="fas fa-ban"></i> Requested
                            </span>
                          ) : (
                            <span className="orders-refund-flag">
                              <i className="fas fa-undo-alt"></i> Requested
                            </span>
                          )}
                        </div>
                        <div className="orders-priority-customer">
                          <span>{order.customerName || 'Customer'}</span>
                          <small>{order.email || ''}</small>
                        </div>
                        <div className="orders-priority-meta">
                          <span>₱{(order.finalTotal ?? order.total ?? order.refundAmount ?? 0).toLocaleString('en-PH')}</span>
                          <span className="orders-priority-method" style={{ color: pm.color }}>
                            <PaymentMethodMark pm={pm} /> {pm.label}
                          </span>
                          <span>{order.items?.length || 0} item(s)</span>
                        </div>
                      </div>
                      <div className={`orders-priority-actions${isLbcPanel ? ' orders-priority-actions--row' : ''}`}>
                        <button type="button" className="view-btn" onClick={() => setSelectedOrder(order)}>
                          <i className="fas fa-eye"></i> {isLbcPanel ? 'View' : 'Review'}
                        </button>
                        {isLbcPanel && (
                          <button
                            type="button"
                            className="orders-priority-confirm"
                            onClick={() => {
                              if (busy || !canConfirmDeliver) return;
                              openLbcApprove(order);
                            }}
                            disabled={busy || !canConfirmDeliver}
                            aria-disabled={busy || !canConfirmDeliver}
                            title={canConfirmDeliver ? 'Confirm Deliver' : 'Mark as Shipped first from View'}
                          >
                            {busy
                              ? <><i className="fas fa-spinner fa-spin"></i> Confirming…</>
                              : <><i className="fas fa-check"></i> Confirm Deliver</>}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <AdminPager
              total={sidePanelOrders.length}
              page={safeSidePage}
              pageSize={SIDE_CARD_PAGE_SIZE}
              onPageChange={setSidePage}
              hidePageSize
              alwaysShow
            />
          </aside>

          <section className="orders-split-right">
            <div className="orders-container">
              <div className="orders-list-caption">
                {activeTab === 'refunds' ? (
                  <>
                    <h2>
                      <DkIcon name={DK_ICONS.ordersRefunded} className="orders-dk-icon" size={16} alt="" />
                      Refunded
                    </h2>
                    <p>Approved and rejected refunds</p>
                  </>
                ) : activeTab === 'lbc' ? (
                  <>
                    <h2><i className="fas fa-check-circle"></i> Completed</h2>
                    <p>LBC deliveries with proof are listed under the Completed tab</p>
                  </>
                ) : (
                  <>
                    <h2><i className="fas fa-ban"></i> Canceled</h2>
                    <p>Cancelled orders</p>
                  </>
                )}
              </div>
              {renderOrdersTable()}
            </div>
          </section>
        </div>
      ) : (
        <div className="orders-container orders-container--full">
          {activeTab === 'manual' && (
            <div className="orders-manual-banner">
              <div className="orders-manual-banner-copy">
                <h3><i className="fas fa-store"></i> Walk-in / Manual Record</h3>
                <p>Record in-store sales — product, quantity, and current price. Stock is deducted when you save.</p>
              </div>
              <button
                type="button"
                className="orders-manual-record-btn orders-manual-record-btn--solid"
                onClick={() => setShowWalkInModal(true)}
              >
                <i className="fas fa-plus"></i> Record Sale
              </button>
            </div>
          )}
          {renderOrdersTable()}
        </div>
      )}

      {showWalkInModal && (
        <WalkInRecordModal
          onClose={() => setShowWalkInModal(false)}
          onSubmit={async (payload) => {
            try {
              const result = await createWalkInOrderMutation(payload);
              showNotification(
                `Walk-in sale recorded · #${formatOrderShortId(result?.orderId || result)} · ₱${Number(result?.total || 0).toLocaleString('en-PH')}`,
                'success'
              );
              setShowWalkInModal(false);
              setActiveTab('manual');
            } catch (err) {
              const msg = String(err?.data || err?.message || err || 'Failed to record sale');
              showNotification(msg.replace(/^.*Error:\s*/i, '').slice(0, 180), 'error');
              throw err;
            }
          }}
        />
      )}

      {lbcApproveOrder && createPortal(
        <div className="lbc-approve-overlay" onClick={closeLbcApprove}>
          <div
            className="lbc-approve-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="lbc-approve-title"
          >
            <h3 id="lbc-approve-title">Confirm LBC delivery?</h3>
            <p className="lbc-approve-sub">
              Confirm deliver for order #{formatOrderShortId(lbcApproveOrder)} — {lbcApproveOrder.customerName || 'the customer'}?
            </p>
            <p className="lbc-approve-desc">
              Upload proof that LBC already delivered this order. The photo is required and will show on the customer Track Order page.
            </p>
            <div className="lbc-approve-upload">
              <label>Delivery proof photo <em>(required)</em></label>
              <button
                type="button"
                className={`lbc-approve-drop ${lbcApprovePhoto ? 'has-photo' : ''}`}
                onClick={() => lbcProofInputRef.current?.click()}
                disabled={!!acceptingLbcId}
              >
                {lbcApprovePhoto ? (
                  <span className="lbc-approve-preview-wrap">
                    <img src={lbcApprovePhoto} alt="LBC delivery proof" className="lbc-approve-preview" />
                    <span>Change photo</span>
                  </span>
                ) : (
                  <span className="lbc-approve-placeholder">
                    <i className="fas fa-cloud-upload-alt"></i>
                    Upload LBC delivery proof
                  </span>
                )}
              </button>
              <input
                ref={lbcProofInputRef}
                type="file"
                accept={IMAGE_ACCEPT_NO_GIF}
                style={{ display: 'none' }}
                onChange={(e) => handleLbcProofPick(e.target.files?.[0])}
              />
              {lbcApprovePhoto && (
                <button
                  type="button"
                  className="lbc-approve-remove"
                  onClick={() => setLbcApprovePhoto('')}
                  disabled={!!acceptingLbcId}
                >
                  Remove photo
                </button>
              )}
            </div>
            <div className="lbc-approve-actions">
              <button type="button" className="lbc-approve-cancel" onClick={closeLbcApprove} disabled={!!acceptingLbcId}>
                Cancel
              </button>
              <button
                type="button"
                className="lbc-approve-submit"
                onClick={handleApproveLbc}
                disabled={!lbcApprovePhoto || !!acceptingLbcId}
              >
                {acceptingLbcId
                  ? <><i className="fas fa-spinner fa-spin"></i> Confirming…</>
                  : <><i className="fas fa-check"></i> Confirm Deliver</>}
              </button>
            </div>
          </div>
        </div>,
        getOverlayRoot?.() || document.body
      )}

      {selectedOrder && (
        <OrderModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onUpdateStatus={handleUpdateStatus}
          onCancelWithReason={handleCancelWithReason}
          onResolveRefund={handleResolveRefund}
          onResolveCancelRequest={handleResolveCancelRequest}
          onMarkLbcShipped={async (orderId, { photo, imageStorageId }) => {
            const result = await markLbcShippedMutation({
              orderId,
              photo,
              ...(imageStorageId ? { imageStorageId } : {}),
            });
            if (result?.success) {
              setSelectedOrder((prev) =>
                prev?.orderId === orderId
                  ? {
                      ...prev,
                      orderStatus: 'shipped',
                      status: 'Shipped',
                      shippedAt: new Date().toISOString(),
                      lbcShippedPhoto: photo,
                    }
                  : prev
              );
              showNotification(
                result.alreadyShipped
                  ? 'Order already marked shipped.'
                  : `Order #${formatOrderShortId(orderId)} shipped — moved to Shipped tab. Photo sent to customer chat.`,
                'success'
              );
            }
            return result;
          }}
          generateChatUploadUrl={generateChatUploadUrl}
          getStatusColor={getStatusColor}
          getStatusLabel={getStatusLabel}
          storePin={storePin}
        />
      )}
    </div>
  );
};

/* ══════════════════════════════════════
   REJECT CONFIRMATION DIALOG
══════════════════════════════════════ */
const RejectConfirmDialog = ({ order, adminNote, onConfirm, onCancel }) => {
  const refundAmount = order.refundAmount ?? order.finalTotal ?? order.total ?? 0;
  return (
    <div className="reject-confirm-overlay" onClick={onCancel}>
      <div className="reject-confirm-dialog" onClick={e => e.stopPropagation()}>
        <div className="reject-confirm-icon"><i className="fas fa-exclamation-triangle"></i></div>
        <h3>Reject Refund Request?</h3>
        <p>Are you sure you want to <strong>reject</strong> the refund for Order <strong>#{formatOrderShortId(order)}</strong>?</p>
        <div className="reject-confirm-details">
          <div className="reject-confirm-row"><span>Customer</span><strong>{order.customerName || 'N/A'}</strong></div>
          <div className="reject-confirm-row"><span>Refund Amount</span><strong>₱{refundAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong></div>
          {adminNote && <div className="reject-confirm-row"><span>Your Note</span><strong style={{ fontStyle: 'italic' }}>"{adminNote}"</strong></div>}
        </div>
        <p className="reject-confirm-warning"><i className="fas fa-info-circle"></i> The customer will be notified via email.</p>
        <div className="reject-confirm-actions">
          <button className="reject-confirm-cancel-btn" onClick={onCancel}><i className="fas fa-arrow-left"></i> Go Back</button>
          <button className="reject-confirm-proceed-btn" onClick={onConfirm}><i className="fas fa-times-circle"></i> Yes, Reject</button>
        </div>
      </div>
    </div>
  );
};

/* ══════════════════════════════════════
   ORDER MODAL
══════════════════════════════════════ */
const OrderModal = ({ order, onClose, onUpdateStatus, onCancelWithReason, onResolveRefund, onResolveCancelRequest, onMarkLbcShipped, generateChatUploadUrl, getStatusColor, getStatusLabel, storePin = null }) => {
  useBodyScrollLock(true);
  const [showCancelModal,   setShowCancelModal]   = useState(false);
  const [lbcShipPhoto, setLbcShipPhoto] = useState('');
  const [shippingLbc, setShippingLbc] = useState(false);
  const lbcShipInputRef = useRef(null);
  const [proofExpanded,     setProofExpanded]     = useState(false);
  const [photoExpanded2,    setPhotoExpanded2]    = useState(false);
  const [refundAdminNote,   setRefundAdminNote]   = useState('');
  const [cancelAdminNote,   setCancelAdminNote]   = useState('');
  const [resolvingRefund,   setResolvingRefund]   = useState(false);
  const [resolvingCancel,   setResolvingCancel]   = useState(false);
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);
  const [showWaybill,       setShowWaybill]       = useState(false);
  const [showItemsModal,    setShowItemsModal]    = useState(false);
  const [cancelProofFile,   setCancelProofFile]   = useState(null);
  const [cancelProofPreview, setCancelProofPreview] = useState(null);
  const [cancelProofError,  setCancelProofError]  = useState('');
  const cancelProofInputRef = useRef(null);
  const generateRefundUploadUrl = useMutation(api.orders.generateRefundUploadUrl);

  const refundPhotoUrl = useQuery(
    api.orders.getRefundPhotoUrl,
    order.refundPhotoId ? { storageId: order.refundPhotoId } : 'skip'
  );
  const cancelProofUrl = useQuery(
    api.orders.getRefundPhotoUrl,
    order.cancelRefundProofId ? { storageId: order.cancelRefundProofId } : 'skip'
  );

  const subtotal      = order.subtotal   || 0;
  const shippingFee   = order.shippingFee || 0;
  const originalTotal = order.total || (subtotal + shippingFee);
  const discount      = order.discountAmount || 0;
  const paymentFee    = Number(order.paymentFee || 0) || 0;
  const paymentFeeMethod = String(order.paymentFeeMethod || order.paymentMethod || '').toLowerCase();
  const paymentFeeRate = Number(order.paymentFeeRate || 0) || 0;
  const paymentFeeLabel = paymentFeeMethod.includes('maya') ? 'Maya' : paymentFeeMethod.includes('gcash') ? 'GCash' : 'E-wallet';
  const paymentFeePct = paymentFeeRate > 0 ? `${Math.round(paymentFeeRate * 10000) / 100}%` : '';
  const finalTotal    = order.finalTotal ?? (originalTotal - discount);
  const refundAmount  = order.refundAmount ?? finalTotal;

  const currentStatus  = order.orderStatus || 'pending';
  const paymentStatus  = order.paymentStatus || 'pending';
  const isPaid         = paymentStatus === 'paid';
  const isDone         = currentStatus === 'completed' || currentStatus === 'cancelled';
  const isLbc          = isLbcOrder(order, storePin);
  const isWalkIn       = isWalkInOrder(order);
  const isRiderManaged = !isLbc && (currentStatus === 'shipped' || currentStatus === 'out_for_delivery');
  const canConfirm     = isPaid && currentStatus === 'pending' && order.cancelRequestStatus !== 'requested';
  // Cancel only while still pending (before admin confirm). Confirmed+ = locked.
  const canCancel      = !isDone && currentStatus === 'pending';
  const hasPromo       = !!(order.promoCode && discount > 0);
  const walkInPhone    = String(order.phone || '').trim();
  const rawNote        = String(order.notes || '').trim();
  const walkInNote     = isWalkIn && /^walk-in sale \(manual record\)$/i.test(rawNote)
    ? ''
    : rawNote;
  const showCustomerEmail = !isWalkIn && !isPlaceholderWalkInEmail(order.email);
  const hasDeliveryProof = !!(order.deliveryProofPhoto);
  const otpVerified      = !!(order.deliveryOtpVerified);
  const hasRefund        = !!(order.refundStatus);
  const hasCancelRequest = !!(order.cancelRequestStatus);
  const pm = getPaymentMethodLabel(order);

  // Rider waybill only — never for LBC; only while confirmed (hide after shipped).
  const canPrintWaybill =
    isPaid
    && !isLbc
    && currentStatus === 'confirmed';

  const handleRefundResolve = async (status) => {
    setResolvingRefund(true);
    try { await onResolveRefund(order.orderId, status, refundAdminNote.trim()); }
    finally { setResolvingRefund(false); setShowRejectConfirm(false); }
  };

  const handleCancelProofChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const check = validateImageFile(file);
    if (!check.ok) {
      setCancelProofError(check.error);
      e.target.value = '';
      return;
    }
    setCancelProofError('');
    setCancelProofFile(file);
    setCancelProofPreview(URL.createObjectURL(file));
  };

  const clearCancelProof = () => {
    setCancelProofFile(null);
    if (cancelProofPreview) URL.revokeObjectURL(cancelProofPreview);
    setCancelProofPreview(null);
    if (cancelProofInputRef.current) cancelProofInputRef.current.value = '';
  };

  const handleCancelRequestResolve = async (decision) => {
    if (!onResolveCancelRequest) return;
    setCancelProofError('');
    setResolvingCancel(true);
    try {
      let proofPhotoId;
      if (decision === 'approved' && isPaid && cancelProofFile) {
        const uploadUrl = await generateRefundUploadUrl();
        const uploadRes = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': cancelProofFile.type },
          body: cancelProofFile,
        });
        if (!uploadRes.ok) throw new Error('Failed to upload refund proof');
        const { storageId } = await uploadRes.json();
        proofPhotoId = storageId;
      }
      await onResolveCancelRequest(order.orderId, decision, cancelAdminNote.trim(), proofPhotoId);
      clearCancelProof();
    } catch (err) {
      setCancelProofError(err?.message || 'Could not process cancel approval.');
    } finally {
      setResolvingCancel(false);
    }
  };

  return createPortal(
    <div className="order-modal-overlay" onClick={onClose}>
      <div className="order-modal" onClick={e => e.stopPropagation()}>
        {/* ── HEADER ── */}
        <div className="modal-header">
          <div>
            <h2>Order #{formatOrderShortId(order)}</h2>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
              <span className="status-badge" style={{ backgroundColor: getStatusColor(order.orderStatus, order) }}>{getStatusLabel(order.orderStatus, order)}</span>
              <span className={`payment-badge ${isPaid ? 'paid' : 'pending'}`}>{isPaid ? 'Paid' : 'Payment Pending'}</span>
              <span className="method-badge-pill" style={{ color: pm.color, borderColor: pm.color + '44', display: 'inline-flex', alignItems: 'center', gap: 6 }}><PaymentMethodMark pm={pm} /> {pm.label}</span>
              {hasPromo && <span className="promo-admin-pill"><i className="fas fa-tag"></i> {order.promoCode}</span>}
              {hasCancelRequest && (
                <span className={`refund-header-pill refund-header-${order.cancelRequestStatus === 'requested' ? 'requested' : order.cancelRequestStatus === 'approved' ? 'approved' : 'rejected'}`}>
                  <i className={`fas ${order.cancelRequestStatus === 'requested' ? 'fa-ban' : order.cancelRequestStatus === 'approved' ? 'fa-check-circle' : 'fa-times-circle'}`}></i>
                  {order.cancelRequestStatus === 'requested' ? 'Cancel Pending' : order.cancelRequestStatus === 'approved' ? 'Cancel Approved' : 'Cancel Declined'}
                </span>
              )}
              {hasRefund && (
                <span className={`refund-header-pill refund-header-${order.refundStatus}`}>
                  <i className={`fas ${order.refundStatus === 'requested' ? 'fa-clock' : order.refundStatus === 'approved' ? 'fa-check-circle' : 'fa-times-circle'}`}></i>
                  {order.refundStatus === 'requested' ? 'Refund Pending' : order.refundStatus === 'approved' ? 'Refund Approved' : 'Refund Rejected'}
                </span>
              )}
            </div>
          </div>
          <button className="close-btn" onClick={onClose}><i className="fas fa-times"></i></button>
        </div>

        <div className="modal-body">
          {!isPaid && <div className="flow-notice warning"><i className="fas fa-exclamation-triangle"></i><div><strong>Payment not yet confirmed</strong><p>Do not confirm until payment is verified via PayMongo.</p></div></div>}
          {isPaid && currentStatus === 'pending' && !isLbc && <div className="flow-notice success"><i className="fas fa-check-circle"></i><div><strong>Payment received!</strong><p>Confirm order below. Riders can then claim it by scanning the waybill.</p></div></div>}
          {isPaid && currentStatus === 'pending' && isLbc && <div className="flow-notice success"><i className="fas fa-box"></i><div><strong>Payment received — LBC Express</strong><p>Confirm below. This outside-NCR order will not go to riders; ship via LBC and send the tracking ID to the customer.</p></div></div>}
          {isPaid && currentStatus === 'confirmed' && !isLbc && <div className="flow-notice info"><i className="fas fa-motorcycle"></i><div><strong>Processing</strong><p>Order confirmed — visible to riders. They claim it by scanning the waybill.</p></div></div>}
          {isPaid && currentStatus === 'confirmed' && isLbc && <div className="flow-notice info"><i className="fas fa-truck"></i><div><strong>Processing — LBC</strong><p>Mark as Shipped below (upload photo → auto-sent to customer chat). Then Confirm Deliver in the LBC tab.</p></div></div>}
          {isPaid && currentStatus === 'shipped' && isLbc && <div className="flow-notice purple"><i className="fas fa-shipping-fast"></i><div><strong>Shipped — LBC</strong><p>Order is in the Shipped tab. Confirm Deliver in the LBC tab with delivery proof when LBC finishes.</p></div></div>}
          {isRiderManaged && !isLbc && <div className="flow-notice purple"><i className="fas fa-shipping-fast"></i><div><strong>Rider is handling delivery</strong><p>Rider confirms via OTP + photo proof.</p></div></div>}
          {order.cancelRequestStatus === 'requested' && (
            <div className="flow-notice warning">
              <i className="fas fa-ban"></i>
              <div>
                <strong>Customer requested cancellation</strong>
                <p>Review this under Canceled → Request Cancel before confirming the order.</p>
              </div>
            </div>
          )}

          <div className="order-modal-split">
          <div className="order-modal-pane order-modal-pane--left">

          <div className="modal-section">
            <h3><i className="fas fa-user"></i> {isWalkIn ? 'Walk-in Details' : 'Customer Information'}</h3>
            <div className="order-info-grid">
              <div className="info-item"><label>Full Name</label><strong>{order.customerName || 'N/A'}</strong></div>
              {showCustomerEmail && (
                <div className="info-item"><label>Email</label><span>{order.email || 'N/A'}</span></div>
              )}
              {(!isWalkIn || walkInPhone) && (
                <div className="info-item"><label>Phone</label><span>{walkInPhone || order.phone || 'N/A'}</span></div>
              )}
              {!isWalkIn && (
                <div className="info-item"><label>Delivery Address</label><span>{order.shippingAddress || 'N/A'}</span></div>
              )}
              {isWalkIn && (
                <div className="info-item"><label>Sale type</label><span>In-store / Walk-in</span></div>
              )}
            </div>
          </div>

          <div className="modal-section">
            <h3><i className="fas fa-info-circle"></i> Order Information</h3>
            <div className="order-info-grid">
              <div className="info-item"><label>Order ID</label><strong>#{formatOrderShortId(order)}</strong></div>
              <div className="info-item"><label>Date</label><span>{order._creationTime ? new Date(order._creationTime).toLocaleString('en-PH') : 'N/A'}</span></div>
              <div className="info-item"><label>Payment Method</label><span className="method-display" style={{ color: pm.color, display: 'inline-flex', alignItems: 'center', gap: 6 }}><PaymentMethodMark pm={pm} /> {pm.label}</span></div>
              <div className="info-item"><label>Payment Status</label><span className={`payment-badge ${isPaid ? 'paid' : 'pending'}`}>{isPaid ? 'Paid' : 'Pending'}</span></div>
            </div>
            {walkInNote && (
              <div className="customer-note-box">
                <label><i className="fas fa-sticky-note"></i> {isWalkIn ? 'Note' : 'Customer Note'}</label>
                <p>{walkInNote}</p>
              </div>
            )}
          </div>

          {hasPromo && (
            <div className="modal-section">
              <h3><i className="fas fa-tag"></i> Promo Applied</h3>
              <div className="promo-admin-card">
                <div className="promo-admin-top"><div className="promo-admin-badge"><i className="fas fa-ticket-alt"></i><span>{order.promoCode}</span></div></div>
                <div className="promo-admin-details">
                  {order.discountPercent > 0 && <div className="promo-admin-row"><span>Discount</span><strong>{order.discountPercent}% off</strong></div>}
                  <div className="promo-admin-row discount"><span>Amount Saved</span><strong>−₱{discount.toLocaleString('en-PH')}</strong></div>
                  <div className="promo-admin-row final"><span>Final Charged</span><strong>₱{finalTotal.toLocaleString('en-PH')}</strong></div>
                </div>
              </div>
            </div>
          )}

          {order.riderInfo && (
            <div className="modal-section">
              <h3><DkIcon name={DK_ICONS.assignedRider} size={16} /> Assigned Rider</h3>
              <div className="order-info-grid">
                <div className="info-item"><label>Name</label><strong>{order.riderInfo.name || 'N/A'}</strong></div>
                <div className="info-item"><label>Phone</label><span>{order.riderInfo.phone || 'N/A'}</span></div>
                <div className="info-item"><label>Plate</label><span>{order.riderInfo.plate || 'N/A'}</span></div>
              </div>
            </div>
          )}

          {Array.isArray(order.deliveryFailedAttempts) && order.deliveryFailedAttempts.length > 0 && (
            <div className="modal-section">
              <h3><i className="fas fa-exclamation-triangle"></i> Failed Delivery Attempts</h3>
              <div className="failed-attempts-admin-list">
                {order.deliveryFailedAttempts.map((a, idx) => {
                  const lat = Number(a?.lat);
                  const lng = Number(a?.lng);
                  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
                  const mapsUrl = hasCoords
                    ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`
                    : null;
                  return (
                    <div key={idx} className="failed-attempt-admin-card">
                      <div className="failed-attempt-admin-top">
                        <strong>Attempt {a?.attempt || idx + 1}/3</strong>
                        <span>{a?.at ? new Date(a.at).toLocaleString('en-PH') : '—'}</span>
                      </div>
                      <p className="failed-attempt-admin-msg">
                        {a?.reason
                          ? `Delivery attempt was unsuccessful : Recipient Request Reschedule Delivery — Reason: ${a.reason}`
                          : 'Delivery attempt was unsuccessful : Recipient Request Reschedule Delivery'}
                      </p>
                      {a?.riderName && (
                        <div className="failed-attempt-admin-meta"><i className="fas fa-motorcycle"></i> {a.riderName}</div>
                      )}
                      {a?.deviceLabel && (
                        <div className="failed-attempt-admin-meta"><i className="fas fa-mobile-alt"></i> {a.deviceLabel}</div>
                      )}
                      {(a?.address || hasCoords) && (
                        <div className="failed-attempt-admin-gps">
                          <i className="fas fa-map-marker-alt"></i>
                          <span>{a?.address || `${lat.toFixed(6)}, ${lng.toFixed(6)}`}</span>
                          {a?.accuracy != null && <em>±{Math.round(a.accuracy)}m</em>}
                          {mapsUrl && (
                            <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
                              View on map
                            </a>
                          )}
                        </div>
                      )}
                      {a?.photo && (
                        <div className="failed-attempt-admin-photo-wrap">
                          <img src={a.photo} alt={`Failed attempt ${a?.attempt || idx + 1}`} className="failed-attempt-admin-photo" />
                          <a href={a.photo} target="_blank" rel="noopener noreferrer">Open photo</a>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {(hasDeliveryProof || otpVerified) && (
            <div className="modal-section">
              <h3><i className="fas fa-shield-alt"></i> Proof of Delivery</h3>
              <div className="pod-card">
                <div className={`pod-otp-row ${otpVerified ? 'verified' : 'unverified'}`}>
                  <div className="pod-otp-icon"><i className={`fas ${otpVerified ? 'fa-check-circle' : 'fa-times-circle'}`}></i></div>
                  <div className="pod-otp-text"><strong>OTP Verification</strong><span>{otpVerified ? 'Verified by rider' : 'Not yet verified'}</span></div>
                  {otpVerified && <span className="pod-otp-badge">Verified</span>}
                </div>
                {order.deliveryConfirmedAt && <div className="pod-timestamp"><i className="fas fa-clock"></i><span>Confirmed: {new Date(order.deliveryConfirmedAt).toLocaleString('en-PH')}</span></div>}
                {hasDeliveryProof && (
                  <div className="pod-photo-section">
                    <div className="pod-photo-header" onClick={() => setProofExpanded(!proofExpanded)}>
                      <div className="pod-photo-label"><i className="fas fa-camera"></i><strong>Delivery Photo</strong></div>
                      <button className="pod-toggle-btn"><i className={`fas ${proofExpanded ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>{proofExpanded ? 'Hide' : 'Show'}</button>
                    </div>
                    {proofExpanded && <div className="pod-photo-wrap"><img src={order.deliveryProofPhoto} alt="Proof" className="pod-photo" /><a href={order.deliveryProofPhoto} download={`proof-${formatOrderShortId(order)}.jpg`} className="pod-download-btn"><i className="fas fa-download"></i> Download</a></div>}
                  </div>
                )}
              </div>
            </div>
          )}

          {hasCancelRequest && (
            <div className="modal-section">
              <h3><i className="fas fa-ban"></i> Cancel Request</h3>
              <div className={`admin-refund-card admin-refund-${order.cancelRequestStatus}`}>
                <div className="admin-refund-details">
                  <div className="admin-refund-row">
                    <span>Customer reason</span>
                    <strong style={{ fontStyle: 'italic' }}>"{order.cancelRequestReason || '—'}"</strong>
                  </div>
                  {isPaid && (
                    <div className="admin-refund-row admin-refund-amount-row">
                      <span>Refund if approved</span>
                      <strong className="admin-refund-amount-value">₱{finalTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong>
                    </div>
                  )}
                  {order.cancelRequestMethod && (
                    <div className="admin-refund-row">
                      <span>Refund to</span>
                      <strong className="admin-refund-method-cell">
                        <PaymentMethodMark pm={REFUND_METHOD_LABELS[order.cancelRequestMethod]} size={18} />
                        <span style={{ color: REFUND_METHOD_LABELS[order.cancelRequestMethod]?.color }}>
                          {REFUND_METHOD_LABELS[order.cancelRequestMethod]?.label}
                        </span>
                        {order.cancelRequestPhone ? ` · ${order.cancelRequestPhone}` : ''}
                      </strong>
                    </div>
                  )}
                  <div className="admin-refund-row">
                    <span>Requested at</span>
                    <strong>{order.cancelRequestedAt ? new Date(order.cancelRequestedAt).toLocaleString('en-PH') : '—'}</strong>
                  </div>
                  {order.cancelRequestStatus !== 'requested' && order.cancelResolvedAt && (
                    <div className="admin-refund-row">
                      <span>Resolved at</span>
                      <strong>{new Date(order.cancelResolvedAt).toLocaleString('en-PH')}</strong>
                    </div>
                  )}
                  {order.cancelRequestNote && (
                    <div className="admin-refund-row">
                      <span>Admin note</span>
                      <strong>{order.cancelRequestNote}</strong>
                    </div>
                  )}
                </div>
                {order.cancelRequestStatus === 'requested' && (
                  <div className="admin-refund-action">
                    {isPaid && (
                      <div className="admin-cancel-paymongo-card">
                        <div className="admin-cancel-paymongo-head">
                          <i className="fas fa-money-bill-transfer"></i>
                          <strong>PayMongo refund · send money back</strong>
                        </div>
                        <div className="admin-cancel-paymongo-row">
                          <span>Amount to return</span>
                          <strong>₱{finalTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong>
                        </div>
                        <div className="admin-cancel-paymongo-row">
                          <span>Wallet</span>
                          <strong className="admin-refund-method-cell">
                            <PaymentMethodMark
                              pm={REFUND_METHOD_LABELS[order.cancelRequestMethod] || getPaymentMethodLabel(order)}
                              size={18}
                            />
                            <span style={{ color: (REFUND_METHOD_LABELS[order.cancelRequestMethod] || getPaymentMethodLabel(order))?.color }}>
                              {(REFUND_METHOD_LABELS[order.cancelRequestMethod] || getPaymentMethodLabel(order))?.label || 'GCash / Maya'}
                            </span>
                          </strong>
                        </div>
                        <div className="admin-cancel-paymongo-row">
                          <span>Account / phone</span>
                          <strong>{order.cancelRequestPhone || order.phone || '—'}</strong>
                        </div>
                        <div className="admin-cancel-paymongo-row">
                          <span>Customer</span>
                          <strong>{order.customerName || '—'}</strong>
                        </div>
                        <div className="admin-paymongo-brands">
                          <img src="/images/payments/gcash.svg" alt="GCash" />
                          <img src="/images/payments/maya.svg" alt="Maya" />
                          <span>Secured by PayMongo</span>
                        </div>
                        <p className="admin-cancel-paymongo-hint">
                          Approving opens PayMongo refund to the customer’s original GCash/Maya — same payment rails as checkout.
                        </p>
                      </div>
                    )}
                    <div className="admin-refund-confirm-notice">
                      <i className="fas fa-info-circle"></i>
                      <span>
                        Approving will cancel the order
                        {isPaid ? ` and return ₱${finalTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })} via PayMongo` : ''}.
                      </span>
                    </div>
                    {isPaid && (
                      <div className="admin-cancel-proof-upload">
                        <label className="admin-refund-note-label">
                          <i className="fas fa-camera"></i> Refund proof screenshot <span className="refund-required">*</span>
                        </label>
                        <input
                          ref={cancelProofInputRef}
                          type="file"
                          accept={IMAGE_ACCEPT_NO_GIF}
                          onChange={handleCancelProofChange}
                          style={{ display: 'none' }}
                        />
                        {!cancelProofPreview ? (
                          <button
                            type="button"
                            className="admin-cancel-proof-btn"
                            onClick={() => cancelProofInputRef.current?.click()}
                            disabled={resolvingCancel}
                          >
                            <i className="fas fa-cloud-upload-alt"></i> Optional screenshot (JPG/PNG · no GIF)
                          </button>
                        ) : (
                          <div className="admin-cancel-proof-preview">
                            <img src={cancelProofPreview} alt="Refund proof" />
                            <button type="button" className="admin-cancel-proof-remove" onClick={clearCancelProof} disabled={resolvingCancel}>
                              <i className="fas fa-trash"></i> Remove
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    <label className="admin-refund-note-label">
                      <i className="fas fa-comment-alt"></i> Response note <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span>
                    </label>
                    <textarea
                      className="admin-refund-note-input"
                      placeholder="e.g. Cancel approved / reason for decline…"
                      value={cancelAdminNote}
                      onChange={(e) => setCancelAdminNote(e.target.value)}
                      rows={2}
                    />
                    {cancelProofError && (
                      <div className="admin-cancel-proof-error">
                        <i className="fas fa-exclamation-circle"></i> {cancelProofError}
                      </div>
                    )}
                    <div className="admin-refund-action-btns">
                      <button
                        className="admin-refund-reject-btn"
                        onClick={() => handleCancelRequestResolve('rejected')}
                        disabled={resolvingCancel}
                      >
                        {resolvingCancel ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-times-circle"></i>} Decline
                      </button>
                      <button
                        className="admin-refund-approve-btn"
                        onClick={() => handleCancelRequestResolve('approved')}
                        disabled={resolvingCancel}
                      >
                        {resolvingCancel
                          ? <i className="fas fa-spinner fa-spin"></i>
                          : <i className="fas fa-credit-card"></i>}
                        {isPaid ? 'PayMongo Refund & Cancel' : 'Approve Cancel'}
                      </button>
                    </div>
                  </div>
                )}
                {order.cancelRequestStatus === 'approved' && (
                  <div className="admin-refund-resolved approved">
                    <i className="fas fa-check-circle"></i>
                    <span>Cancel request approved. Order cancelled.</span>
                    {cancelProofUrl && (
                      <a href={cancelProofUrl} target="_blank" rel="noreferrer" className="admin-cancel-proof-link">
                        <i className="fas fa-image"></i> View refund proof
                      </a>
                    )}
                  </div>
                )}
                {order.cancelRequestStatus === 'rejected' && (
                  <div className="admin-refund-resolved rejected">
                    <i className="fas fa-times-circle"></i>
                    <span>Cancel request declined. Order continues.</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {hasRefund && (
            <div className="modal-section">
              <h3><i className="fas fa-undo-alt"></i> Refund Request</h3>
              <div className={`admin-refund-card admin-refund-${order.refundStatus}`}>
                <div className="admin-refund-details">
                  <div className="admin-refund-row"><span>Reason</span><strong>📦 Item arrived damaged</strong></div>
                  <div className="admin-refund-row admin-refund-amount-row"><span>Refund Amount</span><strong className="admin-refund-amount-value">₱{refundAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong></div>
                  {order.refundMethod && (
                    <div className="admin-refund-row"><span>Refund to</span>
                      <strong className="admin-refund-method-cell">
                        <PaymentMethodMark pm={REFUND_METHOD_LABELS[order.refundMethod]} size={18} />
                        <span style={{ color: REFUND_METHOD_LABELS[order.refundMethod]?.color }}>{REFUND_METHOD_LABELS[order.refundMethod]?.label}</span>
                        {' · '}{order.refundAccountName}{order.refundAccountNumber ? ` (${order.refundAccountNumber})` : ''}
                      </strong>
                    </div>
                  )}
                  {order.refundComment && <div className="admin-refund-row"><span>Customer note</span><strong style={{ fontStyle: 'italic' }}>"{order.refundComment}"</strong></div>}
                  <div className="admin-refund-row"><span>Requested at</span><strong>{order.refundRequestedAt ? new Date(order.refundRequestedAt).toLocaleString('en-PH') : '—'}</strong></div>
                  {order.refundStatus !== 'requested' && order.refundResolvedAt && <div className="admin-refund-row"><span>Resolved at</span><strong>{new Date(order.refundResolvedAt).toLocaleString('en-PH')}</strong></div>}
                  {order.refundAdminNote && <div className="admin-refund-row"><span>Admin note</span><strong>{order.refundAdminNote}</strong></div>}
                </div>
                {order.refundPhotoId && (
                  <div className="admin-refund-photo-section">
                    <div className="admin-refund-photo-header" onClick={() => setPhotoExpanded2(!photoExpanded2)}>
                      <div className="admin-refund-photo-label"><i className="fas fa-camera"></i><strong>Damage Photo</strong></div>
                      <button className="pod-toggle-btn" type="button"><i className={`fas ${photoExpanded2 ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>{photoExpanded2 ? 'Hide' : 'View'}</button>
                    </div>
                    {photoExpanded2 && (
                      <div className="admin-refund-photo-wrap">
                        {refundPhotoUrl ? <><img src={refundPhotoUrl} alt="Damage" className="admin-refund-photo" /><a href={refundPhotoUrl} download={`damage-${formatOrderShortId(order)}.jpg`} className="pod-download-btn"><i className="fas fa-download"></i> Download</a></> : <div className="admin-refund-photo-loading"><i className="fas fa-spinner fa-spin"></i> Loading…</div>}
                      </div>
                    )}
                  </div>
                )}
                {order.refundStatus === 'requested' && (
                  <div className="admin-refund-action">
                    <div className="admin-cancel-paymongo-card admin-refund-paymongo-card">
                      <div className="admin-cancel-paymongo-head">
                        <i className="fas fa-credit-card"></i>
                        <strong>PayMongo refund · pay customer back</strong>
                      </div>
                      <div className="admin-cancel-paymongo-row">
                        <span>Amount to return</span>
                        <strong>₱{refundAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong>
                      </div>
                      <div className="admin-cancel-paymongo-row">
                        <span>Return via</span>
                        <strong className="admin-refund-method-cell">
                          <PaymentMethodMark
                            pm={REFUND_METHOD_LABELS[order.refundMethod] || getPaymentMethodLabel(order)}
                            size={18}
                          />
                          <span style={{ color: (REFUND_METHOD_LABELS[order.refundMethod] || getPaymentMethodLabel(order))?.color }}>
                            {(REFUND_METHOD_LABELS[order.refundMethod] || getPaymentMethodLabel(order))?.label || 'GCash / Maya'}
                          </span>
                        </strong>
                      </div>
                      <div className="admin-cancel-paymongo-row">
                        <span>Account</span>
                        <strong>
                          {order.refundAccountName || '—'}
                          {order.refundAccountNumber ? ` · ${order.refundAccountNumber}` : ''}
                        </strong>
                      </div>
                      <div className="admin-paymongo-brands">
                        <img src="/images/payments/gcash.svg" alt="GCash" />
                        <img src="/images/payments/maya.svg" alt="Maya" />
                        <span>Secured by PayMongo</span>
                      </div>
                      <p className="admin-cancel-paymongo-hint">
                        Same as customer checkout: PayMongo returns the paid amount to their original GCash/Maya wallet.
                      </p>
                      <button
                        type="button"
                        className="admin-paymongo-pay-btn"
                        onClick={() => handleRefundResolve('approved')}
                        disabled={resolvingRefund}
                      >
                        {resolvingRefund
                          ? <><i className="fas fa-spinner fa-spin"></i> Processing PayMongo…</>
                          : <><i className="fas fa-lock"></i> Continue to PayMongo Refund</>}
                      </button>
                    </div>
                    <label className="admin-refund-note-label"><i className="fas fa-comment-alt"></i> Response note <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span></label>
                    <textarea
                      className="admin-refund-note-input"
                      placeholder="e.g. We've processed your refund…"
                      value={refundAdminNote}
                      rows={2}
                      maxLength={300}
                      onChange={(e) => {
                        setRefundAdminNote(e.target.value);
                        const el = e.target;
                        el.style.height = '64px';
                        if (el.scrollHeight > 64) {
                          el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
                        }
                      }}
                    />
                    <div className="admin-refund-action-btns">
                      <button className="admin-refund-reject-btn" onClick={() => setShowRejectConfirm(true)} disabled={resolvingRefund}>{resolvingRefund ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-times-circle"></i>} Reject</button>
                    </div>
                  </div>
                )}
                {order.refundStatus === 'approved' && <div className="admin-refund-resolved approved"><i className="fas fa-check-circle"></i><span>Refund of <strong>₱{refundAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong> approved and paid.</span></div>}
                {order.refundStatus === 'rejected' && <div className="admin-refund-resolved rejected"><i className="fas fa-times-circle"></i><span>Refund request rejected.</span></div>}
              </div>
            </div>
          )}

          </div>{/* end left pane */}

          <div className="order-modal-pane order-modal-pane--right">

          <div className="modal-section">
            <h3><i className="fas fa-box"></i> Order Items ({order.items?.length || 0})</h3>
            <div className="order-items-list">
              {(order.items?.length ? [order.items[0]] : []).map((item, index) => (
                <div key={index} className="order-item-card">
                  <div className="item-image"><img src={item.image} alt={item.name || 'Product'} onError={e => { e.target.onerror = null; e.target.src = '/images/dklogo.jpg'; }} /></div>
                  <div className="item-details"><strong>{item.name || 'N/A'}</strong><p className="item-price">₱{(item.price || 0).toLocaleString('en-PH')} x {item.quantity || 0}</p></div>
                  <div className="item-subtotal">₱{((item.quantity || 0) * (item.price || 0)).toLocaleString('en-PH')}</div>
                </div>
              ))}
            </div>
            {(order.items?.length || 0) > 1 && (
              <button
                type="button"
                className="order-view-all-items-btn"
                onClick={() => setShowItemsModal(true)}
              >
                <i className="fas fa-list"></i>
                View all items ({order.items.length})
              </button>
            )}
          </div>

          <div className="modal-section">
            <h3><i className="fas fa-calculator"></i> Order Summary</h3>
            <div className="order-totals">
              <div className="total-row"><span>Subtotal:</span><strong>₱{subtotal.toLocaleString('en-PH')}</strong></div>
              {!isWalkIn && (
                <div className="total-row">
                  <span>Shipping:</span>
                  <strong>
                    {isLbc
                      ? 'LBC · arrange with customer'
                      : `₱${shippingFee.toLocaleString('en-PH')}`}
                  </strong>
                </div>
              )}
              {hasPromo && <>
                <div className="total-row promo-discount-admin-row"><span><i className="fas fa-tag" style={{ marginRight: '6px', color: '#ec4899' }}></i>Promo ({order.promoCode}):</span><strong>−₱{discount.toLocaleString('en-PH')}</strong></div>
                <div className="total-row"><span style={{ color: '#6b7280' }}>Original:</span><strong style={{ color: '#6b7280', textDecoration: 'line-through' }}>₱{originalTotal.toLocaleString('en-PH')}</strong></div>
              </>}
              {paymentFee > 0 && (
                <div className="total-row">
                  <span>
                    Handling Fee ({paymentFeeLabel}{paymentFeePct ? ` ${paymentFeePct}` : ''}):
                  </span>
                  <strong>₱{paymentFee.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                </div>
              )}
              <div className="total-row grand-total"><span>{hasPromo ? 'Final Charged:' : 'Total:'}</span><strong>₱{Number(finalTotal).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
            </div>
          </div>

          {/* ── UPDATE ORDER STATUS ── */}
          <div className="modal-section">
            <h3><i className="fas fa-tasks"></i> Update Order Status</h3>
            {isDone && (
              <div className={`status-done-notice ${currentStatus}`}>
                <i className={`fas ${currentStatus === 'completed' ? 'fa-check-circle' : 'fa-ban'}`}></i>
                <span>{currentStatus === 'completed' ? 'Order completed.' : 'Order cancelled.'}</span>
              </div>
            )}
            {isRiderManaged && (
              <div className="rider-managed-notice"><i className="fas fa-motorcycle"></i><div><strong>Rider handling delivery</strong><p>Status updates automatically via OTP + photo.</p></div></div>
            )}
            {!isDone && !isRiderManaged && (
              <div className="status-buttons">
                {currentStatus === 'pending' && (
                  <div className="status-btn-wrapper">
                    <button
                      className={`status-btn confirmed ${!canConfirm ? 'is-blocked' : ''}`}
                      onClick={() => canConfirm && onUpdateStatus(order.orderId, 'confirmed')}
                      disabled={!canConfirm}
                    >
                      <i className="fas fa-check-circle"></i><span>Confirm Order</span>
                    </button>
                    {!isPaid && <div className="block-reason"><i className="fas fa-lock"></i> Awaiting payment</div>}
                  </div>
                )}
                {isLbc && isPaid && currentStatus === 'confirmed' && (
                  <div className="status-btn-wrapper status-btn-wrapper--lbc-ship">
                    <div className="lbc-ship-box">
                      <label className="lbc-ship-label">
                        <i className="fas fa-camera"></i> Shipping photo <em>(required)</em>
                      </label>
                      <button
                        type="button"
                        className={`lbc-ship-drop ${lbcShipPhoto ? 'has-photo' : ''}`}
                        onClick={() => lbcShipInputRef.current?.click()}
                      >
                        {lbcShipPhoto ? (
                          <img src={lbcShipPhoto} alt="LBC shipping proof" className="lbc-ship-preview" />
                        ) : (
                          <span><i className="fas fa-cloud-upload-alt"></i> Upload photo to ship</span>
                        )}
                      </button>
                      <input
                        ref={lbcShipInputRef}
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (!file) return;
                          if (file.size > 4_500_000) {
                            alert('Photo is too large. Please use a smaller image.');
                            return;
                          }
                          const reader = new FileReader();
                          reader.onload = (ev) => setLbcShipPhoto(String(ev.target?.result || ''));
                          reader.readAsDataURL(file);
                        }}
                      />
                      {lbcShipPhoto && (
                        <button type="button" className="lbc-ship-remove" onClick={() => setLbcShipPhoto('')}>
                          Remove photo
                        </button>
                      )}
                      <button
                        type="button"
                        className="status-btn shipped lbc-ship-submit"
                        disabled={!lbcShipPhoto || shippingLbc || !onMarkLbcShipped}
                        onClick={async () => {
                          if (!lbcShipPhoto || !onMarkLbcShipped) return;
                          setShippingLbc(true);
                          try {
                            let imageStorageId;
                            if (generateChatUploadUrl) {
                              try {
                                const uploadUrl = await generateChatUploadUrl({});
                                const blob = await (await fetch(lbcShipPhoto)).blob();
                                const res = await fetch(uploadUrl, {
                                  method: 'POST',
                                  headers: { 'Content-Type': blob.type || 'image/jpeg' },
                                  body: blob,
                                });
                                if (res.ok) {
                                  const json = await res.json();
                                  imageStorageId = json.storageId;
                                }
                              } catch (uploadErr) {
                                console.warn('Chat photo upload failed, sending text only', uploadErr);
                              }
                            }
                            const result = await onMarkLbcShipped(order.orderId, {
                              photo: lbcShipPhoto,
                              imageStorageId,
                            });
                            if (!result?.success && !result?.alreadyShipped) {
                              alert(result?.message || 'Failed to mark as shipped.');
                            } else {
                              setLbcShipPhoto('');
                            }
                          } catch (err) {
                            console.error(err);
                            alert(err?.message || 'Failed to mark as shipped.');
                          } finally {
                            setShippingLbc(false);
                          }
                        }}
                      >
                        {shippingLbc
                          ? <><i className="fas fa-spinner fa-spin"></i><span>Shipping…</span></>
                          : <><i className="fas fa-shipping-fast"></i><span>Shipped</span></>}
                      </button>
                      <div className="block-reason" style={{ color: '#6366f1' }}>
                        <i className="fas fa-info-circle"></i> Photo auto-sends to customer chat · moves to Shipped tab
                      </div>
                    </div>
                  </div>
                )}
                {isLbc && currentStatus === 'shipped' && (
                  <div className="status-btn-wrapper">
                    <button className="status-btn shipped is-current is-blocked" disabled>
                      <i className="fas fa-shipping-fast"></i><span>Shipped</span>
                      <span className="current-indicator">LBC</span>
                    </button>
                    <div className="block-reason" style={{ color: '#6366f1' }}>
                      <i className="fas fa-check"></i> Shipped — Confirm Deliver in LBC tab
                    </div>
                  </div>
                )}
                {!isDone && (
                  <div className="status-btn-wrapper">
                    <button
                      className={`status-btn cancelled ${!canCancel ? 'is-blocked' : ''}`}
                      onClick={() => canCancel && setShowCancelModal(true)}
                      disabled={!canCancel}
                      title={
                        canCancel
                          ? (isPaid ? 'Cancel & refund via PayMongo' : 'Cancel Order')
                          : 'Already confirmed — cancel is locked'
                      }
                    >
                      <i className="fas fa-times-circle"></i><span>Cancel Order</span>
                    </button>
                    {isPaid && currentStatus === 'pending' && (
                      <div className="block-reason" style={{ color: '#0ea5e9' }}>
                        <i className="fas fa-info-circle"></i> Paid + pending — cancel will auto-refund
                      </div>
                    )}
                    {currentStatus !== 'pending' && (
                      <div className="block-reason">
                        <i className="fas fa-lock"></i> Confirmed — cancel is no longer available
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {currentStatus === 'cancelled' && order.cancelReason && (
            <div className="modal-section">
              <h3><i className="fas fa-ban"></i> Cancellation Reason</h3>
              <div className="cancel-reason-display"><i className="fas fa-quote-left"></i><p>{order.cancelReason}</p></div>
            </div>
          )}

          <div className="modal-actions">
            {canPrintWaybill && (
              <button
                className="print-waybill-btn-bottom"
                onClick={() => setShowWaybill(true)}
                title="Print Waybill"
              >
                <i className="fas fa-print"></i> Print Waybill
              </button>
            )}
          </div>

          </div>{/* end right pane */}
          </div>{/* end split */}
        </div>
      </div>

      {showCancelModal && <CancelReasonModal order={order} onConfirm={reason => { onCancelWithReason(order.orderId, reason); setShowCancelModal(false); }} onClose={() => setShowCancelModal(false)} />}
      {showRejectConfirm && <RejectConfirmDialog order={order} adminNote={refundAdminNote} onConfirm={() => handleRefundResolve('rejected')} onCancel={() => setShowRejectConfirm(false)} />}
      {showWaybill && <WaybillModal order={order} onClose={() => setShowWaybill(false)} />}
      {showItemsModal && (
        <OrderItemsListModal
          order={order}
          onClose={() => setShowItemsModal(false)}
        />
      )}
    </div>,
    getOverlayRoot() || document.body
  );
};

const OrderItemsListModal = ({ order, onClose }) => {
  useBodyScrollLock(true);
  const items = order.items || [];
  const [pageSize, setPageSize] = useState(5);
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageItems = items.slice(start, start + pageSize);
  const showingFrom = items.length === 0 ? 0 : start + 1;
  const showingTo = Math.min(start + pageSize, items.length);

  const handlePageSizeChange = (e) => {
    setPageSize(Number(e.target.value));
    setPage(1);
  };

  return (
    <div className="order-items-modal-overlay" onClick={onClose}>
      <div className="order-items-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="order-items-modal-header">
          <div>
            <h3><i className="fas fa-box-open"></i> All Order Items</h3>
            <p>Order #{formatOrderShortId(order)} · {items.length} item{items.length === 1 ? '' : 's'}</p>
          </div>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Close">
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="order-items-modal-body">
          <ul
            className="order-items-modal-list dk-fixed-page dk-fixed-page--stack"
            style={fixedPageStyle(pageSize, { '--dk-row-h': '72px', '--dk-gap': '8px' })}
          >
            {pageItems.map((item, index) => {
              const absoluteIndex = start + index;
              const lineTotal = (item.quantity || 0) * (item.price || 0);
              return (
                <li key={absoluteIndex} className="order-items-modal-row">
                  <span className="order-items-modal-index">{absoluteIndex + 1}</span>
                  <div className="order-items-modal-thumb">
                    <img
                      src={item.image}
                      alt={item.name || 'Product'}
                      onError={e => { e.target.onerror = null; e.target.src = '/images/dklogo.jpg'; }}
                    />
                  </div>
                  <div className="order-items-modal-info">
                    <strong>{item.name || 'N/A'}</strong>
                    <span>₱{(item.price || 0).toLocaleString('en-PH')} × {item.quantity || 0}</span>
                  </div>
                  <div className="order-items-modal-total">
                    ₱{lineTotal.toLocaleString('en-PH')}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="order-items-modal-footer">
          <div className="order-items-modal-pagination">
            <label className="order-items-page-size">
              <span>Show</span>
              <select value={pageSize} onChange={handlePageSizeChange}>
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={15}>15</option>
                <option value={20}>20</option>
              </select>
            </label>
            <span className="order-items-page-meta">
              {showingFrom}–{showingTo} of {items.length}
            </span>
            <div className="order-items-page-nav">
              <button
                type="button"
                className="order-items-page-btn"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
              >
                <i className="fas fa-chevron-left"></i> Previous
              </button>
              <span className="order-items-page-indicator">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                className="order-items-page-btn"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
              >
                Next <i className="fas fa-chevron-right"></i>
              </button>
            </div>
          </div>
          <button type="button" className="order-items-modal-done" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

const CANCEL_PRESETS = [
  'Item is out of stock', 'Customer requested cancellation', 'Duplicate order',
  'Payment issue / not verified',
  'Hindi kinuna ni customer or hindi sumasagot sa tawag ni rider',
  'Incorrect order details', 'Fraudulent order detected', 'Other reason',
];

const CancelReasonModal = ({ order, onConfirm, onClose }) => {
  useBodyScrollLock(true);
  const [selectedPreset, setSelectedPreset] = useState('');
  const [customReason,   setCustomReason]   = useState('');
  const [error,          setError]          = useState('');
  const isOther     = selectedPreset === 'Other reason';
  const finalReason = isOther ? customReason.trim() : selectedPreset;
  const isPaidPending =
    String(order?.paymentStatus || '').toLowerCase() === 'paid'
    && String(order?.orderStatus || '').toLowerCase() === 'pending';

  return (
    <div className="cancel-reason-overlay" onClick={onClose}>
      <div className="cancel-reason-modal" onClick={e => e.stopPropagation()}>
        <div className="cancel-reason-header">
          <div className="cancel-reason-icon"><i className="fas fa-ban"></i></div>
          <div><h3>Cancel Order</h3><p>Order #{formatOrderShortId(order)}</p></div>
          <button className="close-btn" onClick={onClose}><i className="fas fa-times"></i></button>
        </div>
        <div className="cancel-reason-body">
          <p className="cancel-reason-prompt">Select or enter a cancellation reason.</p>
          {isPaidPending && (
            <p className="cancel-reason-prompt" style={{ color: '#0ea5e9', marginTop: 0 }}>
              This order is paid but not confirmed yet — cancelling will refund the customer via PayMongo.
            </p>
          )}
          <div className="cancel-presets">
            {CANCEL_PRESETS.map(preset => (
              <button key={preset} className={`cancel-preset-chip ${selectedPreset === preset ? 'active' : ''}`} onClick={() => { setSelectedPreset(preset); setError(''); if (preset !== 'Other reason') setCustomReason(''); }}>
                {selectedPreset === preset && <i className="fas fa-check"></i>} {preset}
              </button>
            ))}
          </div>
          {isOther && (
            <div className="cancel-custom-wrap">
              <label>Specify reason <span className="required">*</span></label>
              <textarea className="cancel-custom-input" placeholder="Type cancellation reason…" value={customReason} onChange={e => { setCustomReason(e.target.value); setError(''); }} rows={3} maxLength={300} autoFocus />
              <div className="char-count">{customReason.length}/300</div>
            </div>
          )}
          {error && <div className="cancel-error"><i className="fas fa-exclamation-circle"></i> {error}</div>}
        </div>
        <div className="cancel-reason-footer">
          <button className="cancel-go-back-btn" onClick={onClose}><i className="fas fa-arrow-left"></i> Go Back</button>
          <button className="cancel-confirm-btn" onClick={() => { if (!finalReason) { setError('Please select or enter a reason.'); return; } onConfirm(finalReason); }} disabled={!finalReason}>
            <i className="fas fa-ban"></i> Confirm Cancellation
          </button>
        </div>
      </div>
    </div>
  );
};

/* ══════════════════════════════════════
   Walk-in / Manual Record modal
══════════════════════════════════════ */
const WalkInRecordModal = ({ onClose, onSubmit }) => {
  useBodyScrollLock(true);
  const { confirm } = useConfirm();
  const products = useQuery(api.products.getAllProductsAdmin) || [];
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState([]); // { id, name, price, stock, image, quantity }
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const available = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => {
        if (p.status === 'archived' || p.status === 'hidden') return false;
        const stock = Number(p.stock);
        if (Number.isFinite(stock) && stock <= 0) return false;
        if (!q) return true;
        return (
          String(p.name || '').toLowerCase().includes(q)
          || String(p.category || '').toLowerCase().includes(q)
        );
      })
      .slice(0, 40);
  }, [products, search]);

  const total = lines.reduce((sum, l) => sum + Number(l.price || 0) * Number(l.quantity || 0), 0);

  const addProduct = (product) => {
    const id = String(product._id);
    const stock = Number(product.stock);
    setLines((prev) => {
      const existing = prev.find((l) => l.id === id);
      if (existing) {
        const nextQty = existing.quantity + 1;
        if (Number.isFinite(stock) && nextQty > stock) {
          setError(`Only ${stock} left for ${product.name}`);
          return prev;
        }
        setError('');
        return prev.map((l) => (l.id === id ? { ...l, quantity: nextQty } : l));
      }
      if (Number.isFinite(stock) && stock < 1) {
        setError(`${product.name} is out of stock`);
        return prev;
      }
      setError('');
      return [
        ...prev,
        {
          id,
          name: product.name,
          price: Number(product.price) || 0,
          stock: Number.isFinite(stock) ? stock : null,
          image: product.image || '',
          quantity: 1,
        },
      ];
    });
  };

  const setQty = (id, qty) => {
    const n = Math.max(1, Math.floor(Number(qty) || 1));
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const max = l.stock != null ? l.stock : n;
        const quantity = Math.min(n, max);
        if (quantity < n) setError(`Only ${max} left for ${l.name}`);
        else setError('');
        return { ...l, quantity };
      })
    );
  };

  const removeLine = (id) => setLines((prev) => prev.filter((l) => l.id !== id));

  const payLabel =
    paymentMethod === 'gcash' ? 'GCash' : paymentMethod === 'maya' ? 'Maya' : 'Cash';

  const handleSave = async () => {
    if (!lines.length) {
      setError('Add at least one product.');
      return;
    }
    const itemSummary = lines
      .map((l) => `• ${l.name} × ${l.quantity}`)
      .join('\n');
    const ok = await confirm({
      title: 'Confirm walk-in sale?',
      message:
        `Record this walk-in sale?\n\n${itemSummary}\n\n` +
        `Payment: ${payLabel}\n` +
        `Total: ₱${Number(total || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n\n` +
        `Stock will be deducted from inventory.`,
      confirmLabel: 'Save & Deduct Stock',
      cancelLabel: 'Cancel',
      variant: 'primary',
      icon: 'fa-store',
    });
    if (!ok) return;

    setSaving(true);
    setError('');
    try {
      await onSubmit({
        customerName: customerName.trim() || undefined,
        phone: phone.trim() || undefined,
        paymentMethod,
        notes: notes.trim() || undefined,
        items: lines.map((l) => ({ id: l.id, quantity: l.quantity })),
      });
    } catch (err) {
      const msg = String(err?.data || err?.message || err || '');
      if (msg) setError(msg.replace(/^\[.*?\]\s*/i, '').slice(0, 200));
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="walkin-overlay" onClick={onClose}>
      <div
        className="walkin-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="walkin-title"
      >
        <div className="walkin-header">
          <div>
            <h3 id="walkin-title"><i className="fas fa-cash-register"></i> Manual Record</h3>
            <p>Walk-in sale — prices match current product prices. Stock deducts on save.</p>
          </div>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Close">
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="walkin-body">
          <div className="walkin-col walkin-col--products">
            <div className="walkin-products-sticky">
              <label className="walkin-label">Available products</label>
              <input
                type="search"
                className="walkin-search"
                placeholder="Search product name or category…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>
            <div className="walkin-product-list">
              {available.length === 0 ? (
                <div className="walkin-empty">No matching products with stock.</div>
              ) : (
                available.map((p) => {
                  const stock = Number(p.stock);
                  return (
                    <button
                      key={p._id}
                      type="button"
                      className="walkin-product-row"
                      onClick={() => addProduct(p)}
                    >
                      {p.image ? (
                        <img src={p.image} alt="" className="walkin-product-thumb" />
                      ) : (
                        <span className="walkin-product-thumb walkin-product-thumb--empty">
                          <i className="fas fa-box"></i>
                        </span>
                      )}
                      <span className="walkin-product-meta">
                        <strong>{p.name}</strong>
                        <small>
                          ₱{Number(p.price || 0).toLocaleString('en-PH')}
                          {Number.isFinite(stock) ? ` · ${stock} in stock` : ''}
                        </small>
                      </span>
                      <i className="fas fa-plus walkin-product-add"></i>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="walkin-col walkin-col--cart">
            <label className="walkin-label">Items in this sale</label>
            {lines.length === 0 ? (
              <div className="walkin-empty">Tap a product to add it.</div>
            ) : (
              <ul className="walkin-lines">
                {lines.map((l) => (
                  <li key={l.id} className="walkin-line">
                    <div className="walkin-line-info">
                      <strong>{l.name}</strong>
                      <small>₱{Number(l.price).toLocaleString('en-PH')} each</small>
                    </div>
                    <div className="walkin-line-qty">
                      <button type="button" onClick={() => setQty(l.id, l.quantity - 1)} disabled={l.quantity <= 1 || saving}>−</button>
                      <input
                        type="number"
                        min={1}
                        max={l.stock ?? undefined}
                        value={l.quantity}
                        onChange={(e) => setQty(l.id, e.target.value)}
                        disabled={saving}
                      />
                      <button
                        type="button"
                        onClick={() => setQty(l.id, l.quantity + 1)}
                        disabled={saving || (l.stock != null && l.quantity >= l.stock)}
                      >
                        +
                      </button>
                    </div>
                    <strong className="walkin-line-total">
                      ₱{(l.price * l.quantity).toLocaleString('en-PH')}
                    </strong>
                    <button type="button" className="walkin-line-remove" onClick={() => removeLine(l.id)} disabled={saving} aria-label="Remove">
                      <i className="fas fa-trash"></i>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="walkin-fields">
              <label>
                Customer name <em>(optional)</em>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Walk-in Customer"
                  disabled={saving}
                />
              </label>
              <label>
                Phone <em>(optional)</em>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  placeholder="09XXXXXXXXX"
                  disabled={saving}
                />
              </label>
              <label>
                Payment method
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} disabled={saving}>
                  <option value="cash">Cash</option>
                  <option value="gcash">GCash</option>
                  <option value="maya">Maya</option>
                </select>
              </label>
              <label>
                Notes <em>(optional)</em>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. paid at counter"
                  disabled={saving}
                  maxLength={200}
                />
              </label>
            </div>

            {error && (
              <div className="walkin-error">
                <i className="fas fa-exclamation-circle"></i> {error}
              </div>
            )}
          </div>
        </div>

        <div className="walkin-footer">
          <div className="walkin-grand">
            <span>Total</span>
            <strong>₱{total.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
          </div>
          <div className="walkin-footer-actions">
            <button type="button" className="walkin-cancel" onClick={onClose} disabled={saving}>Cancel</button>
            <button
              type="button"
              className="walkin-submit"
              onClick={handleSave}
              disabled={saving || !lines.length}
            >
              {saving
                ? <><i className="fas fa-spinner fa-spin"></i> Saving…</>
                : <><i className="fas fa-check"></i> Save &amp; Deduct Stock</>}
            </button>
          </div>
        </div>
      </div>
    </div>,
    getOverlayRoot?.() || document.body
  );
};

export default AdminOrders;