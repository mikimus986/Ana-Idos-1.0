document.addEventListener("DOMContentLoaded", async () => {

    const fromInput = document.getElementById("from");
    const toInput = document.getElementById("to");
    const dateInput = document.getElementById("date");
    const timeInput = document.getElementById("time");
    const searchButton = document.getElementById("searchButton");
    const swapButton = document.getElementById("swapButton");
    const resultsContainer = document.getElementById("results");
    const stopsList = document.getElementById("stops");

    // =====================================================
    // KONTROLA
    // =====================================================

    if (
        !fromInput ||
        !toInput ||
        !searchButton ||
        !resultsContainer
    ) {
        console.error("Chybí HTML prvky pro vyhledávání.");
        return;
    }

    if (!window.searchTimetable) {
        console.error("search.js nebyl načten.");
        resultsContainer.innerHTML = `
            <div class="resultCard errorCard">
                <strong>Chyba:</strong>
                search.js nebyl načten.
            </div>
        `;
        return;
    }

    // =====================================================
    // ROUTES
    // =====================================================

    let routes = [];

    try {

        const response =
            await fetch("data/routes.json");

        if (!response.ok) {
            throw new Error(
                `routes.json HTTP ${response.status}`
            );
        }

        routes = await response.json();

        console.log("Načtené linky:", routes);

    } catch (error) {

        console.error(
            "Nepodařilo se načíst routes.json:",
            error
        );

        resultsContainer.innerHTML = `
            <div class="resultCard errorCard">
                <strong>Nepodařilo se načíst linky.</strong>
                <p>${error.message}</p>
            </div>
        `;

        return;
    }

    // =====================================================
    // INFORMACE O LINCE
    // =====================================================

    function getRouteInfo(line) {

        const route =
            routes.find(
                item =>
                    String(item.line).trim() ===
                    String(line).trim()
            );

        if (route) {
            return route;
        }

        return {
            line: String(line),
            type: "bus",
            icon: "🚌",
            color: "#2196F3"
        };
    }

    // =====================================================
    // NAČTENÍ VŠECH ZASTÁVEK
    // =====================================================

    async function loadAllStops() {

        if (!stopsList) {
            return;
        }

        const stops =
            new Set();

        for (const route of routes) {

            try {

                const timetable =
                    await window.searchTimetable.loadTimetable(
                        route.line
                    );

                if (
                    !timetable ||
                    !Array.isArray(timetable.directions)
                ) {
                    continue;
                }

                for (
                    const direction
                    of timetable.directions
                ) {

                    if (
                        !Array.isArray(direction.stops)
                    ) {
                        continue;
                    }

                    for (
                        const stop
                        of direction.stops
                    ) {

                        if (stop) {
                            stops.add(
                                String(stop)
                            );
                        }
                    }
                }

            } catch (error) {

                console.warn(
                    `Nelze načíst zastávky linky ${route.line}`,
                    error
                );
            }
        }

        stopsList.innerHTML = "";

        [...stops]
            .sort((a, b) =>
                a.localeCompare(b, "cs")
            )
            .forEach(stop => {

                const option =
                    document.createElement("option");

                option.value = stop;

                stopsList.appendChild(option);
            });

        console.log(
            `Načteno zastávek: ${stops.size}`
        );
    }

    await loadAllStops();

    // =====================================================
    // PROHOZENÍ ZASTÁVEK
    // =====================================================

    if (swapButton) {

        swapButton.addEventListener(
            "click",
            () => {

                const oldFrom =
                    fromInput.value;

                fromInput.value =
                    toInput.value;

                toInput.value =
                    oldFrom;
            }
        );
    }

    // =====================================================
    // DNEŠNÍ DATUM
    // =====================================================

    if (dateInput && !dateInput.value) {

        const today =
            new Date();

        const year =
            today.getFullYear();

        const month =
            String(
                today.getMonth() + 1
            ).padStart(2, "0");

        const day =
            String(
                today.getDate()
            ).padStart(2, "0");

        dateInput.value =
            `${year}-${month}-${day}`;
    }

    // =====================================================
    // VÝCHOZÍ ČAS
    // =====================================================

    if (timeInput && !timeInput.value) {

        const now =
            new Date();

        const hours =
            String(
                now.getHours()
            ).padStart(2, "0");

        const minutes =
            String(
                now.getMinutes()
            ).padStart(2, "0");

        timeInput.value =
            `${hours}:${minutes}`;
    }

    // =====================================================
    // TYP DNE
    // =====================================================

    function getDayType() {

        if (
            !dateInput ||
            !dateInput.value
        ) {

            const day =
                new Date().getDay();

            return (
                day === 0 ||
                day === 6
            )
                ? "weekends"
                : "weekdays";
        }

        const date =
            new Date(
                dateInput.value +
                "T12:00:00"
            );

        const day =
            date.getDay();

        return (
            day === 0 ||
            day === 6
        )
            ? "weekends"
            : "weekdays";
    }

    // =====================================================
    // VYTVOŘENÍ KARTY SPOJE
    // =====================================================

    function createResult(connection) {

        const route =
            getRouteInfo(
                connection.line
            );

        const card =
            document.createElement("div");

        card.className =
            "resultCard";

        card.style.borderLeft =
            `7px solid ${route.color}`;

        // =================================================
        // MODRÝ / BAREVNÝ PRUH
        // =================================================

        const header =
            document.createElement("div");

        header.className =
            "resultHeader";

        header.style.backgroundColor =
            route.color;

        const shortLabel =
            connection.isShortTrip
                ? " S"
                : "";

        header.innerHTML = `
            <span class="routeIcon">
                ${route.icon}
            </span>

            <span class="routeNumber">
                ${route.line}${shortLabel}
            </span>

            <span class="routeDirection">
                Směr: ${connection.destination || ""}
            </span>
        `;

        card.appendChild(header);

        // =================================================
        // ČASY
        // =================================================

        const main =
            document.createElement("div");

        main.className =
            "resultMain";

        main.innerHTML = `
            <div class="mainStop">

                <div class="mainTime">
                    ${connection.departure}
                </div>

                <div class="mainStopName">
                    ${connection.from}
                </div>

            </div>

            <div class="routeArrow">
                →
            </div>

            <div class="mainStop">

                <div class="mainTime">
                    ${connection.arrival}
                </div>

                <div class="mainStopName">
                    ${connection.to}
                </div>

            </div>
        `;

        card.appendChild(main);

        // =================================================
        // ZASTÁVKY
        // =================================================

        const stopsBox =
            document.createElement("div");

        stopsBox.className =
            "resultStops";

        const connectionStops =
            Array.isArray(connection.stops)
                ? connection.stops
                : [];

        if (connectionStops.length > 0) {

            for (
                const stop
                of connectionStops
            ) {

                const row =
                    document.createElement("div");

                row.className =
                    "stopRow";

                const dot =
                    document.createElement("span");

                dot.className =
                    "stopDot";

                dot.style.backgroundColor =
                    route.color;

                const name =
                    document.createElement("span");

                name.className =
                    "stopName";

                name.textContent =
                    stop.name;

                const time =
                    document.createElement("span");

                time.className =
                    "stopTime";

                time.textContent =
                    stop.time;

                row.appendChild(dot);
                row.appendChild(name);
                row.appendChild(time);

                stopsBox.appendChild(row);
            }
        }

        stopsBox.style.display =
            "none";

        card.appendChild(stopsBox);

        // =================================================
        // TLAČÍTKO ZASTÁVEK
        // =================================================

        const toggle =
            document.createElement("button");

        toggle.type =
            "button";

        toggle.className =
            "stopsToggle";

        toggle.textContent =
            "Zobrazit zastávky ▼";

        toggle.addEventListener(
            "click",
            () => {

                const hidden =
                    stopsBox.style.display ===
                    "none";

                if (hidden) {

                    stopsBox.style.display =
                        "block";

                    toggle.textContent =
                        "Skrýt zastávky ▲";

                } else {

                    stopsBox.style.display =
                        "none";

                    toggle.textContent =
                        "Zobrazit zastávky ▼";
                }
            }
        );

        card.appendChild(toggle);

        return card;
    }

    // =====================================================
    // VYHLEDÁVÁNÍ
    // =====================================================

    searchButton.addEventListener(
        "click",
        async event => {

            event.preventDefault();

            const from =
                fromInput.value.trim();

            const to =
                toInput.value.trim();

            const afterTime =
                timeInput &&
                timeInput.value
                    ? timeInput.value
                    : "00:00";

            // =============================================
            // KONTROLA
            // =============================================

            if (!from || !to) {

                resultsContainer.innerHTML = `
                    <div class="resultCard messageCard">
                        <strong>
                            Vyberte výchozí a cílovou zastávku.
                        </strong>
                    </div>
                `;

                return;
            }

            if (
                from.toLowerCase() ===
                to.toLowerCase()
            ) {

                resultsContainer.innerHTML = `
                    <div class="resultCard messageCard">
                        Výchozí a cílová zastávka
                        musí být rozdílné.
                    </div>
                `;

                return;
            }

            // =============================================
            // NAČÍTÁNÍ
            // =============================================

            resultsContainer.innerHTML = `
                <div class="searchLoading">
                    <span class="loadingSpinner"></span>
                    <span>Vyhledávám spojení…</span>
                </div>
            `;

            try {

                const dayType =
                    getDayType();

                const lineNumbers =
                    routes.map(
                        route =>
                            String(route.line)
                    );

                // =========================================
                // VYHLEDÁNÍ
                // =========================================

                const connections =
                    await window.searchTimetable.findConnections(
                        from,
                        to,
                        afterTime,
                        dayType,
                        lineNumbers
                    );

                resultsContainer.innerHTML = "";

                // =========================================
                // ŽÁDNÉ SPOJENÍ
                // =========================================

                if (
                    !Array.isArray(connections) ||
                    connections.length === 0
                ) {

                    resultsContainer.innerHTML = `
                        <div class="resultCard messageCard">

                            <strong>
                                Žádné spojení nebylo nalezeno.
                            </strong>

                            <p>
                                ${from}
                                →
                                ${to}
                            </p>

                        </div>
                    `;

                    return;
                }

                // =========================================
                // VÝSLEDKY
                // =========================================

                for (
                    const connection
                    of connections
                ) {

                    resultsContainer.appendChild(
                        createResult(
                            connection
                        )
                    );
                }

            } catch (error) {

                console.error(
                    "CHYBA VYHLEDÁVÁNÍ:",
                    error
                );

                resultsContainer.innerHTML = `
                    <div class="resultCard errorCard">

                        <strong>
                            Chyba při vyhledávání.
                        </strong>

                        <p>
                            ${error.message}
                        </p>

                    </div>
                `;
            }
        }
    );
});
