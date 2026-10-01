document.addEventListener("DOMContentLoaded", () => {
    const searchInput = document.getElementById("book-search");
    const filterButtons = document.querySelectorAll(".filter-btn");
    let bookCards = [...document.querySelectorAll(".book-card")];
    const groups = new Map();
    const text = (card, selector) => card.querySelector(selector)?.textContent.trim() || "";
    const seriesName = card => text(card, ".book-series").replace(/\s*[•·]\s*Book\s+.*$/i, "").trim();
    bookCards.forEach(card => {
        const name = seriesName(card);
        if (!name) return;
        const key = name.toLowerCase() + "|" + text(card, ".book-author").toLowerCase();
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(card);
    });
    const dialog = document.createElement("dialog");
    dialog.className = "series-dialog";
    dialog.setAttribute("aria-labelledby", "series-dialog-title");
    dialog.innerHTML = '<div class="series-dialog-header"><h2 id="series-dialog-title"></h2><button type="button" class="series-dialog-close" aria-label="Close series">×</button></div><div class="series-dialog-books"></div>';
    document.body.append(dialog);
    const close = () => dialog.close();
    dialog.querySelector(".series-dialog-close").addEventListener("click", close);
    dialog.addEventListener("click", event => { if (event.target === dialog) {
        const bounds = dialog.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
    }});
    let previousOverflow = "";
    dialog.addEventListener("close", () => {
        document.body.style.overflow = previousOverflow;
        dialog.querySelector(".series-dialog-books").replaceChildren();
    });
    groups.forEach(members => {
        members.sort((a, b) => {
            const number = card => Number(text(card, ".book-series").match(/Book\s+(\d+(?:\.\d+)?)/i)?.[1] || 0);
            return number(a) - number(b);
        });
        const name = seriesName(members[0]);
        const tile = members[0].cloneNode(true);
        tile.classList.add("series-card");
        const anchor = tile.querySelector(".book-download-wrapper");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "book-download-wrapper series-open";
        button.setAttribute("aria-haspopup", "dialog");
        button.setAttribute("aria-label", `View ${name}, ${members.length} books`);
        button.append(...anchor.childNodes);
        anchor.replaceWith(button);
        tile.querySelector("h3").textContent = name;
        tile.querySelector(".book-series").textContent = `${members.length} ${members.length === 1 ? "book" : "books"} • View series`;
        tile._seriesMembers = members;
        tile.dataset.genre = [...new Set(members.flatMap(card => (card.dataset.genre || "").split(/\s+/)))].join(" ");
        const badges = tile.querySelector(".book-badges");
        if (badges) {
            const seen = new Set();
            badges.replaceChildren();
            members.forEach(card => card.querySelectorAll(".badge").forEach(badge => {
                if (!seen.has(badge.textContent)) { seen.add(badge.textContent); badges.append(badge.cloneNode(true)); }
            }));
        }
        button.addEventListener("click", () => {
            dialog.querySelector("h2").textContent = name;
            dialog.querySelector(".series-dialog-books").replaceChildren(...members.map(card => {
                const copy = card.cloneNode(true);
                copy.style.display = "";
                copy.hidden = false;
                copy.classList.remove("hidden");
                copy.querySelectorAll("img").forEach(img => { img.loading = "lazy"; img.decoding = "async"; });
                return copy;
            }));
            previousOverflow = document.body.style.overflow;
            dialog.showModal();
            document.body.style.overflow = "hidden";
        });
        members[0].before(tile);
        members.forEach(card => card.remove());
    });
    bookCards = [...document.querySelectorAll(".book-card")];
    bookCards.forEach(card => card.querySelectorAll("img").forEach(img => { img.loading = "lazy"; img.decoding = "async"; }));

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
            const matches = (card._seriesMembers || [card]).some(book => {
                const genres = (book.dataset.genre || "").toLowerCase().split(/\s+/);
                const matchesGenre = activeFilter === "all" || genres.includes(activeFilter);
                const matchesSearch = [text(book, ".book-info h3"), text(book, ".book-author"), text(book, ".book-series")]
                    .some(value => value.toLowerCase().includes(searchTerm));
                return matchesGenre && matchesSearch;
            });

            card.style.display =
                matches
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