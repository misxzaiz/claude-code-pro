/**
 * Claude Code Pro - Official Website Scripts
 * Handles navigation, animations, and interactive elements
 */

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', function() {

    // ============================================
    // Navigation functionality
    // ============================================

    const nav = document.querySelector('.nav');
    const navToggle = document.querySelector('.nav-toggle');
    const navLinks = document.querySelector('.nav-links');

    // Scroll effect for navigation
    let lastScroll = 0;
    window.addEventListener('scroll', function() {
        const currentScroll = window.pageYOffset;

        // Add/remove scrolled class
        if (currentScroll > 50) {
            nav.classList.add('scrolled');
        } else {
            nav.classList.remove('scrolled');
        }

        lastScroll = currentScroll;
    });

    // Mobile menu toggle
    navToggle.addEventListener('click', function() {
        navLinks.classList.toggle('active');
        this.classList.toggle('active');
    });

    // Close mobile menu on link click
    navLinks.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', function() {
            navLinks.classList.remove('active');
            navToggle.classList.remove('active');
        });
    });

    // ============================================
    // Smooth scroll for anchor links
    // ============================================

    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const href = this.getAttribute('href');

            // Skip empty anchors
            if (href === '#') return;

            e.preventDefault();
            const target = document.querySelector(href);

            if (target) {
                const navHeight = nav.offsetHeight;
                const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - navHeight;

                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });

    // ============================================
    // Scroll reveal animations
    // ============================================

    const revealElements = document.querySelectorAll(
        '.feature-card, .tech-item, .demo-feature, .platform-card, .section-header'
    );

    const revealOnScroll = function() {
        const windowHeight = window.innerHeight;
        const elementVisible = 150;

        revealElements.forEach(element => {
            const elementTop = element.getBoundingClientRect().top;

            if (elementTop < windowHeight - elementVisible) {
                element.classList.add('reveal');
                element.classList.add('active');
            }
        });
    };

    // Initial check
    revealOnScroll();

    // Throttled scroll listener
    let scrollTimeout;
    window.addEventListener('scroll', function() {
        if (scrollTimeout) {
            cancelAnimationFrame(scrollTimeout);
        }
        scrollTimeout = requestAnimationFrame(revealOnScroll);
    });

    // ============================================
    // Counter animation for stats
    // ============================================

    const animateCounter = function(element, target, duration = 2000) {
        const start = 0;
        const increment = target / (duration / 16);
        let current = start;

        const updateCounter = function() {
            current += increment;

            if (current < target) {
                // Format number with K suffix for large numbers
                if (target >= 1000) {
                    element.textContent = Math.floor(current / 1000) + 'K+';
                } else {
                    element.textContent = Math.floor(current) + '+';
                }
                requestAnimationFrame(updateCounter);
            } else {
                if (target >= 1000) {
                    element.textContent = (target / 1000) + 'K+';
                } else {
                    element.textContent = target + '+';
                }
            }
        };

        updateCounter();
    };

    // Intersection Observer for counter animation
    const statObserver = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const counter = entry.target;
                const target = parseInt(counter.getAttribute('data-count'));

                if (target && !counter.classList.contains('counted')) {
                    counter.classList.add('counted');
                    animateCounter(counter, target);
                }
            }
        });
    }, { threshold: 0.5 });

    document.querySelectorAll('.stat-value[data-count]').forEach(counter => {
        statObserver.observe(counter);
    });

    // ============================================
    // Typing animation for hero preview
    // ============================================

    const typingTexts = [
        '帮我创建一个 React 组件',
        '优化这段代码的性能',
        '解释这个函数的作用',
        '帮我修复这个 bug'
    ];

    let typingIndex = 0;
    let charIndex = 0;
    let isDeleting = false;
    const typingSpeed = 100;
    const deletingSpeed = 50;
    const pauseTime = 2000;

    const typeMessage = function() {
        const messageElement = document.querySelector('.message-user .message-content');

        if (!messageElement) return;

        const currentText = typingTexts[typingIndex];

        if (isDeleting) {
            messageElement.textContent = currentText.substring(0, charIndex - 1);
            charIndex--;
        } else {
            messageElement.textContent = currentText.substring(0, charIndex + 1);
            charIndex++;
        }

        let nextSpeed = isDeleting ? deletingSpeed : typingSpeed;

        if (!isDeleting && charIndex === currentText.length) {
            nextSpeed = pauseTime;
            isDeleting = true;
        } else if (isDeleting && charIndex === 0) {
            isDeleting = false;
            typingIndex = (typingIndex + 1) % typingTexts.length;
        }

        setTimeout(typeMessage, nextSpeed);
    };

    // Start typing animation after a delay
    setTimeout(typeMessage, 2000);

    // ============================================
    // Feature cards stagger animation
    // ============================================

    const featureCards = document.querySelectorAll('.feature-card');
    featureCards.forEach((card, index) => {
        card.style.transitionDelay = (index * 0.1) + 's';
    });

    // ============================================
    // Parallax effect for background orbs
    // ============================================

    document.addEventListener('mousemove', function(e) {
        const orbs = document.querySelectorAll('.bg-gradient-orb');
        const x = e.clientX / window.innerWidth;
        const y = e.clientY / window.innerHeight;

        orbs.forEach((orb, index) => {
            const speed = (index + 1) * 20;
            const xOffset = (x - 0.5) * speed;
            const yOffset = (y - 0.5) * speed;

            orb.style.transform = `translate(${xOffset}px, ${yOffset}px)`;
        });
    });

    // ============================================
    // Demo tab switching
    // ============================================

    const demoTabs = document.querySelectorAll('.demo-tab');
    demoTabs.forEach(tab => {
        tab.addEventListener('click', function() {
            // Remove active class from all tabs
            demoTabs.forEach(t => t.classList.remove('active'));

            // Add active class to clicked tab
            this.classList.add('active');
        });
    });

    // ============================================
    // Copy code button functionality
    // ============================================

    const copyBtns = document.querySelectorAll('.copy-btn');
    copyBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const codeBlock = this.closest('.code-block');
            const code = codeBlock.querySelector('code');

            if (code) {
                navigator.clipboard.writeText(code.textContent).then(function() {
                    btn.textContent = '已复制!';

                    setTimeout(function() {
                        btn.textContent = '复制';
                    }, 2000);
                });
            }
        });
    });

    // ============================================
    // Download button hover effect
    // ============================================

    const downloadBtns = document.querySelectorAll('.download-btn');
    downloadBtns.forEach(btn => {
        btn.addEventListener('mouseenter', function() {
            downloadBtns.forEach(b => {
                if (b !== this) {
                    b.style.opacity = '0.5';
                }
            });
        });

        btn.addEventListener('mouseleave', function() {
            downloadBtns.forEach(b => {
                b.style.opacity = '1';
            });
        });
    });

    // ============================================
    // Platform card 3D effect
    // ============================================

    const platformCards = document.querySelectorAll('.platform-card');
    platformCards.forEach(card => {
        card.addEventListener('mousemove', function(e) {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const rotateX = (y - centerY) / 10;
            const rotateY = (centerX - x) / 10;

            card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-8px)`;
        });

        card.addEventListener('mouseleave', function() {
            card.style.transform = '';
        });
    });

    // ============================================
    // Performance optimization: Reduce motion
    // ============================================

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    if (prefersReducedMotion.matches) {
        // Disable animations for users who prefer reduced motion
        document.documentElement.style.setProperty('--transition-fast', '0ms');
        document.documentElement.style.setProperty('--transition-base', '0ms');
        document.documentElement.style.setProperty('--transition-slow', '0ms');

        // Cancel ongoing animations
        const orbs = document.querySelectorAll('.bg-gradient-orb');
        orbs.forEach(orb => {
            orb.style.animation = 'none';
        });
    }

    // ============================================
    // Lazy loading for better performance
    // ============================================

    if ('IntersectionObserver' in window) {
        const imageObserver = new IntersectionObserver(function(entries) {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    if (img.dataset.src) {
                        img.src = img.dataset.src;
                        img.removeAttribute('data-src');
                    }
                    imageObserver.unobserve(img);
                }
            });
        });

        document.querySelectorAll('img[data-src]').forEach(img => {
            imageObserver.observe(img);
        });
    }

    // ============================================
    // Easter egg: Konami code
    // ============================================

    const konamiCode = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
    let konamiIndex = 0;

    document.addEventListener('keydown', function(e) {
        if (e.key === konamiCode[konamiIndex]) {
            konamiIndex++;

            if (konamiIndex === konamiCode.length) {
                // Activate easter egg
                document.body.style.filter = 'hue-rotate(180deg)';
                setTimeout(function() {
                    document.body.style.filter = '';
                }, 3000);

                konamiIndex = 0;
            }
        } else {
            konamiIndex = 0;
        }
    });

    // ============================================
    // Initialize: Add ready class
    // ============================================

    document.documentElement.classList.add('ready');

});

// ============================================
// Service Worker for offline support (optional)
// ============================================

if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        // Uncomment to enable service worker
        // navigator.serviceWorker.register('/sw.js')
        //     .then(reg => console.log('Service Worker registered'))
        //     .catch(err => console.log('Service Worker registration failed'));
    });
}
