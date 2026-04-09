/*
 * Animation Style: Subtle and professional
 * All GSAP calls are wrapped in null checks and try/catch blocks.
 * Product cards use a window load + clearProps pattern — no ScrollTrigger, no opacity.
 */

// ─────────────────────────────────────────────────────────────────────────────
// IMMEDIATE VISIBILITY RESET — first executable line, before anything else.
// Runs synchronously before GSAP loads so cards are never invisible.
// ─────────────────────────────────────────────────────────────────────────────
(function() {
    var sel = '.product-card, .card, .product-item, .product, [class*="product-"], [class*="-card"]';
    document.querySelectorAll(sel).forEach(function(el) {
        el.style.opacity = '1';
        el.style.visibility = 'visible';
        el.style.transform = 'none';
    });
})();

if (typeof gsap !== 'undefined') {
    gsap.registerPlugin(ScrollTrigger);
}

// PRODUCT CARDS — visibility only, no GSAP animation
// GSAP is never allowed to touch opacity or transform on card elements.
window.addEventListener('load', function() {
    document.querySelectorAll('.product-card, .card, .product-item, .product').forEach(function(el) {
        el.style.opacity = '1';
        el.style.visibility = 'visible';
        el.style.transform = 'none';
    });
});

document.addEventListener('DOMContentLoaded', function() {
    // Second visibility reset after DOM parse — belt-and-suspenders
    var sel = '.product-card, .card, .product-item, .product, [class*="product-"], [class*="-card"]';
    document.querySelectorAll(sel).forEach(function(el) {
        el.style.opacity = '1';
        el.style.visibility = 'visible';
        el.style.transform = 'none';
    });

    // Mobile menu functionality
    const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
    const mobileMenu = document.querySelector('.mobile-menu');
    const mobileNavLinks = document.querySelectorAll('.mobile-nav-link');

    if (mobileMenuToggle && mobileMenu) {
        mobileMenuToggle.addEventListener('click', function() {
            mobileMenu.classList.toggle('is-open');
            mobileMenuToggle.classList.toggle('active');
        });

        mobileNavLinks.forEach(function(link) {
            link.addEventListener('click', function() {
                mobileMenu.classList.remove('is-open');
                mobileMenuToggle.classList.remove('active');
            });
        });

        document.addEventListener('click', function(e) {
            if (!mobileMenu.contains(e.target) && !mobileMenuToggle.contains(e.target)) {
                mobileMenu.classList.remove('is-open');
                mobileMenuToggle.classList.remove('active');
            }
        });
    }

    // Header scroll behavior
    const header = document.querySelector('.header');
    let lastScrollY = 0;

    window.addEventListener('scroll', function() {
        if (header) {
            if (window.scrollY > 80) {
                header.classList.add('scrolled');
            } else {
                header.classList.remove('scrolled');
            }
        }
        lastScrollY = window.scrollY;
    });

    // Smooth scroll for anchor links
    const anchorLinks = document.querySelectorAll('a[href^="#"]');
    anchorLinks.forEach(function(link) {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href').substring(1);
            const targetElement = document.getElementById(targetId);
            if (targetElement) {
                targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

    // Form validation
    const forms = document.querySelectorAll('form');
    forms.forEach(function(form) {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            let isValid = true;
            const inputs = form.querySelectorAll('input[required], textarea[required]');

            inputs.forEach(function(input) {
                const errorMsg = input.parentNode.querySelector('.error-message');
                if (errorMsg) errorMsg.remove();
                input.classList.remove('error');

                if (!input.value.trim()) {
                    input.classList.add('error');
                    showError(input, 'This field is required');
                    isValid = false;
                } else if (input.type === 'email' && !isValidEmail(input.value)) {
                    input.classList.add('error');
                    showError(input, 'Please enter a valid email address');
                    isValid = false;
                }
            });

            if (isValid) showSuccess(form);
        });
    });

    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    function showError(input, message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        input.parentNode.appendChild(errorDiv);
    }

    function showSuccess(form) {
        const successDiv = document.createElement('div');
        successDiv.className = 'success-message';
        successDiv.textContent = 'Thank you! Your message has been sent successfully.';
        form.appendChild(successDiv);
        setTimeout(function() {
            successDiv.remove();
            form.reset();
            form.querySelectorAll('.error').forEach(function(el) { el.classList.remove('error'); });
        }, 3000);
    }

    // Product filtering
    const filterSelects = document.querySelectorAll('.filter-select');
    const productCards = document.querySelectorAll('.product-card');

    filterSelects.forEach(function(select) {
        select.addEventListener('change', filterProducts);
    });

    function filterProducts() {
        const categoryFilter = document.querySelector('.filter-select[data-filter="category"]');
        const priceFilter = document.querySelector('.filter-select[data-filter="price"]');
        if (!categoryFilter || !priceFilter) return;

        const selectedCategory = categoryFilter.value;
        const selectedPriceRange = priceFilter.value;

        productCards.forEach(function(card) {
            let show = true;
            if (selectedCategory !== 'all') {
                if (card.getAttribute('data-category') !== selectedCategory) show = false;
            }
            if (selectedPriceRange !== 'all' && show) {
                const cardPrice = parseFloat(card.getAttribute('data-price'));
                const parts = selectedPriceRange.split('-').map(Number);
                if (cardPrice < parts[0] || (parts[1] && cardPrice > parts[1])) show = false;
            }
            card.style.display = show ? '' : 'none';
        });
    }

    // IntersectionObserver for in-view class
    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
            if (entry.isIntersecting) entry.target.classList.add('in-view');
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

    document.querySelectorAll('.section, .story-content, .form-group').forEach(function(el) {
        observer.observe(el);
    });

    // Newsletter signup
    const newsletterForms = document.querySelectorAll('.newsletter-form');
    newsletterForms.forEach(function(form) {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            const emailInput = form.querySelector('input[type="email"]');
            if (emailInput && isValidEmail(emailInput.value)) {
                const msg = document.createElement('div');
                msg.className = 'success-message';
                msg.textContent = 'Successfully subscribed to our newsletter!';
                form.appendChild(msg);
                setTimeout(function() { msg.remove(); form.reset(); }, 3000);
            }
        });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// ALL OTHER GSAP ANIMATIONS — window load, every call null-checked + try/catch
// ─────────────────────────────────────────────────────────────────────────────
window.addEventListener('load', function() {
    if (typeof gsap === 'undefined') return;

    // Hero headline
    var heroHeadline = document.querySelector('.hero-headline');
    if (heroHeadline) {
        try {
            gsap.from(heroHeadline, { y: 40, duration: 0.8, ease: 'power2.out' });
        } catch(e) {}
    }

    // Hero subheading
    var heroSubheading = document.querySelector('.hero-subheading');
    if (heroSubheading) {
        try {
            gsap.from(heroSubheading, { y: 30, duration: 0.6, delay: 0.2, ease: 'power2.out' });
        } catch(e) {}
    }

    // Hero CTA
    var heroCTA = document.querySelector('.hero-cta');
    if (heroCTA) {
        try {
            gsap.from(heroCTA, { y: 20, duration: 0.5, delay: 0.4, ease: 'power2.out' });
        } catch(e) {}
    }

    // Hero parallax
    var hero = document.querySelector('.hero');
    if (hero) {
        try {
            gsap.to(hero, {
                yPercent: 30,
                ease: 'none',
                scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: 0.5 }
            });
        } catch(e) {}
    }

    // Section scroll animations — transform only, no opacity
    var sections = document.querySelectorAll('.section');
    if (sections.length > 0) {
        sections.forEach(function(section, index) {
            try {
                gsap.from(section, {
                    y: index % 2 === 0 ? 30 : -30,
                    duration: 0.6,
                    ease: 'power2.out',
                    scrollTrigger: { trigger: section, start: 'top 95%', once: true }
                });
            } catch(e) {}
        });
    }

    // Brand story text
    var storyContent = document.querySelector('.story-content');
    var storyText = document.querySelector('.story-text');
    if (storyText) {
        try {
            gsap.from(storyText, {
                x: -40, duration: 0.8, ease: 'power2.out',
                scrollTrigger: { trigger: storyContent || storyText, start: 'top 95%', once: true }
            });
        } catch(e) {}
    }

    // Brand story image
    var storyImage = document.querySelector('.story-image');
    if (storyImage) {
        try {
            gsap.from(storyImage, {
                x: 40, duration: 0.8, delay: 0.2, ease: 'power2.out',
                scrollTrigger: { trigger: storyContent || storyImage, start: 'top 95%', once: true }
            });
        } catch(e) {}
    }

    // Form groups
    var formGroups = document.querySelectorAll('.form-group');
    if (formGroups.length > 0) {
        formGroups.forEach(function(group, index) {
            try {
                gsap.from(group, {
                    y: 20, duration: 0.5, delay: index * 0.08, ease: 'power2.out',
                    scrollTrigger: { trigger: group, start: 'top 95%', once: true }
                });
            } catch(e) {}
        });
    }

    // Button hover animations
    var buttons = document.querySelectorAll('.btn');
    if (buttons.length > 0) {
        buttons.forEach(function(btn) {
            btn.addEventListener('mouseenter', function() {
                try { gsap.to(btn, { scale: 1.02, duration: 0.2, ease: 'power2.out' }); } catch(e) {}
            });
            btn.addEventListener('mouseleave', function() {
                try { gsap.to(btn, { scale: 1, duration: 0.2, ease: 'power2.out' }); } catch(e) {}
            });
        });
    }

    // Filter groups
    var filtersSection = document.querySelector('.filters-section');
    if (filtersSection) {
        var filterGroups = document.querySelectorAll('.filter-group');
        if (filterGroups.length > 0) {
            try {
                gsap.from(filterGroups, {
                    y: 15, duration: 0.4, stagger: 0.08, ease: 'power2.out',
                    scrollTrigger: { trigger: filtersSection, start: 'top 95%', once: true }
                });
            } catch(e) {}
        }
    }
});

/*
Interactive Components Audit:
- Mobile menu toggle (.mobile-menu-toggle): click to toggle is-open on .mobile-menu
- Scroll detection: adds .scrolled to .header at 80px
- Anchor links: smooth scroll
- Forms: validation and success states
- Filter selects: filter product cards by category/price
- Newsletter forms: email signup
- Product cards: window.load visibility reset only — NO GSAP on cards
- Product card hovers: CSS-only (no GSAP)
- Buttons: hover scale animations, try/catch wrapped
- IntersectionObserver: adds .in-view class on sections/story/forms
*/
