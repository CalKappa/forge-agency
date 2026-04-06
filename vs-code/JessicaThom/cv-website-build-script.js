(function() {
  'use strict';

  // =============================================
  // LANGUAGE DATA
  // =============================================
  const translations = {
    fr: {
      nav: {
        about: 'À Propos',
        experience: 'Expérience',
        skills: 'Compétences',
        education: 'Formation',
        testimonials: 'Recommandations',
        contact: 'Contact'
      },
      hero: {
        eyebrow: 'Portfolio & CV',
        title: 'Jessica Baillet',
        subtitle: 'Chef de Projet Marketing · Stratégie Digitale & Innovation',
        btnPrimary: 'Découvrir mon parcours',
        btnSecondary: 'Télécharger mon CV'
      },
      about: {
        number: '01',
        title: 'À Propos',
        intro: 'Passionnée par le marketing digital et l\'innovation, je conçois et pilote des stratégies qui transforment les ambitions en résultats mesurables. Mon approche allie créativité, rigueur analytique et une profonde compréhension des enjeux business.',
        body: 'Avec plus de <strong>10 ans d\'expérience</strong> dans le marketing digital, j\'ai accompagné des entreprises de toutes tailles — des startups ambitieuses aux grands groupes internationaux. Spécialisée en <strong>stratégie de contenu</strong>, <strong>acquisition digitale</strong> et <strong>gestion de projets transversaux</strong>, je m\'engage à créer de la valeur durable et à conduire le changement avec impact.',
        stats: [
          { number: '10+', label: 'Années d\'expérience' },
          { number: '15+', label: 'Projets majeurs' },
          { number: '3', label: 'Secteurs d\'industrie' },
          { number: '98%', label: 'Clients satisfaits' }
        ]
      },
      experience: {
        number: '02',
        title: 'Expérience Professionnelle',
        items: [
          {
            company: 'Groupe Lumière Digital',
            date: '2021 — Présent',
            role: 'Directrice Marketing Digital',
            bullets: [
              'Pilotage de la stratégie digitale globale avec un budget de 2M€',
              'Augmentation du trafic organique de 185% en 18 mois',
              'Management d\'une équipe pluridisciplinaire de 8 personnes'
            ],
            tags: ['Stratégie Digitale', 'SEO/SEA', 'Management', 'Analytics']
          },
          {
            company: 'Agence Créative Nova',
            date: '2018 — 2021',
            role: 'Chef de Projet Marketing Senior',
            bullets: [
              'Gestion simultanée de 5 à 8 comptes clients grands comptes',
              'Conception et déploiement de campagnes multi-canal innovantes',
              'Mise en place de processus agiles réduisant les délais de 30%'
            ],
            tags: ['Gestion de Projet', 'Campagnes Multi-canal', 'Agile', 'CRM']
          },
          {
            company: 'TechStart Solutions',
            date: '2015 — 2018',
            role: 'Responsable Communication & Marketing',
            bullets: [
              'Création de la stratégie de marque et de l\'identité visuelle',
              'Lancement de 3 produits SaaS avec des campagnes go-to-market',
              'Développement des partenariats stratégiques B2B'
            ],
            tags: ['Branding', 'SaaS', 'B2B', 'Content Marketing']
          },
          {
            company: 'MediaPlus International',
            date: '2013 — 2015',
            role: 'Chargée de Marketing Digital',
            bullets: [
              'Gestion des réseaux sociaux et de la stratégie de contenu',
              'Analyse des performances et reporting mensuel',
              'Coordination avec les équipes créatives et techniques'
            ],
            tags: ['Social Media', 'Content', 'Reporting', 'Coordination']
          }
        ]
      },
      skills: {
        number: '03',
        title: 'Compétences',
        categories: [
          {
            icon: 'strategy',
            title: 'Stratégie & Marketing',
            items: [
              { name: 'Stratégie digitale', level: 'Expert', levelClass: 'expert' },
              { name: 'Marketing de contenu', level: 'Expert', levelClass: 'expert' },
              { name: 'SEO / SEA', level: 'Avancé', levelClass: 'advanced' },
              { name: 'Branding & positionnement', level: 'Expert', levelClass: 'expert' },
              { name: 'Marketing automation', level: 'Avancé', levelClass: 'advanced' }
            ]
          },
          {
            icon: 'tools',
            title: 'Outils & Technologies',
            items: [
              { name: 'Google Analytics / GA4', level: 'Expert', levelClass: 'expert' },
              { name: 'HubSpot / Salesforce', level: 'Avancé', levelClass: 'advanced' },
              { name: 'Adobe Creative Suite', level: 'Intermédiaire', levelClass: 'intermediate' },
              { name: 'WordPress / CMS', level: 'Avancé', levelClass: 'advanced' },
              { name: 'Notion / Asana / Trello', level: 'Expert', levelClass: 'expert' }
            ]
          },
          {
            icon: 'leadership',
            title: 'Leadership & Soft Skills',
            items: [
              { name: 'Management d\'équipe', level: 'Expert', levelClass: 'expert' },
              { name: 'Gestion de projet agile', level: 'Expert', levelClass: 'expert' },
              { name: 'Communication', level: 'Expert', levelClass: 'expert' },
              { name: 'Résolution de problèmes', level: 'Avancé', levelClass: 'advanced' },
              { name: 'Négociation', level: 'Avancé', levelClass: 'advanced' }
            ]
          }
        ]
      },
      education: {
        number: '04',
        title: 'Formation',
        items: [
          {
            degree: 'Master Marketing Digital & Innovation',
            institution: 'HEC Paris',
            year: '2013'
          },
          {
            degree: 'Licence Communication & Médias',
            institution: 'Université Paris-Sorbonne',
            year: '2011'
          },
          {
            degree: 'Certification Google Analytics',
            institution: 'Google',
            year: '2020'
          }
        ]
      },
      testimonials: {
        number: '05',
        title: 'Recommandations',
        items: [
          {
            text: '« Jessica possède une rare combinaison de vision stratégique et d\'excellence opérationnelle. Son leadership a transformé notre approche digitale et généré des résultats exceptionnels. »',
            name: 'Marie Dupont',
            role: 'Directrice Générale, Groupe Lumière Digital'
          },
          {
            text: '« Travailler avec Jessica a été une révélation. Sa capacité à comprendre les enjeux business et à les traduire en actions marketing concrètes est tout simplement remarquable. »',
            name: 'Thomas Bernard',
            role: 'Fondateur & CEO, TechStart Solutions'
          },
          {
            text: '« Jessica apporte une énergie et une rigueur uniques à chaque projet. Elle sait fédérer les équipes et maintenir un cap stratégique clair, même dans les situations complexes. »',
            name: 'Sophie Martin',
            role: 'Directrice de Clientèle, Agence Créative Nova'
          }
        ]
      },
      contact: {
        number: '06',
        title: 'Contact',
        subtext: 'Vous souhaitez échanger ? N\'hésitez pas à me contacter.',
        email: 'jessica.baillet@email.com',
        linkedin: 'Voir mon profil LinkedIn',
        location: 'Paris, France',
        download: 'Télécharger mon CV (PDF)',
        form: {
          name: 'Nom',
          namePlaceholder: 'Votre nom complet',
          email: 'Email',
          emailPlaceholder: 'votre@email.com',
          subject: 'Objet',
          subjectPlaceholder: 'Sujet de votre message',
          message: 'Message',
          messagePlaceholder: 'Votre message...',
          submit: 'Envoyer le message',
          gdpr: 'Vos données sont traitées conformément au RGPD. Consultez notre <a href="#">politique de confidentialité</a>.'
        },
        success: 'Merci ! Votre message a bien été envoyé.',
        error: 'Veuillez remplir tous les champs correctement.'
      },
      footer: {
        copy: '© 2025 Jessica Baillet. Tous droits réservés.'
      }
    },
    en: {
      nav: {
        about: 'About',
        experience: 'Experience',
        skills: 'Skills',
        education: 'Education',
        testimonials: 'Testimonials',
        contact: 'Contact'
      },
      hero: {
        eyebrow: 'Portfolio & CV',
        title: 'Jessica Baillet',
        subtitle: 'Marketing Project Manager · Digital Strategy & Innovation',
        btnPrimary: 'Explore my journey',
        btnSecondary: 'Download my CV'
      },
      about: {
        number: '01',
        title: 'About',
        intro: 'Passionate about digital marketing and innovation, I design and lead strategies that turn ambitions into measurable results. My approach combines creativity, analytical rigor, and a deep understanding of business challenges.',
        body: 'With over <strong>10 years of experience</strong> in digital marketing, I have supported companies of all sizes — from ambitious startups to large international groups. Specializing in <strong>content strategy</strong>, <strong>digital acquisition</strong> and <strong>cross-functional project management</strong>, I am committed to creating lasting value and driving change with impact.',
        stats: [
          { number: '10+', label: 'Years of experience' },
          { number: '15+', label: 'Major projects' },
          { number: '3', label: 'Industry sectors' },
          { number: '98%', label: 'Satisfied clients' }
        ]
      },
      experience: {
        number: '02',
        title: 'Professional Experience',
        items: [
          {
            company: 'Groupe Lumière Digital',
            date: '2021 — Present',
            role: 'Digital Marketing Director',
            bullets: [
              'Led global digital strategy with a €2M budget',
              'Increased organic traffic by 185% in 18 months',
              'Managed a multidisciplinary team of 8 people'
            ],
            tags: ['Digital Strategy', 'SEO/SEA', 'Management', 'Analytics']
          },
          {
            company: 'Agence Créative Nova',
            date: '2018 — 2021',
            role: 'Senior Marketing Project Manager',
            bullets: [
              'Simultaneously managed 5 to 8 major client accounts',
              'Designed and deployed innovative multi-channel campaigns',
              'Implemented agile processes reducing timelines by 30%'
            ],
            tags: ['Project Management', 'Multi-channel Campaigns', 'Agile', 'CRM']
          },
          {
            company: 'TechStart Solutions',
            date: '2015 — 2018',
            role: 'Communications & Marketing Manager',
            bullets: [
              'Created brand strategy and visual identity',
              'Launched 3 SaaS products with go-to-market campaigns',
              'Developed strategic B2B partnerships'
            ],
            tags: ['Branding', 'SaaS', 'B2B', 'Content Marketing']
          },
          {
            company: 'MediaPlus International',
            date: '2013 — 2015',
            role: 'Digital Marketing Coordinator',
            bullets: [
              'Managed social media and content strategy',
              'Performed analytics and monthly reporting',
              'Coordinated with creative and technical teams'
            ],
            tags: ['Social Media', 'Content', 'Reporting', 'Coordination']
          }
        ]
      },
      skills: {
        number: '03',
        title: 'Skills',
        categories: [
          {
            icon: 'strategy',
            title: 'Strategy & Marketing',
            items: [
              { name: 'Digital strategy', level: 'Expert', levelClass: 'expert' },
              { name: 'Content marketing', level: 'Expert', levelClass: 'expert' },
              { name: 'SEO / SEA', level: 'Advanced', levelClass: 'advanced' },
              { name: 'Branding & positioning', level: 'Expert', levelClass: 'expert' },
              { name: 'Marketing automation', level: 'Advanced', levelClass: 'advanced' }
            ]
          },
          {
            icon: 'tools',
            title: 'Tools & Technologies',
            items: [
              { name: 'Google Analytics / GA4', level: 'Expert', levelClass: 'expert' },
              { name: 'HubSpot / Salesforce', level: 'Advanced', levelClass: 'advanced' },
              { name: 'Adobe Creative Suite', level: 'Intermediate', levelClass: 'intermediate' },
              { name: 'WordPress / CMS', level: 'Advanced', levelClass: 'advanced' },
              { name: 'Notion / Asana / Trello', level: 'Expert', levelClass: 'expert' }
            ]
          },
          {
            icon: 'leadership',
            title: 'Leadership & Soft Skills',
            items: [
              { name: 'Team management', level: 'Expert', levelClass: 'expert' },
              { name: 'Agile project management', level: 'Expert', levelClass: 'expert' },
              { name: 'Communication', level: 'Expert', levelClass: 'expert' },
              { name: 'Problem solving', level: 'Advanced', levelClass: 'advanced' },
              { name: 'Negotiation', level: 'Advanced', levelClass: 'advanced' }
            ]
          }
        ]
      },
      education: {
        number: '04',
        title: 'Education',
        items: [
          {
            degree: 'Master in Digital Marketing & Innovation',
            institution: 'HEC Paris',
            year: '2013'
          },
          {
            degree: 'Bachelor in Communication & Media',
            institution: 'Université Paris-Sorbonne',
            year: '2011'
          },
          {
            degree: 'Google Analytics Certification',
            institution: 'Google',
            year: '2020'
          }
        ]
      },
      testimonials: {
        number: '05',
        title: 'Testimonials',
        items: [
          {
            text: '"Jessica possesses a rare combination of strategic vision and operational excellence. Her leadership transformed our digital approach and delivered exceptional results."',
            name: 'Marie Dupont',
            role: 'CEO, Groupe Lumière Digital'
          },
          {
            text: '"Working with Jessica was a revelation. Her ability to understand business challenges and translate them into concrete marketing actions is simply remarkable."',
            name: 'Thomas Bernard',
            role: 'Founder & CEO, TechStart Solutions'
          },
          {
            text: '"Jessica brings unique energy and rigor to every project. She knows how to unite teams and maintain a clear strategic direction, even in complex situations."',
            name: 'Sophie Martin',
            role: 'Client Director, Agence Créative Nova'
          }
        ]
      },
      contact: {
        number: '06',
        title: 'Contact',
        subtext: 'Would you like to connect? Don\'t hesitate to reach out.',
        email: 'jessica.baillet@email.com',
        linkedin: 'View my LinkedIn profile',
        location: 'Paris, France',
        download: 'Download my CV (PDF)',
        form: {
          name: 'Name',
          namePlaceholder: 'Your full name',
          email: 'Email',
          emailPlaceholder: 'your@email.com',
          subject: 'Subject',
          subjectPlaceholder: 'Subject of your message',
          message: 'Message',
          messagePlaceholder: 'Your message...',
          submit: 'Send message',
          gdpr: 'Your data is processed in accordance with GDPR. See our <a href="#">privacy policy</a>.'
        },
        success: 'Thank you! Your message has been sent successfully.',
        error: 'Please fill in all fields correctly.'
      },
      footer: {
        copy: '© 2025 Jessica Baillet. All rights reserved.'
      }
    }
  };

  let currentLang = 'fr';
  let carouselInterval = null;
  let currentSlide = 0;

  // =============================================
  // INITIALIZATION
  // =============================================
  document.addEventListener('DOMContentLoaded', function() {
    initNavbar();
    initMobileMenu();
    initLanguageToggle();
    initSmoothScroll();
    initScrollSpy();
    initIntersectionObserver();
    initCarousel();
    initContactForm();
    initKeyboardNavigation();
    applyLanguage(currentLang);
  });

  // =============================================
  // NAVBAR SCROLL EFFECT
  // =============================================
  function initNavbar() {
    var navbar = document.getElementById('navbar');
    if (!navbar) return;

    window.addEventListener('scroll', function() {
      if (window.scrollY > 10) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }
    }, { passive: true });
  }

  // =============================================
  // MOBILE MENU
  // =============================================
  function initMobileMenu() {
    var hamburger = document.querySelector('.nav-hamburger');
    var navLinks = document.querySelector('.nav-links');
    if (!hamburger || !navLinks) return;

    hamburger.addEventListener('click', function() {
      hamburger.classList.toggle('open');
      navLinks.classList.toggle('open');
    });

    navLinks.querySelectorAll('a').forEach(function(link) {
      if (!link) return;
      link.addEventListener('click', function() {
        hamburger.classList.remove('open');
        navLinks.classList.remove('open');
      });
    });

    document.addEventListener('click', function(e) {
      if (!hamburger.contains(e.target) && !navLinks.contains(e.target)) {
        hamburger.classList.remove('open');
        navLinks.classList.remove('open');
      }
    });
  }

  // =============================================
  // LANGUAGE TOGGLE
  // =============================================
  function initLanguageToggle() {
    var langButtons = document.querySelectorAll('.lang-toggle button');
    if (!langButtons.length) return;

    langButtons.forEach(function(btn) {
      if (!btn) return;
      btn.addEventListener('click', function() {
        var lang = this.getAttribute('data-lang');
        if (lang && lang !== currentLang) {
          currentLang = lang;
          applyLanguage(lang);
          langButtons.forEach(function(b) {
            if (b) b.classList.remove('active-lang');
          });
          this.classList.add('active-lang');
        }
      });
    });
  }

  function applyLanguage(lang) {
    var t = translations[lang];
    if (!t) return;

    // Nav links
    var navAnchors = document.querySelectorAll('.nav-links a[data-section]');
    navAnchors.forEach(function(a) {
      if (!a) return;
      var section = a.getAttribute('data-section');
      if (t.nav[section]) {
        a.textContent = t.nav[section];
      }
    });

    // Hero
    setTextContent('[data-i18n="hero.eyebrow"]', t.hero.eyebrow);
    setTextContent('[data-i18n="hero.title"]', t.hero.title);
    setTextContent('[data-i18n="hero.subtitle"]', t.hero.subtitle);
    setTextContent('[data-i18n="hero.btnPrimary"]', t.hero.btnPrimary);
    setTextContent('[data-i18n="hero.btnSecondary"]', t.hero.btnSecondary);

    // About
    setTextContent('[data-i18n="about.number"]', t.about.number);
    setTextContent('[data-i18n="about.title"]', t.about.title);
    setTextContent('[data-i18n="about.intro"]', t.about.intro);
    setHTML('[data-i18n="about.body"]', t.about.body);

    var statNumbers = document.querySelectorAll('[data-i18n^="about.stat.number"]');
    var statLabels = document.querySelectorAll('[data-i18n^="about.stat.label"]');
    t.about.stats.forEach(function(stat, i) {
      if (statNumbers[i]) statNumbers[i].textContent = stat.number;
      if (statLabels[i]) statLabels[i].textContent = stat.label;
    });

    // Experience
    setTextContent('[data-i18n="experience.number"]', t.experience.number);
    setTextContent('[data-i18n="experience.title"]', t.experience.title);

    var timelineItems = document.querySelectorAll('.timeline-item');
    t.experience.items.forEach(function(item, i) {
      if (!timelineItems[i]) return;
      var card = timelineItems[i].querySelector('.timeline-card');
      if (!card) return;
      var companyEl = card.querySelector('.timeline-company-name');
      var dateEl = card.querySelector('.timeline-date');
      var h3El = card.querySelector('h3');
      var bullets = card.querySelectorAll('.timeline-description li');
      var tags = card.querySelectorAll('.timeline-tag');

      if (companyEl) companyEl.textContent = item.company;
      if (dateEl) dateEl.textContent = item.date;
      if (h3El) h3El.textContent = item.role;
      item.bullets.forEach(function(b, j) {
        if (bullets[j]) bullets[j].textContent = b;
      });
      item.tags.forEach(function(tag, j) {
        if (tags[j]) tags[j].textContent = tag;
      });
    });

    // Skills
    setTextContent('[data-i18n="skills.number"]', t.skills.number);
    setTextContent('[data-i18n="skills.title"]', t.skills.title);

    var skillCards = document.querySelectorAll('.skill-card');
    t.skills.categories.forEach(function(cat, i) {
      if (!skillCards[i]) return;
      var titleEl = skillCards[i].querySelector('.skill-card-title');
      if (titleEl) titleEl.textContent = cat.title;
      var listItems = skillCards[i].querySelectorAll('.skill-list li');
      cat.items.forEach(function(skill, j) {
        if (!listItems[j]) return;
        var nameSpan = listItems[j].querySelector('.skill-name');
        var levelSpan = listItems[j].querySelector('.skill-level');
        if (nameSpan) nameSpan.textContent = skill.name;
        if (levelSpan) {
          levelSpan.textContent = skill.level;
          levelSpan.className = 'skill-level skill-level--' + skill.levelClass;
        }
      });
    });

    // Education
    setTextContent('[data-i18n="education.number"]', t.education.number);
    setTextContent('[data-i18n="education.title"]', t.education.title);

    var eduCards = document.querySelectorAll('.education-card');
    t.education.items.forEach(function(item, i) {
      if (!eduCards[i]) return;
      var degreeEl = eduCards[i].querySelector('.education-degree');
      var instEl = eduCards[i].querySelector('.education-institution');
      var yearEl = eduCards[i].querySelector('.education-year');
      if (degreeEl) degreeEl.textContent = item.degree;
      if (instEl) instEl.textContent = item.institution;
      if (yearEl) yearEl.textContent = item.year;
    });

    // Testimonials
    setTextContent('[data-i18n="testimonials.number"]', t.testimonials.number);
    setTextContent('[data-i18n="testimonials.title"]', t.testimonials.title);

    var slides = document.querySelectorAll('.testimonial-slide');
    t.testimonials.items.forEach(function(item, i) {
      if (!slides[i]) return;
      var textEl = slides[i].querySelector('.testimonial-text');
      var nameEl = slides[i].querySelector('.testimonial-name');
      var roleEl = slides[i].querySelector('.testimonial-role');
      if (textEl) textEl.textContent = item.text;
      if (nameEl) nameEl.textContent = item.name;
      if (roleEl) roleEl.textContent = item.role;
    });

    // Contact
    setTextContent('[data-i18n="contact.number"]', t.contact.number);
    setTextContent('[data-i18n="contact.title"]', t.contact.title);
    setTextContent('[data-i18n="contact.subtext"]', t.contact.subtext);
    setTextContent('[data-i18n="contact.email"]', t.contact.email);
    setTextContent('[data-i18n="contact.linkedin"]', t.contact.linkedin);
    setTextContent('[data-i18n="contact.location"]', t.contact.location);
    setTextContent('[data-i18n="contact.download"]', t.contact.download);

    // Form
    setTextContent('[data-i18n="contact.form.name"]', t.contact.form.name);
    setAttr('[data-i18n-placeholder="contact.form.namePlaceholder"]', 'placeholder', t.contact.form.namePlaceholder);
    setTextContent('[data-i18n="contact.form.email"]', t.contact.form.email);
    setAttr('[data-i18n-placeholder="contact.form.emailPlaceholder"]', 'placeholder', t.contact.form.emailPlaceholder);
    setTextContent('[data-i18n="contact.form.subject"]', t.contact.form.subject);
    setAttr('[data-i18n-placeholder="contact.form.subjectPlaceholder"]', 'placeholder', t.contact.form.subjectPlaceholder);
    setTextContent('[data-i18n="contact.form.message"]', t.contact.form.message);
    setAttr('[data-i18n-placeholder="contact.form.messagePlaceholder"]', 'placeholder', t.contact.form.messagePlaceholder);
    setTextContent('[data-i18n="contact.form.submit"]', t.contact.form.submit);
    setHTML('[data-i18n="contact.form.gdpr"]', t.contact.form.gdpr);

    // Footer
    setTextContent('[data-i18n="footer.copy"]', t.footer.copy);

    document.documentElement.setAttribute('lang', lang);
  }

  function setTextContent(selector, text) {
    var el = document.querySelector(selector);
    if (el) el.textContent = text;
  }

  function setHTML(selector, html) {
    var el = document.querySelector(selector);
    if (el) el.innerHTML = html;
  }

  function setAttr(selector, attr, value) {
    var el = document.querySelector(selector);
    if (el) el.setAttribute(attr, value);
  }

  // =============================================
  // SMOOTH SCROLL
  // =============================================
  function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(function(anchor) {
      if (!anchor) return;
      anchor.addEventListener('click', function(e) {
        var href = this.getAttribute('href');
        if (href === '#') return;
        var target = document.querySelector(href);
        if (target) {
          e.preventDefault();
          var navbar = document.getElementById('navbar');
          var navHeight = navbar ? navbar.offsetHeight : 72;
          var targetPos = target.getBoundingClientRect().top + window.pageYOffset - navHeight;
          window.scrollTo({ top: targetPos, behavior: 'smooth' });
        }
      });
    });

    var scrollIndicator = document.querySelector('.scroll-indicator');
    if (scrollIndicator) {
      scrollIndicator.addEventListener('click', function() {
        var aboutSection = document.getElementById('about');
        if (aboutSection) {
          var navbar = document.getElementById('navbar');
          var navHeight = navbar ? navbar.offsetHeight : 72;
          window.scrollTo({
            top: aboutSection.getBoundingClientRect().top + window.pageYOffset - navHeight,
            behavior: 'smooth'
          });
        }
      });
      scrollIndicator.style.cursor = 'pointer';
    }
  }

  // =============================================
  // SCROLL SPY — ACTIVE NAV LINK
  // =============================================
  function initScrollSpy() {
    var sections = document.querySelectorAll('.section[id], #hero');
    var navLinks = document.querySelectorAll('.nav-links a[data-section]');
    if (!sections.length && !navLinks.length) return;

    var sectionMap = {
      'hero': null,
      'about': 'about',
      'experience': 'experience',
      'skills': 'skills',
      'education': 'education',
      'testimonials': 'testimonials',
      'contact': 'contact'
    };

    function updateActive() {
      var navbar = document.getElementById('navbar');
      var navHeight = navbar ? navbar.offsetHeight : 72;
      var scrollPos = window.scrollY + navHeight + 100;
      var current = '';

      sections.forEach(function(section) {
        if (!section) return;
        var top = section.offsetTop;
        var bottom = top + section.offsetHeight;
        if (scrollPos >= top && scrollPos < bottom) {
          current = section.id;
        }
      });

      navLinks.forEach(function(link) {
        if (!link) return;
        link.classList.remove('active');
        if (link.getAttribute('data-section') === sectionMap[current]) {
          link.classList.add('active');
        }
      });
    }

    window.addEventListener('scroll', updateActive, { passive: true });
    updateActive();
  }

  // =============================================
  // INTERSECTION OBSERVER — FADE IN ANIMATIONS
  // =============================================
  function initIntersectionObserver() {
    var fadeElements = document.querySelectorAll('.fade-in-up');
    var timelineCards = document.querySelectorAll('.timeline-card');
    if (!fadeElements.length && !timelineCards.length) return;

    if (fadeElements.length) {
      var fadeObserver = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (!entry || !entry.target) return;
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            fadeObserver.unobserve(entry.target);
          }
        });
      }, {
        root: null,
        rootMargin: '0px 0px -60px 0px',
        threshold: 0.1
      });

      fadeElements.forEach(function(el) {
        if (el) fadeObserver.observe(el);
      });
    }

    if (timelineCards.length) {
      var cardObserver = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (!entry || !entry.target) return;
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            cardObserver.unobserve(entry.target);
          }
        });
      }, {
        root: null,
        rootMargin: '0px 0px -40px 0px',
        threshold: 0.15
      });

      timelineCards.forEach(function(card, index) {
        if (!card) return;
        card.style.transitionDelay = (index * 150) + 'ms';
        cardObserver.observe(card);
      });
    }
  }

  // =============================================
  // TESTIMONIALS CAROUSEL
  // =============================================
  function initCarousel() {
    var slides = document.querySelectorAll('.testimonial-slide');
    if (!slides.length) return;

    var dots = document.querySelectorAll('.carousel-dot');

    function showSlide(index) {
      slides.forEach(function(slide) {
        if (slide) slide.classList.remove('active');
      });
      dots.forEach(function(dot) {
        if (dot) dot.classList.remove('active');
      });

      currentSlide = index;
      if (currentSlide >= slides.length) currentSlide = 0;
      if (currentSlide < 0) currentSlide = slides.length - 1;

      if (slides[currentSlide]) slides[currentSlide].classList.add('active');
      if (dots[currentSlide]) dots[currentSlide].classList.add('active');
    }

    dots.forEach(function(dot, i) {
      if (!dot) return;
      dot.addEventListener('click', function() {
        showSlide(i);
        resetAutoAdvance();
      });
    });

    function autoAdvance() {
      showSlide(currentSlide + 1);
    }

    function resetAutoAdvance() {
      if (carouselInterval) clearInterval(carouselInterval);
      carouselInterval = setInterval(autoAdvance, 6000);
    }

    // Touch / swipe support
    var carouselEl = document.querySelector('.testimonials-carousel');
    if (carouselEl) {
      var startX = 0;
      var endX = 0;

      carouselEl.addEventListener('touchstart', function(e) {
        if (e.changedTouches && e.changedTouches[0]) {
          startX = e.changedTouches[0].screenX;
        }
      }, { passive: true });

      carouselEl.addEventListener('touchend', function(e) {
        if (e.changedTouches && e.changedTouches[0]) {
          endX = e.changedTouches[0].screenX;
          var diff = startX - endX;
          if (Math.abs(diff) > 50) {
            if (diff > 0) {
              showSlide(currentSlide + 1);
            } else {
              showSlide(currentSlide - 1);
            }
            resetAutoAdvance();
          }
        }
      }, { passive: true });
    }

    showSlide(0);
    resetAutoAdvance();
  }

  // =============================================
  // CONTACT FORM HANDLING
  // =============================================
  function initContactForm() {
    var form = document.querySelector('.contact-form');
    if (!form) return;

    form.addEventListener('submit', function(e) {
      e.preventDefault();

      var t = translations[currentLang].contact;

      var nameField = form.querySelector('input[name="name"]');
      var emailField = form.querySelector('input[name="email"]');
      var subjectField = form.querySelector('input[name="subject"]');
      var messageField = form.querySelector('textarea[name="message"]');

      clearFormErrors(form);

      var valid = true;

      if (!nameField || !nameField.value.trim()) {
        showFieldError(nameField);
        valid = false;
      }

      if (!emailField || !emailField.value.trim() || !isValidEmail(emailField.value.trim())) {
        showFieldError(emailField);
        valid = false;
      }

      if (!subjectField || !subjectField.value.trim()) {
        showFieldError(subjectField);
        valid = false;
      }

      if (!messageField || !messageField.value.trim()) {
        showFieldError(messageField);
        valid = false;
      }

      if (!valid) {
        showFormMessage(form, t.error, 'error');
        return;
      }

      var submitBtn = form.querySelector('.btn');
      if (submitBtn) {
        var originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = '...';
        submitBtn.style.opacity = '0.7';

        setTimeout(function() {
          showFormMessage(form, t.success, 'success');
          form.reset();
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
          submitBtn.style.opacity = '1';
        }, 1200);
      }
    });

    var fields = form.querySelectorAll('input, textarea');
    fields.forEach(function(field) {
      if (!field) return;
      field.addEventListener('input', function() {
        this.style.borderColor = '';
        this.style.boxShadow = '';
        var existingMsg = form.querySelector('.form-message');
        if (existingMsg) existingMsg.remove();
      });

      field.addEventListener('focus', function() {
        this.style.borderColor = '';
        this.style.boxShadow = '';
      });
    });
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function showFieldError(field) {
    if (!field) return;
    field.style.borderColor = '#E8836B';
    field.style.boxShadow = '0 0 0 3px rgba(232, 131, 107, 0.15)';
  }

  function clearFormErrors(form) {
    if (!form) return;
    var fields = form.querySelectorAll('input, textarea');
    fields.forEach(function(field) {
      if (!field) return;
      field.style.borderColor = '';
      field.style.boxShadow = '';
    });
    var existingMsg = form.querySelector('.form-message');
    if (existingMsg) existingMsg.remove();
  }

  function showFormMessage(form, message, type) {
    if (!form) return;
    var existingMsg = form.querySelector('.form-message');
    if (existingMsg) existingMsg.remove();

    var msgEl = document.createElement('div');
    msgEl.className = 'form-message';
    msgEl.textContent = message;
    msgEl.style.fontFamily = 'var(--font-body)';
    msgEl.style.fontSize = '0.875rem';
    msgEl.style.fontWeight = '500';
    msgEl.style.padding = '12px 16px';
    msgEl.style.borderRadius = '8px';
    msgEl.style.marginTop = '12px';
    msgEl.style.textAlign = 'center';
    msgEl.style.transition = 'opacity 0.3s ease';

    if (type === 'success') {
      msgEl.style.backgroundColor = 'rgba(26, 83, 92, 0.08)';
      msgEl.style.color = '#1A535C';
      msgEl.style.border = '1px solid rgba(26, 83, 92, 0.2)';
    } else {
      msgEl.style.backgroundColor = 'rgba(232, 131, 107, 0.08)';
      msgEl.style.color = '#E8836B';
      msgEl.style.border = '1px solid rgba(232, 131, 107, 0.2)';
    }

    form.appendChild(msgEl);

    if (type === 'success') {
      setTimeout(function() {
        msgEl.style.opacity = '0';
        setTimeout(function() {
          if (msgEl.parentNode) msgEl.remove();
        }, 300);
      }, 5000);
    }
  }

  // =============================================
  // KEYBOARD NAVIGATION FOR CAROUSEL
  // =============================================
  function initKeyboardNavigation() {
    document.addEventListener('keydown', function(e) {
      var testimonialSection = document.getElementById('testimonials');
      if (!testimonialSection) return;

      var rect = testimonialSection.getBoundingClientRect();
      var inView = rect.top < window.innerHeight && rect.bottom > 0;

      if (inView) {
        var slides = document.querySelectorAll('.testimonial-slide');
        if (!slides.length) return;

        if (e.key === 'ArrowLeft') {
          currentSlide--;
          if (currentSlide < 0) currentSlide = slides.length - 1;
          showCarouselSlide(currentSlide);
          resetCarouselAutoAdvance();
        } else if (e.key === 'ArrowRight') {
          currentSlide++;
          if (currentSlide >= slides.length) currentSlide = 0;
          showCarouselSlide(currentSlide);
          resetCarouselAutoAdvance();
        }
      }
    });
  }

  function showCarouselSlide(index) {
    var slides = document.querySelectorAll('.testimonial-slide');
    var dots = document.querySelectorAll('.carousel-dot');
    slides.forEach(function(s) {
      if (s) s.classList.remove('active');
    });
    dots.forEach(function(d) {
      if (d) d.classList.remove('active');
    });
    if (slides[index]) slides[index].classList.add('active');
    if (dots[index]) dots[index].classList.add('active');
  }

  function resetCarouselAutoAdvance() {
    if (carouselInterval) clearInterval(carouselInterval);
    var slides = document.querySelectorAll('.testimonial-slide');
    if (!slides.length) return;
    carouselInterval = setInterval(function() {
      currentSlide++;
      if (currentSlide >= slides.length) currentSlide = 0;
      showCarouselSlide(currentSlide);
    }, 6000);
  }

})();
