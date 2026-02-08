import React from 'react';
import { useNavigate } from 'react-router-dom';
import './LogoMarquee.css';

const LogoMarquee = () => {
  const navigate = useNavigate();

  const groups = [
    { name: 'BTS', logo: '/images/BTS_logo.png' },
    { name: 'BLACKPINK', logo: '/images/bp_logo.png' },
    { name: 'TWICE', logo: '/images/TWICE-Logo.png' },
    { name: 'SEVENTEEN', logo: '/images/Seventeen-logo.png' },
    { name: 'STRAY KIDS', logo: '/images/straykids.jpg' },
    { name: 'EXO', logo: '/images/Exo-Logo.png' },
    { name: 'RED VELVET', logo: '/images/redvelvet.jpg' },
    { name: 'NEWJEANS', logo: '/images/newjeans.jpg' }
  ];

  // duplicate para seamless loop
  const duplicatedGroups = [...groups, ...groups];

  const handleGroupClick = (groupName) => {
    navigate('/collections', {
      state: {
        filterGroup: groupName,
        scrollToTop: true
      }
    });

    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 100);
  };

  return (
    <section className="logo-marquee-section">
      <div className="container">
        <h2 className="logo-marquee-title">
          Featured <span>K-Pop Groups</span>
        </h2>
      </div>

      <div className="marquee-container">
        <div className="marquee-gradient-left" />
        <div className="marquee-gradient-right" />

        <div className="marquee-track">
          {duplicatedGroups.map((group, index) => (
            <div
              key={index}
              className="logo-item"
              role="button"
              tabIndex={0}
              onClick={() => handleGroupClick(group.name)}
              onKeyDown={(e) =>
                e.key === 'Enter' && handleGroupClick(group.name)
              }
            >
              <div className="logo-circle">
                <img src={group.logo} alt={group.name} />
              </div>
              <div className="logo-text">{group.name}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default LogoMarquee;