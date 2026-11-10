import React from 'react';
import { Link } from 'react-router-dom';
import './MoreSettings.css';

const LINKS = [
  {
    to: '/help',
    icon: 'fa-headset',
    title: 'Customer Service',
    desc: 'Help Center, FAQs, and support',
  },
  {
    to: '/terms-and-conditions',
    icon: 'fa-file-contract',
    title: 'Terms and Conditions',
    desc: 'Rules for using DKMerch',
  },
  {
    to: '/privacy-policy',
    icon: 'fa-user-shield',
    title: 'Privacy Policy',
    desc: 'How we handle your data',
  },
  {
    to: '/help#contact',
    icon: 'fa-envelope',
    title: 'Contact Us',
    desc: 'Phone, email, and store hours',
    hash: true,
  },
];

const MoreSettings = () => {
  return (
    <div className="more-settings-page">
      <div className="more-settings-container">
        <header className="more-settings-header">
          <h1><i className="fas fa-cog"></i> Settings</h1>
          <p>Customer service and legal information</p>
        </header>

        <div className="more-settings-list">
          {LINKS.map((item) => (
            <Link key={item.title} to={item.to} className="more-settings-card">
              <span className="more-settings-icon"><i className={`fas ${item.icon}`}></i></span>
              <span className="more-settings-text">
                <strong>{item.title}</strong>
                <small>{item.desc}</small>
              </span>
              <i className="fas fa-chevron-right more-settings-chevron"></i>
            </Link>
          ))}
        </div>

        <div className="more-settings-contact">
          <h2><i className="fas fa-phone-alt"></i> Contact Us</h2>
          <p><i className="fas fa-phone"></i> +63 912 345 6789</p>
          <p><i className="fas fa-envelope"></i> dkmerchtest@gmail.com</p>
          <p><i className="fas fa-clock"></i> Mon–Sat: 9AM–6PM PST</p>
        </div>
      </div>
    </div>
  );
};

export default MoreSettings;
