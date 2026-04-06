document.addEventListener('DOMContentLoaded', function() {
    // Register ScrollTrigger plugin
    gsap.registerPlugin(ScrollTrigger);

    // Word by word text reveal
    const wordRevealElements = document.querySelectorAll('.word-reveal');
    if (wordRevealElements) {
        wordRevealElements.forEach(element => {
            const text = element.textContent;
            element.innerHTML = text.split(' ').map(word => `<span class="word">${word}</span>`).join(' ');
            
            gsap.fromTo(element.querySelectorAll('.word'), 
                { opacity: 0, y: 50 },
                { 
                    opacity: 1, 
                    y: 0, 
                    duration: 0.8,
                    stagger: 0.1,
                    ease: "power3.out",
                    scrollTrigger: {
                        trigger: element,
                        start: "top 80%"
                    }
                }
            );
        });
    }

    // Animated progress bars
    const progressBars = document.querySelectorAll('.progress-bar');
    if (progressBars) {
        progressBars.forEach(bar => {
            const progress = bar.getAttribute('data-progress') || 75;
            const fill = bar.querySelector('.progress-fill');
            if (fill) {
                gsap.fromTo(fill, 
                    { width: '0%' },
                    {
                        width: `${progress}%`,
                        duration: 2,
                        ease: "power3.out",
                        scrollTrigger: {
                            trigger: bar,
                            start: "top 80%"
                        }
                    }
                );
            }
        });
    }

    // Blur to sharp image reveal
    const blurImages = document.querySelectorAll('.blur-reveal');
    if (blurImages) {
        blurImages.forEach(img => {
            gsap.fromTo(img,
                { filter: 'blur(20px)', opacity: 0.5 },
                {
                    filter: 'blur(0px)',
                    opacity: 1,
                    duration: 1.5,
                    ease: "power3.out",
                    scrollTrigger: {
                        trigger: img,
                        start: "top 80%"
                    }
                }
            );
        });
    }

    // Image reveal wipe
    const wipeImages = document.querySelectorAll('.image-wipe');
    if (wipeImages) {
        wipeImages.forEach(container => {
            const overlay = container.querySelector('.wipe-overlay');
            if (overlay) {
                gsap.fromTo(overlay,
                    { xPercent: 0 },
                    {
                        xPercent: 100,
                        duration: 1.5,
                        ease: "power3.inOut",
                        scrollTrigger: {
                            trigger: container,
                            start: "top 80%"
                        }
                    }
                );
            }
        });
    }

    // Ripple effect on click
    const rippleElements = document.querySelectorAll('.ripple-effect');
    if (rippleElements) {
        rippleElements.forEach(element => {
            element.addEventListener('click', function(e) {
                const ripple = document.createElement('div');
                ripple.className = 'ripple';
                const rect = element.getBoundingClientRect();
                const size = Math.max(rect.width, rect.height);
                ripple.style.width = ripple.style.height = size + 'px';
                ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
                ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
                element.appendChild(ripple);
                
                gsap.fromTo(ripple, 
                    { scale: 0, opacity: 0.8 },
                    { 
                        scale: 1, 
                        opacity: 0, 
                        duration: 0.6,
                        onComplete: () => ripple.remove()
                    }
                );
            });
        });
    }

    // GSAP Accordion
    const accordionItems = document.querySelectorAll('.accordion-item');
    if (accordionItems) {
        accordionItems.forEach(item => {
            const header = item.querySelector('.accordion-header');
            const content = item.querySelector('.accordion-content');
            
            if (header && content) {
                gsap.set(content, { height: 0, overflow: 'hidden' });
                
                header.addEventListener('click', () => {
                    const isOpen = item.classList.contains('active');
                    
                    // Close all other items
                    accordionItems.forEach(otherItem => {
                        if (otherItem !== item) {
                            otherItem.classList.remove('active');
                            gsap.to(otherItem.querySelector('.accordion-content'), {
                                height: 0,
                                duration: 0.3
                            });
                        }
                    });
                    
                    if (isOpen) {
                        item.classList.remove('active');
                        gsap.to(content, { height: 0, duration: 0.3 });
                    } else {
                        item.classList.add('active');
                        gsap.to(content, { height: 'auto', duration: 0.3 });
                    }
                });
            }
        });
    }

    // Text scramble effect
    const scrambleElements = document.querySelectorAll('.text-scramble');
    if (scrambleElements) {
        scrambleElements.forEach(element => {
            const originalText = element.textContent;
            const chars = '!<>-_\\/[]{}—=+*^?#________';
            
            function scrambleText() {
                let iteration = 0;
                const interval = setInterval(() => {
                    element.textContent = originalText
                        .split('')
                        .map((char, index) => {
                            if (index < iteration) {
                                return originalText[index];
                            }
                            return chars[Math.floor(Math.random() * chars.length)];
                        })
                        .join('');
                    
                    if (iteration >= originalText.length) {
                        clearInterval(interval);
                    }
                    iteration += 1 / 3;
                }, 30);
            }
            
            ScrollTrigger.create({
                trigger: element,
                start: "top 80%",
                onEnter: scrambleText
            });
        });
    }

    // Glitch text effect
    const glitchElements = document.querySelectorAll('.glitch-text');
    if (glitchElements) {
        glitchElements.forEach(element => {
            const originalText = element.textContent;
            element.setAttribute('data-text', originalText);
            
            ScrollTrigger.create({
                trigger: element,
                start: "top 80%",
                onEnter: () => {
                    element.classList.add('glitch-active');
                    setTimeout(() => {
                        element.classList.remove('glitch-active');
                    }, 1000);
                }
            });
        });
    }

    // Counter animation
    const counters = document.querySelectorAll('.counter');
    if (counters) {
        counters.forEach(counter => {
            const target = parseInt(counter.getAttribute('data-target')) || 100;
            const obj = { value: 0 };
            
            gsap.to(obj, {
                value: target,
                duration: 2,
                ease: "power3.out",
                onUpdate: () => {
                    counter.textContent = Math.floor(obj.value);
                },
                scrollTrigger: {
                    trigger: counter,
                    start: "top 80%"
                }
            });
        });
    }

    // Color shifting background on scroll
    const colorShiftBg = document.querySelector('.color-shift-bg');
    if (colorShiftBg) {
        gsap.to(colorShiftBg, {
            background: 'linear-gradient(45deg, #ff006e, #ffbe0b, #8338ec, #3a86ff)',
            scrollTrigger: {
                trigger: colorShiftBg,
                start: "top bottom",
                end: "bottom top",
                scrub: true
            }
        });
    }

    // Particle background with tsParticles
    const particleContainer = document.querySelector('.particle-bg');
    if (particleContainer && window.tsParticles) {
        tsParticles.load("particle-bg", {
            particles: {
                number: { value: 80 },
                color: { value: "#00d4ff" },
                shape: { type: "circle" },
                opacity: { value: 0.5 },
                size: { value: 3 },
                move: {
                    enable: true,
                    speed: 2,
                    direction: "none",
                    random: false,
                    straight: false,
                    out_mode: "out",
                    bounce: false
                }
            },
            interactivity: {
                detect_on: "canvas",
                events: {
                    onhover: { enable: true, mode: "repulse" },
                    onclick: { enable: true, mode: "push" },
                    resize: true
                },
                modes: {
                    repulse: { distance: 100, duration: 0.4 },
                    push: { particles_nb: 4 }
                }
            },
            retina_detect: true
        });
    }

    // Spotlight follow mouse effect
    const spotlight = document.querySelector('.spotlight');
    if (spotlight) {
        document.addEventListener('mousemove', (e) => {
            gsap.to(spotlight, {
                x: e.clientX,
                y: e.clientY,
                duration: 0.3,
                ease: "power2.out"
            });
        });
    }

    // 3D card tilt on hover
    const tiltCards = document.querySelectorAll('.tilt-card');
    if (tiltCards) {
        tiltCards.forEach(card => {
            card.addEventListener('mousemove', (e) => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;
                const rotateX = (y - centerY) / 10;
                const rotateY = (centerX - x) / 10;
                
                gsap.to(card, {
                    rotateX: rotateX,
                    rotateY: rotateY,
                    transformPerspective: 1000,
                    duration: 0.3,
                    ease: "power2.out"
                });
            });
            
            card.addEventListener('mouseleave', () => {
                gsap.to(card, {
                    rotateX: 0,
                    rotateY: 0,
                    duration: 0.3,
                    ease: "power2.out"
                });
            });
        });
    }

    // Typewriter text
    const typewriterElements = document.querySelectorAll('.typewriter');
    if (typewriterElements) {
        typewriterElements.forEach(element => {
            const text = element.textContent;
            element.textContent = '';
            
            ScrollTrigger.create({
                trigger: element,
                start: "top 80%",
                onEnter: () => {
                    let i = 0;
                    const timer = setInterval(() => {
                        if (i < text.length) {
                            element.textContent += text.charAt(i);
                            i++;
                        } else {
                            clearInterval(timer);
                        }
                    }, 50);
                }
            });
        });
    }

    // Parallax background
    const parallaxElements = document.querySelectorAll('.parallax-bg');
    if (parallaxElements) {
        parallaxElements.forEach(element => {
            gsap.to(element, {
                yPercent: -50,
                ease: "none",
                scrollTrigger: {
                    trigger: element,
                    start: "top bottom",
                    end: "bottom top",
                    scrub: true
                }
            });
        });
    }

    // Diagonal wipe transitions
    const diagonalWipes = document.querySelectorAll('.diagonal-wipe');
    if (diagonalWipes) {
        diagonalWipes.forEach(element => {
            const overlay = element.querySelector('.diagonal-overlay');
            if (overlay) {
                gsap.fromTo(overlay,
                    { xPercent: -100, yPercent: -100 },
                    {
                        xPercent: 100,
                        yPercent: 100,
                        duration: 1.5,
                        ease: "power3.inOut",
                        scrollTrigger: {
                            trigger: element,
                            start: "top 80%"
                        }
                    }
                );
            }
        });
    }

    // Split text animation
    const splitTextElements = document.querySelectorAll('.split-text');
    if (splitTextElements) {
        splitTextElements.forEach(element => {
            const text = element.textContent;
            element.innerHTML = text.split('').map(char => 
                char === ' ' ? ' ' : `<span class="char">${char}</span>`
            ).join('');
            
            gsap.fromTo(element.querySelectorAll('.char'),
                { opacity: 0, y: 100, rotateX: -90 },
                {
                    opacity: 1,
                    y: 0,
                    rotateX: 0,
                    duration: 0.8,
                    stagger: 0.02,
                    ease: "power3.out",
                    scrollTrigger: {
                        trigger: element,
                        start: "top 80%"
                    }
                }
            );
        });
    }

    // Horizontal scroll section
    const horizontalSection = document.querySelector('.horizontal-scroll');
    if (horizontalSection) {
        const items = horizontalSection.querySelectorAll('.scroll-item');
        if (items.length > 0) {
            gsap.to(items, {
                xPercent: -100 * (items.length - 1),
                ease: "none",
                scrollTrigger: {
                    trigger: horizontalSection,
                    pin: true,
                    scrub: 1,
                    snap: 1 / (items.length - 1),
                    end: () => "+=" + horizontalSection.offsetWidth
                }
            });
        }
    }

    // Floating elements
    const floatingElements = document.querySelectorAll('.floating');
    if (floatingElements) {
        floatingElements.forEach(element => {
            gsap.to(element, {
                y: -20,
                duration: 2,
                ease: "power1.inOut",
                yoyo: true,
                repeat: -1
            });
        });
    }

    // Animated statistics with circular rings
    const statRings = document.querySelectorAll('.stat-ring');
    if (statRings) {
        statRings.forEach(ring => {
            const progress = ring.getAttribute('data-progress') || 75;
            const circle = ring.querySelector('.ring-progress');
            if (circle) {
                const radius = circle.r.baseVal.value;
                const circumference = 2 * Math.PI * radius;
                circle.style.strokeDasharray = circumference;
                circle.style.strokeDashoffset = circumference;
                
                gsap.to(circle, {
                    strokeDashoffset: circumference - (progress / 100) * circumference,
                    duration: 2,
                    ease: "power3.out",
                    scrollTrigger: {
                        trigger: ring,
                        start: "top 80%"
                    }
                });
            }
        });
    }

    // Breathing scale pulse on hero elements
    const heroElements = document.querySelectorAll('.hero-pulse');
    if (heroElements) {
        heroElements.forEach(element => {
            gsap.to(element, {
                scale: 1.05,
                duration: 2,
                ease: "power1.inOut",
                yoyo: true,
                repeat: -1
            });
        });
    }

    // Magnetic button effect
    const magneticButtons = document.querySelectorAll('.magnetic-btn');
    if (magneticButtons) {
        magneticButtons.forEach(btn => {
            btn.addEventListener('mousemove', (e) => {
                const rect = btn.getBoundingClientRect();
                const x = e.clientX - rect.left - rect.width / 2;
                const y = e.clientY - rect.top - rect.height / 2;
                
                gsap.to(btn, {
                    x: x * 0.3,
                    y: y * 0.3,
                    duration: 0.3,
                    ease: "power2.out"
                });
            });
            
            btn.addEventListener('mouseleave', () => {
                gsap.to(btn, {
                    x: 0,
                    y: 0,
                    duration: 0.5,
                    ease: "elastic.out(1, 0.3)"
                });
            });
        });
    }

    // Liquid blob morphing background
    const liquidBlob = document.querySelector('.liquid-blob');
    if (liquidBlob) {
        gsap.to(liquidBlob, {
            borderRadius: "60% 40% 30% 70% / 60% 30% 70% 40%",
            duration: 3,
            ease: "power1.inOut",
            yoyo: true,
            repeat: -1
        });
    }

    // Elastic bounce reveals
    const bounceElements = document.querySelectorAll('.bounce-reveal');
    if (bounceElements) {
        bounceElements.forEach(element => {
            gsap.fromTo(element,
                { scale: 0, opacity: 0 },
                {
                    scale: 1,
                    opacity: 1,
                    duration: 0.8,
                    ease: "elastic.out(1, 0.3)",
                    scrollTrigger: {
                        trigger: element,
                        start: "top 80%"
                    }
                }
            );
        });
    }

    // Morphing gradient background
    const morphGradient = document.querySelector('.morph-gradient');
    if (morphGradient) {
        gsap.to(morphGradient, {
            background: "radial-gradient(circle at 20% 80%, #ff006e 0%, #8338ec 50%, #3a86ff 100%)",
            duration: 4,
            ease: "power1.inOut",
            yoyo: true,
            repeat: -1
        });
    }

    // Staggered card reveals
    const cardGroups = document.querySelectorAll('.card-group');
    if (cardGroups) {
        cardGroups.forEach(group => {
            const cards = group.querySelectorAll('.reveal-card');
            if (cards.length > 0) {
                gsap.fromTo(cards,
                    { opacity: 0, y: 100, scale: 0.8 },
                    {
                        opacity: 1,
                        y: 0,
                        scale: 1,
                        duration: 0.8,
                        stagger: 0.2,
                        ease: "power3.out",
                        scrollTrigger: {
                            trigger: group,
                            start: "top 80%"
                        }
                    }
                );
            }
        });
    }
});