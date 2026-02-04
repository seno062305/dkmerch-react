import React from 'react';
import './LogoMarquee.css';

const LogoMarquee = () => {
  const groups = [
    { name: 'BTS', logo: '/images/BTS_logo.png' },
    { name: 'BLACKPINK', logo: '/images/bp logo.png' },
    { name: 'TWICE', logo: '/images/TWICE-Logo.png' },
    { name: 'SEVENTEEN', logo: '/images/Seventeen-logo.png' },
    { name: 'STRAY KIDS', logo: '/images/straykids.jpg' },
    { name: 'EXO', logo: '/images/exo-logo.png' },
    { name: 'RED VELVET', logo: '/images/redvelvet.jpg' },
    { name: 'NEWJEANS', logo: '/images/newjeans.jpg' }
  ];

  // Duplicate the array to create a seamless loop
  const duplicatedGroups = [...groups, ...groups];

  return (
    <section className="logo-marquee-section">
      <div className="container">
        <h2 className="logo-marquee-title">Featured <span>K-Pop Groups</span></h2>
      </div>
      <div className="marquee-container">
        <div className="marquee-gradient-left"></div>
        <div className="marquee-gradient-right"></div>
        <div className="marquee-track">
          {duplicatedGroups.map((group, index) => (
            <div key={index} className="logo-item">
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