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


    // ==================================================
    // KONTROLA
    // ==================================================

    if (!fromInput || !toInput || !searchButton || !resultsContainer) {
        console.error("Chybí některý HTML prvek.");
        return;
    }


    if (!window.searchTimetable) {
        console.error("search.js nebyl načten.");
        return;
    }


    // ==================================================
    // NAČTENÍ ROUTES.JSON
    // ==================================================

    let routes = [];

    try {

        const response = await fetch("data/routes.json");

        if (!response.ok) {
            throw new Error(
                `routes.json: HTTP ${response.status}`
            );
        }

        routes = await response.json();

        console.log("ROUTES:", routes);

    } catch (error) {

        console.error(
            "Nepodařilo se načíst routes.json:",
            error
        );
    }


    // ==================================================
    // FUNKCE PRO INFORMACE O LINCE
    // ==================================================

    function getRouteInfo(line) {

        const found = routes.find(
            route =>
                String(route.line).trim() ===
                String(line).trim()
        );

        if (found) {
            return found;
        }

        console.warn(
            "Linka nebyla nalezena v routes.json:",
            line
        );

        return {
            line: String(line),
            icon: "🚌",
            color: "#2196F3",
            type: "bus"
        };
    }


    // ==================================================
    // NAČTENÍ VŠECH ZASTÁVEK
    // ==================================================

    async function loadAllStops() {

        if (!stopsList) {
            console.error("Nenalezen datalist #stops.");
            return;
        }

        const allStops = new Set();


        for (const route of routes) {

            try {

                const timetable =
                    await window.searchTimetable.loadTimetable(
                        route.line
                    );


                if (
                    !timetable ||
                    !timetable.directions
                ) {
                    continue;
                }


                for (
                    const direction
                    of timetable.directions
                ) {

                    if (!direction.stops) {
                        continue;
                    }


                    for (
                        const stop
                        of direction.stops
                    ) {

                        allStops.add(stop);
                    }
                }

            } catch (error) {

                console.warn(
                    `Nepodařilo se načíst jízdní řád linky ${route.line}:`,
                    error
                );
            }
        }


        stopsList.innerHTML = "";


        const sortedStops =
            [...allStops].sort(
                (a, b) =>
                    a.localeCompare(b, "cs")
            );


        for (const stop of sortedStops) {

            const option =
                document.createElement("option");

            option.value = stop;

            stopsList.appendChild(option);
        }


        console.log(
            `Načteno zastávek: ${sortedStops.length}`
        );
    }


    await loadAllStops();


    // ==================================================
    // PROHOZENÍ ZASTÁVEK
    // ==================================================

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


    // ==================================================
    // VÝCHOZÍ DATUM
    // ==================================================

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


    // ==================================================
    // TYP DNE
    // ==================================================

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


    // ==================================================
    // VYTVOŘENÍ VÝSLEDKU
    // ==================================================

    function createResult(connection) {

        const route =
            getRouteInfo(connection.line);


        const card =
            document.createElement("div");

        card.className =
            "resultCard";


        // Barva celé levé strany
        card.style.borderLeft =
            `8px solid ${route.color}`;


        // ==================================================
        // HLAVIČKA
        // ==================================================

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
        `;


        card.appendChild(header);


        // ==================================================
        // SMĚR
        // ==================================================

        const direction =
            document.createElement("div");

        direction.className =
            "routeDirection";


        direction.innerHTML = `
            <strong>Směr:</strong>
            ${connection.destination}
        `;


        card.appendChild(direction);


        // ==================================================
        // HLAVNÍ ČASY
        // ==================================================

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


        // ==================================================
        // ZASTÁVKY POUZE MEZI FROM A TO
        // ==================================================

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


        if (
            fromIndex !== -1 &&
            toIndex !== -1 &&
            fromIndex <= toIndex
        ) {

            for (
                let i = fromIndex;
                i <= toIndex;
                i++
            ) {

                const stop =
                    connection.stops[i];


                const row =
                    document.createElement("div");

                row.className =
                    "stopRow";


                // Tečka
                const dot =
                    document.createElement("span");

                dot.className =
                    "stopDot";


                dot.style.backgroundColor =
                    route.color;


                // Název
                const name =
                    document.createElement("span");

                name.className =
                    "stopName";

                name.textContent =
                    stop.name;


                // Čas
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


        // ==================================================
        // ZASTÁVKY JSOU ZAKRYTÉ
        // ==================================================

        stopsBox.style.display =
            "none";


        card.appendChild(stopsBox);


        // ==================================================
        // TLAČÍTKO PRO ROZKLIKNUTÍ
        // ==================================================

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


    // ==================================================
    // VYHLEDÁVÁNÍ
    // ==================================================

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


            // ==================================================
            // KONTROLA VSTUPU
            // ==================================================

            if (!from || !to) {

                resultsContainer.innerHTML = `
                    <div class="resultCard">

                        <strong>
                            Vyber výchozí a cílovou zastávku.
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


            // ==================================================
            // VYHLEDÁVÁNÍ
            // ==================================================

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


                // ==================================================
                // ŽÁDNÝ VÝSLEDEK
                // ==================================================

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


                // ==================================================
                // VÝSLEDKY
                // ==================================================

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
