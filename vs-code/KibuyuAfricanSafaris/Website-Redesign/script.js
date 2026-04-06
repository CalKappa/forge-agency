(function() {
  'use strict';

  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ========================================
  // HEADER SCROLL BEHAVIOR
  // ========================================
  var header = document.getElementById('site-header');
  var lastScrollY = window.scrollY;
  var ticking = false;

  function onScroll() {
    var currentScrollY = window.scrollY;

    if (!ticking) {
      window.requestAnimationFrame(function() {

        // Add is-scrolled class after scrolling 50px
        if (currentScrollY > 50) {
          header.classList.add('is-scrolled');
        } else {
          header.classList.remove('is-scrolled');
        }

        // Hide header when scrolling down, show when scrolling up
        // Only activate after scrolling past 100px to avoid triggering at the top
        if (currentScrollY > lastScrollY && currentScrollY > 100) {
          // Scrolling down — but not if mobile menu is open
          if (!document.getElementById('mobile-menu').classList.contains('is-open')) {
            header.classList.add('is-hidden');
          }
        } else if (currentScrollY < lastScrollY) {
          // Scrolling up
          header.classList.remove('is-hidden');
        }

        lastScrollY = currentScrollY;
        ticking = false;
      });
      ticking = true;
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ========================================
  // MOBILE MENU
  // ========================================
  var menuToggle = document.getElementById('menu-toggle');
  var mobileMenu = document.getElementById('mobile-menu');

  if (menuToggle && mobileMenu) {
    menuToggle.addEventListener('click', function() {
      var isOpen = menuToggle.getAttribute('aria-expanded') === 'true';
      menuToggle.setAttribute('aria-expanded', String(!isOpen));
      if (!isOpen) {
        mobileMenu.classList.add('is-open');
        document.body.style.overflow = 'hidden';
      } else {
        mobileMenu.classList.remove('is-open');
        document.body.style.overflow = '';
      }
    });

    var mobileLinks = mobileMenu.querySelectorAll('.mobile-nav-link');
    mobileLinks.forEach(function(link) {
      link.addEventListener('click', function() {
        mobileMenu.classList.remove('is-open');
        menuToggle.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
      });
    });

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && mobileMenu.classList.contains('is-open')) {
        mobileMenu.classList.remove('is-open');
        menuToggle.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
        menuToggle.focus();
      }
    });
  }

  // ========================================
  // ACTIVE NAV LINK
  // ========================================
  var currentPath = window.location.pathname.replace(/\/$/, '') || '/';
  var navLinks = document.querySelectorAll('#main-nav .nav-link, #mobile-menu .mobile-nav-link');

  navLinks.forEach(function(link) {
    var href = link.getAttribute('href');
    if (!href) return;
    var linkPath = href.replace(/\/$/, '') || '/';
    if (linkPath === currentPath || (currentPath === '' && linkPath === '/') ||
        (currentPath === '/index.html' && (linkPath === '/' || linkPath === '/index.html' || linkPath === 'index.html')) ||
        currentPath.endsWith(linkPath) && linkPath !== '/') {
      link.classList.add('is-active');
    }
    // Handle relative paths
    if (currentPath.endsWith(href.replace('./', '').replace(/\/$/, ''))) {
      link.classList.add('is-active');
    }
  });

  // ========================================
  // SCROLL REVEAL ANIMATIONS
  // ========================================
  if (!prefersReducedMotion) {
    var revealElements = document.querySelectorAll('.reveal, .reveal-stagger, .reveal-image');

    if (revealElements.length > 0 && 'IntersectionObserver' in window) {
      var revealObserver = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            revealObserver.unobserve(entry.target);
          }
        });
      }, {
        threshold: 0.15,
        rootMargin: '0px 0px -50px 0px'
      });

      revealElements.forEach(function(el) {
        revealObserver.observe(el);
      });
    } else {
      // Fallback: make everything visible
      revealElements.forEach(function(el) {
        el.classList.add('is-visible');
      });
    }
  }

  // ========================================
  // TESTIMONIAL CAROUSEL
  // ========================================
  var carousels = document.querySelectorAll('.testimonial-carousel');

  carousels.forEach(function(carousel) {
    var slides = carousel.querySelectorAll('.testimonial-slide');
    var dotsContainer = carousel.querySelector('.carousel-dots');
    if (!slides.length) return;

    var currentSlide = 0;
    var autoplayInterval = null;
    var totalSlides = slides.length;

    // Initialize: hide all slides except first
    slides.forEach(function(slide, i) {
      slide.style.display = i === 0 ? 'block' : 'none';
    });

    // Create dots if container exists
    if (dotsContainer) {
      dotsContainer.innerHTML = '';
      for (var i = 0; i < totalSlides; i++) {
        var dot = document.createElement('button');
        dot.className = 'carousel-dot' + (i === 0 ? ' is-active' : '');
        dot.setAttribute('aria-label', 'Go to testimonial ' + (i + 1));
        dot.dataset.index = i;
        dotsContainer.appendChild(dot);
      }
    }

    function goToSlide(index) {
      slides[currentSlide].style.display = 'none';
      currentSlide = (index + totalSlides) % totalSlides;
      slides[currentSlide].style.display = 'block';

      if (dotsContainer) {
        var dots = dotsContainer.querySelectorAll('.carousel-dot');
        dots.forEach(function(d, i) {
          d.classList.toggle('is-active', i === currentSlide);
        });
      }
    }

    function nextSlide() {
      goToSlide(currentSlide + 1);
    }

    // Dot click
    if (dotsContainer) {
      dotsContainer.addEventListener('click', function(e) {
        var dot = e.target.closest('.carousel-dot');
        if (dot) {
          goToSlide(parseInt(dot.dataset.index, 10));
          resetAutoplay();
        }
      });
    }

    // Autoplay
    function startAutoplay() {
      if (totalSlides > 1) {
        autoplayInterval = setInterval(nextSlide, 5000);
      }
    }

    function resetAutoplay() {
      clearInterval(autoplayInterval);
      startAutoplay();
    }

    startAutoplay();

    // Touch/swipe support
    var touchStartX = 0;
    var touchEndX = 0;

    carousel.addEventListener('touchstart', function(e) {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    carousel.addEventListener('touchend', function(e) {
      touchEndX = e.changedTouches[0].screenX;
      var diff = touchStartX - touchEndX;
      if (Math.abs(diff) > 50) {
        if (diff > 0) {
          goToSlide(currentSlide + 1);
        } else {
          goToSlide(currentSlide - 1);
        }
        resetAutoplay();
      }
    }, { passive: true });
  });

  // ========================================
  // ACCORDION
  // ========================================
  var accordionTriggers = document.querySelectorAll('.accordion-trigger');

  accordionTriggers.forEach(function(trigger) {
    trigger.addEventListener('click', function() {
      var item = trigger.closest('.accordion-item');
      var isOpen = item.classList.contains('is-open');

      // Close all open siblings in the same accordion group
      var parentAccordion = item.closest('.accordion');
      if (parentAccordion) {
        parentAccordion.querySelectorAll('.accordion-item.is-open').forEach(function(sib) {
          if (sib !== item) {
            sib.classList.remove('is-open');
            var sibTrigger = sib.querySelector('.accordion-trigger');
            if (sibTrigger) sibTrigger.setAttribute('aria-expanded', 'false');
          }
        });
      }

      if (isOpen) {
        item.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
      } else {
        item.classList.add('is-open');
        trigger.setAttribute('aria-expanded', 'true');
      }
    });
  });

  // ========================================
  // ANCHOR NAV (Safaris Page)
  // ========================================
  var anchorNav = document.querySelector('.anchor-nav');
  var anchorLinks = document.querySelectorAll('.anchor-nav__link');

  if (anchorNav && anchorLinks.length > 0) {
    // Sticky behavior
    var anchorNavOriginalTop = null;

    function calcAnchorNavTop() {
      if (anchorNav.classList.contains('is-sticky')) {
        anchorNav.classList.remove('is-sticky');
        anchorNavOriginalTop = anchorNav.getBoundingClientRect().top + window.scrollY;
        anchorNav.classList.add('is-sticky');
      } else {
        anchorNavOriginalTop = anchorNav.getBoundingClientRect().top + window.scrollY;
      }
    }

    // Delay calculation to allow layout
    setTimeout(calcAnchorNavTop, 100);
    window.addEventListener('resize', function() { setTimeout(calcAnchorNavTop, 100); });

    function checkAnchorSticky() {
      if (anchorNavOriginalTop === null) return;
      var headerHeight = header ? header.offsetHeight : 0;
      if (window.scrollY + headerHeight >= anchorNavOriginalTop) {
        anchorNav.classList.add('is-sticky');
      } else {
        anchorNav.classList.remove('is-sticky');
      }
    }

    window.addEventListener('scroll', checkAnchorSticky, { passive: true });
    checkAnchorSticky();

    // Smooth scroll for anchor links
    anchorLinks.forEach(function(link) {
      link.addEventListener('click', function(e) {
        var href = link.getAttribute('href');
        if (href && href.startsWith('#')) {
          e.preventDefault();
          var target = document.querySelector(href);
          if (target) {
            var headerHeight = header ? header.offsetHeight : 0;
            var anchorNavHeight = anchorNav.offsetHeight || 0;
            var offsetTop = target.getBoundingClientRect().top + window.scrollY - headerHeight - anchorNavHeight - 16;
            window.scrollTo({ top: offsetTop, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
          }
        }
      });
    });

    // Active state on scroll
    var anchorSections = [];
    anchorLinks.forEach(function(link) {
      var href = link.getAttribute('href');
      if (href && href.startsWith('#')) {
        var section = document.querySelector(href);
        if (section) {
          anchorSections.push({ link: link, section: section });
        }
      }
    });

    function updateAnchorActive() {
      var headerHeight = header ? header.offsetHeight : 0;
      var anchorNavHeight = anchorNav.offsetHeight || 0;
      var scrollPos = window.scrollY + headerHeight + anchorNavHeight + 50;

      var activeLink = null;
      for (var i = anchorSections.length - 1; i >= 0; i--) {
        if (anchorSections[i].section.offsetTop <= scrollPos) {
          activeLink = anchorSections[i].link;
          break;
        }
      }

      anchorLinks.forEach(function(link) {
        link.classList.remove('is-active');
      });
      if (activeLink) {
        activeLink.classList.add('is-active');
      }
    }

    window.addEventListener('scroll', updateAnchorActive, { passive: true });
    updateAnchorActive();
  }

  // ========================================
  // CONTACT FORM HANDLING
  // ========================================
  var contactForm = document.getElementById('contact-form');

  if (contactForm) {
    // Conditional children ages field
    var childrenField = contactForm.querySelector('[name="children"]') || contactForm.querySelector('#field-children');
    var childrenAgesField = document.getElementById('field-children-ages') || document.querySelector('.field-children-ages');

    if (childrenField && childrenAgesField) {
      var childrenAgesWrapper = childrenAgesField.closest('.form-field');

      function toggleChildrenAges() {
        var val = parseInt(childrenField.value, 10);
        if (childrenAgesWrapper) {
          childrenAgesWrapper.style.display = val > 0 ? 'block' : 'none';
        }
      }

      childrenField.addEventListener('change', toggleChildrenAges);
      childrenField.addEventListener('input', toggleChildrenAges);
      toggleChildrenAges();
    }

    // Form validation
    contactForm.addEventListener('submit', function(e) {
      e.preventDefault();

      // Check honeypot
      var honeypot = contactForm.querySelector('.form-honeypot input');
      if (honeypot && honeypot.value) {
        return;
      }

      // Clear previous errors
      var errorFields = contactForm.querySelectorAll('.form-field.has-error');
      errorFields.forEach(function(f) { f.classList.remove('has-error'); });

      var errorInputs = contactForm.querySelectorAll('.is-error');
      errorInputs.forEach(function(f) { f.classList.remove('is-error'); });

      var isValid = true;

      // Validate required fields
      var requiredInputs = contactForm.querySelectorAll('[required]');
      requiredInputs.forEach(function(input) {
        var value = input.value.trim();
        var fieldWrapper = input.closest('.form-field');

        if (!value) {
          isValid = false;
          input.classList.add('is-error');
          if (fieldWrapper) fieldWrapper.classList.add('has-error');
        }

        // Email validation
        if (input.type === 'email' && value) {
          var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(value)) {
            isValid = false;
            input.classList.add('is-error');
            if (fieldWrapper) fieldWrapper.classList.add('has-error');
          }
        }
      });

      // Validate required radio groups
      var radioGroups = contactForm.querySelectorAll('.form-radio-group[data-required="true"]');
      radioGroups.forEach(function(group) {
        var checked = group.querySelector('input:checked');
        if (!checked) {
          isValid = false;
          var fieldWrapper = group.closest('.form-field');
          if (fieldWrapper) fieldWrapper.classList.add('has-error');
        }
      });

      // Validate required checkbox groups
      var checkboxGroups = contactForm.querySelectorAll('.form-checkbox-group[data-required="true"]');
      checkboxGroups.forEach(function(group) {
        var checked = group.querySelector('input:checked');
        if (!checked) {
          isValid = false;
          var fieldWrapper = group.closest('.form-field');
          if (fieldWrapper) fieldWrapper.classList.add('has-error');
        }
      });

      if (!isValid) {
        var firstError = contactForm.querySelector('.form-field.has-error');
        if (firstError) {
          var offset = firstError.getBoundingClientRect().top + window.scrollY - (header ? header.offsetHeight : 0) - 24;
          window.scrollTo({ top: offset, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
        }
        return;
      }

      // Collect form data
      var formData = new FormData(contactForm);

      // Get the submitter name for success message
      var nameField = contactForm.querySelector('[name="name"]') || contactForm.querySelector('[name="full_name"]');
      var userName = nameField ? nameField.value.split(' ')[0] : '';

      // Simulate submission (replace with actual endpoint)
      var submitBtn = contactForm.querySelector('.form-submit .btn-primary');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = submitBtn.dataset.loading || 'Sending...';
      }

      // Simulate async submission
      setTimeout(function() {
        // Show success state
        var formWrapper = contactForm.closest('.contact-form-wrapper');
        if (formWrapper) {
          var successHTML = '<div class="form-success">' +
            '<div class="form-success__icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div>' +
            '<h3>Thank You' + (userName ? ', ' + userName : '') + '!</h3>' +
            '<p>We\'ve received your enquiry and are already dreaming up ideas for you. Expect to hear from us within 24 hours.</p>' +
            '<p>While you wait, follow our safari adventures on <a href="https://www.instagram.com/kibuyuafricansafaris" target="_blank" rel="noopener noreferrer" class="text-link">Instagram →</a></p>' +
            '</div>';
          formWrapper.innerHTML = successHTML;
          var offset = formWrapper.getBoundingClientRect().top + window.scrollY - (header ? header.offsetHeight : 0) - 24;
          window.scrollTo({ top: offset, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
        }
      }, 1500);
    });

    // Live validation: remove error on input
    contactForm.addEventListener('input', function(e) {
      var input = e.target;
      if (input.classList.contains('is-error')) {
        input.classList.remove('is-error');
        var fieldWrapper = input.closest('.form-field');
        if (fieldWrapper) fieldWrapper.classList.remove('has-error');
      }
    });

    contactForm.addEventListener('change', function(e) {
      var input = e.target;
      var fieldWrapper = input.closest('.form-field');
      if (fieldWrapper && fieldWrapper.classList.contains('has-error')) {
        // Check if now valid
        if (input.type === 'radio' || input.type === 'checkbox') {
          var group = fieldWrapper.querySelector('.form-radio-group, .form-checkbox-group');
          if (group && group.querySelector('input:checked')) {
            fieldWrapper.classList.remove('has-error');
          }
        }
      }
    });
  }

  // ========================================
  // LQIP IMAGE LOADING
  // ========================================
  var lqipImages = document.querySelectorAll('.lqip-wrapper .lqip-full');

  lqipImages.forEach(function(img) {
    if (img.complete && img.naturalWidth > 0) {
      img.setAttribute('data-loaded', 'true');
    } else {
      img.addEventListener('load', function() {
        img.setAttribute('data-loaded', 'true');
      });
      img.addEventListener('error', function() {
        img.setAttribute('data-loaded', 'true');
      });
    }
  });

  // ========================================
  // HERO VIDEO (Desktop only)
  // ========================================
  var heroVideo = document.querySelector('.hero__media video');

  if (heroVideo) {
    if (window.innerWidth < 768 || prefersReducedMotion) {
      // Remove video on mobile / reduced motion, show poster
      var poster = heroVideo.getAttribute('poster');
      if (poster) {
        var img = document.createElement('img');
        img.src = poster;
        img.alt = heroVideo.getAttribute('data-alt') || 'Safari landscape';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        heroVideo.parentNode.replaceChild(img, heroVideo);
      }
    } else {
      // Lazy load video
      heroVideo.setAttribute('preload', 'none');
      var videoSources = heroVideo.querySelectorAll('source[data-src]');

      function loadVideo() {
        videoSources.forEach(function(source) {
          if (source.dataset.src) {
            source.src = source.dataset.src;
          }
        });
        heroVideo.load();
        heroVideo.play().catch(function() {});
      }

      if (document.readyState === 'complete') {
        loadVideo();
      } else {
        window.addEventListener('load', loadVideo);
      }
    }
  }

  // ========================================
  // SCROLL INDICATOR CLICK
  // ========================================
  var scrollIndicator = document.querySelector('.hero__scroll-indicator');
  if (scrollIndicator) {
    scrollIndicator.addEventListener('click', function() {
      var hero = scrollIndicator.closest('.hero');
      if (hero) {
        var nextSection = hero.nextElementSibling;
        if (nextSection) {
          var headerHeight = header ? header.offsetHeight : 0;
          var offset = nextSection.getBoundingClientRect().top + window.scrollY - headerHeight;
          window.scrollTo({ top: offset, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
        }
      }
    });
    scrollIndicator.style.cursor = 'pointer';
  }

  // ========================================
  // WHATSAPP FLOATING BUTTON (Lazy show)
  // ========================================
  var whatsappFloat = document.getElementById('whatsapp-float');
  if (whatsappFloat) {
    whatsappFloat.style.opacity = '0';
    whatsappFloat.style.transform = 'scale(0.8)';
    whatsappFloat.style.transition = 'opacity 0.3s ease, transform 0.3s ease';

    setTimeout(function() {
      whatsappFloat.style.opacity = '1';
      whatsappFloat.style.transform = 'scale(1)';
    }, 3000);
  }

  // ========================================
  // LAZY LOAD THIRD-PARTY WIDGETS
  // ========================================
  if ('IntersectionObserver' in window) {
    var lazyWidgets = document.querySelectorAll('[data-lazy-widget]');

    var widgetObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          var widget = entry.target;
          var scriptSrc = widget.getAttribute('data-lazy-widget');
          if (scriptSrc) {
            var script = document.createElement('script');
            script.src = scriptSrc;
            script.async = true;
            widget.appendChild(script);
          }
          // For iframes
          var iframeSrc = widget.getAttribute('data-lazy-iframe');
          if (iframeSrc) {
            var iframe = document.createElement('iframe');
            iframe.src = iframeSrc;
            iframe.style.width = '100%';
            iframe.style.border = 'none';
            iframe.loading = 'lazy';
            widget.appendChild(iframe);
          }
          widgetObserver.unobserve(widget);
        }
      });
    }, {
      rootMargin: '200px 0px'
    });

    lazyWidgets.forEach(function(widget) {
      widgetObserver.observe(widget);
    });
  }

  // ========================================
  // INSTAGRAM FEED LAZY LOADING
  // ========================================
  var instagramSection = document.querySelector('.instagram-grid');
  if (instagramSection && 'IntersectionObserver' in window) {
    var instaImages = instagramSection.querySelectorAll('img[data-src]');

    var instaObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          var img = entry.target;
          if (img.dataset.src) {
            img.src = img.dataset.src;
            img.removeAttribute('data-src');
          }
          instaObserver.unobserve(img);
        }
      });
    }, {
      rootMargin: '200px 0px'
    });

    instaImages.forEach(function(img) {
      instaObserver.observe(img);
    });
  }

  // ========================================
  // SMOOTH SCROLL FOR ALL ANCHOR LINKS
  // ========================================
  document.addEventListener('click', function(e) {
    var link = e.target.closest('a[href^="#"]');
    if (!link) return;

    var href = link.getAttribute('href');
    if (href === '#' || href === '#main-content') {
      if (href === '#main-content') {
        e.preventDefault();
        var mainContent = document.getElementById('main-content');
        if (mainContent) {
          mainContent.focus();
          mainContent.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth' });
        }
      }
      return;
    }

    // Skip if it's an anchor-nav link (already handled)
    if (link.classList.contains('anchor-nav__link')) return;

    var target = document.querySelector(href);
    if (target) {
      e.preventDefault();
      var headerHeight = header ? header.offsetHeight : 0;
      var offset = target.getBoundingClientRect().top + window.scrollY - headerHeight - 16;
      window.scrollTo({ top: offset, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
    }
  });

  // ========================================
  // ITINERARY CARD EXPAND / DAY TIMELINE
  // ========================================
  var itineraryToggles = document.querySelectorAll('[data-itinerary-toggle]');

  itineraryToggles.forEach(function(toggle) {
    toggle.addEventListener('click', function(e) {
      e.preventDefault();
      var targetId = toggle.getAttribute('data-itinerary-toggle');
      var timeline = document.getElementById(targetId);
      if (!timeline) return;

      var isExpanded = timeline.style.display === 'block';
      if (isExpanded) {
        timeline.style.display = 'none';
        toggle.textContent = toggle.dataset.showText || 'View Itinerary →';
        toggle.setAttribute('aria-expanded', 'false');
      } else {
        timeline.style.display = 'block';
        toggle.textContent = toggle.dataset.hideText || 'Hide Itinerary →';
        toggle.setAttribute('aria-expanded', 'true');
      }
    });
  });

  // Initialize hidden day timelines
  var dayTimelines = document.querySelectorAll('.day-timeline[id]');
  dayTimelines.forEach(function(tl) {
    if (tl.hasAttribute('data-collapsible')) {
      tl.style.display = 'none';
    }
  });

  // ========================================
  // LANGUAGE TOGGLE
  // ========================================
  var langToggles = document.querySelectorAll('.lang-toggle__option');
  // Language toggle links should be <a> elements with proper hrefs
  // The is-active class is set based on current page language

  var isFrench = window.location.pathname.indexOf('/fr/') !== -1;

  langToggles.forEach(function(toggle) {
    var lang = toggle.getAttribute('data-lang') || toggle.textContent.trim().toUpperCase();
    if ((lang === 'FR' && isFrench) || (lang === 'EN' && !isFrench)) {
      toggle.classList.add('is-active');
    } else {
      toggle.classList.remove('is-active');
    }
  });

  // ========================================
  // FORM: AUTO-SELECT PREFERRED LANGUAGE
  // ========================================
  var langRadios = contactForm ? contactForm.querySelectorAll('input[name="preferred_language"]') : [];
  if (langRadios.length > 0) {
    var preferredLang = isFrench ? 'fr' : 'en';
    langRadios.forEach(function(radio) {
      if (radio.value.toLowerCase() === preferredLang) {
        radio.checked = true;
      }
    });
  }

  // ========================================
  // BROWSER LANGUAGE DETECTION BANNER
  // ========================================
  // French pages coming soon — language detection banner disabled until /fr/ pages exist
  // if (!isFrench && !sessionStorage.getItem('langBannerDismissed')) {
  //   var browserLang = (navigator.language || navigator.userLanguage || '').toLowerCase();
  //   if (browserLang.indexOf('fr') === 0) {
  //     var banner = document.createElement('div');
  //     banner.id = 'lang-suggest-banner';
  //     banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:950;background:var(--color-dust-beige,#F0EBE3);padding:16px 24px;display:flex;align-items:center;justify-content:center;gap:16px;flex-wrap:wrap;box-shadow:0 -2px 12px rgba(0,0,0,0.08);font-family:var(--font-body,Lato,sans-serif);font-size:0.9375rem;color:var(--color-acacia-charcoal,#2C2C2C);';
  //     banner.innerHTML = '<span>🇫🇷 Ce site est également disponible en français.</span>' +
  //       '<a href="/fr/" style="color:#C8973E;font-weight:600;text-decoration:underline;text-underline-offset:4px;">Voir en français</a>' +
  //       '<button id="lang-banner-dismiss" aria-label="Dismiss" style="background:none;border:none;cursor:pointer;font-size:1.25rem;color:#9A9590;padding:4px 8px;line-height:1;">✕</button>';
  //     document.body.appendChild(banner);
  //
  //     document.getElementById('lang-banner-dismiss').addEventListener('click', function() {
  //       banner.remove();
  //       sessionStorage.setItem('langBannerDismissed', 'true');
  //     });
  //   }
  // }

  // ========================================
  // EXIT INTENT (Desktop only)
  // ========================================
  if (window.innerWidth >= 1024 && !sessionStorage.getItem('exitIntentShown')) {
    var exitIntentTriggered = false;

    document.addEventListener('mouseout', function(e) {
      if (exitIntentTriggered) return;
      if (e.clientY <= 0 && e.relatedTarget === null) {
        exitIntentTriggered = true;
        sessionStorage.setItem('exitIntentShown', 'true');
        showExitIntent();
      }
    });

    function showExitIntent() {
      var overlay = document.createElement('div');
      overlay.id = 'exit-intent-overlay';
      overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;background:rgba(44,44,44,0.6);display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity 0.3s ease;';

      var modal = document.createElement('div');
      modal.style.cssText = 'background:#FAFAF8;border-radius:8px;padding:48px 40px;max-width:480px;width:90%;text-align:center;position:relative;box-shadow:0 8px 40px rgba(0,0,0,0.15);';
      modal.innerHTML = '<button id="exit-intent-close" aria-label="Close" style="position:absolute;top:16px;right:16px;background:none;border:none;cursor:pointer;font-size:1.5rem;color:#9A9590;padding:4px;line-height:1;">✕</button>' +
        '<span class="overline" style="display:block;font-family:var(--font-body,Lato,sans-serif);font-weight:600;font-size:0.75rem;letter-spacing:0.15em;text-transform:uppercase;color:#C8973E;margin-bottom:12px;">BEFORE YOU GO</span>' +
        '<h3 style="font-family:var(--font-heading,Playfair Display,serif);font-weight:700;font-size:1.75rem;color:#2C2C2C;margin-bottom:12px;">Get Our Free Safari Planning Guide</h3>' +
        '<p style="font-family:var(--font-body,Lato,sans-serif);font-size:1rem;color:#9A9590;line-height:1.7;margin-bottom:24px;">Discover the best times to visit, what to pack, and insider tips for your Tanzania adventure.</p>' +
        '<form id="exit-intent-form" style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">' +
        '<input type="email" placeholder="Your email address" required style="flex:1;min-width:200px;padding:14px 16px;border:1px solid #D6D0C8;border-radius:4px;font-family:inherit;font-size:1rem;color:#2C2C2C;outline:none;" />' +
        '<button type="submit" class="btn-primary" style="white-space:nowrap;">Send Guide</button>' +
        '</form>' +
        '<p style="font-size:0.8125rem;color:#9A9590;margin-top:12px;">No spam, ever. Unsubscribe anytime.</p>';

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      requestAnimationFrame(function() {
        overlay.style.opacity = '1';
      });

      function closeExitIntent() {
        overlay.style.opacity = '0';
        setTimeout(function() { overlay.remove(); }, 300);
      }

      document.getElementById('exit-intent-close').addEventListener('click', closeExitIntent);
      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) closeExitIntent();
      });
      document.addEventListener('keydown', function handler(e) {
        if (e.key === 'Escape') {
          closeExitIntent();
          document.removeEventListener('keydown', handler);
        }
      });

      var exitForm = document.getElementById('exit-intent-form');
      if (exitForm) {
        exitForm.addEventListener('submit', function(e) {
          e.preventDefault();
          var emailInput = exitForm.querySelector('input[type="email"]');
          if (emailInput && emailInput.value) {
            exitForm.innerHTML = '<p style="font-family:var(--font-body,Lato,sans-serif);font-size:1rem;color:#4A6741;font-weight:600;">Thank you! Check your inbox for the guide.</p>';
            setTimeout(closeExitIntent, 2500);
          }
        });
      }
    }
  }

  // ========================================
  // PARALLAX / FIXED BACKGROUND FOR CTA BAND
  // ========================================
  if (!prefersReducedMotion && window.innerWidth >= 1024) {
    var ctaBands = document.querySelectorAll('.cta-band__media img');
    ctaBands.forEach(function(img) {
      img.style.position = 'absolute';
      img.style.top = '50%';
      img.style.left = '50%';
      img.style.transform = 'translate(-50%, -50%)';
      img.style.minWidth = '100%';
      img.style.minHeight = '120%';
    });
  }

  // ========================================
  // FOCUS TRAP FOR MOBILE MENU
  // ========================================
  if (mobileMenu && menuToggle) {
    mobileMenu.addEventListener('keydown', function(e) {
      if (e.key !== 'Tab') return;
      if (!mobileMenu.classList.contains('is-open')) return;

      var focusable = mobileMenu.querySelectorAll('a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
      var allFocusable = [menuToggle].concat(Array.from(focusable));

      if (allFocusable.length === 0) return;

      var firstFocusable = allFocusable[0];
      var lastFocusable = allFocusable[allFocusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstFocusable) {
          e.preventDefault();
          lastFocusable.focus();
        }
      } else {
        if (document.activeElement === lastFocusable) {
          e.preventDefault();
          firstFocusable.focus();
        }
      }
    });
  }

  // ========================================
  // LAZY LOAD IMAGES WITH data-src
  // ========================================
  if ('IntersectionObserver' in window) {
    var lazyImages = document.querySelectorAll('img[data-src]:not(.instagram-grid img)');

    var imageObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          var img = entry.target;
          if (img.dataset.src) {
            img.src = img.dataset.src;
            img.removeAttribute('data-src');
          }
          if (img.dataset.srcset) {
            img.srcset = img.dataset.srcset;
            img.removeAttribute('data-srcset');
          }
          imageObserver.unobserve(img);
        }
      });
    }, {
      rootMargin: '300px 0px'
    });

    lazyImages.forEach(function(img) {
      imageObserver.observe(img);
    });
  }

  // ========================================
  // STATS COUNTER ANIMATION
  // ========================================
  if (!prefersReducedMotion && 'IntersectionObserver' in window) {
    var statNumbers = document.querySelectorAll('.stat-item__number[data-count]');

    if (statNumbers.length > 0) {
      var statsObserver = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (entry.isIntersecting) {
            var el = entry.target;
            var target = parseInt(el.getAttribute('data-count'), 10);
            var suffix = el.getAttribute('data-suffix') || '';
            var prefix = el.getAttribute('data-prefix') || '';
            var duration = 2000;
            var startTime = null;

            function animateCount(timestamp) {
              if (!startTime) startTime = timestamp;
              var progress = Math.min((timestamp - startTime) / duration, 1);
              var eased = 1 - Math.pow(1 - progress, 3);
              var current = Math.floor(eased * target);
              el.textContent = prefix + current + suffix;
              if (progress < 1) {
                requestAnimationFrame(animateCount);
              } else {
                el.textContent = prefix + target + suffix;
              }
            }

            requestAnimationFrame(animateCount);
            statsObserver.unobserve(el);
          }
        });
      }, { threshold: 0.5 });

      statNumbers.forEach(function(el) {
        statsObserver.observe(el);
      });
    }
  }

})();