import React, { useState } from 'react';
import './Help.css';

const Help = () => {
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const faqs = [
    {
      category: 'orders',
      question: 'How do I place an order?',
      answer: 'Browse our collections, add items to your cart, and proceed to checkout. You can pay via credit card, debit card, or online banking.'
    },
    {
      category: 'orders',
      question: 'Can I modify or cancel my order?',
      answer: 'You can modify or cancel your order within 1 hour of placing it. After that, please contact our customer service team for assistance.'
    },
    {
      category: 'shipping',
      question: 'How long does shipping take?',
      answer: 'Standard shipping takes 3-5 business days within Metro Manila and 5-7 business days for provincial areas. Express shipping is available for 1-2 days delivery.'
    },
    {
      category: 'shipping',
      question: 'Do you ship internationally?',
      answer: 'Currently, we only ship within the Philippines. International shipping will be available soon!'
    },
    {
      category: 'payment',
      question: 'What payment methods do you accept?',
      answer: 'We accept credit cards (Visa, Mastercard), debit cards, GCash, PayMaya, and bank transfers.'
    },
    {
      category: 'payment',
      question: 'Is my payment information secure?',
      answer: 'Yes! We use industry-standard encryption to protect your payment information. We never store your full credit card details.'
    },
    {
      category: 'returns',
      question: 'What is your return policy?',
      answer: 'We accept returns within 7 days of delivery for unopened items in original packaging. Please contact us to initiate a return.'
    },
    {
      category: 'returns',
      question: 'How do I return an item?',
      answer: 'Contact our customer service team with your order number. We\'ll provide you with a return shipping label and instructions.'
    },
    {
      category: 'products',
      question: 'Are all products authentic?',
      answer: 'Yes! We only sell 100% authentic K-Pop merchandise sourced directly from official distributors and labels.'
    },
    {
      category: 'products',
      question: 'When will pre-order items be shipped?',
      answer: 'Pre-order items are shipped on or before the release date specified on the product page. You\'ll receive a notification when your item ships.'
    }
  ];

  const categories = [
    { id: 'all', name: 'All', icon: 'list' },
    { id: 'orders', name: 'Orders', icon: 'shopping-bag' },
    { id: 'shipping', name: 'Shipping', icon: 'truck' },
    { id: 'payment', name: 'Payment', icon: 'credit-card' },
    { id: 'returns', name: 'Returns', icon: 'undo' },
    { id: 'products', name: 'Products', icon: 'box' }
  ];

  const filteredFaqs = faqs.filter(faq => {
    const categoryMatch = activeCategory === 'all' || faq.category === activeCategory;
    const searchMatch = searchQuery === '' || 
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase());
    return categoryMatch && searchMatch;
  });

  return (
    <main>
      <div className="page-header">
        <div className="container">
          <h1 className="page-title">Help Center</h1>
          <p className="page-description">Find answers to frequently asked questions</p>
        </div>
      </div>

      <div className="container">
        <section className="help-page">
          <div className="help-search">
            <div className="search-box">
              <i className="fas fa-search"></i>
              <input
                type="text"
                placeholder="Search for help..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="help-categories">
            {categories.map(cat => (
              <button
                key={cat.id}
                className={`category-btn ${activeCategory === cat.id ? 'active' : ''}`}
                onClick={() => setActiveCategory(cat.id)}
              >
                <i className={`fas fa-${cat.icon}`}></i>
                <span>{cat.name}</span>
              </button>
            ))}
          </div>

          <div className="faq-section">
            {filteredFaqs.map((faq, index) => (
              <div key={index} className="faq-item">
                <div className="faq-question">
                  <i className="fas fa-question-circle"></i>
                  <h3>{faq.question}</h3>
                </div>
                <div className="faq-answer">
                  <p>{faq.answer}</p>
                </div>
              </div>
            ))}

            {filteredFaqs.length === 0 && (
              <div className="no-results">
                <i className="fas fa-search"></i>
                <h3>No results found</h3>
                <p>Try searching with different keywords</p>
              </div>
            )}
          </div>

          <div className="contact-support">
            <h2>Still need help?</h2>
            <p>Our customer support team is here to assist you</p>
            <div className="contact-methods">
              <div className="contact-card">
                <i className="fas fa-envelope"></i>
                <h4>Email Us</h4>
                <p>support@dkmerch.com</p>
                <small>We'll respond within 24 hours</small>
              </div>
              <div className="contact-card">
                <i className="fas fa-phone"></i>
                <h4>Call Us</h4>
                <p>+63 912 345 6789</p>
                <small>Mon-Sat: 9AM-6PM</small>
              </div>
              <div className="contact-card">
                <i className="fas fa-comments"></i>
                <h4>Live Chat</h4>
                <p>Chat with us now</p>
                <button className="btn btn-primary btn-small">Start Chat</button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
};

export default Help;