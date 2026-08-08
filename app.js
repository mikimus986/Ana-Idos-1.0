// ===============================
// ANA IDOS - app.js
// ===============================

const fromInput = document.getElementById("from");
const toInput = document.getElementById("to");
const timeInput = document.getElementById("time");
const searchButton = document.getElementById("searchButton");
const swapButton = document.getElementById("swapButton");
const resultsContainer = document.getElementById("results");

// ===============================
// Aktuální čas
// ===============================

window.addEventListener("load", () => {

    if (timeInput) {

        const now = new Date();

        const hours = String(now.getHours()).padStart(2, "0");
        const minutes = String(now.getMinutes()).padStart(2, "0");

        timeInput.value = `${hours}:${minutes}`;

    }

});

// ===============================
// Prohození zastávek
// ===============================

if (swapButton) {

    swapButton.addEventListener("click", () => {

        const oldFrom = fromInput.value;

        fromInput.value = toInput.value;
        toInput.value = oldFrom;

    });

}

// ===============================
// Tlačítko vyhledávání
// ===============================

if (searchButton) {

    searchButton.addEventListener("click", search);

}

// ===============================
// Enter = vyhledat
// ===============================

[fromInput, toInput, timeInput].forEach(input => {

    if (!input) return;

    input.addEventListener("keydown", event => {

        if (event.key === "Enter") {

            event.preventDefault();

            search();

        }

    });

});

// ===============================
// Vyhledávání
// ===============================

function search() {

    const from = fromInput.value.trim();
    const to = toInput.value.trim();
    const time = timeInput.value;

    if (!from) {

        showMessage("Zadej výchozí zastávku.");

        return;

    }

    if (!to) {

        showMessage("Zadej cílovou zastávku.");

        return;

    }

    if (from === to) {

        showMessage(
            "Výchozí a cílová zastávka musí být rozdílné."
        );

        return;

    }

    if (!time) {

        showMessage("Zadej čas.");

        return;

    }

    if (typeof findConnections !== "function") {

        showMessage("Vyhledávač spojů není načten.");

        console.error(
            "V search.js chybí funkce findConnections()."
        );

        return;

    }

    let results = [];

    // ===============================
    // Přímé spoje
    // ===============================

    const directConnections =
        findConnections(from, to, time);

    results.push(...directConnections);

    // ===============================
    // Spoje s přestupem
    // ===============================

    if (typeof findTransferConnections === "function") {

        const transferConnections =
            findTransferConnections(from, to, time);

        results.push(...transferConnections);

    }

    // ===============================
    // Odstranění duplicit
    // ===============================

    results = removeDuplicates(results);

    // ===============================
    // Seřazení podle odjezdu
    // ===============================

    results.sort((a, b) => {

        return getDepartureMinutes(a)
            - getDepartureMinutes(b);

    });

    displayResults(results, from, to);

}

// ===============================
// Čas odjezdu výsledku
// ===============================

function getDepartureMinutes(connection) {

    if (connection.transfer && connection.first) {

        return timeToMinutes(
            connection.first.departure
        );

    }

    return timeToMinutes(
        connection.departure
    );

}

// ===============================
// Odstranění duplicit
// ===============================

function removeDuplicates(results) {

    const unique = [];
    const keys = new Set();

    results.forEach(connection => {

        let key;

        if (connection.transfer) {

            key =
                "transfer|" +
                connection.first.line + "|" +
                connection.first.departure + "|" +
                connection.stop + "|" +
                connection.second.line + "|" +
                connection.second.departure;

        } else {

            key =
                "direct|" +
                connection.line + "|" +
                connection.departure + "|" +
                connection.arrival;

        }

        if (!keys.has(key)) {

            keys.add(key);

            unique.push(connection);

        }

    });

    return unique;

}

// ===============================
// Informace o lince z routes.json
// ===============================

function getRouteInfo(line) {

    if (
        typeof allRoutes === "undefined" ||
        !Array.isArray(allRoutes)
    ) {

        return null;

    }

    return allRoutes.find(route =>
        String(route.line) === String(line)
    );

}

// ===============================
// Zobrazení zprávy
// ===============================

function showMessage(message) {

    if (!resultsContainer) return;

    resultsContainer.innerHTML = `

        <div class="resultCard">

            <h2>${escapeHTML(message)}</h2>

        </div>

    `;

}

// ===============================
// Zobrazení výsledků
// ===============================

function displayResults(results, from, to) {

    if (!resultsContainer) return;

    resultsContainer.innerHTML = "";

    if (!results || results.length === 0) {

        showMessage(
            "Od zadaného času nebylo nalezeno žádné spojení."
        );

        return;

    }

    results.forEach(connection => {

        const card = document.createElement("div");

        card.className = "resultCard";

        if (connection.transfer) {

            card.innerHTML =
                createTransferHTML(
                    connection,
                    from,
                    to
                );

        } else {

            card.innerHTML =
                createDirectHTML(
                    connection,
                    from,
                    to
                );

        }

        resultsContainer.appendChild(card);

    });

}

// ===============================
// Přímý spoj
// ===============================

function createDirectHTML(connection, from, to) {

    const route = getRouteInfo(connection.line);

    const icon =
        route?.icon || "❓";

    const color =
        route?.color || "#777";

    const line =
        escapeHTML(connection.line);

    const direction =
        escapeHTML(connection.direction || "");

    const departure =
        escapeHTML(connection.departure);

    const arrival =
        escapeHTML(connection.arrival);

    return `

        <div class="departureTime">

            ${departure}

        </div>

        <div class="lineRow">

            <span
                class="lineBadge"
                style="background-color:${color};"
            >

                ${icon}

                <strong>
                    ${line}
                </strong>

            </span>

            <span class="direction">

                ${direction}

            </span>

        </div>

        <div class="times">

            <div>

                <strong>Odjezd</strong><br>

                ${escapeHTML(from)}<br>

                ${departure}

            </div>

            <div>

                <strong>Příjezd</strong><br>

                ${escapeHTML(to)}<br>

                ${arrival}

            </div>

        </div>

    `;

}

// ===============================
// Spoj s přestupem
// ===============================

function createTransferHTML(connection, from, to) {

    const first = connection.first;
    const second = connection.second;

    const firstRoute =
        getRouteInfo(first.line);

    const secondRoute =
        getRouteInfo(second.line);

    const firstIcon =
        firstRoute?.icon || "❓";

    const secondIcon =
        secondRoute?.icon || "❓";

    const firstColor =
        firstRoute?.color || "#777";

    const secondColor =
        secondRoute?.color || "#777";

    return `

        <div class="departureTime">

            ${escapeHTML(first.departure)}

        </div>

        <!-- PRVNÍ LINKA -->

        <div class="lineRow">

            <span
                class="lineBadge"
                style="background-color:${firstColor};"
            >

                ${firstIcon}

                <strong>
                    ${escapeHTML(first.line)}
                </strong>

            </span>

            <span class="direction">

                ${escapeHTML(first.direction || "")}

            </span>

        </div>

        <div class="times">

            <div>

                <strong>Odjezd</strong><br>

                ${escapeHTML(from)}<br>

                ${escapeHTML(first.departure)}

            </div>

            <div>

                <strong>Příjezd</strong><br>

                ${escapeHTML(connection.stop)}<br>

                ${escapeHTML(first.arrival)}

            </div>

        </div>

        <!-- PŘESTUP -->

        <div class="transfer">

            Přestup na

            <strong>
                ${escapeHTML(second.line)}
            </strong>

            ${secondIcon}

        </div>

        <!-- DRUHÁ LINKA -->

        <div class="lineRow">

            <span
                class="lineBadge"
                style="background-color:${secondColor};"
            >

                ${secondIcon}

                <strong>
                    ${escapeHTML(second.line)}
                </strong>

            </span>

            <span class="direction">

                ${escapeHTML(second.direction || "")}

            </span>

        </div>

        <div class="times">

            <div>

                <strong>Odjezd</strong><br>

                ${escapeHTML(connection.stop)}<br>

                ${escapeHTML(second.departure)}

            </div>

            <div>

                <strong>Příjezd</strong><br>

                ${escapeHTML(to)}<br>

                ${escapeHTML(second.arrival)}

            </div>

        </div>

    `;

}

// ===============================
// Ochrana textu
// ===============================

function escapeHTML(value) {

    if (value === undefined || value === null) {

        return "";

    }

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

}
