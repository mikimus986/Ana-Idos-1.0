// ===============================
// ANA IDOS - app.js
// ===============================

const fromInput = document.getElementById("from");
const toInput = document.getElementById("to");
const dateInput = document.getElementById("date");
const timeInput = document.getElementById("time");
const searchButton = document.getElementById("searchButton");
const swapButton = document.getElementById("swapButton");
const resultsContainer = document.getElementById("results");

// ===============================
// Aktuální datum a čas
// ===============================

window.addEventListener("load", () => {

    const now = new Date();

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    dateInput.value = `${year}-${month}-${day}`;

    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");

    timeInput.value = `${hours}:${minutes}`;

});

// ===============================
// Prohození zastávek
// ===============================

swapButton.addEventListener("click", () => {

    const oldFrom = fromInput.value;

    fromInput.value = toInput.value;
    toInput.value = oldFrom;

});

// ===============================
// Vyhledávání
// ===============================

searchButton.addEventListener("click", search);

// Enter ve formuláři
[fromInput, toInput, timeInput].forEach(input => {

    input.addEventListener("keydown", event => {

        if (event.key === "Enter") {
            search();
        }

    });

});

// ===============================
// Hlavní vyhledávání
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

        showMessage("Výchozí a cílová zastávka musí být rozdílné.");

        return;

    }

    if (!time) {

        showMessage("Zadej čas.");

        return;

    }

    if (typeof findTransferConnections !== "function") {

        showMessage("Vyhledávač ještě není načten.");

        console.error(
            "Funkce findTransferConnections() nebyla nalezena."
        );

        return;

    }

    const connections =
        findTransferConnections(from, to, time);

    displayResults(connections, from, to);

}

// ===============================
// Zobrazení zprávy
// ===============================

function showMessage(message) {

    resultsContainer.innerHTML = `
        <div class="resultCard">
            <h2>${message}</h2>
        </div>
    `;

}

// ===============================
// Zobrazení výsledků
// ===============================

function displayResults(results, from, to) {

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

        // Přímý spoj
        if (!connection.transfer) {

            const routeInfo =
                getRouteInfo(connection.line);

            const icon =
                routeInfo?.icon || "";

            const color =
                routeInfo?.color || "#777";

            card.innerHTML = `

                <div class="departureTime">
                    ${connection.departure}
                </div>

                <div class="lineRow">

                    <span
                        class="lineBadge"
                        style="background:${color};">

                        ${icon}
                        ${connection.line}

                    </span>

                    <span class="direction">
                        ${connection.direction || ""}
                    </span>

                </div>

                <div class="times">

                    <div>

                        <strong>Odjezd</strong><br>

                        ${from}<br>

                        ${connection.departure}

                    </div>

                    <div>

                        <strong>Příjezd</strong><br>

                        ${to}<br>

                        ${connection.arrival}

                    </div>

                </div>

            `;

        }

        // Spoj s přestupem
        else {

            card.innerHTML =
                createTransferHTML(connection, from, to);

        }

        resultsContainer.appendChild(card);

    });

}

// ===============================
// Informace o lince z routes.json
// ===============================

function getRouteInfo(line) {

    if (typeof allRoutes === "undefined") {
        return null;
    }

    return allRoutes.find(route =>
        String(route.line) === String(line)
    );

}

// ===============================
// HTML pro přestup
// ===============================

function createTransferHTML(connection, from, to) {

    const first = connection.first;
    const second = connection.second;

    const firstRoute =
        getRouteInfo(first.line);

    const secondRoute =
        getRouteInfo(second.line);

    const firstIcon =
        firstRoute?.icon || "";

    const secondIcon =
        secondRoute?.icon || "";

    const firstColor =
        firstRoute?.color || "#777";

    const secondColor =
        secondRoute?.color || "#777";

    return `

        <div class="departureTime">
            ${first.departure}
        </div>

        <div class="lineRow">

            <span
                class="lineBadge"
                style="background:${firstColor};">

                ${firstIcon}
                ${first.line}

            </span>

            <span class="direction">
                ${first.direction || ""}
            </span>

        </div>

        <div class="times">

            <div>

                <strong>Odjezd</strong><br>

                ${from}<br>

                ${first.departure}

            </div>

            <div>

                <strong>Příjezd</strong><br>

                ${connection.stop}<br>

                ${first.arrival}

            </div>

        </div>

        <div class="transfer">

            Přestup na
            <strong>${second.line}</strong>
            ${secondIcon}

        </div>

        <div class="lineRow">

            <span
                class="lineBadge"
                style="background:${secondColor};">

                ${secondIcon}
                ${second.line}

            </span>

            <span class="direction">
                ${second.direction || ""}
            </span>

        </div>

        <div class="times">

            <div>

                <strong>Odjezd</strong><br>

                ${connection.stop}<br>

                ${second.departure}

            </div>

            <div>

                <strong>Příjezd</strong><br>

                ${to}<br>

                ${second.arrival}

            </div>

        </div>

    `;

}
