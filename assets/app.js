const mobileToggle = document.querySelector("[data-mobile-toggle]");
const navLinks = document.querySelector("[data-nav-links]");

if (mobileToggle && navLinks) {
  mobileToggle.addEventListener("click", () => {
    const isOpen = navLinks.classList.toggle("open");
    mobileToggle.setAttribute("aria-expanded", String(isOpen));
  });

  navLinks.addEventListener("click", (event) => {
    if (event.target.closest("a")) {
      navLinks.classList.remove("open");
      mobileToggle.setAttribute("aria-expanded", "false");
    }
  });
}

const revealItems = document.querySelectorAll(".reveal");

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.16 }
  );

  revealItems.forEach((item) => observer.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("visible"));
}

const filterButtons = document.querySelectorAll("[data-project-filter]");
const projectCards = document.querySelectorAll("[data-project-category]");

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const filter = button.dataset.projectFilter;

    filterButtons.forEach((item) => {
      item.setAttribute("aria-pressed", String(item === button));
    });

    projectCards.forEach((card) => {
      const categories = card.dataset.projectCategory.split(" ");
      const shouldShow = filter === "all" || categories.includes(filter);
      card.classList.toggle("hidden", !shouldShow);
    });
  });
});

const contactForm = document.querySelector("[data-contact-form]");

if (contactForm) {
  contactForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const formData = new FormData(contactForm);
    const name = String(formData.get("name") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const message = String(formData.get("message") || "").trim();
    const status = contactForm.querySelector("[data-form-status]");

    if (!name || !email || !message) {
      status.textContent = "Vul je naam, e-mail en korte vraag in.";
      status.classList.remove("hidden");
      status.style.color = "#991b1b";
      status.style.background = "#fee2e2";
      return;
    }

    const subject = encodeURIComponent(`AVDLData vraag van ${name}`);
    const body = encodeURIComponent(`${message}\n\nNaam: ${name}\nE-mail: ${email}`);
    window.location.href = `mailto:arjanvdlaanzakelijk@gmail.com?subject=${subject}&body=${body}`;

    status.textContent = "Je e-mailprogramma wordt geopend met je vraag klaar om te versturen.";
    status.classList.remove("hidden");
    status.style.color = "#166534";
    status.style.background = "#dcfce7";
  });
}

if (window.lucide) {
  window.lucide.createIcons({
    attrs: {
      "stroke-width": 1.8,
    },
  });
}
