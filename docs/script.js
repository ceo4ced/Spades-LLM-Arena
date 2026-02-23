// ===== Scroll Spy =====
const navLinks = document.querySelectorAll('.nav-link[data-section]');
const sections = [];

navLinks.forEach(link => {
    const id = link.getAttribute('data-section');
    const section = document.getElementById(id);
    if (section) sections.push({ id, el: section, link });
});

function updateActiveNav() {
    const scrollY = window.scrollY + 120;

    let current = sections[0];
    for (const s of sections) {
        if (s.el.offsetTop <= scrollY) {
            current = s;
        }
    }

    navLinks.forEach(l => l.classList.remove('active'));
    if (current) current.link.classList.add('active');
}

window.addEventListener('scroll', updateActiveNav, { passive: true });
updateActiveNav();

// ===== Smooth Scroll for Nav Links =====
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const targetId = this.getAttribute('href').substring(1);
        const target = document.getElementById(targetId);
        if (target) {
            e.preventDefault();
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });

            // Close mobile sidebar
            document.getElementById('sidebar').classList.remove('open');
        }
    });
});

// ===== Mobile Menu Toggle =====
const menuToggle = document.getElementById('menu-toggle');
const sidebar = document.getElementById('sidebar');

menuToggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
});

// Close sidebar when clicking outside on mobile
document.getElementById('content').addEventListener('click', () => {
    sidebar.classList.remove('open');
});

// ===== Animated Counter for Hero Stats =====
function animateCounters() {
    const statValues = document.querySelectorAll('.stat-value');
    statValues.forEach(el => {
        const text = el.textContent;
        if (/^\d+$/.test(text)) {
            const target = parseInt(text);
            let current = 0;
            const increment = Math.max(1, Math.floor(target / 40));
            const timer = setInterval(() => {
                current += increment;
                if (current >= target) {
                    current = target;
                    clearInterval(timer);
                }
                el.textContent = current;
            }, 30);
        }
    });
}

// Run counter animation when hero is visible
const heroObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            animateCounters();
            heroObserver.disconnect();
        }
    });
}, { threshold: 0.3 });

const heroSection = document.getElementById('hero');
if (heroSection) heroObserver.observe(heroSection);

// ===== Fade-in Animation on Scroll =====
const fadeObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, { threshold: 0.1 });

document.querySelectorAll('.info-card, .agent-card, .cred-card, .ui-feature, .stream-step, .step').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    fadeObserver.observe(el);
});
