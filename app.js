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

        routes =
            await response.json();

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

        const found =
            routes.find(
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
            console.error(
                "Nenalezen datalist #stops."
            );
            return;
        }

        const allStops =
            new Set();


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
                    a.localeCompare(
                        b,
                        "cs"
                    )
            );


        for (
            const stop
            of sortedStops
        ) {

            const option =
                document.createElement("option");

            option.value =
                stop;

            stopsList.appendChild(
                option
            );
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

    if (
        dateInput &&
        !dateInput.value
    ) {

        const today =
            new Date();

        const year =
            today.getFullYear();

        const month =
            String(
                today.getMonth() + 1
            ).padStart(
                2,
                "0"
            );

        const day =
            String(
                today.getDate()
            ).padStart(
                2,
                "0"
            );

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

            const today =
                new Date();

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
    // ZJIŠTĚNÍ REŽIMU
    // ==================================================

    function getSearchMode() {

        const selected =
            document.querySelector(
                'input[name="mode"]:checked'
            );

        if (!selected) {
            return "departure";
        }

        return selected.value;
    }


    // ==================================================
    // VYTVOŘENÍ PŘÍMÉHO SPOJE
    // ==================================================

    function createDirectResult(connection) {

        const route =
            getRouteInfo(
                connection.line
            );


        const card =
            document.createElement("div");

        card.className =
            "resultCard";


        // Barevný okraj
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
                ${route.icon || "🚌"}
            </span>

            <span class="routeNumber">
                ${connection.line}${shortLabel}
            </span>

            <span class="routeDirection">
                → ${connection.destination || ""}
            </span>

        `;


        card.appendChild(
            header
        );


        // ==================================================
        // ČASY
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


        card.appendChild(
            main
        );


        // ==================================================
        // ZASTÁVKY
        // ==================================================

        const stopsBox =
            document.createElement("div");

        stopsBox.className =
            "resultStops";


        const stops =
            Array.isArray(connection.stops)
                ? connection.stops
                : [];


        if (stops.length > 0) {

            for (
                const stop
                of stops
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


                row.appendChild(
                    dot
                );

                row.appendChild(
                    name
                );

                row.appendChild(
                    time
                );


                stopsBox.appendChild(
                    row
                );
            }
        }


        // Skryté dokud se nerozklikne
        stopsBox.style.display =
            "none";


        card.appendChild(
            stopsBox
        );


        // ==================================================
        // TLAČÍTKO ZASTÁVEK
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


        card.appendChild(
            toggle
        );


        return card;
    }


    // ==================================================
    // VYTVOŘENÍ PŘESTUPNÍHO SPOJE
    // ==================================================

    function createTransferResult(connection) {

        const card =
            document.createElement("div");

        card.className =
            "resultCard transferCard";


        // ==================================================
        // NADPIS
        // ==================================================

        const title =
            document.createElement("div");

        title.className =
            "transferTitle";

        title.textContent =
            "Přestupní spoj";


        card.appendChild(
            title
        );


        // ==================================================
        // JEDNOTLIVÉ ČÁSTI
        // ==================================================

        const legs =
            Array.isArray(connection.legs)
                ? connection.legs
                : [];


        for (
            const leg
            of legs
        ) {

            const route =
                getRouteInfo(
                    leg.line
                );


            const part =
                document.createElement("div");

            part.className =
                "transferPart";


            // Barevná hlavička
            const header =
                document.createElement("div");

            header.className =
                "resultHeader";

            header.style.backgroundColor =
                route.color;


            const shortLabel =
                leg.isShortTrip
                    ? " S"
                    : "";


            header.innerHTML = `

                <span class="routeIcon">
                    ${route.icon || "🚌"}
                </span>

                <span class="routeNumber">
                    ${leg.line}${shortLabel}
                </span>

                <span class="routeDirection">
                    → ${leg.destination || ""}
                </span>

            `;


            part.appendChild(
                header
            );


            // Časy
            const main =
                document.createElement("div");

            main.className =
                "resultMain";


            main.innerHTML = `

                <div class="mainStop">

                    <div class="mainTime">
                        ${leg.departure}
                    </div>

                    <div class="mainStopName">
                        ${leg.from}
                    </div>

                </div>


                <div class="routeArrow">
                    →
                </div>


                <div class="mainStop">

                    <div class="mainTime">
                        ${leg.arrival}
                    </div>

                    <div class="mainStopName">
                        ${leg.to}
                    </div>

                </div>

            `;


            part.appendChild(
                main
            );


            // Zastávky úseku
            const stopsBox =
                document.createElement("div");

            stopsBox.className =
                "resultStops";


            const stops =
                Array.isArray(leg.stops)
                    ? leg.stops
                    : [];


            for (
                const stop
                of stops
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


                row.appendChild(
                    dot
                );

                row.appendChild(
                    name
                );

                row.appendChild(
                    time
                );


                stopsBox.appendChild(
                    row
                );
            }


            stopsBox.style.display =
                "none";


            part.appendChild(
                stopsBox
            );


            // Tlačítko
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


            part.appendChild(
                toggle
            );


            card.appendChild(
                part
            );


            // Přestupní zastávka
            if (
                leg.transferStop
            ) {

                const transfer =
                    document.createElement("div");

                transfer.className =
                    "transferStop";

                transfer.innerHTML = `
                    <strong>Přestup:</strong>
                    ${leg.transferStop}
                `;


                card.appendChild(
                    transfer
                );
            }
        }


        return card;
    }


    // ==================================================
    // VYTVOŘENÍ VÝSLEDKU
    // ==================================================

    function createResult(connection) {

        if (
            connection.type === "transfer" ||
            Array.isArray(connection.legs)
        ) {

            return createTransferResult(
                connection
            );
        }


        return createDirectResult(
            connection
        );
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


            let afterTime =
                "00:00";


            if (
                timeInput &&
                timeInput.value
            ) {

                afterTime =
                    timeInput.value;
            }


            // ==================================================
            // KONTROLA
            // ==================================================

            if (
                !from ||
                !to
            ) {

                resultsContainer.innerHTML = `

                    <div class="resultCard">

                        <div class="departureTime">
                            Chybí zastávka
                        </div>

                        <p>
                            Zadejte výchozí a cílovou zastávku.
                        </p>

                    </div>

                `;

                return;
            }


            if (
                from.toLowerCase() ===
                to
