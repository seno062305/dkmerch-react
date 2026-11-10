import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import {
  getNotificationPermission,
  isPushSupported,
  subscribeToPush,
} from '../utils/pushNotifications';
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
  const { user, isAuthenticated } = useAuth();
  const { showNotification } = useNotification();
  const savePushSub = useMutation(api.pushSubscriptions.saveSubscription);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushStatus, setPushStatus] = useState(getNotificationPermission());

  const enablePhoneNotifications = async () => {
    if (!isAuthenticated || !user?.email) {
      showNotification('Please log in first to enable notifications.', 'error');
      return;
    }
    if (!isPushSupported()) {
      showNotification('Push notifications are not supported on this browser. Install the app on your phone for best results.', 'error');
      return;
    }
    setPushBusy(true);
    try {
      const sub = await subscribeToPush();
      await savePushSub({
        email: user.email,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        userAgent: navigator.userAgent,
      });
      setPushStatus('granted');
      showNotification('Phone notifications enabled for DKMerch.', 'success');
    } catch (err) {
      setPushStatus(getNotificationPermission());
      showNotification(err?.message || 'Could not enable notifications.', 'error');
    } finally {
      setPushBusy(false);
    }
  };

  return (
    <div className="more-settings-page">
      <div className="more-settings-container">
        <header className="more-settings-header">
          <h1><i className="fas fa-cog"></i> Settings</h1>
          <p>Customer service and legal information</p>
        </header>

        <div className="more-settings-list">
          <button
            type="button"
            className="more-settings-card more-settings-card--btn"
            onClick={enablePhoneNotifications}
            disabled={pushBusy}
          >
            <span className="more-settings-icon"><i className="fas fa-bell"></i></span>
            <span className="more-settings-text">
              <strong>Phone notifications</strong>
              <small>
                {pushStatus === 'granted'
                  ? 'Enabled — order updates can appear on your phone'
                  : 'Enable DKMerch alerts on your installed app / browser'}
              </small>
            </span>
            <i className={`fas ${pushBusy ? 'fa-spinner fa-spin' : 'fa-chevron-right'} more-settings-chevron`}></i>
          </button>

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
          <p><i className="fas fa-clock"></i> Mon–Sat: 9AM–6PM PHT</p>
        </div>
      </div>
    </div>
  );
};

export default MoreSettings;
