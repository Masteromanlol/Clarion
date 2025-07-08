/**
 * script.js for Clarion Website
 *
 * This script adds two main functionalities to the website:
 * 1. Smooth Scrolling: When a user clicks an anchor link (e.g., <a href="#ask">),
 * the page will smoothly scroll to that section instead of jumping instantly.
 * 2. Fade-in Animations on Scroll: Elements with the class ".fade-in" will
 * start as invisible and transparent and will smoothly fade into view as the
 * user scrolls them onto the screen. This is achieved using the
 * Intersection Observer API for good performance.
 */

// Wait for the entire HTML document to be loaded and parsed before running the script.
document.addEventListener('DOMContentLoaded', function() {

    // --- SMOOTH SCROLLING LOGIC ---
    // Select all anchor links that start with a '#'
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            // Prevent the default jump-link behavior
            e.preventDefault();

            // Find the target element using the href attribute
            const targetElement = document.querySelector(this.getAttribute('href'));

            // If the target element exists, scroll to it smoothly
            if (targetElement) {
                targetElement.scrollIntoView({
                    behavior: 'smooth'
                });
            }
        });
    });

    // --- FADE-IN ANIMATION LOGIC ---
    // Select all elements that have the ".fade-in" class
    const faders = document.querySelectorAll('.fade-in');

    // Set up the options for the Intersection Observer
    const appearOptions = {
        threshold: 0.2, // Trigger the animation when 20% of the element is visible
        rootMargin: "0px 0px -50px 0px" // Start the animation a little before it's fully in view
    };

    // Create a new Intersection Observer
    const appearOnScroll = new IntersectionObserver(function(
        entries,
        appearOnScroll
    ) {
        entries.forEach(entry => {
            // If the element is not intersecting (not on screen), do nothing.
            if (!entry.isIntersecting) {
                return;
            } else {
                // If the element is on screen, add the 'visible' class to it.
                // The 'visible' class in style.css contains the CSS for the fade-in effect.
                entry.target.classList.add('visible');
                // Stop observing the element once it has become visible so the animation doesn't repeat.
                appearOnScroll.unobserve(entry.target);
            }
        });
    },
    appearOptions);

    // Loop through all the fader elements and make the observer watch them.
    faders.forEach(fader => {
        appearOnScroll.observe(fader);
    });

});
