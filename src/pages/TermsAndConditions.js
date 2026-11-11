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
          <p className="legal-updated">Last updated: November 2026</p>
        </div>

        <div className="legal-content">
          <section className="legal-section">
            <h2><i className="fas fa-handshake"></i> 1. Acceptance of Terms</h2>
            <p>
              By accessing or using the DKMerch website, Progressive Web App (PWA), customer account,
              rider dashboard, or related services, you agree to these Terms and Conditions and our
              <a href="/privacy-policy"> Privacy Policy</a>. If you do not agree, do not use the platform.
            </p>
          </section>

          <section className="legal-section">
            <h2><i className="fas fa-store"></i> 2. The DKMerch Platform</h2>
            <p>DKMerch is an online K-Pop merchandise store with the following system features:</p>
            <ul>
              <li>Product browsing, wishlist, cart, checkout, promos, rewards points, and pre-orders.</li>
              <li>Online payment through PayMongo (GCash or Maya).</li>
              <li>Admin order confirmation, inventory/ops tools, and sales reports.</li>
              <li>In-house DK Rider delivery with waybill / QR scan acceptance, live GPS tracking, and delivery OTP confirmation.</li>
              <li>On-site FAQ chatbot and email support.</li>
              <li>Optional install of DKMerch as a phone app (PWA) via the Download button.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2><i className="fas fa-user"></i> 3. Customer Accounts</h2>
            <ul>
              <li>You must provide accurate registration details and consent to the Privacy Policy to create an account.</li>
              <li>Email OTP / verification flows may be required for registration, password reset, or reactivation.</li>
              <li>You must be <strong>logged in</strong> to add items to cart, use wishlist, place pre-orders, and checkout. Guest checkout is not available.</li>
              <li>Customer accounts may also use a login PIN (and Quick Sign In QR) after setup; keep credentials confidential.</li>
              <li>In Settings → Account Management you may <strong>deactivate</strong> (temporary; reactivate with email OTP) or <strong>delete</strong> (soft-delete) your account.</li>
              <li>Admins may suspend or manage accounts when policy or security requires it.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2><i className="fas fa-shopping-bag"></i> 4. Products, Pre-Orders, Promos &amp; Rewards</h2>
            <ul>
              <li>Products are subject to stock availability. Prices are in Philippine Peso (PHP) and may change.</li>
              <li>Product images are illustrative and may differ slightly from the physical item.</li>
              <li><strong>Pre-orders:</strong> You may reserve upcoming items. When released, you are notified (including by email) and must add available items to cart yourself before checkout. You may cancel a pre-order before it becomes available.</li>
              <li><strong>Promo codes:</strong> One promo code per order, subject to validity dates, usage limits, minimum order rules, and any maximum discount cap configured in the system.</li>
              <li><strong>Rewards:</strong> Points / rewards balances follow program rules configured by DKMerch and may be adjusted for abuse or error correction.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2><i className="fas fa-credit-card"></i> 5. Payment</h2>
            <p>
              Checkout uses <strong>PayMongo</strong>. You are redirected to PayMongo’s secure page to pay with
              <strong> GCash</strong> or <strong>Maya</strong>. DKMerch does not store your e-wallet login credentials.
            </p>
            <ul>
              <li>Payments are processed in PHP.</li>
              <li>Failed, unpaid, or disputed payments may prevent fulfillment or lead to cancellation.</li>
              <li>An order recorded after payment still requires <strong>admin confirmation</strong> before it becomes available to riders.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2><i className="fas fa-truck"></i> 6. Shipping, Tracking &amp; Delivery OTP</h2>
            <ul>
              <li>Shipping fees are calculated from the distance between the store location and your delivery address (geocoded coordinates).</li>
              <li>You must provide a complete and accurate delivery address and reachable phone number.</li>
              <li>Delivery time estimates (commonly about 2–4 business days after confirmation) are estimates, not guarantees, and depend on rider availability, distance, and conditions outside our control.</li>
              <li>After admin confirmation, riders may accept the parcel by scanning the waybill / QR code. No separate admin pickup-approval step is required in the current system.</li>
              <li>When the rider goes out for delivery, GPS tracking may be shown on your order tracking page.</li>
              <li>You must generate / show the <strong>4-digit delivery OTP</strong> on your tracking page. The rider enters that OTP to mark the order delivered. Optional delivery proof photos may be attached by the rider.</li>
              <li>Risk of loss generally passes upon successful delivery confirmation in the system.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2><i className="fas fa-motorcycle"></i> 7. Rider Terms</h2>
            <p>
              Rider accounts are created and managed by DKMerch administrators. Riders must use the rider dashboard
              only for authorized deliveries and must follow these rules:
            </p>
            <ul>
              <li>Accept available orders only by scanning the parcel waybill / QR code as implemented in the app.</li>
              <li>Keep GPS enabled while a delivery is active so customers can track the trip.</li>
              <li>Do not disable tracking, tamper with waybill labels, or misrepresent delivery status.</li>
              <li>Confirm delivery only with the customer’s valid delivery OTP (and proof photo when required/used).</li>
              <li>Vehicle type supported in the current rider setup is motorcycle.</li>
              <li>Violations may result in suspension or removal of rider access.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2><i className="fas fa-undo"></i> 8. Refunds</h2>
            <p>
              DKMerch accepts <strong>damaged-item refund requests only</strong> after delivery is confirmed
              in the system. Change-of-mind returns for unused / unopened goods are not a general feature of
              the current platform.
            </p>
            <ul>
              <li>
                You must submit the refund request from Track Order / My Orders within
                <strong> 24 hours of delivery confirmation</strong>, with a clear photo of the damage and
                your GCash or Maya account name and mobile number for payout if approved.
              </li>
              <li>Requests filed after the 24-hour window are automatically blocked by the system.</li>
              <li>Admin reviews each request and may approve or reject it (with a reason when rejected).</li>
              <li>
                Approved refunds are sent to the GCash/Maya details you provided; payout after approval
                is typically completed within about 24 hours, subject to admin processing and e-wallet timing.
              </li>
              <li>
                Before admin confirms an order, you may request cancellation from Track Order (subject to
                review). Paid cancellations may require GCash/Maya details for a refund if approved.
              </li>
            </ul>
          </section>

          <section className="legal-section">
            <h2><i className="fas fa-mobile-alt"></i> 9. Mobile App (PWA)</h2>
            <p>
              The Download button installs DKMerch as a Progressive Web App on supported phones/browsers
              (or via Add to Home Screen on iOS). The PWA provides access to the same store and, for authorized
              riders, the rider dashboard. Installation does not create a separate App Store / Play Store account
              unless you already have a DKMerch login.
            </p>
          </section>

          <section className="legal-section">
            <h2><i className="fas fa-comments"></i> 10. Support Chatbot</h2>
            <p>
              The floating chatbot provides automated FAQ answers about orders, payments, delivery, promos,
              pre-orders, and refunds. It does not replace human support. For account-specific issues, email{' '}
              <a href="mailto:dkmerchtest@gmail.com">dkmerchtest@gmail.com</a>.
            </p>
          </section>

          <section className="legal-section">
            <h2><i className="fas fa-ban"></i> 11. Prohibited Activities</h2>
            <ul>
              <li>Using the platform for unlawful purposes.</li>
              <li>Attempting unauthorized access to customer, rider, or admin features.</li>
              <li>Submitting false addresses, fake refund evidence, or fraudulent payments.</li>
              <li>Abusing promos, rewards, pre-orders, or delivery OTP confirmation.</li>
              <li>Interfering with site operations, scanners, GPS tracking, or other users’ accounts.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2><i className="fas fa-copyright"></i> 12. Intellectual Property</h2>
            <p>
              DKMerch logos, site design, text, and original content belong to DKMerch or its licensors.
              Product brands and artist-related marks belong to their respective owners. Unauthorized copying
              or redistribution of platform content is prohibited.
            </p>
          </section>

          <section className="legal-section">
            <h2><i className="fas fa-gavel"></i> 13. Limitation of Liability</h2>
            <p>
              To the fullest extent allowed by law, DKMerch is not liable for indirect, incidental, or
              consequential damages arising from use of the service, including courier delays, third-party
              payment outages (e.g. PayMongo / GCash / Maya), map/geocoding downtime, or events beyond our control.
              Our total liability for a claim related to an order is limited to the amount you paid for that order.
            </p>
          </section>

          <section className="legal-section">
            <h2><i className="fas fa-edit"></i> 14. Changes to Terms</h2>
            <p>
              We may update these Terms at any time by posting a revised version on this page.
              Continued use after changes constitutes acceptance.
            </p>
          </section>

          <section className="legal-section">
            <h2><i className="fas fa-lightbulb"></i> 15. Payo (Advice)</h2>
            <p>
              These tips help you avoid common issues. They do not replace the rules above.
            </p>
            <ul>
              <li>
                <strong>Address &amp; phone:</strong> Double-check your delivery address and mobile number
                before checkout so the rider can reach you.
              </li>
              <li>
                <strong>Payment:</strong> Complete PayMongo (GCash / Maya) on the official redirect page.
                Do not share your e-wallet PIN or OTP with anyone claiming to be DKMerch staff.
              </li>
              <li>
                <strong>After paying:</strong> Wait for admin confirmation before expecting rider pickup.
                You can track status under My Orders / Track Order.
              </li>
              <li>
                <strong>Delivery OTP:</strong> Generate or show your 4-digit OTP only when the rider arrives.
                Do not post it publicly or send it to unknown contacts.
              </li>
              <li>
                <strong>Refunds:</strong> If an item arrives damaged, request a refund promptly with a clear photo
                and correct GCash/Maya details for payout.
              </li>
              <li>
                <strong>Install on iPhone:</strong> Open the live site in Safari
                (<a href="https://dkmerchwebsite.vercel.app">dkmerchwebsite.vercel.app</a>), then Share →
                Add to Home Screen. Avoid installing from a local IP — that only creates a Safari shortcut.
              </li>
              <li>
                <strong>Riders:</strong> Keep GPS on during active deliveries, scan the waybill/QR to accept,
                and confirm delivery only with the customer’s valid OTP.
              </li>
              <li>
                <strong>Support:</strong> Use the FAQ chatbot for general questions; email{' '}
                <a href="mailto:dkmerchtest@gmail.com">dkmerchtest@gmail.com</a> for account-specific help.
              </li>
            </ul>
          </section>

          <section className="legal-section legal-contact-section">
            <h2><i className="fas fa-envelope"></i> Contact Us</h2>
            <p>
              Questions about these Terms: <a href="mailto:dkmerchtest@gmail.com">dkmerchtest@gmail.com</a>.
              Privacy details are in the <a href="/privacy-policy">Privacy Policy</a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default TermsAndConditions;
