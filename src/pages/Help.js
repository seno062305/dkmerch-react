import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import './Help.css';

const Help = () => {
  const location = useLocation();

  useEffect(() => {
    if (location.hash) {
      const id = location.hash.replace('#', '');
      setTimeout(() => {
        const element = document.getElementById(id);
        if (element) element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  // FIXED: use primitives, not the whole location object
  }, [location.hash, location.pathname]);

  return (
    <main className="help-main">
      {/* Same page-header structure as PreOrder */}
      <div className="page-header">
        <div className="container">
          <h1 className="page-title">Help Center</h1>
          <p className="page-description">Find answers to your questions and learn more about our services</p>
        </div>
      </div>

      <div className="container">
        <div className="help-page">

          {/* FAQ */}
          <section id="faq" className="help-section">
            <h2><i className="fas fa-question-circle"></i> Frequently Asked Questions</h2>
            <div className="faq-grid">
              <div className="faq-item">
                <h3>How do I place an order?</h3>
                <p>Browse our products, add items to your cart, and proceed to checkout. You'll need to create an account or checkout as a guest.</p>
              </div>
              <div className="faq-item">
                <h3>Do you ship internationally?</h3>
                <p>Yes! We ship to most countries worldwide. Shipping fees and delivery times vary by location.</p>
              </div>
              <div className="faq-item">
                <h3>Are all products authentic?</h3>
                <p>Absolutely! We guarantee that all our K-Pop merchandise is 100% authentic and officially licensed.</p>
              </div>
              <div className="faq-item">
                <h3>How long does shipping take?</h3>
                <p>Domestic orders typically arrive within 3-7 business days. International orders may take 10-21 business days.</p>
              </div>
            </div>
          </section>

          {/* Shipping */}
          <section id="shipping" className="help-section">
            <h2><i className="fas fa-shipping-fast"></i> Shipping Information</h2>
            <div className="info-content">
              <div className="info-card">
                <h3>Domestic Shipping</h3>
                <ul>
                  <li>Standard Shipping: ₱150 (3-7 business days)</li>
                  <li>Express Shipping: ₱300 (1-3 business days)</li>
                  <li>Free shipping on orders over ₱2,500</li>
                </ul>
              </div>
              <div className="info-card">
                <h3>International Shipping</h3>
                <ul>
                  <li>Standard International: Starting at ₱800</li>
                  <li>Express International: Starting at ₱1,500</li>
                  <li>Delivery time: 10-21 business days</li>
                </ul>
              </div>
              <div className="info-card">
                <h3>Order Processing</h3>
                <ul>
                  <li>Orders are processed within 1-2 business days</li>
                  <li>You'll receive a tracking number via email</li>
                  <li>Track your order in the Track Order page</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Returns */}
          <section id="returns" className="help-section">
            <h2><i className="fas fa-undo"></i> Return Policy</h2>
            <div className="info-content">
              <div className="info-card">
                <h3>Return Window</h3>
                <p>You have 14 days from the date of delivery to initiate a return for most items.</p>
              </div>
              <div className="info-card">
                <h3>Eligible Items</h3>
                <ul>
                  <li>Items must be unused and in original packaging</li>
                  <li>Albums must have intact shrink wrap</li>
                  <li>Photocards and collectibles must be in mint condition</li>
                </ul>
              </div>
              <div className="info-card">
                <h3>Non-Returnable Items</h3>
                <ul>
                  <li>Opened albums or damaged packaging</li>
                  <li>Pre-order items (special circumstances only)</li>
                  <li>Sale or clearance items</li>
                </ul>
              </div>
              <div className="info-card">
                <h3>How to Return</h3>
                <ol>
                  <li>Contact our support team at support@dkmerch.com</li>
                  <li>Provide your order number and reason for return</li>
                  <li>Receive return authorization and instructions</li>
                  <li>Ship the item back using provided label</li>
                  <li>Refund processed within 5-7 business days</li>
                </ol>
              </div>
            </div>
          </section>

          {/* Contact */}
          <section className="help-section contact-section">
            <h2><i className="fas fa-envelope"></i> Still Need Help?</h2>
            <p>Our customer support team is here to assist you!</p>
            <div className="contact-options">
              <div className="contact-option">
                <i className="fas fa-envelope"></i>
                <h3>Email Us</h3>
                <p>support@dkmerch.com</p>
                <p className="response-time">Response within 24 hours</p>
              </div>
              <div className="contact-option">
                <i className="fas fa-phone"></i>
                <h3>Call Us</h3>
                <p>+63 912 345 6789</p>
                <p className="response-time">Mon-Sat: 9AM-6PM</p>
              </div>
              <div className="contact-option">
                <i className="fab fa-facebook-messenger"></i>
                <h3>Live Chat</h3>
                <p>Chat with us on Facebook</p>
                <p className="response-time">Mon-Sat: 9AM-6PM</p>
              </div>
            </div>
          </section>

        </div>
      </div>
    </main>
  );
};

export default Help;