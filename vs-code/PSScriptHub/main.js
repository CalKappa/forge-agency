/*
 * Animation Style: Subtle and professional
 * Hero Animation: Soft fade-in and slight upward movement for hero section elements on page load (300ms ease-out)
 * GSAP Effects Used: fade-in on scroll (sections), stagger reveal (cards), hero fade-in animation, smooth scroll, header scroll behavior
 */

gsap.registerPlugin(ScrollTrigger);

document.addEventListener('DOMContentLoaded', function() {
  // GSAP initialization
  window.addEventListener('load', function() {
    // Hero Animation - Soft fade-in and slight upward movement
    const heroElements = document.querySelectorAll('.hero h1, .hero p, .hero .btn');
    if (heroElements.length > 0) {
      gsap.fromTo(heroElements, 
        { opacity: 0, y: 30 }, 
        { 
          opacity: 1, 
          y: 0, 
          duration: 0.6, 
          ease: 'power2.out',
          stagger: 0.15
        }
      );
    }

    // Scroll animations - subtle and professional
    const sections = document.querySelectorAll('.section');
    sections.forEach(section => {
      gsap.fromTo(section, 
        { opacity: 0, y: 30 },
        {
          opacity: 1,
          y: 0,
          duration: 0.6,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: section,
            start: 'top 85%'
          }
        }
      );
    });

    // Feature cards stagger
    const featureCards = document.querySelectorAll('.feature-card');
    if (featureCards.length > 0) {
      gsap.fromTo(featureCards,
        { opacity: 0, y: 40 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          ease: 'back.out(1.2)',
          stagger: 0.15,
          scrollTrigger: {
            trigger: '.features-grid',
            start: 'top 85%'
          }
        }
      );
    }

    // Script cards stagger
    const scriptCards = document.querySelectorAll('.script-card');
    if (scriptCards.length > 0) {
      gsap.fromTo(scriptCards,
        { opacity: 0, x: -60 },
        {
          opacity: 1,
          x: 0,
          duration: 1,
          ease: 'expo.out',
          stagger: 0.12,
          scrollTrigger: {
            trigger: '.scripts-grid',
            start: 'top 85%'
          }
        }
      );
    }

    // Carousel cards stagger
    const carouselCards = document.querySelectorAll('.carousel-card');
    if (carouselCards.length > 0) {
      gsap.fromTo(carouselCards,
        { opacity: 0, x: 60 },
        {
          opacity: 1,
          x: 0,
          duration: 0.9,
          ease: 'power2.out',
          stagger: 0.1,
          scrollTrigger: {
            trigger: '.carousel-container',
            start: 'top 85%'
          }
        }
      );
    }

    // Contact form and info animation
    const contactElements = document.querySelectorAll('.contact-layout > *');
    if (contactElements.length > 0) {
      gsap.fromTo(contactElements,
        { opacity: 0, y: 50 },
        {
          opacity: 1,
          y: 0,
          duration: 1.2,
          ease: 'power2.out',
          stagger: 0.2,
          scrollTrigger: {
            trigger: '.contact-layout',
            start: 'top 85%'
          }
        }
      );
    }
  });

  // Mobile navigation
  const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
  const mobileMenu = document.querySelector('.mobile-menu');
  const mobileNavLinks = document.querySelectorAll('.mobile-nav-link');

  if (mobileMenuToggle && mobileMenu) {
    mobileMenuToggle.addEventListener('click', function() {
      mobileMenuToggle.classList.toggle('active');
      mobileMenu.classList.toggle('is-open');
    });

    // Close menu when clicking nav links
    mobileNavLinks.forEach(link => {
      link.addEventListener('click', function() {
        mobileMenuToggle.classList.remove('active');
        mobileMenu.classList.remove('is-open');
      });
    });

    // Close menu when clicking outside
    document.addEventListener('click', function(e) {
      if (!mobileMenu.contains(e.target) && !mobileMenuToggle.contains(e.target)) {
        mobileMenuToggle.classList.remove('active');
        mobileMenu.classList.remove('is-open');
      }
    });
  }

  // Header scroll behavior
  const header = document.querySelector('.header');
  if (header) {
    window.addEventListener('scroll', function() {
      if (window.scrollY > 80) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
    });
  }

  // Smooth scroll for anchor links
  const anchorLinks = document.querySelectorAll('a[href^="#"]');
  anchorLinks.forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      const targetId = this.getAttribute('href');
      const targetElement = document.querySelector(targetId);
      
      if (targetElement) {
        targetElement.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    });
  });

  // Active nav link highlighting
  const navLinks = document.querySelectorAll('.nav-link');
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  
  navLinks.forEach(link => {
    const linkHref = link.getAttribute('href');
    if (linkHref === currentPage || 
        (currentPage === '' && linkHref === 'index.html') ||
        (currentPage === 'index.html' && linkHref === '/')) {
      link.classList.add('active');
    }
  });

  // Search functionality
  const searchInput = document.querySelector('.search-input');
  const scriptCards = document.querySelectorAll('.script-card');
  
  if (searchInput && scriptCards.length > 0) {
    searchInput.addEventListener('input', function(e) {
      const searchTerm = e.target.value.toLowerCase();
      
      scriptCards.forEach(card => {
        const title = card.querySelector('h3')?.textContent.toLowerCase() || '';
        const description = card.querySelector('p')?.textContent.toLowerCase() || '';
        
        if (title.includes(searchTerm) || description.includes(searchTerm)) {
          card.style.display = 'block';
        } else {
          card.style.display = 'none';
        }
      });
    });
  }

  // Filter functionality
  const filterCheckboxes = document.querySelectorAll('.filter-option input[type="checkbox"]');
  
  if (filterCheckboxes.length > 0 && scriptCards.length > 0) {
    filterCheckboxes.forEach(checkbox => {
      checkbox.addEventListener('change', function() {
        const selectedFilters = Array.from(filterCheckboxes)
          .filter(cb => cb.checked)
          .map(cb => cb.value);
        
        scriptCards.forEach(card => {
          const cardTags = Array.from(card.querySelectorAll('.script-tag'))
            .map(tag => tag.textContent.toLowerCase());
          
          if (selectedFilters.length === 0 || 
              selectedFilters.some(filter => cardTags.includes(filter.toLowerCase()))) {
            card.style.display = 'block';
          } else {
            card.style.display = 'none';
          }
        });
      });
    });
  }

  // Copy to clipboard functionality
  const copyButtons = document.querySelectorAll('.copy-btn');
  
  copyButtons.forEach(button => {
    button.addEventListener('click', function() {
      const codeBlock = this.closest('.code-block');
      const codeContent = codeBlock.querySelector('code');
      
      if (codeContent) {
        const textToCopy = codeContent.textContent;
        
        navigator.clipboard.writeText(textToCopy).then(() => {
          const originalText = this.textContent;
          this.textContent = 'Copied!';
          this.classList.add('copied');
          
          setTimeout(() => {
            this.textContent = originalText;
            this.classList.remove('copied');
          }, 2000);
        }).catch(err => {
          console.error('Failed to copy text: ', err);
        });
      }
    });
  });

  // Expandable sections
  const sectionToggles = document.querySelectorAll('.section-toggle');
  
  sectionToggles.forEach(toggle => {
    toggle.addEventListener('click', function() {
      const parent = this.closest('.expandable-section');
      const content = parent.querySelector('.section-content');
      
      if (content.classList.contains('expanded')) {
        content.classList.remove('expanded');
        this.setAttribute('aria-expanded', 'false');
      } else {
        content.classList.add('expanded');
        this.setAttribute('aria-expanded', 'true');
      }
    });
  });

  // Pagination functionality
  const paginationBtns = document.querySelectorAll('.pagination-btn');
  
  paginationBtns.forEach(btn => {
    btn.addEventListener('click', function() {
      if (!this.classList.contains('active')) {
        paginationBtns.forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        
        // Scroll to top of content area
        const scriptsGrid = document.querySelector('.scripts-grid');
        if (scriptsGrid) {
          scriptsGrid.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    });
  });

  // Carousel scroll functionality
  const carousel = document.querySelector('.carousel');
  if (carousel) {
    let isScrolling = false;
    
    carousel.addEventListener('wheel', function(e) {
      if (!isScrolling) {
        e.preventDefault();
        this.scrollLeft += e.deltaY;
      }
    });
  }

  // Form validation
  const contactForm = document.querySelector('form');
  
  if (contactForm) {
    contactForm.addEventListener('submit', function(e) {
      e.preventDefault();
      
      const formInputs = this.querySelectorAll('.form-input, .form-textarea');
      let isValid = true;
      
      formInputs.forEach(input => {
        const errorMsg = input.parentNode.querySelector('.error-message');
        if (errorMsg) errorMsg.remove();
        input.classList.remove('error');
        
        // Required field validation
        if (input.hasAttribute('required') && !input.value.trim()) {
          showError(input, 'This field is required');
          isValid = false;
        }
        
        // Email validation
        if (input.type === 'email' && input.value.trim()) {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(input.value.trim())) {
            showError(input, 'Please enter a valid email address');
            isValid = false;
          }
        }
      });
      
      if (isValid) {
        // Form is valid - show success message
        const successMsg = document.createElement('div');
        successMsg.className = 'form-success';
        successMsg.textContent = 'Message sent successfully!';
        successMsg.style.cssText = `
          background-color: var(--success-green);
          color: white;
          padding: 1rem;
          border-radius: var(--border-radius);
          margin-bottom: 1rem;
        `;
        
        this.insertBefore(successMsg, this.firstChild);
        this.reset();
        
        setTimeout(() => {
          successMsg.remove();
        }, 5000);
      }
    });
  }

  function showError(input, message) {
    input.classList.add('error');
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    errorDiv.style.cssText = `
      color: #ef4444;
      font-size: var(--small-size);
      margin-top: 0.25rem;
    `;
    input.parentNode.appendChild(errorDiv);
  }

  // IntersectionObserver for scroll animations
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -10% 0px'
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
      }
    });
  }, observerOptions);

  // Observe elements that need scroll animations
  const animatedElements = document.querySelectorAll('.feature-card, .script-card, .contact-item');
  animatedElements.forEach(el => {
    observer.observe(el);
  });
});

/*
Interactive Components Audit:
- Mobile menu toggle (.mobile-menu-toggle) - toggles hamburger animation and menu visibility
- Mobile nav links (.mobile-nav-link) - closes menu on click
- Header scroll behavior (window scroll) - adds scrolled class at 80px
- Anchor links (a[href^="#"]) - smooth scroll to target
- Search input (.search-input) - filters script cards by title/description
- Filter checkboxes (.filter-option input) - filters script cards by tags
- Copy buttons (.copy-btn) - copies code to clipboard with visual feedback
- Section toggles (.section-toggle) - expands/collapses content sections
- Pagination buttons (.pagination-btn) - activates page and scrolls to content
- Carousel (.carousel) - horizontal scroll with wheel event
- Contact form (form) - validates required fields and email format
- IntersectionObserver - adds in-view class to animated elements
*/