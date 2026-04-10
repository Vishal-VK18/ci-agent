function showPage(pageId) {
    console.log("Switching to:", pageId);

    // Remove active from pages
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });

    // Show selected page
    const selectedPage = document.getElementById(pageId);
    if (selectedPage) {
        selectedPage.classList.add('active');
    } else {
        console.error("Page not found:", pageId);
    }

    // Fix sidebar active state
    document.querySelectorAll('.sidebar-item').forEach(item => {
        item.classList.remove('active');
    });

    const activeNav = document.querySelector('[data-page="' + pageId + '"]');
    if (activeNav) {
        activeNav.classList.add('active');
    }
}

window.onload = function () {
    showPage("dashboardPage");
};
