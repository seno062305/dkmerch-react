import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { goToCustomerTab } from '../utils/navScroll';
import './Footer.css';

const Footer = () => {
  const currentYear = new Date().getFullYear();
  const navigate = useNavigate();
  const location = useLocation();

  const socialLinks = [
    { icon: 'facebook-f', url: '#', label: 'Facebook' },
    { icon: 'twitter', url: '#', label: 'Twitter' },
    { icon: 'instagram', url: '#', label: 'Instagram' },
    { icon: 'youtube', url: '#', label: 'YouTube' },
    { icon: 'tiktok', url: '#', label: 'TikTok' }
  ];

  const handleNavClick = (e, path) => {
    e.preventDefault();
    e.stopPropagation();
    goToCustomerTab(navigate, location.pathname, path);
  };

  const quickLinks = [
    { label: 'Home', path: '/' },
    { label: 'Collections', path: '/collections' },
    { label: 'Pre-Order', path: '/preorder' }
  ];

  const serviceLinks = [
    { label: 'Track Order', path: '/track-order' },
    { label: 'Terms and Conditions', path: '/terms-and-conditions' },
    { label: 'Privacy Policy', path: '/privacy-policy' },
  ];

  return (
    <footer>
      <div className="container">
        <div className="footer-content">
          <div className="footer-section footer-about">
              <div className="footer-brand-row">
                <img src="/images/dklogo.jpg" alt="DKMerch" className="footer-logo-img" />
                <h3>DKMerch</h3>
              </div>
            <p>Your trusted source for authentic K-Pop merchandise from your favorite groups.</p>
            <div className="social-links">
              {socialLinks.map((social, index) => (
                <a key={index} href={social.url} aria-label={social.label}>
                  <i className={`fab fa-${social.icon}`}></i>
                </a>
              ))}
            </div>
          </div>

          <div className="footer-section">
            <h4>Quick Links</h4>
            <ul className="footer-links">
              {quickLinks.map((link) => (
                <li key={link.path}>
                  <a
                    href={link.path}
                    onClick={(e) => handleNavClick(e, link.path)}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="footer-section">
            <h4>Customer Service</h4>
            <ul className="footer-links">
              {serviceLinks.map((link) => (
                <li key={link.path}>
                  <a
                    href={link.path}
                    onClick={(e) => handleNavClick(e, link.path)}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="footer-section footer-contact">
            <h4>Contact Us</h4>
            <div className="contact-info">
              <p><i className="fas fa-phone"></i> +63 912 345 6789</p>
              <p><i className="fas fa-envelope"></i> dkmerchtest@gmail.com</p>
              <p><i className="fas fa-clock"></i> Mon-Sat: 9AM-6PM PHT</p>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <p>&copy; {currentYear} DKMerch. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
