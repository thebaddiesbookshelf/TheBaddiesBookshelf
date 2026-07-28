document.addEventListener("DOMContentLoaded", () => {
    const searchInput = document.getElementById("book-search");
    const filterButtons = document.querySelectorAll(".filter-btn");
    const bookCards = document.querySelectorAll(".book-card");

    if (!searchInput || !filterButtons.length || !bookCards.length) {
        return;
    }

    let activeFilter =
        localStorage.getItem("tbbLibraryFilter") || "all";

    function updateActiveButton() {
        filterButtons.forEach((button) => {
            const isActive =
                button.dataset.filter === activeFilter;

            button.classList.toggle("active", isActive);
        });
    }

    function filterBooks() {
        const searchTerm = searchInput.value
            .toLowerCase()
            .trim();

        bookCards.forEach((card) => {
            const title =
                card.querySelector(".book-info h3")
                    ?.textContent.toLowerCase() || "";

            const author =
                card.querySelector(".book-author")
                    ?.textContent.toLowerCase() || "";

            const series =
                card.querySelector(".book-series")
                    ?.textContent.toLowerCase() || "";

            const genres = (
                card.dataset.genre || ""
            )
                .toLowerCase()
                .split(/\s+/)
                .filter(Boolean);

            const matchesGenre =
                activeFilter === "all" ||
                genres.includes(activeFilter);

            const matchesSearch =
                searchTerm === "" ||
                title.includes(searchTerm) ||
                author.includes(searchTerm) ||
                series.includes(searchTerm);

            card.style.display =
                matchesGenre && matchesSearch
                    ? ""
                    : "none";
        });
    }

    filterButtons.forEach((button) => {
        button.addEventListener("click", () => {
            activeFilter =
                button.dataset.filter || "all";

            localStorage.setItem(
                "tbbLibraryFilter",
                activeFilter
            );

            updateActiveButton();
            filterBooks();
        });
    });

    searchInput.addEventListener("input", filterBooks);

    searchInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            filterBooks();
        }
    });

    updateActiveButton();
    filterBooks();
});