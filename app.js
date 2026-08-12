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

    if (
        !fromInput ||
        !toInput ||
        !searchButton ||
        !resultsContainer
    ) {
        console.error("Chybí některý HTML prvek.");
        return;
    }

    if (!window.searchTimetable) {
        console.error("search.js nebyl načten.");
        return;
    }


    // ==================================================
    // ROUTES.JSON
    // ==================================================

    let routes = [];

    try {

        const response =
            await fetch("data/routes.json");

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
    // INFORMACE O LINCE
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
                    !Array.isArray(timetable.directions)
                ) {
                    continue;
                }

                for (const direction of timetable.directions) {

                    if (!Array.isArray(direction.stops)) {
                        continue;
                    }

                    for (const stop of direction.stops) {
                        allStops.add(stop);
                    }
                }

            } catch (error) {

                console.warn(
                    `Nepodařilo se načíst linku ${route.line}:`,
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
    }


    await loadAllStops();


    // ==================================================
    // PROHOZENÍ
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

    if (
        dateInput &&
        !dateInput.value
    ) {

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

        if (
            !dateInput ||
            !dateInput.value
        ) {

            const today = new Date();
            const day = today.getDay();

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
    // REŽIM
    // ==================================================

    function getSearchMode() {

        const selected =
            document.querySelector(
                'input[name="mode"]:checked'
            );

        return selected
            ? selected.value
            : "departure";
    }


    // ==================================================
    // VYTVOŘENÍ ZASTÁVEK
    // ==================================================

    function createStopsBox(stops, color) {

        const stopsBox =
            document.createElement("div");

        stopsBox.className =
            "resultStops";

        if (!Array.isArray(stops)) {
            stops = [];
        }

        for (const stop of stops) {

            const row =
                document.createElement("div");

            row.className =
                "stopRow";


            const dot =
                document.createElement("span");

            dot.className =
                "stopDot";

            dot.style.backgroundColor =
                color;


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

        stopsBox.style.display = "none";

        return stopsBox;
    }


    // ==================================================
    // TLAČÍTKO ZASTÁVEK
    // ==================================================

    function createStopsToggle(stopsBox) {

        const toggle =
            document.createElement("button");

        toggle.type = "button";

        toggle.className =
            "stopsToggle";

        toggle.textContent =
            "Zobrazit zastávky ▼";


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

        return toggle;
    }


    // ==================================================
    // HLAVIČKA LINKY
    // ==================================================

    function createRouteHeader(lineData) {

        const route =
            getRouteInfo(lineData.line);

        const header =
            document.createElement("div");

        header.className =
            "resultHeader";

        header.style.backgroundColor =
            route.color;


        const shortLabel =
            lineData.isShortTrip
                ? " S"
                : "";


        header.innerHTML = `

            <span class="routeIcon">
                ${route.icon || "🚌"}
            </span>

            <span class="routeNumber">
                ${lineData.line}${shortLabel}
            </span>

            <span class="routeDirection">
                → ${lineData.destination || ""}
            </span>

        `;

        return header;
    }


    // ==================================================
    // ČASOVÁ ČÁST
    // ==================================================

    function createMainPart(data) {

        const main =
            document.createElement("div");

        main.className =
            "resultMain";


        main.innerHTML = `

            <div class="mainStop">

                <div class="mainTime">
                    ${data.departure}
                </div>

                <div class="mainStopName">
                    ${data.from}
                </div>

            </div>

            <div class="routeArrow">
                →
            </div>

            <div class="mainStop">

                <div class="mainTime">
                    ${data.arrival}
                </div>

                <div class="mainStopName">
                    ${data.to}
                </div>

            </div>

        `;

        return main;
    }


    // ==================================================
    // PŘÍMÝ SPOJ
    // ==================================================

    function createDirectResult(connection) {

        const route =
            getRouteInfo(connection.line);


        const card =
            document.createElement("div");

        card.className =
            "resultCard";


        card.style.borderLeft =
            `8px solid ${route.color}`;


        // HLAVIČKA
        card.appendChild(
            createRouteHeader(connection)
        );


        // ČASY
        card.appendChild(
            createMainPart(connection)
        );


        // ZASTÁVKY
        const stopsBox =
            createStopsBox(
                connection.stops,
                route.color
            );

        card.appendChild(stopsBox);


        // TLAČÍTKO
        card.appendChild(
            createStopsToggle(stopsBox)
        );


        return card;
    }


    // ==================================================
    // PŘESTUPNÍ SPOJ
    // ==================================================

    function createTransferResult(connection) {

        const card =
            document.createElement("div");

        card.className =
            "resultCard transferCard";


        const legs =
            Array.isArray(connection.legs)
                ? connection.legs
                : [];


        if (legs.length === 0) {
            return card;
        }


        // ==================================================
        // KAŽDÝ ÚSEK
        // ==================================================

        legs.forEach(
            (leg, index) => {

                const route =
                    getRouteInfo(leg.line);


                const part =
                    document.createElement("div");

                part.className =
                    "transferPart";


                // ------------------------------------------
                // HLAVIČKA
                // ------------------------------------------

                part.appendChild(
                    createRouteHeader(leg)
                );


                // ------------------------------------------
                // ČASY
                // ------------------------------------------

                part.appendChild(
                    createMainPart(leg)
                );


                // ------------------------------------------
                // ZASTÁVKY
                // ------------------------------------------

                const stopsBox =
                    createStopsBox(
                        leg.stops,
                        route.color
                    );

                part.appendChild(
                    stopsBox
                );


                // ------------------------------------------
                // TLAČÍTKO
                // ------------------------------------------

                part.appendChild(
                    createStopsToggle(stopsBox)
                );


                card.appendChild(part);


                // ==================================================
                // PŘESTUP
                //
