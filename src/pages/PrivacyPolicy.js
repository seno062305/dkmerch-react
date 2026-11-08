import React from 'react';
import './LegalPage.css';

const PrivacyPolicy = () => {
  return (
    <div className="legal-page">
      <div className="legal-container">
        <div className="legal-header">
          <div className="legal-icon">
            <i className="fas fa-shield-alt"></i>
          </div>
          <h1>Privacy Policy</h1>
          <p className="legal-updated">Last updated: November 2026</p>
        </div>

        <div className="legal-content">
          <div className="legal-privacy-banner">
            <div className="legal-privacy-banner-icon">
              <i className="fas fa-balance-scale"></i>
            </div>
            <div>
              <strong>RA 10173 — Data Privacy Act of 2012</strong>
              <p>
                DKMerch processes personal data in accordance with Republic Act No. 10173
                (Data Privacy Act of 2012) and its Implementing Rules and Regulations.
                This policy describes what the DKMerch system actually collects and how it is used.
              </p>
            </div>
          </div>

          <section className="legal-section">
            <h2><i className="fas fa-info-circle"></i> 1. Introduction</h2>
            <p>
              DKMerch (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;) operates an online K-Pop merchandise store with
              in-house rider delivery, order tracking, rewards, pre-orders, and related admin tools.
              As the <strong>Personal Information Controller (PIC)</strong>, we determine the purpose
              and means of processing personal information collected through our website and Progressive Web App (PWA).
            </p>
            <ul>
              <li><strong>Business Name:</strong> DKMerch</li>
              <li><strong>Contact Email:</strong> <a href="mailto:dkmerchtest@gmail.com">dkmerchtest@gmail.com</a></li>
              <li><strong>Service area:</strong> Areas served by DK Riders (primarily Metro Manila / NCR, Philippines)</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2><i className="fas fa-database"></i> 2. Information We Collect</h2>
            <p>Depending on how you use the system, we may collect:</p>
            <ul>
              <li>
                <strong>Customer account data:</strong> Full name, email address, phone number, username,
                password (stored hashed), and shipping / delivery address.
              </li>
              <li>
                <strong>Checkout &amp; location data:</strong> Delivery address text, map coordinates (latitude/longitude),
                city, and ZIP used to estimate distance-based shipping fees and to guide riders.
              </li>
              <li>
                <strong>Order data:</strong> Cart items, order totals, shipping fee, promo code used (if any),
                order status history, refund requests (including damage photos and GCash/Maya refund account details you submit),
                and optional delivery proof photos uploaded by riders.
              </li>
              <li>
                <strong>Payment references:</strong> PayMongo payment / checkout identifiers and payment status.
                We do <strong>not</strong> store your GCash or Maya login credentials or full card numbers on our servers.
              </li>
              <li>
                <strong>OTP &amp; security codes:</strong> One-time codes for registration / email verification,
                password reset, account reactivation, and customer-generated <strong>delivery OTP</strong> used
                on the order tracking page to confirm receipt.
              </li>
              <li>
                <strong>Wishlist, pre-orders &amp; rewards:</strong> Saved wishlist items, pre-order reservations,
                and rewards / points balances tied to your account.
              </li>
              <li>
                <strong>Account management status:</strong> Active, self-deactivated, deleted (soft-delete),
                or admin-managed suspension-related fields as applicable in the system.
              </li>
              <li>
                <strong>Rider account data:</strong> Rider accounts are created by administrators (name, email,
                phone, motorcycle vehicle type, and login credentials). Rider dashboards may use device camera
                access to scan parcel waybill / QR codes.
              </li>
              <li>
                <strong>Rider GPS during delivery:</strong> Real-time location while a delivery is active
                (after the rider marks out for delivery) so customers can track the rider on the tracking page.
              </li>
              <li>
                <strong>Support chatbot:</strong> The on-site FAQ chatbot answers canned questions in your browser.
                It is not used as a ticket system and does not replace email support.
              </li>
              <li>
                <strong>Device / session data:</strong> Browser session and preferences stored via browser
                local storage so you stay signed in and retain cart/wishlist state on that device.
              </li>
            </ul>
          </section>

          <section className="legal-section">
            <h2><i className="fas fa-check-circle"></i> 3. Legal Basis for Processing</h2>
            <ul>
              <li><strong>Consent</strong> — Explicit privacy consent checkbox during customer registration.</li>
              <li><strong>Contractual necessity</strong> — To create accounts, process PayMongo payments, fulfill orders, and complete rider delivery with OTP confirmation.</li>
              <li><strong>Legitimate interest</strong> — Fraud prevention, platform security, and service improvement.</li>
              <li><strong>Legal obligation</strong> — Compliance with applicable Philippine laws and regulations.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2><i className="fas fa-cogs"></i> 4. How We Use Your Information</h2>
            <ul>
              <li>Create and manage customer and rider accounts.</li>
              <li>Send transactional emails (OTP, order updates, refund decisions, rider-related notices) through our email providers.</li>
              <li>Calculate shipping fees from store-to-address distance and process checkout via PayMongo (GCash / Maya).</li>
              <li>Allow admins to confirm orders before they appear as available for riders.</li>
              <li>Allow riders to scan waybill / QR codes to accept parcels, share GPS while delivering, and verify customer delivery OTP (with optional proof photo).</li>
              <li>Show customers live rider location and delivery OTP on the order tracking page.</li>
              <li>Manage wishlist, pre-orders, promos, and rewards points.</li>
              <li>Process refund requests submitted after delivery (photo + e-wallet refund details).</li>
              <li>Support account deactivation (reactivation via email OTP) and soft-deletion from Settings.</li>
              <li>Comply with legal obligations and resolve disputes.</li>
            </ul>
            <p style={{ marginTop: 12 }}>
              We do not use your data for automated decision-making or advertising profiling beyond
              what is needed to operate the features above.
            </p>
          </section>

          <section className="legal-section">
            <h2><i className="fas fa-share-alt"></i> 5. Sharing Your Information</h2>
            <p>We do <strong>not sell, trade, or rent</strong> personal information. Data may be shared only with:</p>
            <ul>
              <li>
                <strong>DK Riders:</strong> Customer name, phone, delivery address, order items, and related
                delivery details needed to pick up and deliver the order.
              </li>
              <li>
                <strong>PayMongo:</strong> Payment processing for GCash and Maya. PayMongo’s privacy practices
                apply to data processed on their checkout page.
              </li>
              <li>
                <strong>Backend &amp; email processors:</strong> Convex (application database / backend) and
                email delivery services used by the system (e.g. Brevo / Resend) to send OTPs and transactional mail.
              </li>
              <li>
                <strong>Map / geocoding services:</strong> Address text may be sent to geocoding providers
                (e.g. OpenStreetMap Nominatim) to resolve coordinates for shipping and maps.
              </li>
              <li>
                <strong>Legal authorities:</strong> When required by law, court order, or regulation.
              </li>
            </ul>
          </section>

          <section className="legal-section">
            <h2><i className="fas fa-lock"></i> 6. Data Security</h2>
            <ul>
              <li>HTTPS / encrypted transport for the website.</li>
              <li>Application data stored in Convex with role-based access (customer, rider, admin).</li>
              <li>Passwords stored hashed; OTPs are time-limited where applicable.</li>
              <li>Payment credentials are handled by PayMongo, not stored as login secrets in DKMerch.</li>
            </ul>
            <p style={{ marginTop: 12 }}>
              If a personal data breach likely to affect your rights occurs, we will notify the
              National Privacy Commission (NPC) and affected users as required by RA 10173.
              No online system can guarantee absolute security.
            </p>
          </section>

          <section className="legal-section">
            <h2><i className="fas fa-cookie-bite"></i> 7. Cookies, Local Storage &amp; PWA</h2>
            <p>
              DKMerch primarily uses browser <strong>local storage</strong> for session and preferences.
              The site can be installed as a phone app (PWA) via the Download button. Installation may
              store app assets locally through the service worker. We do not use third-party advertising trackers.
              Disabling storage may break login, cart, wishlist, or install features.
            </p>
          </section>

          <section className="legal-section">
            <h2><i className="fas fa-clock"></i> 8. Data Retention</h2>
            <ul>
              <li><strong>Active accounts:</strong> Kept while the account remains active.</li>
              <li><strong>Self-deactivated accounts:</strong> Retained until you reactivate via email OTP or request deletion.</li>
              <li><strong>Soft-deleted accounts:</strong> Marked deleted in the system (with deletion timestamp) and may be retained for audit / admin review before any permanent purge by administrators.</li>
              <li><strong>Order, payment, and refund records:</strong> Retained as needed for fulfillment, dispute handling, and Philippine business / tax record-keeping.</li>
              <li><strong>Delivery GPS:</strong> Used during active delivery tracking; historical tracking data may remain tied to the order record as stored by the system.</li>
              <li><strong>Delivery OTP:</strong> Used to complete delivery confirmation for that order.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2><i className="fas fa-user-check"></i> 9. Your Rights as a Data Subject</h2>
            <p>Under the Data Privacy Act of 2012, you may:</p>
            <div className="legal-rights-grid">
              <div className="legal-right-card">
                <div className="legal-right-icon"><i className="fas fa-eye"></i></div>
                <div>
                  <strong>Right to Access</strong>
                  <p>Request a copy of personal data we hold about you.</p>
                </div>
              </div>
              <div className="legal-right-card">
                <div className="legal-right-icon"><i className="fas fa-edit"></i></div>
                <div>
                  <strong>Right to Rectification</strong>
                  <p>Update profile details in Account Settings.</p>
                </div>
              </div>
              <div className="legal-right-card">
                <div className="legal-right-icon"><i className="fas fa-trash-alt"></i></div>
                <div>
                  <strong>Right to Erasure</strong>
                  <p>Use Settings → Account Management → Delete Account (soft-delete in the system).</p>
                </div>
              </div>
              <div className="legal-right-card">
                <div className="legal-right-icon"><i className="fas fa-pause-circle"></i></div>
                <div>
                  <strong>Right to Restrict / Deactivate</strong>
                  <p>Temporarily deactivate your account and later reactivate with an email OTP.</p>
                </div>
              </div>
              <div className="legal-right-card">
                <div className="legal-right-icon"><i className="fas fa-file-export"></i></div>
                <div>
                  <strong>Right to Data Portability</strong>
                  <p>Request your data in a structured, commonly used format.</p>
                </div>
              </div>
              <div className="legal-right-card">
                <div className="legal-right-icon"><i className="fas fa-undo"></i></div>
                <div>
                  <strong>Right to Withdraw Consent</strong>
                  <p>Withdraw consent by deactivating or deleting your account, subject to data we must keep for orders/legal compliance.</p>
                </div>
              </div>
            </div>
            <p style={{ marginTop: 16 }}>
              Contact <a href="mailto:dkmerchtest@gmail.com">dkmerchtest@gmail.com</a> or use Settings → Account Management.
            </p>
          </section>

          <section className="legal-section">
            <h2><i className="fas fa-child"></i> 10. Children&apos;s Privacy</h2>
            <p>
              DKMerch is not intended for users under 18. We do not knowingly collect personal information
              from children under 18. Contact us to request removal if you believe this has occurred.
            </p>
          </section>

          <section className="legal-section">
            <h2><i className="fas fa-external-link-alt"></i> 11. Third-Party Services</h2>
            <p>
              Checkout redirects to PayMongo. Maps / geocoding and email delivery rely on third-party providers.
              Their sites and policies apply when you leave DKMerch or when they process data on our behalf.
            </p>
          </section>

          <section className="legal-section">
            <h2><i className="fas fa-sync-alt"></i> 12. Changes to This Policy</h2>
            <p>
              Updates will be posted on this page with a revised date. Continued use of DKMerch after changes
              means you accept the updated policy.
            </p>
          </section>

          <section className="legal-section">
            <h2><i className="fas fa-balance-scale"></i> 13. National Privacy Commission</h2>
            <p>You may lodge a complaint with the National Privacy Commission (NPC):</p>
            <ul>
              <li><strong>Website:</strong> <a href="https://www.privacy.gov.ph">www.privacy.gov.ph</a></li>
              <li><strong>Email:</strong> info@privacy.gov.ph</li>
              <li><strong>Hotline:</strong> (02) 8234-2228</li>
            </ul>
          </section>

          <section className="legal-section legal-contact-section">
            <h2><i className="fas fa-envelope"></i> Contact</h2>
            <p>
              Privacy requests: <a href="mailto:dkmerchtest@gmail.com">dkmerchtest@gmail.com</a>.
              We aim to respond within 15 business days.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
