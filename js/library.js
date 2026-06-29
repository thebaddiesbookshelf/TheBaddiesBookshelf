/* Full Width Panel Area */
.filter-section {
    background: #ffffff;
    width: 100%;
    padding: 30px 40px;
    border-bottom: 1px solid rgba(186, 139, 161, 0.2);
}

/* Vertical Stack Setup */
.filter-container {
    max-width: 1440px;
    margin: 0 auto;
    display: flex;
    flex-direction: column; /* Organizes everything into separate horizontal rows */
    gap: 20px;
}

/* Search Row Setup */
.search-row {
    width: 100%;
    display: flex;
    justify-content: flex-start;
}

.search-wrapper {
    position: relative;
    width: 100%;
    max-width: 450px; /* Slightly wider for an elegant look */
}

.search-wrapper input {
    width: 100%;
    padding: 12px 20px 12px 45px;
    border: 1px solid #ecc4d6;
    background-color: rgba(255, 245, 249, 0.6);
    border-radius: 25px;
    font-family: 'Poppins', sans-serif;
    font-size: 0.95rem;
    color: #3B2E35;
    outline: none;
    transition: all 0.3s ease;
}

.search-wrapper input:focus {
    background-color: #ffffff;
    border-color: #cb5f93;
    box-shadow: 0 4px 12px rgba(121, 65, 92, 0.08);
}

.search-icon {
    position: absolute;
    left: 18px;
    top: 50%;
    transform: translateY(-50%);
    color: #8c5470;
    font-size: 1rem;
    pointer-events: none;
}

/* Genres Row Setup */
.filter-row {
    display: flex;
    align-items: center;
    gap: 20px;
    flex-wrap: wrap;
    width: 100%;
}