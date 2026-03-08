import React from 'react';
import './LegalPage.css';

const TermsAndConditions = () => {
  return (
    <div className="legal-page">
      <div className="legal-container">
        <div className="legal-header">
          <div className="legal-icon">
            <i className="fas fa-file-contract"></i>
          </div>
          <h1>Terms and Conditions</h1>
          <p className="legal-updated">Last updated: March 2026</p>
        </div>

        <div className="legal-content">
          <section className="legal-section">
            <h2><i className="fas fa-handshake"></i> 1. Acceptance of Terms</h2>
            <p>
              By accessing and using the DKMerch website and services, you accept and agree to be bound by
              these Terms and Conditions. If you do not agree to these terms, please do not use our services.
            </p>
          </section>

          <section className="legal-section">
            <h2><i className="fas fa-shopping-bag"></i> 2. Products and Orders</h2>
            <p>
              All products listed on DKMerch are subject to availability. We reserve the right to limit
              quantities, refuse orders, or discontinue products at any time. Prices are subject to change
              without notice.
            </p>
            <ul>
              <li>Orders are confirmed only upon successful payment.</li>
              <li>Pre-order items are subject to availability and estimated delivery timelines.</li>
              <li>Product images are for illustrative purposes and may slightly differ from the actual item.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2><i className="fas fa-credit-card"></i> 3. Payment</h2>
            <p>
              DKMerch accepts various payment methods as displayed during checkout. All transactions are
              processed securely. We do not store your payment information on our servers.
            </p>
            <ul>
              <li>Payments are processed in Philippine Peso (PHP).</li>
              <li>All prices are inclusive of applicable taxes unless stated otherwise.</li>
              <li>Failed or disputed transactions may result in order cancellation.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2><i className="fas fa-truck"></i> 4. Shipping and Delivery</h2>
            <p>
              We aim to deliver all orders within the estimated timeframe provided at checkout. DKMerch
              is not responsible for delays caused by courier services, weather conditions, or other
              factors beyond our control.
            </p>
            <ul>
              <li>Delivery times are estimates and not guaranteed.</li>
              <li>Customers are responsible for providing accurate delivery addresses.</li>
              <li>Risk of loss passes to the customer upon delivery.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2><i className="fas fa-qrcode"></i> 5. Rider Obligations — QR Code Scanning</h2>
            <p>
              All DKMerch riders are required to scan the QR code attached to every parcel before
              proceeding with delivery. This is a mandatory step to confirm parcel pickup and initiate
              the delivery tracking process.
            </p>
            <ul>
              <li>Riders must scan the parcel QR code upon receiving the package from the admin or warehouse.</li>
              <li>Failure to scan the QR code before delivery will be considered a violation of rider protocol.</li>
              <li>QR code scanning serves as proof of parcel handover and activates order tracking for the customer.</li>
              <li>Riders must not tamper with, remove, or damage the QR code label on any parcel.</li>
              <li>Any unscanned parcels reported by customers may result in disciplinary action against the assigned rider.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2><i className="fas fa-map-marker-alt"></i> 6. Rider Obligations — GPS Location Tracking</h2>
            <p>
              DKMerch requires all active riders to maintain their GPS location sharing enabled throughout
              the entire duration of a delivery. GPS tracking is used to ensure delivery transparency and
              customer safety.
            </p>
            <ul>
              <li>Riders must not disable, turn off, or block GPS location sharing while on an active delivery.</li>
              <li>GPS tracking assigned by the admin or activated through the QR scan must remain active until the order is marked as delivered.</li>
              <li>Intentionally disabling GPS during a delivery is a serious violation and may result in immediate suspension or termination of rider privileges.</li>
              <li>Riders are responsible for ensuring their device has sufficient battery and data connection to maintain GPS tracking throughout the delivery.</li>
              <li>DKMerch reserves the right to monitor rider GPS data for quality assurance and dispute resolution purposes.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2><i className="fas fa-undo"></i> 7. Returns and Refunds</h2>
            <p>
              We accept returns for defective or incorrect items within 7 days of receipt. Items must be
              in their original condition and packaging. Sale items and pre-orders are final and
              non-refundable unless defective.
            </p>
          </section>

          <section className="legal-section">
            <h2><i className="fas fa-user-shield"></i> 8. User Accounts</h2>
            <p>
              You are responsible for maintaining the confidentiality of your account credentials.
              DKMerch is not liable for any loss resulting from unauthorized use of your account.
              Notify us immediately of any suspected unauthorized access.
            </p>
          </section>

          <section className="legal-section">
            <h2><i className="fas fa-copyright"></i> 9. Intellectual Property</h2>
            <p>
              All content on DKMerch, including logos, images, text, and design, is the property of
              DKMerch or its licensors. Unauthorized reproduction or distribution is strictly prohibited.
            </p>
          </section>

          <section className="legal-section">
            <h2><i className="fas fa-ban"></i> 10. Prohibited Activities</h2>
            <p>Users are prohibited from:</p>
            <ul>
              <li>Using the platform for any unlawful purpose.</li>
              <li>Attempting to gain unauthorized access to any part of the website.</li>
              <li>Submitting false or misleading information.</li>
              <li>Engaging in any activity that disrupts or interferes with the service.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2><i className="fas fa-gavel"></i> 11. Limitation of Liability</h2>
            <p>
              DKMerch shall not be liable for any indirect, incidental, or consequential damages arising
              from the use of our services. Our total liability shall not exceed the amount paid for the
              specific order in question.
            </p>
          </section>

          <section className="legal-section">
            <h2><i className="fas fa-edit"></i> 12. Changes to Terms</h2>
            <p>
              DKMerch reserves the right to modify these Terms and Conditions at any time. Continued use
              of our services after changes constitutes your acceptance of the updated terms.
            </p>
          </section>

          <section className="legal-section legal-contact-section">
            <h2><i className="fas fa-envelope"></i> Contact Us</h2>
            <p>
              For questions regarding these Terms and Conditions, please contact us at{' '}
              <a href="mailto:dkmerchtest@gmail.com">dkmerchtest@gmail.com</a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default TermsAndConditions;