import React from 'react';
import { Link } from 'react-router-dom';
import './Footer.css';

const Footer = () => {
  const currentYear = new Date().getFullYear();

  const socialLinks = [
    { icon: 'facebook-f', url: '#' },
    { icon: 'twitter', url: '#' },
    { icon: 'instagram', url: '#' },
    { icon: 'youtube', url: '#' },
    { icon: 'tiktok', url: '#' }
  ];

  const quickLinks = [
    { label: 'Home', path: '/' },
    { label: 'Collections', path: '/collections' },
    { label: 'Pre-Order', path: '/preorder' },
    { label: 'New Arrivals', path: '/new' },
    { label: 'Sale', path: '/sale' },
    { label: 'Wishlist', path: '/wishlist' }
  ];

  const serviceLinks = [
    { label: 'Track Order', path: '#' },
    { label: 'Shipping Info', path: '#' },
    { label: 'Returns & Exchanges', path: '#' },
    { label: 'FAQ', path: '#' },
    { label: 'Contact Us', path: '#' },
    { label: 'Privacy Policy', path: '#' }
  ];

  return (
    <footer>
      <div className="container">
        <div className="footer-content">
          <div className="footer-section">
            <h3>DKMerch</h3>
            <p>Your trusted source for authentic K-Pop merchandise. We bring you the latest albums, photocards, lightsticks, and exclusive items from your favorite groups.</p>
            <div className="social-links">
              {socialLinks.map((social, index) => (
                <a key={index} href={social.url} target="_blank" rel="noopener noreferrer">
                  <i className={`fab fa-${social.icon}`}></i>
                </a>
              ))}
            </div>
          </div>

          <div className="footer-section">
            <h3>Quick Links</h3>
            <ul className="footer-links">
              {quickLinks.map((link, index) => (
                <li key={index}>
                  <Link to={link.path}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="footer-section">
            <h3>Customer Service</h3>
            <ul className="footer-links">
              {serviceLinks.map((link, index) => (
                <li key={index}>
                  <a href={link.path}>{link.label}</a>
                </li>
              ))}
            </ul>
          </div>

          <div className="footer-section">
            <h3>Contact Info</h3>
            <p><i className="fas fa-map-marker-alt"></i> 123 K-Pop Street, Manila, Philippines</p>
            <p><i className="fas fa-phone"></i> +63 912 345 6789</p>
            <p><i className="fas fa-envelope"></i> support@dkmerch.com</p>
            <p><i className="fas fa-clock"></i> Mon-Sat: 9AM-6PM</p>
          </div>
        </div>

        <div className="footer-bottom">
          <p>&copy; {currentYear} DKMerch K-Pop Merchandise. All rights reserved. | Designed by Project Team</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;