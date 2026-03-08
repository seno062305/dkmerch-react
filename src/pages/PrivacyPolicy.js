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
          <p className="legal-updated">Last updated: March 2026</p>
        </div>

        <div className="legal-content">
          <section className="legal-section">
            <h2><i className="fas fa-info-circle"></i> 1. Introduction</h2>
            <p>
              DKMerch ("we", "our", "us") is committed to protecting your personal information.
              This Privacy Policy explains how we collect, use, and safeguard your data when you
              use our website and services.
            </p>
          </section>

          <section className="legal-section">
            <h2><i className="fas fa-database"></i> 2. Information We Collect</h2>
            <p>We may collect the following types of information:</p>
            <ul>
              <li><strong>Personal Information:</strong> Name, email address, phone number, and delivery address provided during registration or checkout.</li>
              <li><strong>Order Information:</strong> Purchase history, payment details (processed securely — we do not store card data), and order status.</li>
              <li><strong>Usage Data:</strong> Pages visited, time spent on the site, browser type, and device information.</li>
              <li><strong>Communication Data:</strong> Messages or inquiries you send to our support team.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2><i className="fas fa-cogs"></i> 3. How We Use Your Information</h2>
            <p>We use your information to:</p>
            <ul>
              <li>Process and fulfill your orders.</li>
              <li>Send order confirmations, shipping updates, and delivery notifications.</li>
              <li>Respond to your questions and support requests.</li>
              <li>Improve our website, products, and services.</li>
              <li>Send promotional offers (only if you have opted in).</li>
              <li>Comply with legal obligations.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2><i className="fas fa-share-alt"></i> 4. Sharing Your Information</h2>
            <p>
              We do not sell, trade, or rent your personal information to third parties. We may share
              your data with:
            </p>
            <ul>
              <li><strong>Delivery Partners:</strong> To fulfill and track your orders.</li>
              <li><strong>Payment Processors:</strong> To securely handle transactions.</li>
              <li><strong>Service Providers:</strong> Who assist in operating our website (e.g., email services, analytics).</li>
              <li><strong>Legal Authorities:</strong> When required by law or to protect our rights.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2><i className="fas fa-lock"></i> 5. Data Security</h2>
            <p>
              We implement industry-standard security measures to protect your personal data from
              unauthorized access, disclosure, or loss. However, no method of transmission over the
              internet is 100% secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section className="legal-section">
            <h2><i className="fas fa-cookie-bite"></i> 6. Cookies</h2>
            <p>
              DKMerch uses cookies to enhance your browsing experience, remember your preferences,
              and analyze site traffic. You may choose to disable cookies through your browser settings,
              though some features may not function properly as a result.
            </p>
          </section>

          <section className="legal-section">
            <h2><i className="fas fa-user-check"></i> 7. Your Rights</h2>
            <p>You have the right to:</p>
            <ul>
              <li>Access the personal information we hold about you.</li>
              <li>Request correction of inaccurate or incomplete data.</li>
              <li>Request deletion of your account and associated data.</li>
              <li>Opt out of marketing communications at any time.</li>
            </ul>
            <p>
              To exercise these rights, contact us at{' '}
              <a href="mailto:dkmerchtest@gmail.com">dkmerchtest@gmail.com</a>.
            </p>
          </section>

          <section className="legal-section">
            <h2><i className="fas fa-child"></i> 8. Children's Privacy</h2>
            <p>
              DKMerch does not knowingly collect personal information from children under the age of 13.
              If you believe a child has provided us with personal data, please contact us so we can
              delete that information promptly.
            </p>
          </section>

          <section className="legal-section">
            <h2><i className="fas fa-external-link-alt"></i> 9. Third-Party Links</h2>
            <p>
              Our website may contain links to third-party sites. We are not responsible for the privacy
              practices of those sites. We encourage you to review their privacy policies before
              providing any personal information.
            </p>
          </section>

          <section className="legal-section">
            <h2><i className="fas fa-sync-alt"></i> 10. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. Changes will be posted on this page
              with the updated date. Continued use of our services after changes means you accept the
              revised policy.
            </p>
          </section>

          <section className="legal-section legal-contact-section">
            <h2><i className="fas fa-envelope"></i> Contact Us</h2>
            <p>
              For privacy-related concerns, please reach out to us at{' '}
              <a href="mailto:dkmerchtest@gmail.com">dkmerchtest@gmail.com</a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;