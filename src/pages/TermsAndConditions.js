import React, { useState } from 'react';
import './LegalPage.css';

const TermsAndConditions = () => {
  const [activeTab, setActiveTab] = useState('terms');

  return (
    <div className="legal-page">
      <div className="legal-container">
        <div className="legal-header">
          <div className="legal-icon">
            <i className={activeTab === 'terms' ? 'fas fa-file-contract' : 'fas fa-shield-alt'}></i>
          </div>
          <h1>{activeTab === 'terms' ? 'Terms and Conditions' : 'Privacy Policy'}</h1>
          <p className="legal-updated">Last updated: March 2026</p>

          <div className="legal-tabs">
            <button
              className={`legal-tab-btn ${activeTab === 'terms' ? 'active' : ''}`}
              onClick={() => setActiveTab('terms')}
            >
              <i className="fas fa-file-contract"></i> Terms & Conditions
            </button>
            <button
              className={`legal-tab-btn ${activeTab === 'privacy' ? 'active' : ''}`}
              onClick={() => setActiveTab('privacy')}
            >
              <i className="fas fa-shield-alt"></i> Privacy Policy
            </button>
          </div>
        </div>

        {/* ══ TERMS AND CONDITIONS TAB ══ */}
        {activeTab === 'terms' && (
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
        )}

        {/* ══ PRIVACY POLICY TAB ══ */}
        {activeTab === 'privacy' && (
          <div className="legal-content">

            {/* RA 10173 Compliance Banner */}
            <div className="legal-privacy-banner">
              <div className="legal-privacy-banner-icon">
                <i className="fas fa-balance-scale"></i>
              </div>
              <div>
                <strong>RA 10173 — Data Privacy Act of 2012</strong>
                <p>
                  DKMerch is committed to protecting your personal data in accordance with Republic Act No. 10173,
                  also known as the <em>Data Privacy Act of 2012</em> of the Philippines and its Implementing Rules
                  and Regulations. This Privacy Policy explains what data we collect, how we use it, and your rights
                  as a data subject.
                </p>
              </div>
            </div>

            <section className="legal-section">
              <h2><i className="fas fa-info-circle"></i> 1. Introduction</h2>
              <p>
                DKMerch ("we", "our", "us") is committed to protecting your personal information.
                This Privacy Policy explains how we collect, use, and safeguard your data when you
                use our website and services. As the <strong>Personal Information Controller (PIC)</strong>,
                we determine the purpose and means of processing your personal information.
              </p>
              <ul>
                <li><strong>Business Name:</strong> DKMerch</li>
                <li><strong>Contact Email:</strong> <a href="mailto:dkmerchtest@gmail.com">dkmerchtest@gmail.com</a></li>
                <li><strong>Coverage:</strong> Metro Manila, Philippines</li>
              </ul>
            </section>

            <section className="legal-section">
              <h2><i className="fas fa-database"></i> 2. Information We Collect</h2>
              <p>We may collect the following types of information:</p>
              <ul>
                <li><strong>Personal Information:</strong> Name, email address, phone number, and delivery address provided during registration or checkout.</li>
                <li><strong>Order Information:</strong> Purchase history, payment details (processed securely — we do not store card data), and order status.</li>
                <li><strong>Usage Data:</strong> Pages visited, time spent on the site, browser type, and device information.</li>
                <li><strong>Communication Data:</strong> Messages or inquiries you send to our support team.</li>
                <li><strong>Biometric / Photo Data (Riders only):</strong> Selfie photo and valid government-issued IDs uploaded during rider registration for identity verification purposes.</li>
                <li><strong>GPS / Location Data (Riders only):</strong> Real-time delivery location shared during active deliveries for tracking and customer safety.</li>
              </ul>
            </section>

            <section className="legal-section">
              <h2><i className="fas fa-check-circle"></i> 3. Legal Basis for Processing</h2>
              <p>We process your personal data based on the following lawful bases under RA 10173:</p>
              <ul>
                <li><strong>Consent</strong> — You provide explicit consent when you register and tick the privacy consent checkbox during sign-up.</li>
                <li><strong>Contractual Necessity</strong> — Processing is necessary to fulfill your orders and deliver your purchased products.</li>
                <li><strong>Legitimate Interest</strong> — To prevent fraud, ensure platform security, and improve our services.</li>
                <li><strong>Legal Obligation</strong> — To comply with applicable Philippine laws and regulations.</li>
              </ul>
            </section>

            <section className="legal-section">
              <h2><i className="fas fa-cogs"></i> 4. How We Use Your Information</h2>
              <p>We use your information to:</p>
              <ul>
                <li>Process and fulfill your orders.</li>
                <li>Send order confirmations, shipping updates, and delivery notifications.</li>
                <li>Respond to your questions and support requests.</li>
                <li>Improve our website, products, and services.</li>
                <li>Send promotional offers (only if you have opted in).</li>
                <li>Verify the identity of rider applicants.</li>
                <li>Track deliveries in real time for safety and transparency.</li>
                <li>Detect and prevent fraud or unauthorized access.</li>
                <li>Comply with legal obligations.</li>
              </ul>
              <p style={{ marginTop: 12 }}>
                <strong>We do not use your data for automated decision-making or profiling</strong> beyond
                what is necessary for the above purposes.
              </p>
            </section>

            <section className="legal-section">
              <h2><i className="fas fa-share-alt"></i> 5. Sharing Your Information</h2>
              <p>
                We do <strong>not sell, trade, or rent</strong> your personal information to third parties.
                We may share your data with:
              </p>
              <ul>
                <li><strong>Delivery Partners / Riders:</strong> Your name, delivery address, and contact number are shared with the assigned rider solely for delivery purposes.</li>
                <li><strong>Payment Processors:</strong> To securely handle transactions (e.g., PayMongo, Paymaya).</li>
                <li><strong>Service Providers:</strong> Who assist in operating our website (e.g., Brevo for email services). These providers process data only as necessary to provide their services.</li>
                <li><strong>Legal Authorities:</strong> When required by law, court order, or government regulation.</li>
              </ul>
            </section>

            <section className="legal-section">
              <h2><i className="fas fa-lock"></i> 6. Data Security</h2>
              <p>
                We implement reasonable technical and organizational measures to protect your personal data
                from unauthorized access, disclosure, alteration, or destruction, including:
              </p>
              <ul>
                <li>Encrypted data transmission (HTTPS/SSL).</li>
                <li>Secure database storage via Convex platform.</li>
                <li>Role-based access control — only authorized personnel can access user data.</li>
                <li>Regular security reviews of our systems.</li>
              </ul>
              <p style={{ marginTop: 12 }}>
                In the event of a data breach that may compromise your rights, we will notify the
                National Privacy Commission (NPC) and affected users within 72 hours as required by RA 10173.
                However, no method of transmission over the internet is 100% secure, and we cannot guarantee
                absolute security.
              </p>
            </section>

            <section className="legal-section">
              <h2><i className="fas fa-cookie-bite"></i> 7. Cookies and Tracking</h2>
              <p>
                DKMerch uses browser local storage (not traditional cookies) to maintain your session
                and preferences. We do not use third-party advertising trackers. Your browsing activity
                within our platform is stored only to improve your experience. You may choose to disable
                cookies through your browser settings, though some features may not function properly as a result.
              </p>
            </section>

            <section className="legal-section">
              <h2><i className="fas fa-clock"></i> 8. Data Retention</h2>
              <p>We retain your personal data for the following periods:</p>
              <ul>
                <li><strong>Active accounts:</strong> For as long as your account is active.</li>
                <li><strong>Deactivated accounts:</strong> Data is retained until you reactivate or request deletion.</li>
                <li><strong>Deleted accounts:</strong> Soft-deleted records may be retained for up to 30 days for audit purposes before permanent removal.</li>
                <li><strong>Order records:</strong> Retained for 5 years as required by Philippine tax and business regulations.</li>
                <li><strong>Rider ID photos:</strong> Retained for the duration of the rider's active status, then deleted within 30 days of account termination.</li>
              </ul>
            </section>

            <section className="legal-section">
              <h2><i className="fas fa-user-check"></i> 9. Your Rights as a Data Subject</h2>
              <p>
                Under the Data Privacy Act of 2012 and our commitment to your privacy, you have the following rights:
              </p>
              <div className="legal-rights-grid">
                <div className="legal-right-card">
                  <div className="legal-right-icon"><i className="fas fa-eye"></i></div>
                  <div>
                    <strong>Right to Access</strong>
                    <p>Request a copy of your personal data we hold.</p>
                  </div>
                </div>
                <div className="legal-right-card">
                  <div className="legal-right-icon"><i className="fas fa-edit"></i></div>
                  <div>
                    <strong>Right to Rectification</strong>
                    <p>Correct inaccurate or incomplete data via Account Settings.</p>
                  </div>
                </div>
                <div className="legal-right-card">
                  <div className="legal-right-icon"><i className="fas fa-trash-alt"></i></div>
                  <div>
                    <strong>Right to Erasure</strong>
                    <p>Request deletion of your account and personal data via Settings → Account Management.</p>
                  </div>
                </div>
                <div className="legal-right-card">
                  <div className="legal-right-icon"><i className="fas fa-ban"></i></div>
                  <div>
                    <strong>Right to Object</strong>
                    <p>Object to processing your data for purposes such as marketing.</p>
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
                    <p>Withdraw your consent at any time by deactivating or deleting your account.</p>
                  </div>
                </div>
              </div>
              <p style={{ marginTop: 16 }}>
                To exercise any of these rights, contact us at{' '}
                <a href="mailto:dkmerchtest@gmail.com">dkmerchtest@gmail.com</a> or use the
                Account Management section in your Settings.
              </p>
            </section>

            <section className="legal-section">
              <h2><i className="fas fa-child"></i> 10. Children's Privacy</h2>
              <p>
                DKMerch does not knowingly collect personal information from children under the age of 18.
                If you believe a child has provided us with personal data, please contact us so we can
                delete that information promptly. Parents or guardians may contact us to request removal.
              </p>
            </section>

            <section className="legal-section">
              <h2><i className="fas fa-external-link-alt"></i> 11. Third-Party Links</h2>
              <p>
                Our website may contain links to third-party sites. We are not responsible for the privacy
                practices of those sites. We encourage you to review their privacy policies before
                providing any personal information.
              </p>
            </section>

            <section className="legal-section">
              <h2><i className="fas fa-sync-alt"></i> 12. Changes to This Policy</h2>
              <p>
                We may update this Privacy Policy from time to time. Changes will be posted on this page
                with the updated date. Any significant changes will also be communicated through the platform
                or via email. Continued use of our services after changes means you accept the revised policy.
              </p>
            </section>

            <section className="legal-section">
              <h2><i className="fas fa-balance-scale"></i> 13. National Privacy Commission</h2>
              <p>
                If you believe your data privacy rights have been violated, you have the right to lodge
                a complaint with the <strong>National Privacy Commission (NPC)</strong> of the Philippines:
              </p>
              <ul>
                <li><strong>Website:</strong> <a href="https://www.privacy.gov.ph" target="_blank" rel="noopener noreferrer">www.privacy.gov.ph</a></li>
                <li><strong>Email:</strong> info@privacy.gov.ph</li>
                <li><strong>Hotline:</strong> (02) 8234-2228</li>
              </ul>
            </section>

            <section className="legal-section legal-contact-section">
              <h2><i className="fas fa-envelope"></i> Contact Our Data Privacy Officer</h2>
              <p>
                For privacy-related concerns, requests, or complaints, please reach out to us at{' '}
                <a href="mailto:dkmerchtest@gmail.com">dkmerchtest@gmail.com</a>.
              </p>
              <p style={{ marginTop: 8, fontSize: 13, color: '#6b7280' }}>
                We aim to respond to all data privacy requests within 15 business days.
              </p>
            </section>

          </div>
        )}

      </div>
    </div>
  );
};

export default TermsAndConditions;