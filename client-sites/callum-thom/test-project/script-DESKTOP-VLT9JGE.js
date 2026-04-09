/*
 * Animation Style: Subtle, smooth transitions (no flashy effects)
 * Hero Animation: Gentle fade-in on page load for headline and subheading, Subtle zoom or parallax effect on hero background image
 * GSAP Effects Used: 
 * - gentle fade-in on page load (hero content)
 * - parallax background on hero section
 * - fade-in on scroll (recipe cards)
 * - stagger reveal (ingredient lists, instruction lists)
 * - smooth scroll behavior for navigation
 */

gsap.registerPlugin(ScrollTrigger);

document.addEventListener('DOMContentLoaded', function() {
    // Mobile navigation toggle
    const hamburger = document.querySelector('.hamburger');
    const mobileMenu = document.querySelector('.mobile-menu');
    const navLinks = document.querySelectorAll('.nav-link');
    const header = document.querySelector('.header');

    // Hamburger menu toggle
    hamburger.addEventListener('click', function() {
        hamburger.classList.toggle('active');
        mobileMenu.classList.toggle('is-open');
    });

    // Close mobile menu when clicking nav links
    navLinks.forEach(link => {
        link.addEventListener('click', function() {
            hamburger.classList.remove('active');
            mobileMenu.classList.remove('is-open');
        });
    });

    // Close mobile menu when clicking outside
    document.addEventListener('click', function(e) {
        if (!hamburger.contains(e.target) && !mobileMenu.contains(e.target)) {
            hamburger.classList.remove('active');
            mobileMenu.classList.remove('is-open');
        }
    });

    // Header scroll behavior
    window.addEventListener('scroll', function() {
        if (window.scrollY > 80) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    });

    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href').substring(1);
            const targetElement = document.getElementById(targetId);
            if (targetElement) {
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Hero animation - gentle fade-in
    gsap.from(".hero-content h1", { 
        opacity: 0, 
        y: 20, 
        duration: 1, 
        ease: 'power2.out',
        delay: 0.2
    });

    gsap.from(".hero-subtitle", { 
        opacity: 0, 
        y: 20, 
        duration: 1, 
        ease: 'power2.out',
        delay: 0.4
    });

    gsap.from(".cta-button", { 
        opacity: 0, 
        y: 20, 
        duration: 1, 
        ease: 'power2.out',
        delay: 0.6
    });
});

window.addEventListener('load', function() {
    // Hero parallax background effect
    gsap.to(".hero", {
        yPercent: 30,
        ease: "none",
        scrollTrigger: {
            trigger: ".hero",
            start: "top top",
            end: "bottom top",
            scrub: true
        }
    });

    // Recipe section fade-in animations
    gsap.from(".recipe-section h2", {
        opacity: 0,
        y: 30,
        duration: 0.8,
        ease: 'power2.out',
        scrollTrigger: {
            trigger: ".recipe-section",
            start: "top 85%"
        }
    });

    gsap.from(".recipe-card", {
        opacity: 0,
        y: 40,
        duration: 0.6,
        ease: 'power2.out',
        stagger: 0.2,
        scrollTrigger: {
            trigger: ".recipe-grid",
            start: "top 85%"
        }
    });

    // Ingredient list stagger animation
    gsap.from(".ingredients-list li", {
        opacity: 0,
        x: -30,
        duration: 0.4,
        ease: 'back.out(1.2)',
        stagger: 0.1,
        scrollTrigger: {
            trigger: ".ingredients-list",
            start: "top 85%"
        }
    });

    // Instructions list stagger animation
    gsap.from(".instructions-list li", {
        opacity: 0,
        x: 40,
        duration: 0.5,
        ease: 'power2.out',
        stagger: 0.15,
        scrollTrigger: {
            trigger: ".instructions-list",
            start: "top 85%"
        }
    });

    // Recipe meta information animation
    gsap.from(".meta-item", {
        opacity: 0,
        scale: 0.8,
        duration: 0.6,
        ease: 'back.out(1.2)',
        stagger: 0.1,
        scrollTrigger: {
            trigger: ".recipe-meta",
            start: "top 85%"
        }
    });

    // Temperature highlight animation
    gsap.from(".temperature-highlight", {
        opacity: 0,
        y: 20,
        duration: 0.6,
        ease: 'power2.out',
        scrollTrigger: {
            trigger: ".temperature-highlight",
            start: "top 85%"
        }
    });

    // Footer animation
    gsap.from(".footer-links", {
        opacity: 0,
        y: 30,
        duration: 0.6,
        ease: 'power2.out',
        scrollTrigger: {
            trigger: ".footer",
            start: "top 90%"
        }
    });
});

/*
Interactive Component Audit:
- hamburger: .hamburger, toggles mobile menu visibility and active state
- mobile menu close: .nav-link, closes mobile menu when navigation links are clicked
- outside click: document, closes mobile menu when clicking outside menu area
- header scroll: window scroll, adds scrolled class to header after 80px scroll
- smooth scroll: a[href^="#"], enables smooth scrolling to anchor targets
- hero fade-in: .hero-content elements, gentle fade-in animation on page load
- parallax background: .hero, subtle parallax scroll effect on hero background
- recipe cards: .recipe-card, fade-in animation when scrolled into view
- ingredient list: .ingredients-list li, staggered slide-in from left
- instructions list: .instructions-list li, staggered slide-in from right
- meta items: .meta-item, staggered scale animation
- temperature highlight: .temperature-highlight, fade-in on scroll
- footer links: .footer-links, fade-in animation when footer enters viewport
*/