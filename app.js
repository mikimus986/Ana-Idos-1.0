// app.js

document.addEventListener("DOMContentLoaded", async () => {

    const fromInput = document.getElementById("from");
    const toInput = document.getElementById("to");
    const dateInput = document.getElementById("date");
    const timeInput = document.getElementById("time");
    const searchButton = document.getElementById("searchButton");
    const swapButton = document.getElementById("swapButton");
    const resultsContainer = document.getElementById("results");
    const stopsList = document.getElementById("stops");

    if (
        !fromInput ||
        !toInput ||
        !searchButton ||
        !resultsContainer
    ) {
        console.error("Chybí některý HTML prvek.");
        return;
    }

    // ==========================================
    // NAČTENÍ ROUTES.JSON
    // ==========================================

    let routes = [];

    try {
        const response = await fetch("data/routes.json");

        if (!response.ok) {
            throw new Error("Nelze načíst data/routes.json");
        }

        routes = await response.json();

        console.log("Načtené linky:", routes);

    } catch (error) {
        console.error(
            "Chyba při načítání routes.json:",
            error
        );
    }

    // ==========================================
    // NAČTENÍ ZASTÁVEK
    // ==========================================

    async function loadStops() {

        const allStops = new Set();

        for (const route of routes) {

            try {

                const timetable =
                    await window.searchTimetable.loadTimetable(
                        route.line
                    );

                if (!timetable.directions) {
                    continue;
                }

                for (const direction of timetable.directions) {

                    if (!direction.stops) {
                        continue;
                    }

                    for (const stop of direction.stops) {
                        allStops.add(stop);
                    }
                }

            } catch (error) {

                console.warn(
                    `Nepodařilo se načíst linku ${route.line}`,
                    error
                );
            }
        }

        if (stopsList) {

            stopsList.innerHTML = "";

            [...allStops]
                .sort((a, b) =>
                    a.localeCompare(b, "cs")
                )
                .forEach(stop => {

                    const option =
                        document.createElement("option");

                    option.value = stop;

                    stopsList.appendChild(option);
                });
        }
    }

    await loadStops();

    // ==========================================
    // PROHOZENÍ ZASTÁVEK
    // ==========================================

    if (swapButton) {

        swapButton.addEventListener("click", () => {

            const oldFrom =
                fromInput.value;

            fromInput.value =
                toInput.value;

            toInput.value =
                oldFrom;
        });
    }

    // ==========================================
    // VÝCHOZÍ DATUM
    // ==========================================

    if (dateInput && !dateInput.value) {

        const today = new Date();

        const year =
            today.getFullYear();

        const month =
            String(today.getMonth() + 1)
                .padStart(2, "0");

        const day =
            String(today.getDate())
                .padStart(2, "0");

        dateInput.value =
            `${year}-${month}-${day}`;
    }

    // ==========================================
    // TYP DNE
    // ==========================================

    function getDayType() {

        if (!dateInput || !dateInput.value) {

            const today = new Date();

            const day =
                today.getDay();

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

    // ==========================================
    // INFORMACE O LINCE
    // ==========================================

    function getRouteInfo(line) {

        const route =
            routes.find(
                route =>
                    String(route.line) ===
                    String(line)
            );

        if (route) {
            return route;
        }

        return {
            line: line,
            icon: "🚌",
            color: "#2196F3",
            type: "bus"
        };
    }

    // ==========================================
    // VYKRESLENÍ JEDNOHO SPOJE
    // ==========================================

    function createResult(connection) {

        const route =
            getRouteInfo(connection.line);

        const card =
            document.createElement("div");

        card.className =
            "resultCard";

        // Barva levého okraje
        card.style.borderLeft =
            `7px solid ${route.color}`;


        // ======================================
        // HLAVIČKA LINKY
        // ======================================

        const header =
            document.createElement("div");

        header.className =
            "resultHeader";

        header.style.backgroundColor =
            route.color;

        header.innerHTML = `
            <span class="routeIcon">
                ${route.icon}
            </span>

            <strong class="routeNumber">
                ${route.line}
            </strong>

            ${
                connection.isShortTrip
                    ? `<span class="shortTrip">S</span>`
                    : ""
            }
        `;

        card.appendChild(header);


        // ======================================
        // SMĚR
        // ======================================

        const direction =
            document.createElement("div");

        direction.className =
            "routeDirection";

        direction.innerHTML = `
            <strong>Směr:</strong>
            ${connection.destination}
        `;

        card.appendChild(direction);


        // ======================================
        // ODJEZD → PŘÍJEZD
        // ======================================

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


        // ======================================
        // ZASTÁVKY
        // ======================================

        const stopsBox =
            document.createElement("div");

        stopsBox.className =
            "resultStops";

        const fromIndex =
            connection.stops.findIndex(
                stop =>
                    stop.name ===
                    connection.from
            );

        const toIndex =
            connection.stops.findIndex(
                stop =>
                    stop.name ===
                    connection.to
            );

        let first =
            fromIndex >= 0
                ? fromIndex
                : 0;

        let last =
            toIndex >= 0
                ? toIndex
                : connection.stops.length - 1;


        for (
            let i = first;
            i <= last;
            i++
        ) {

            const stop =
                connection.stops[i];

            const stopRow =
                document.createElement("div");

            stopRow.className =
                "stopRow";


            // Tečka zastávky
            const dot =
                document.createElement("span");

            dot.className =
                "stopDot";

            dot.style.backgroundColor =
                route.color;


            // Název zastávky
            const stopName =
                document.createElement("span");

            stopName.className =
                "stopName";

            stopName.textContent =
                stop.name;


            // Čas
            const stopTime =
                document.createElement("span");

            stopTime.className =
                "stopTime";

            stopTime.textContent =
                stop.time;


            stopRow.appendChild(dot);
            stopRow.appendChild(stopName);
            stopRow.appendChild(stopTime);

            stopsBox.appendChild(stopRow);
        }

        card.appendChild(stopsBox);


        // ======================================
        // SKRYTÍ / ZOBRAZENÍ ZASTÁVEK
        // ======================================

        const toggle =
            document.createElement("button");

        toggle.type = "button";

        toggle.className =
            "stopsToggle";

        toggle.textContent =
            "Skrýt zastávky ▲";


        toggle.addEventListener(
            "click",
            () => {

                const hidden =
                    stopsBox.style.display === "none";

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

    // ==========================================
    // VYHLEDÁVÁNÍ
    // ==========================================

    searchButton.addEventListener(
        "click",
        async (event) => {

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


            // ======================================
            // KONTROLA
            // ======================================

            if (!from || !to) {

                resultsContainer.innerHTML = `
                    <div class="resultCard">
                        <strong>
                            Zadej výchozí a cílovou zastávku.
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
                    <div class="resultCard">
                        Výchozí a cílová zastávka
                        musí být rozdílné.
                    </div>
                `;

                return;
            }


            // ======================================
            // NAČÍTÁNÍ
            // ======================================

            resultsContainer.innerHTML = `
                <div class="resultCard">
                    Vyhledávám spojení…
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


                console.log(
                    "Vyhledávání:",
                    {
                        from,
                        to,
                        afterTime,
                        dayType,
                        lines: lineNumbers
                    }
                );


                // ==================================
                // VYHLEDÁNÍ SPOJŮ
                // ==================================

                const connections =
                    await window.searchTimetable.findConnections(
                        from,
                        to,
                        afterTime,
                        dayType,
                        lineNumbers
                    );


                resultsContainer.innerHTML =
                    "";


                // ==================================
                // ŽÁDNÝ SPOJ
                // ==================================

                if (
                    !connections ||
                    connections.length === 0
                ) {

                    resultsContainer.innerHTML = `
                        <div class="resultCard">

                            <strong>
                                Žádné přímé spojení nebylo nalezeno.
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


                // ==================================
                // VÝSLEDKY
                // ==================================

                for (
                    const connection
                    of connections
                ) {

                    const result =
                        createResult(
                            connection
                        );

                    resultsContainer.appendChild(
                        result
                    );
                }


            } catch (error) {

                console.error(
                    "CHYBA VYHLEDÁVÁNÍ:",
                    error
                );


                resultsContainer.innerHTML = `
                    <div class="resultCard">

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
