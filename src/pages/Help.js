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

          {/* Shipping */}
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
                <h3>Damaged item refunds</h3>
                <ol>
                  <li>After delivery, open Track Order / My Orders</li>
                  <li>Submit a refund request with a clear photo of the damage</li>
                  <li>Enter your GCash or Maya details for payout if approved</li>
                  <li>Admin reviews the request and emails you the decision</li>
                  <li>For other concerns, email dkmerchtest@gmail.com</li>
                </ol>
              </div>
            </div>
          </section>

          {/* Contact */}
          <section id="contact" className="help-section contact-section">
            <h2><i className="fas fa-envelope"></i> Still Need Help?</h2>
            <p>Our customer support team is here to assist you!</p>
            <div className="contact-options">
              <div className="contact-option">
                <i className="fas fa-envelope"></i>
                <h3>Email Us</h3>
                <p>dkmerchtest@gmail.com</p>
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