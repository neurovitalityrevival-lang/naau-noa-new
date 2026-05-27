/* ===================================================
   Na'au Noa BODY detox — Main Script
   =================================================== */

/* ----- Hero slideshow ----- */
(function() {
  const slides = document.querySelectorAll('.hero-slide');
  if (!slides.length) return;
  let current = 0;
  slides[0].classList.add('active');
  setInterval(function() {
    slides[current].classList.remove('active');
    current = (current + 1) % slides.length;
    slides[current].classList.add('active');
  }, 3000);
})();

/* ----- Scroll-driven fade animations ----- */
const animObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        animObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
);

document.querySelectorAll('.fade-in, .fade-up').forEach((el) => {
  animObserver.observe(el);
});

/* Hero elements are already in viewport — trigger after brief delay */
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    document.querySelectorAll('.hero .fade-in').forEach((el) => {
      el.classList.add('visible');
    });
  }, 80);
});

/* ----- Navbar: transparent → solid on scroll ----- */
const nav = document.getElementById('nav');

function updateNav() {
  nav.classList.toggle('scrolled', window.scrollY > 55);
}
window.addEventListener('scroll', updateNav, { passive: true });
updateNav();

/* ----- Mobile hamburger ----- */
const navToggle = document.getElementById('navToggle');
const navMenu   = document.getElementById('navMenu');

navToggle.addEventListener('click', () => {
  const isOpen = navMenu.classList.toggle('open');
  navToggle.classList.toggle('active', isOpen);
  navToggle.setAttribute('aria-expanded', String(isOpen));
  navToggle.setAttribute('aria-label', isOpen ? 'メニューを閉じる' : 'メニューを開く');
});

navMenu.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    navMenu.classList.remove('open');
    navToggle.classList.remove('active');
    navToggle.setAttribute('aria-expanded', 'false');
    navToggle.setAttribute('aria-label', 'メニューを開く');
  });
});

document.addEventListener('click', (e) => {
  if (!nav.contains(e.target) && navMenu.classList.contains('open')) {
    navMenu.classList.remove('open');
    navToggle.classList.remove('active');
  }
});

/* ----- Smooth scroll with nav offset ----- */
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener('click', function (e) {
    const target = document.querySelector(this.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    const top = target.getBoundingClientRect().top + window.scrollY - 68;
    window.scrollTo({ top, behavior: 'smooth' });
  });
});

/* ----- Parallax banner ----- */
const parallaxWrap = document.querySelector('[data-parallax]');
const parallaxImg  = parallaxWrap ? parallaxWrap.querySelector('.parallax-img') : null;

function updateParallax() {
  if (!parallaxImg) return;
  const rect = parallaxWrap.getBoundingClientRect();
  const vh   = window.innerHeight;
  if (rect.bottom < 0 || rect.top > vh) return;
  const progress = (vh - rect.top) / (vh + rect.height); // 0 → 1
  const offset   = (progress - 0.5) * 80;                // ±40px
  parallaxImg.style.transform = `translateY(${offset}px)`;
}

window.addEventListener('scroll', updateParallax, { passive: true });
updateParallax();

/* ----- Floating CTA: appear after 400px, hide near footer ----- */
const floatCta = document.getElementById('floatCta');
const footer   = document.querySelector('.footer');

function updateFloatCta() {
  const scrollY       = window.scrollY;
  const footerTop     = footer
    ? footer.getBoundingClientRect().top + scrollY - window.innerHeight - 80
    : Infinity;
  const shouldShow = scrollY > 400 && scrollY < footerTop;
  floatCta.classList.toggle('show', shouldShow);
}

window.addEventListener('scroll', updateFloatCta, { passive: true });
updateFloatCta();

/* ----- Contact form: Netlify Forms + Meta CAPI parallel submit ----- */
const form = document.querySelector('.contact-form');
if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const data     = new FormData(form);
    const name     = data.get('name')    || '';
    const email    = data.get('email')   || '';
    const phone    = data.get('tel')     || '';
    const message  = data.get('message') || '';

    // Meta CAPI — fire and forget (errors are silent)
    fetch('/.netlify/functions/meta-capi', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, email, phone, message, sourceUrl: window.location.href }),
    }).catch(() => {});

    // Netlify Forms — await so we know it succeeded
    data.append('form-name', 'contact');
    await fetch('/', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams(data).toString(),
    });

    // Success feedback
    const btn  = form.querySelector('.btn-submit');
    const orig = btn.textContent;
    btn.textContent      = '送信しました ✓';
    btn.style.background = '#4a8d9b';
    btn.disabled         = true;
    setTimeout(() => {
      btn.textContent      = orig;
      btn.style.background = '';
      btn.disabled         = false;
      form.reset();
    }, 3500);
  });
}

