import React from 'react';
import { Link } from 'react-router-dom';
import './Footer.css';

const Footer = () => {
  const currentYear = new Date().getFullYear();

  const socialLinks = [
    { icon: 'facebook-f', url: '#', label: 'Facebook' },
    { icon: 'twitter', url: '#', label: 'Twitter' },
    { icon: 'instagram', url: '#', label: 'Instagram' },
    { icon: 'youtube', url: '#', label: 'YouTube' },
    { icon: 'tiktok', url: '#', label: 'TikTok' }
  ];

  const quickLinks = [
    { label: 'Home', path: '/' },
    { label: 'Collections', path: '/collections' },
    { label: 'Pre-Order', path: '/preorder' },
    { label: 'New Arrivals', path: '/new' }
  ];

  const customerLinks = [
    { label: 'Track Order', path: '/track-order' },
    { label: 'Shipping Info', path: '/shipping' },
    { label: 'Returns', path: '/returns' },
    { label: 'FAQ', path: '/faq' }
  ];

  return (
    <footer>
      <div className="container">
        <div className="footer-content">
          <div className="footer-section footer-about">
            <h3>DKMerch</h3>
            <p>Your trusted source for authentic K-Pop merchandise from your favorite groups.</p>
            <div className="social-links">
              {socialLinks.map((social, index) => (
                <a key={index} href={social.url} target="_blank" rel="noopener noreferrer" aria-label={social.label}>
                  <i className={`fab fa-${social.icon}`}></i>
                </a>
              ))}
            </div>
          </div>

          <div className="footer-section">
            <h4>Quick Links</h4>
            <ul className="footer-links">
              {quickLinks.map((link, index) => (
                <li key={index}>
                  <Link to={link.path}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="footer-section">
            <h4>Customer Service</h4>
            <ul className="footer-links">
              {customerLinks.map((link, index) => (
                <li key={index}>
                  <Link to={link.path}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="footer-section footer-contact">
            <h4>Contact Us</h4>
            <div className="contact-info">
              <p><i className="fas fa-phone"></i> +63 912 345 6789</p>
              <p><i className="fas fa-envelope"></i> support@dkmerch.com</p>
              <p><i className="fas fa-clock"></i> Mon-Sat: 9AM-6PM</p>
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