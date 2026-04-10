/*
 * Animation Style: Minimal, professional, subtle - no trendy or distracting effects
 * Hero Animation: Subtle fade-in or slide-in effect for hero section content on page load (duration 600-800ms, ease-out timing)
 * Animation Method: Vanilla JS + CSS transitions + IntersectionObserver (no third-party libraries)
 * CSS Classes Used for Animation:
 * - is-visible
 * - scrolled
 * - is-open
 * - active
 * - hero-animate
 * - card-animate
 * - heading-animate
 * - section-animate
 * - fade-left
 * - fade-right
 * - fade-up
 */

// DOM Content Loaded Event
document.addEventListener('DOMContentLoaded', function() {
    // Initialize all functionality
    initMobileNavigation();
    initHeaderScroll();
    initHeroAnimation();
    initScrollAnimations();
    initSmoothScroll();
    initFormValidation();
    initActiveNavigation();
    initButtonHoverEffects();
});

// Mobile Navigation Menu
function initMobileNavigation() {
    const mobileToggle = document.querySelector('.mobile-menu-toggle');
    const mobileMenu = document.querySelector('.mobile-menu');
    const mobileNavLinks = document.querySelectorAll('.mobile-nav-link');
    
    if (!mobileToggle || !mobileMenu) return;
    
    // Toggle mobile menu
    mobileToggle.addEventListener('click', function(e) {
        e.preventDefault();
        mobileToggle.classList.toggle('active');
        mobileMenu.classList.toggle('is-open');
        document.body.style.overflow = mobileMenu.classList.contains('is-open') ? 'hidden' : '';
    });
    
    // Close menu when nav link is clicked
    mobileNavLinks.forEach(link => {
        link.addEventListener('click', function() {
            mobileToggle.classList.remove('active');
            mobileMenu.classList.remove('is-open');
            document.body.style.overflow = '';
        });
    });
    
    // Close menu when clicking outside
    document.addEventListener('click', function(e) {
        if (!mobileToggle.contains(e.target) && !mobileMenu.contains(e.target)) {
            mobileToggle.classList.remove('active');
            mobileMenu.classList.remove('is-open');
            document.body.style.overflow = '';
        }
    });
}

// Header Scroll Behavior
function initHeaderScroll() {
    const header = document.querySelector('header');
    if (!header) return;
    
    window.addEventListener('scroll', function() {
        if (window.scrollY > 80) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    });
}

// Hero Animation on Page Load
function initHeroAnimation() {
    const heroCards = document.querySelectorAll('.hero-card, .hero-main-card, .hero-cta-card');
    
    // Add initial animation class
    heroCards.forEach(card => {
        card.classList.add('hero-animate');
    });
    
    // Trigger fade-in animation after a short delay
    setTimeout(() => {
        heroCards.forEach((card, index) => {
            setTimeout(() => {
                card.classList.add('is-visible');
            }, index * 100);
        });
    }, 200);
}

// Scroll Reveal Animations with IntersectionObserver
function initScrollAnimations() {
    // Respect user's motion preferences
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return;
    }
    
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
            }
        });
    }, observerOptions);
    
    // Section headings with staggered delays
    const headings = document.querySelectorAll('h2, h3');
    headings.forEach((heading, index) => {
        if (!heading.closest('.hero')) {
            heading.classList.add('heading-animate');
            heading.style.animationDelay = `${index * 0.1}s`;
            observer.observe(heading);
        }
    });
    
    // Content cards with varied directions
    const contentCards = document.querySelectorAll('.content-card');
    contentCards.forEach((card, index) => {
        // Alternate animation directions for variety
        const animations = ['fade-up', 'fade-left', 'fade-right'];
        const animationClass = animations[index % 3];
        
        card.classList.add('card-animate', animationClass);
        card.style.animationDelay = `${(index % 3) * 0.15}s`;
        observer.observe(card);
    });
    
    // Section containers
    const sections = document.querySelectorAll('section:not(.hero)');
    sections.forEach((section, index) => {
        section.classList.add('section-animate');
        section.style.animationDelay = `${index * 0.2}s`;
        observer.observe(section);
    });
    
    // Additional animatable elements
    const additionalElements = document.querySelectorAll('.btn, .form-group, .footer-section');
    additionalElements.forEach((element, index) => {
        element.classList.add('fade-up');
        element.style.animationDelay = `${index * 0.05}s`;
        observer.observe(element);
    });
}

// Smooth Scroll for Anchor Links
function initSmoothScroll() {
    const anchorLinks = document.querySelectorAll('a[href^="#"]');
    
    anchorLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                e.preventDefault();
                
                const headerHeight = document.querySelector('header')?.offsetHeight || 80;
                const targetPosition = targetElement.offsetTop - headerHeight;
                
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
}

// Active Navigation State
function initActiveNavigation() {
    const navLinks = document.querySelectorAll('.nav-link, .mobile-nav-link');
    const currentPath = window.location.pathname;
    
    navLinks.forEach(link => {
        const linkPath = new URL(link.href).pathname;
        if (linkPath === currentPath || (currentPath === '/' && linkPath.includes('index'))) {
            link.classList.add('active');
        }
    });
}

// Form Validation
function initFormValidation() {
    const forms = document.querySelectorAll('form');
    
    forms.forEach(form => {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const inputs = form.querySelectorAll('input[required], textarea[required], select[required]');
            let isValid = true;
            
            // Clear previous errors
            inputs.forEach(input => {
                input.classList.remove('error');
                const errorMsg = input.parentNode.querySelector('.error-message');
                if (errorMsg) errorMsg.remove();
            });
            
            // Validate each required field
            inputs.forEach(input => {
                const value = input.value.trim();
                let errorMessage = '';
                
                if (!value) {
                    errorMessage = 'This field is required';
                    isValid = false;
                } else if (input.type === 'email' && !isValidEmail(value)) {
                    errorMessage = 'Please enter a valid email address';
                    isValid = false;
                } else if (input.type === 'tel' && !isValidPhone(value)) {
                    errorMessage = 'Please enter a valid phone number';
                    isValid = false;
                }
                
                if (errorMessage) {
                    input.classList.add('error');
                    showFieldError(input, errorMessage);
                }
            });
            
            if (isValid) {
                // Show success state
                showFormSuccess(form);
                // Here you would normally submit the form data
                console.log('Form submitted successfully');
            }
        });
    });
}

// Email validation helper
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Phone validation helper
function isValidPhone(phone) {
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    return phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ''));
}

// Show field error
function showFieldError(input, message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.style.color = 'var(--error-red)';
    errorDiv.style.fontSize = 'var(--text-sm)';
    errorDiv.style.marginTop = '4px';
    errorDiv.textContent = message;
    input.parentNode.appendChild(errorDiv);
}

// Show form success
function showFormSuccess(form) {
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.style.color = 'var(--success-green)';
    successDiv.style.fontSize = 'var(--text-base)';
    successDiv.style.fontWeight = '500';
    successDiv.style.textAlign = 'center';
    successDiv.style.padding = 'var(--space-md)';
    successDiv.style.backgroundColor = '#f0fdf4';
    successDiv.style.border = '1px solid var(--success-green)';
    successDiv.style.borderRadius = '6px';
    successDiv.style.marginTop = 'var(--space-md)';
    successDiv.textContent = 'Thank you! Your message has been sent successfully.';
    
    form.appendChild(successDiv);
    
    // Reset form after success
    setTimeout(() => {
        form.reset();
        successDiv.remove();
    }, 5000);
}

// Button Hover Effects Enhancement
function initButtonHoverEffects() {
    const buttons = document.querySelectorAll('.btn, .header-cta');
    
    buttons.forEach(button => {
        button.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-1px)';
        });
        
        button.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0)';
        });
    });
}

// Additional utility functions for enhanced interactivity
function addRippleEffect(element) {
    element.addEventListener('click', function(e) {
        const ripple = document.createElement('span');
        const rect = this.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = e.clientX - rect.left - size / 2;
        const y = e.clientY - rect.top - size / 2;
        
        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = x + 'px';
        ripple.style.top = y + 'px';
        ripple.classList.add('ripple');
        
        this.appendChild(ripple);
        
        setTimeout(() => {
            ripple.remove();
        }, 600);
    });
}

// Initialize ripple effects on primary buttons
document.querySelectorAll('.btn-primary').forEach(addRippleEffect);

/*
INTERACTIVE COMPONENTS AUDIT:
- Mobile menu toggle (.mobile-menu-toggle): click event toggles .is-open class
- Navigation links (.nav-link, .mobile-nav-link): click event adds .active class, smooth scroll
- Header scroll (header): scroll event adds .scrolled class at 80px
- Hero cards (.hero-card): automatic fade-in animation on page load with .is-visible class
- Content cards (.content-card): IntersectionObserver adds animation classes (.fade-up, .fade-left, .fade-right)
- Anchor links (a[href^="#"]): click event triggers smooth scroll behavior
- Form elements (form): submit event with validation, adds .error class on invalid fields
- Buttons (.btn, .header-cta): hover events for enhanced interactions
- Animation elements: IntersectionObserver adds .is-visible class for scroll reveals
*/