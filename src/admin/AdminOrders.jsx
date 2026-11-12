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
import { isLbcOrder } from '../utils/deliveryUtils';
import { formatOrderShortId } from '../utils/orderId';
import useBodyScrollLock from '../hooks/useBodyScrollLock';
import { getOverlayRoot } from '../utils/scrollLock';
import './AdminOrders.css';

const SITE_URL = 'https://dkmerchwebsite.vercel.app';

const toDateStr = (ms) => new Date(ms).toISOString().split('T')[0];
const today     = toDateStr(Date.now());

const getPaymentMethodLabel = (order) => {
  const raw = (order.paymentMethod || '').toLowerCase();
  if (raw === 'gcash' || raw.includes('gcash'))   return { label: 'GCash', brand: 'gcash', color: '#007fff' };
  if (raw === 'maya'  || raw.includes('maya') || raw.includes('paymaya')) return { label: 'Maya', brand: 'maya', color: '#00b4aa' };
  if (raw === 'card'  || raw.includes('card'))    return { label: 'Card', icon: 'fa-credit-card', color: '#6366f1' };
  if (raw.includes('paymongo') || raw.includes('online')) return { label: 'GCash / Maya', brands: ['gcash', 'maya'], color: '#6b7280' };
  return { label: order.paymentMethod || '—', icon: 'fa-money-bill', color: '#9ca3af' };
};

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
const ORDER_PAGE_SIZES = [10, 20, 30, 40, 50];

const AdminOrders = () => {
  const { confirm } = useConfirm();
  const { showNotification } = useNotification();
  const [activeTab,     setActiveTab]     = useState('all');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [searchTerm,    setSearchTerm]    = useState('');
  const [startDate,     setStartDate]     = useState('');
  const [endDate,       setEndDate]       = useState('');
  const [pageSize,      setPageSize]      = useState(10);
  const [page,          setPage]          = useState(0);

  const orders = useQuery(api.orders.getAllOrders) || [];
  const updateOrderStatusMutation = useMutation(api.orders.updateOrderStatus);
  const updateOrderFieldsMutation = useMutation(api.orders.updateOrderFields);
  const deleteOrderMutation       = useMutation(api.orders.deleteOrder);
  const resolveRefundMutation     = useMutation(api.orders.resolveRefund);
  const rejectCustomerCancelMutation = useMutation(api.orders.rejectCustomerCancel);
  const approveCustomerCancelAction  = useAction(api.payments.approveCustomerCancel);

  const validOrders = orders.filter(o => o.orderId && o.items?.length > 0);
  const refundCount = validOrders.filter(o => o.refundStatus === 'requested').length;
  const cancelReqCount = validOrders.filter(o => o.cancelRequestStatus === 'requested').length;
  const refundTabCount = refundCount + cancelReqCount;

  const tabCounts = {
    all:       validOrders.length,
    paid:      validOrders.filter(o => o.paymentStatus === 'paid' && (!o.orderStatus || o.orderStatus === 'pending')).length,
    pending:   validOrders.filter(o => o.orderStatus === 'pending').length,
    confirmed: validOrders.filter(o => o.orderStatus === 'confirmed').length,
    completed: validOrders.filter(o => o.orderStatus === 'completed').length,
    refund:    refundTabCount,
  };

  useEffect(() => { setPage(0); }, [activeTab, searchTerm, startDate, endDate, pageSize]);

  const filteredOrders = useMemo(() => {
    return validOrders.filter(order => {
      let matchesTab = true;
      if (activeTab === 'paid') {
        matchesTab = order.paymentStatus === 'paid' && (!order.orderStatus || order.orderStatus === 'pending');
      } else if (activeTab === 'refund') {
        matchesTab = !!order.refundStatus || !!order.cancelRequestStatus;
      } else if (activeTab !== 'all') {
        matchesTab = order.orderStatus === activeTab;
      }
      const matchesSearch = !searchTerm || [order.orderId, order.customerName, order.email].some(f => f?.toLowerCase().includes(searchTerm.toLowerCase()));
      let matchesDate = true;
      if (startDate || endDate) {
        const orderDate = new Date(order._creationTime || order.createdAt || 0);
        if (startDate) { const start = new Date(startDate); start.setHours(0,0,0,0); if (orderDate < start) matchesDate = false; }
        if (endDate)   { const end   = new Date(endDate);   end.setHours(23,59,59,999); if (orderDate > end) matchesDate = false; }
      }
      return matchesTab && matchesSearch && matchesDate;
    }).sort((a, b) => {
      if (activeTab === 'refund') {
        const aTime = Math.max(
          a.refundRequestedAt ? new Date(a.refundRequestedAt).getTime() : 0,
          a.cancelRequestedAt ? new Date(a.cancelRequestedAt).getTime() : 0,
        );
        const bTime = Math.max(
          b.refundRequestedAt ? new Date(b.refundRequestedAt).getTime() : 0,
          b.cancelRequestedAt ? new Date(b.cancelRequestedAt).getTime() : 0,
        );
        return bTime - aTime;
      }
      return (b._creationTime || 0) - (a._creationTime || 0);
    });
  }, [validOrders, activeTab, searchTerm, startDate, endDate]);

  const pagedOrders = useMemo(() => {
    const start = page * pageSize;
    return filteredOrders.slice(start, start + pageSize);
  }, [filteredOrders, page, pageSize]);

  const getStatusColor = (status) => {
    const colors = { pending: '#ffc107', confirmed: '#17a2b8', shipped: '#6366f1', out_for_delivery: '#f97316', completed: '#28a745', cancelled: '#dc3545' };
    return colors[status] || '#6c757d';
  };

  const getStatusLabel = (status) => {
    const labels = { pending: 'Pending', confirmed: 'Confirmed', shipped: 'Shipped', out_for_delivery: 'Out for Delivery', completed: 'Completed', cancelled: 'Cancelled' };
    return labels[status] || status || 'Pending';
  };

  const mapStatusToTrackingStatus = (adminStatus) => {
    const statusMap = { pending: 'Processing', confirmed: 'Confirmed', shipped: 'Shipped', out_for_delivery: 'Out for Delivery', completed: 'Delivered', cancelled: 'Cancelled' };
    return statusMap[adminStatus] || 'Processing';
  };

  const handleUpdateStatus = async (orderId, newOrderStatus) => {
    const order = orders.find(o => o.orderId === orderId) || selectedOrder;
    const shortId = formatOrderShortId(orderId);
    const customer = order?.customerName || 'the customer';

    if (newOrderStatus === 'confirmed') {
      const lbc = isLbcOrder(order);
      const ok = await confirm({
        title: 'Confirm this order?',
        message: lbc
          ? `Confirm order #${shortId} for ${customer}?\n\nThis is an outside-NCR (LBC Express) order. It will NOT appear in the rider Available tab — ship via LBC and send the tracking ID to the customer.`
          : `Confirm order #${shortId} for ${customer}?\n\nThis marks the order as confirmed and makes it available for riders to scan and accept.`,
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
    } catch (err) {
      console.error('Failed to update status:', err);
      showNotification('Failed to update order status. Please try again.', 'error');
    }
  };

  const handleDelete = async (orderId, reason) => {
    const trimmed = String(reason || '').trim();
    if (!trimmed) {
      showNotification('Please provide a reason before deleting the order.', 'error');
      return;
    }
    try {
      const result = await deleteOrderMutation({ orderId, reason: trimmed });
      if (!result?.success) {
        showNotification(result?.message || 'Failed to delete order.', 'error');
        return;
      }
      showNotification('Order deleted. Customer was notified.', 'success');
      setSelectedOrder(null);
    } catch (err) {
      console.error('Failed to delete order:', err);
      showNotification(err?.data || err?.message || 'Failed to delete order.', 'error');
    }
  };

  const handleCancelWithReason = async (orderId, reason) => {
    try {
      await updateOrderFieldsMutation({ orderId, cancelReason: reason, orderStatus: 'cancelled', status: 'Cancelled' });
      if (selectedOrder?.orderId === orderId) {
        setSelectedOrder(prev => ({ ...prev, orderStatus: 'cancelled', status: 'Cancelled', cancelReason: reason }));
      }
    } catch (err) {
      console.error('Failed to cancel order:', err);
      showNotification('Failed to cancel order. Please try again.', 'error');
    }
  };

  const handleResolveRefund = async (orderId, refundStatus, adminNote) => {
    const shortId = formatOrderShortId(orderId);
    if (refundStatus === 'approved') {
      const ok = await confirm({
        title: 'Approve this refund?',
        message: `Approve the refund for order #${shortId}?\n\nThis marks the refund as approved/paid for the customer.`,
        confirmLabel: 'Approve Refund',
        cancelLabel: 'Cancel',
        variant: 'primary',
        icon: 'fa-hand-holding-usd',
      });
      if (!ok) return;
    }
    try {
      await resolveRefundMutation({ orderId, refundStatus, refundAdminNote: adminNote });
      if (selectedOrder?.orderId === orderId) {
        const refundAmount = selectedOrder.finalTotal ?? selectedOrder.total ?? 0;
        setSelectedOrder(prev => ({
          ...prev, refundStatus, refundAdminNote: adminNote,
          refundResolvedAt: new Date().toISOString(), refundAmount,
          ...(refundStatus === 'approved' ? { refundPaidAt: new Date().toISOString() } : {}),
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
    { key: 'paid',      icon: 'fa-peso-sign',     label: 'Paid & Awaiting' },
    { key: 'pending',   icon: 'fa-clock',         label: 'Pending' },
    { key: 'confirmed', icon: 'fa-check-circle',  label: 'Confirmed' },
    { key: 'completed', icon: 'fa-check-double',  label: 'Completed' },
    { key: 'refund',    icon: 'fa-undo-alt',      label: 'Refunds / Cancel' },
  ];

  return (
    <div className="admin-orders-page">
      <div className="orders-tabs">
        {tabs.map(t => {
          const count = tabCounts[t.key] ?? 0;
          const isRefund = t.key === 'refund';
          return (
            <button key={t.key} className={`tab-btn ${activeTab === t.key ? 'active' : ''} ${isRefund ? 'tab-btn-refund' : ''}`} onClick={() => setActiveTab(t.key)}>
              <i className={`fas ${t.icon}`}></i>{t.label}
              {count > 0 && <span className={`tab-count-badge ${isRefund ? 'tab-count-badge--refund' : ''}`}>{count}</span>}
            </button>
          );
        })}
      </div>

      {activeTab === 'refund' && refundTabCount > 0 && (
        <div className="admin-refund-info-banner">
          <i className="fas fa-exclamation-circle"></i>
          <span>
            <strong>
              {refundCount > 0 && `${refundCount} pending refund${refundCount > 1 ? 's' : ''}`}
              {refundCount > 0 && cancelReqCount > 0 ? ' · ' : ''}
              {cancelReqCount > 0 && `${cancelReqCount} cancel request${cancelReqCount > 1 ? 's' : ''}`}
            </strong>
            {' '}— review each below.
          </span>
        </div>
      )}

      <div className="orders-filters">
        <div className="filter-group">
          <input type="text" className="search-input" placeholder="Search by Order ID, Customer Name, or Email..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
        <div className="date-filter-group">
          <div className="date-filter-inputs">
            <div className="date-filter-item"><label htmlFor="orderStart"><i className="fas fa-calendar"></i></label><input type="date" id="orderStart" value={startDate} max={endDate || today} onChange={e => setStartDate(e.target.value)} /></div>
            <span className="date-filter-sep">to</span>
            <div className="date-filter-item"><label htmlFor="orderEnd"><i className="fas fa-calendar"></i></label><input type="date" id="orderEnd" value={endDate} min={startDate} max={today} onChange={e => setEndDate(e.target.value)} /></div>
            {(startDate || endDate) && <button className="date-filter-clear" onClick={clearDateFilter}><i className="fas fa-times"></i> Clear</button>}
          </div>
        </div>
      </div>

      <div className="orders-container">
        {filteredOrders.length === 0 ? (
          <div className="empty-orders">
            <i className={`fas ${activeTab === 'refund' ? 'fa-undo-alt' : 'fa-inbox'}`}></i>
            <p>{activeTab === 'refund' ? 'No refund or cancel requests found' : 'No orders found'}</p>
          </div>
        ) : (
          <div className="orders-table-container">
            <div className="dk-fixed-page dk-fixed-page--table" style={fixedPageStyle(pageSize)}>
            <table className="orders-table">
              <thead>
                <tr>
                  <th>ORDER ID</th><th>CUSTOMER</th><th>ITEMS</th><th>TOTAL</th>
                  <th>PAYMENT</th><th>METHOD</th><th>STATUS</th>
                  {activeTab === 'refund' && <th>REQUEST</th>}
                  <th>RIDER</th><th>DATE</th><th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {pagedOrders.map(order => {
                  const pm = getPaymentMethodLabel(order);
                  const pendingRow = order.refundStatus === 'requested' || order.cancelRequestStatus === 'requested';
                  return (
                    <tr key={order.orderId} className={pendingRow ? 'row-refund-pending' : ''}>
                      <td data-label="Order ID"><strong>#{formatOrderShortId(order)}</strong></td>
                      <td data-label="Customer"><div className="customer-info"><strong>{order.customerName || 'N/A'}</strong><small>{order.email || 'N/A'}</small></div></td>
                      <td data-label="Items">{order.items.length} item(s)</td>
                      <td data-label="Total">
                        <strong>₱{(order.finalTotal ?? order.total ?? 0).toLocaleString('en-PH')}</strong>
                        {order.promoCode && <div style={{ fontSize: '11px', color: '#ec4899', fontWeight: 700, marginTop: '3px', display: 'flex', alignItems: 'center', gap: '3px' }}><i className="fas fa-tag"></i> {order.promoCode}</div>}
                      </td>
                      <td data-label="Payment"><span className={`payment-badge ${order.paymentStatus === 'paid' ? 'paid' : 'pending'}`}>{order.paymentStatus === 'paid' ? 'Paid' : 'Pending'}</span></td>
                      <td data-label="Method"><span className="method-badge" style={{ color: pm.color, display: 'inline-flex', alignItems: 'center', gap: 6 }}><PaymentMethodMark pm={pm} /> {pm.label}</span></td>
                      <td data-label="Status"><span className="status-badge" style={{ backgroundColor: getStatusColor(order.orderStatus) }}>{getStatusLabel(order.orderStatus)}</span></td>
                      {activeTab === 'refund' && (
                        <td data-label="Request">
                          {order.cancelRequestStatus === 'requested' && <span className="refund-table-badge refund-table-pending"><i className="fas fa-ban"></i> Cancel Pending</span>}
                          {order.cancelRequestStatus === 'approved' && <span className="refund-table-badge refund-table-approved"><i className="fas fa-check-circle"></i> Cancel Approved</span>}
                          {order.cancelRequestStatus === 'rejected' && <span className="refund-table-badge refund-table-rejected"><i className="fas fa-times-circle"></i> Cancel Declined</span>}
                          {order.refundStatus === 'requested' && <span className="refund-table-badge refund-table-pending"><i className="fas fa-clock"></i> Refund Pending</span>}
                          {order.refundStatus === 'approved'  && <span className="refund-table-badge refund-table-approved"><i className="fas fa-check-circle"></i> Refund Approved</span>}
                          {order.refundStatus === 'rejected'  && <span className="refund-table-badge refund-table-rejected"><i className="fas fa-times-circle"></i> Refund Rejected</span>}
                        </td>
                      )}
                      <td data-label="Rider">
                        {order.riderInfo
                          ? <div style={{ fontSize: '12px' }}><strong>{order.riderInfo.name}</strong><div style={{ color: '#888' }}>{order.riderInfo.plate}</div></div>
                          : <span style={{ color: '#ccc', fontSize: '12px' }}>-</span>}
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
                      <td data-label="Actions"><button className="view-btn" onClick={() => setSelectedOrder(order)}><i className="fas fa-eye"></i> View</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            <AdminPager
              total={filteredOrders.length}
              page={page}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              pageSizeOptions={ORDER_PAGE_SIZES}
            />
          </div>
        )}
      </div>

      {selectedOrder && (
        <OrderModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onUpdateStatus={handleUpdateStatus}
          onCancelWithReason={handleCancelWithReason}
          onDelete={handleDelete}
          onResolveRefund={handleResolveRefund}
          onResolveCancelRequest={handleResolveCancelRequest}
          getStatusColor={getStatusColor}
          getStatusLabel={getStatusLabel}
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
const OrderModal = ({ order, onClose, onUpdateStatus, onCancelWithReason, onDelete, onResolveRefund, onResolveCancelRequest, getStatusColor, getStatusLabel }) => {
  useBodyScrollLock(true);
  const [showCancelModal,   setShowCancelModal]   = useState(false);
  const [showDeleteModal,   setShowDeleteModal]   = useState(false);
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
  const finalTotal    = order.finalTotal ?? (originalTotal - discount);
  const refundAmount  = order.refundAmount ?? finalTotal;

  const currentStatus  = order.orderStatus || 'pending';
  const paymentStatus  = order.paymentStatus || 'pending';
  const isPaid         = paymentStatus === 'paid';
  const isDone         = currentStatus === 'completed' || currentStatus === 'cancelled';
  const isLbc          = isLbcOrder(order);
  const isRiderManaged = !isLbc && (currentStatus === 'shipped' || currentStatus === 'out_for_delivery');
  const canConfirm     = isPaid && currentStatus === 'pending' && order.cancelRequestStatus !== 'requested';
  const canCancel      = !isDone && !isRiderManaged;
  const hasPromo       = !!(order.promoCode && discount > 0);
  const hasDeliveryProof = !!(order.deliveryProofPhoto);
  const otpVerified      = !!(order.deliveryOtpVerified);
  const hasRefund        = !!(order.refundStatus);
  const hasCancelRequest = !!(order.cancelRequestStatus);
  const pm = getPaymentMethodLabel(order);

  const canPrintWaybill = isPaid && currentStatus !== 'pending';

  const handleRefundResolve = async (status) => {
    setResolvingRefund(true);
    try { await onResolveRefund(order.orderId, status, refundAdminNote.trim()); }
    finally { setResolvingRefund(false); setShowRejectConfirm(false); }
  };

  const handleCancelProofChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setCancelProofError('Please upload an image (screenshot of GCash/Maya/PayMongo refund).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setCancelProofError('Image must be less than 5MB.');
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
      if (decision === 'approved' && isPaid) {
        if (!cancelProofFile) {
          setCancelProofError('Upload a screenshot proof that the refund was sent (GCash / Maya / PayMongo).');
          setResolvingCancel(false);
          return;
        }
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
              <span className="status-badge" style={{ backgroundColor: getStatusColor(order.orderStatus) }}>{getStatusLabel(order.orderStatus)}</span>
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
          {isPaid && currentStatus === 'confirmed' && !isLbc && <div className="flow-notice info"><i className="fas fa-motorcycle"></i><div><strong>Order confirmed</strong><p>Visible to riders. They claim it by scanning the waybill — no admin approval needed.</p></div></div>}
          {isPaid && currentStatus === 'confirmed' && isLbc && <div className="flow-notice info"><i className="fas fa-truck"></i><div><strong>LBC order confirmed</strong><p>Not shown to riders. Ship via LBC Express and send the LBC tracking / order ID to the customer.</p></div></div>}
          {isRiderManaged && <div className="flow-notice purple"><i className="fas fa-shipping-fast"></i><div><strong>Rider is handling delivery</strong><p>Rider confirms via OTP + photo proof.</p></div></div>}
          {order.cancelRequestStatus === 'requested' && (
            <div className="flow-notice warning">
              <i className="fas fa-ban"></i>
              <div>
                <strong>Customer requested cancellation</strong>
                <p>Review their reason below in Refunds / Cancel before confirming this order.</p>
              </div>
            </div>
          )}

          <div className="order-modal-split">
          <div className="order-modal-pane order-modal-pane--left">

          <div className="modal-section">
            <h3><i className="fas fa-user"></i> Customer Information</h3>
            <div className="order-info-grid">
              <div className="info-item"><label>Full Name</label><strong>{order.customerName || 'N/A'}</strong></div>
              <div className="info-item"><label>Email</label><span>{order.email || 'N/A'}</span></div>
              <div className="info-item"><label>Phone</label><span>{order.phone || 'N/A'}</span></div>
              <div className="info-item"><label>Delivery Address</label><span>{order.shippingAddress || 'N/A'}</span></div>
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
                        <p className="admin-cancel-paymongo-hint">
                          Refund via PayMongo to the original GCash/Maya payment, then upload a screenshot proof below before approving.
                        </p>
                      </div>
                    )}
                    <div className="admin-refund-confirm-notice">
                      <i className="fas fa-info-circle"></i>
                      <span>
                        Approving will cancel the order
                        {isPaid ? ` and process the ₱${finalTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })} PayMongo refund` : ''}.
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
                          accept="image/*"
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
                            <i className="fas fa-cloud-upload-alt"></i> Upload GCash / Maya / PayMongo screenshot
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
                        disabled={resolvingCancel || (isPaid && !cancelProofFile)}
                      >
                        {resolvingCancel ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-check-circle"></i>} Approve Cancel
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
                    <div className="admin-refund-confirm-notice"><i className="fas fa-info-circle"></i><span>Approving will refund <strong>₱{refundAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong> to customer's {REFUND_METHOD_LABELS[order.refundMethod]?.label || 'account'}{order.refundAccountNumber ? ` (${order.refundAccountNumber})` : ''}. Send money first before approving.</span></div>
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
                      <button className="admin-refund-approve-btn" onClick={() => handleRefundResolve('approved')} disabled={resolvingRefund}>{resolvingRefund ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-check-circle"></i>} Approve & Mark Paid</button>
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
              <div className="total-row">
                <span>Shipping:</span>
                <strong>
                  {isLbc
                    ? 'LBC · arrange with customer'
                    : `₱${shippingFee.toLocaleString('en-PH')}`}
                </strong>
              </div>
              {hasPromo && <>
                <div className="total-row promo-discount-admin-row"><span><i className="fas fa-tag" style={{ marginRight: '6px', color: '#ec4899' }}></i>Promo ({order.promoCode}):</span><strong>−₱{discount.toLocaleString('en-PH')}</strong></div>
                <div className="total-row"><span style={{ color: '#6b7280' }}>Original:</span><strong style={{ color: '#6b7280', textDecoration: 'line-through' }}>₱{originalTotal.toLocaleString('en-PH')}</strong></div>
              </>}
              <div className="total-row grand-total"><span>{hasPromo ? 'Final Charged:' : 'Total:'}</span><strong>₱{finalTotal.toLocaleString('en-PH')}</strong></div>
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
                <div className="status-btn-wrapper">
                  <button
                    className={`status-btn confirmed ${currentStatus === 'confirmed' ? 'is-current' : ''} ${!canConfirm ? 'is-blocked' : ''}`}
                    onClick={() => canConfirm && onUpdateStatus(order.orderId, 'confirmed')}
                    disabled={!canConfirm}
                  >
                    <i className="fas fa-check-circle"></i><span>Confirm Order</span>
                    {currentStatus === 'confirmed' && <span className="current-indicator">Current</span>}
                  </button>
                  {!isPaid && <div className="block-reason"><i className="fas fa-lock"></i> Awaiting payment</div>}
                  {isPaid && currentStatus === 'confirmed' && <div className="block-reason" style={{ color: '#17a2b8' }}><i className="fas fa-check"></i> Already confirmed</div>}
                </div>
                {canCancel && (
                  <div className="status-btn-wrapper">
                    <button className="status-btn cancelled" onClick={() => setShowCancelModal(true)}>
                      <i className="fas fa-times-circle"></i><span>Cancel Order</span>
                    </button>
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
            {isPaid && (
              <button
                className="print-waybill-btn-bottom"
                onClick={() => canPrintWaybill && setShowWaybill(true)}
                disabled={!canPrintWaybill}
                title={!canPrintWaybill ? 'Confirm the order first before printing waybill' : 'Print Waybill'}
                style={!canPrintWaybill ? { opacity: 0.45, cursor: 'not-allowed', filter: 'grayscale(0.5)' } : {}}
              >
                <i className="fas fa-print"></i> Print Waybill
                {!canPrintWaybill && <span style={{ fontSize: '11px', fontWeight: 600, opacity: 0.85, marginLeft: 4 }}>(Confirm order first)</span>}
              </button>
            )}
            <button className="delete-order-btn" onClick={() => setShowDeleteModal(true)}><i className="fas fa-trash"></i> Delete Order</button>
          </div>

          </div>{/* end right pane */}
          </div>{/* end split */}
        </div>
      </div>

      {showCancelModal && <CancelReasonModal order={order} onConfirm={reason => { onCancelWithReason(order.orderId, reason); setShowCancelModal(false); }} onClose={() => setShowCancelModal(false)} />}
      {showDeleteModal && (
        <DeleteReasonModal
          order={order}
          onConfirm={(reason) => { onDelete(order.orderId, reason); setShowDeleteModal(false); }}
          onClose={() => setShowDeleteModal(false)}
        />
      )}
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

const DELETE_PRESETS = [
  'Duplicate / test order',
  'Invalid customer details',
  'Payment not completed',
  'Fraudulent / suspicious order',
  'Customer requested removal',
  'Inventory / listing error',
  'Other reason',
];

const DeleteReasonModal = ({ order, onConfirm, onClose }) => {
  useBodyScrollLock(true);
  const [selectedPreset, setSelectedPreset] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [error, setError] = useState('');
  const isOther = selectedPreset === 'Other reason';
  const finalReason = isOther ? customReason.trim() : selectedPreset;

  return (
    <div className="cancel-reason-overlay" onClick={onClose}>
      <div className="cancel-reason-modal" onClick={e => e.stopPropagation()}>
        <div className="cancel-reason-header">
          <div className="cancel-reason-icon" style={{ background: 'rgba(220,38,38,0.12)', color: '#dc2626' }}>
            <i className="fas fa-trash"></i>
          </div>
          <div>
            <h3>Delete Order</h3>
            <p>Order #{formatOrderShortId(order)}</p>
          </div>
          <button className="close-btn" onClick={onClose}><i className="fas fa-times"></i></button>
        </div>
        <div className="cancel-reason-body">
          <p className="cancel-reason-prompt">
            Select or enter a reason. The customer will get an email and an in-app notification.
          </p>
          <div className="cancel-presets">
            {DELETE_PRESETS.map(preset => (
              <button
                key={preset}
                className={`cancel-preset-chip ${selectedPreset === preset ? 'active' : ''}`}
                onClick={() => {
                  setSelectedPreset(preset);
                  setError('');
                  if (preset !== 'Other reason') setCustomReason('');
                }}
              >
                {selectedPreset === preset && <i className="fas fa-check"></i>} {preset}
              </button>
            ))}
          </div>
          {isOther && (
            <div className="cancel-custom-wrap">
              <label>Specify reason <span className="required">*</span></label>
              <textarea
                className="cancel-custom-input"
                placeholder="Type delete reason…"
                value={customReason}
                onChange={e => { setCustomReason(e.target.value); setError(''); }}
                rows={3}
                maxLength={300}
                autoFocus
              />
              <div className="char-count">{customReason.length}/300</div>
            </div>
          )}
          {error && <div className="cancel-error"><i className="fas fa-exclamation-circle"></i> {error}</div>}
        </div>
        <div className="cancel-reason-footer">
          <button className="cancel-go-back-btn" onClick={onClose}>
            <i className="fas fa-arrow-left"></i> Go Back
          </button>
          <button
            className="cancel-confirm-btn"
            style={{ background: 'linear-gradient(135deg,#b91c1c,#dc2626)' }}
            onClick={() => {
              if (!finalReason) { setError('Please select or enter a reason.'); return; }
              onConfirm(finalReason);
            }}
            disabled={!finalReason}
          >
            <i className="fas fa-trash"></i> Confirm Delete
          </button>
        </div>
      </div>
    </div>
  );
};

const CancelReasonModal = ({ order, onConfirm, onClose }) => {
  useBodyScrollLock(true);
  const [selectedPreset, setSelectedPreset] = useState('');
  const [customReason,   setCustomReason]   = useState('');
  const [error,          setError]          = useState('');
  const isOther     = selectedPreset === 'Other reason';
  const finalReason = isOther ? customReason.trim() : selectedPreset;

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

export default AdminOrders;