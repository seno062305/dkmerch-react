import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { TermsContent } from './TermsAndConditions';
import { PrivacyContent } from './PrivacyPolicy';
import './Help.css';
import './LegalPage.css';

const TOPICS = [
  { id: 'terms', label: 'Terms and Conditions', icon: 'fa-file-contract' },
  { id: 'privacy', label: 'Privacy Policy', icon: 'fa-user-shield' },
];

const HelpOverview = () => (
  <>
    <section id="faq" className="help-section">
      <h2><i className="fas fa-question-circle"></i> Frequently Asked Questions</h2>
      <div className="faq-grid">
        <div className="faq-item">
          <h3>How do I place an order?</h3>
          <p>
            Log in or create a DKMerch account first — guest checkout is not available.
            Then browse products, add items to your cart, and proceed to checkout. Payment is via PayMongo (GCash or Maya).
          </p>
        </div>
        <div className="faq-item">
          <h3>Do I need an account to buy?</h3>
          <p>
            Yes. You must be logged in to add items to cart, use wishlist, place pre-orders, and checkout.
            You can still browse the shop without signing in.
          </p>
        </div>
        <div className="faq-item">
          <h3>Are all products authentic?</h3>
          <p>Absolutely! We guarantee that all our K-Pop merchandise is 100% authentic and officially licensed.</p>
        </div>
        <div className="faq-item">
          <h3>How long does delivery take?</h3>
          <p>
            After admin confirms your order, NCR deliveries are usually handled by DK Riders with live tracking.
            Outside NCR, admin may ship via LBC — timing depends on location and courier schedules.
          </p>
        </div>
      </div>
    </section>

    <section id="shipping" className="help-section">
      <h2><i className="fas fa-shipping-fast"></i> Shipping Information</h2>
      <div className="info-content">
        <div className="info-card">
          <h3>NCR / DK Rider delivery</h3>
          <ul>
            <li>Shipping fee is calculated from store-to-address distance at checkout</li>
            <li>After payment, admin confirms the order before riders can accept it</li>
            <li>Once out for delivery, track your rider live on Track Order</li>
            <li>Confirm receipt with the 4-digit delivery OTP on your tracking page</li>
          </ul>
        </div>
        <div className="info-card">
          <h3>Outside NCR (LBC)</h3>
          <ul>
            <li>Admin may ship via LBC Express for addresses outside rider coverage</li>
            <li>You’ll receive LBC tracking details when available</li>
            <li>Use the LBC tracker on the Track Order page when provided</li>
          </ul>
        </div>
        <div className="info-card">
          <h3>Order Processing</h3>
          <ul>
            <li>Pay with GCash or Maya through PayMongo</li>
            <li>Order emails / status updates are sent to your account email</li>
            <li>Track anytime on the Track Order page (login recommended for full tools)</li>
          </ul>
        </div>
      </div>
    </section>

    <section id="returns" className="help-section">
      <h2><i className="fas fa-undo"></i> Refund Policy</h2>
      <div className="info-content">
        <div className="info-card">
          <h3>24-hour damaged-item window</h3>
          <p>
            After your order is marked delivered, you may request a refund for
            <strong> damaged items only</strong> within <strong>24 hours</strong>.
            Change-of-mind returns for unused goods are not supported in the current system.
          </p>
        </div>
        <div className="info-card">
          <h3>How to request</h3>
          <ol>
            <li>Open Track Order / My Orders and find the delivered order</li>
            <li>Submit a refund request with a clear photo of the damage</li>
            <li>Choose GCash or Maya and enter account name + mobile number</li>
            <li>Admin reviews the request and emails you the decision</li>
            <li>Approved payouts usually process within about 24 hours after approval</li>
          </ol>
        </div>
        <div className="info-card">
          <h3>Before confirmation</h3>
          <p>
            If admin has not confirmed your order yet, you can request cancellation from Track Order.
            Paid orders may need GCash/Maya details so an approved refund can be sent.
          </p>
        </div>
      </div>
    </section>
  </>
);

const Help = () => {
  const location = useLocation();
  const [topic, setTopic] = useState('help');

  useEffect(() => {
    if (location.hash === '#privacy' || location.hash === '#privacy-policy') {
      setTopic('privacy');
    } else if (location.hash === '#terms' || location.hash === '#terms-and-conditions') {
      setTopic('terms');
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [location.hash, location.pathname]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [topic]);

  return (
    <main className="help-main">
      <div className="page-header">
        <div className="container">
          <h1 className="page-title">Help Center</h1>
          <p className="page-description">Find answers to your questions and learn more about our services</p>
        </div>
      </div>

      <div className="container">
        <div className="help-page">
          <section id="customer-service" className="help-section help-customer-service">
            <div className="help-cs-top">
              <button
                type="button"
                className={`help-cs-title-btn${topic === 'help' ? ' is-active' : ''}`}
                onClick={() => setTopic('help')}
                aria-pressed={topic === 'help'}
              >
                <i className="fas fa-headset"></i>
                <span>Customer Service</span>
              </button>
              <div className="help-cs-tabs">
                {TOPICS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`help-cs-tab${topic === t.id ? ' is-active' : ''}`}
                    onClick={() => setTopic(t.id)}
                    aria-pressed={topic === t.id}
                  >
                    <i className={`fas ${t.icon}`}></i>
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
            {topic === 'help' && (
              <div className="help-cs-contact">
                <p><i className="fas fa-phone"></i> +63 912 345 6789</p>
                <p><i className="fas fa-envelope"></i> dkmerchtest@gmail.com</p>
                <p><i className="fas fa-clock"></i> Mon-Sat: 9AM-6PM PHT</p>
              </div>
            )}
          </section>

          <div className="help-topic-panel" key={topic}>
            {topic === 'help' && <HelpOverview />}
            {topic === 'terms' && (
              <section className="help-section help-legal-topic">
                <h2><i className="fas fa-file-contract"></i> Terms and Conditions</h2>
                <p className="help-legal-updated">Last updated: November 2026</p>
                <TermsContent />
              </section>
            )}
            {topic === 'privacy' && (
              <section className="help-section help-legal-topic">
                <h2><i className="fas fa-user-shield"></i> Privacy Policy</h2>
                <p className="help-legal-updated">Last updated: November 2026</p>
                <PrivacyContent />
              </section>
            )}
          </div>
        </div>
      </div>
    </main>
  );
};

export default Help;
