const filterButtons = document.querySelectorAll(".filter-btn");
const bookCards = document.querySelectorAll(".book-card");

filterButtons.forEach(button => {
    button.addEventListener("click", () => {
        const filter = button.dataset.filter;

        bookCards.forEach(card => {
            const genres = card.dataset.genre.split(" ");

            if (filter === "all" || genres.includes(filter)) {
                card.style.display = "block";
            } else {
                card.style.display = "none";
            }
        });
    });
});

