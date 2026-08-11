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


    // =====================================================
    // KONTROLA
    // =====================================================

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


    // =====================================================
    // ROUTES.JSON
    // =====================================================

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
            icon: "🚌",
            color: "#2196F3",
            type: "bus"
        };
    }


    // =====================================================
    // NAČTENÍ VŠECH ZASTÁVEK
    // =====================================================

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
                            allStops.add(stop);
                        }
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

        for (
            const stop
            of sortedStops
        ) {

            const option =
                document.createElement("option");

            option.value = stop;

            stopsList.appendChild(option);
        }

        console.log(
            "Načteno zastávek:",
            sortedStops.length
        );
    }

    await loadAllStops();


    // =====================================================
    // PROHOZENÍ
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
    // DATUM
    // =====================================================

    if (
        dateInput &&
        !dateInput.value
    ) {

        const today = new Date();

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
    // TYP DNE
    // =====================================================

    function getDayType() {

        let date;

        if (
            dateInput &&
            dateInput.value
        ) {

            date =
                new Date(
                    dateInput.value +
                    "T12:00:00"
                );

        } else {

            date = new Date();
        }

        const day =
            date.getDay();

        if (
            day === 0 ||
            day === 6
        ) {
            return "weekends";
        }

        return "weekdays";
    }


    // =====================================================
    // HLAVIČKA LINKY
    // =====================================================

    function createHeader(
        line,
        destination,
        isShortTrip
    ) {

        const route =
            getRouteInfo(line);

        const header =
            document.createElement("div");

        header.className =
            "resultHeader";

        header.style.backgroundColor =
            route.color;

        const shortLabel =
            isShortTrip
                ? " S"
                : "";

        header.innerHTML = `

            <span class="routeIcon">
                ${route.icon || ""}
            </span>

            <span class="routeNumber">
                ${route.line}${shortLabel}
            </span>

            <span class="routeDestination">
                → ${destination || ""}
            </span>

        `;

        return header;
    }


    // =====================================================
    // ZASTÁVKY
    // =====================================================

    function createStops(
        stops,
        color
    ) {

        const wrapper =
            document.createElement("div");

        if (
            !Array.isArray(stops) ||
            stops.length === 0
        ) {
            return wrapper;
        }

        const stopsBox =
            document.createElement("div");

        stopsBox.className =
            "resultStops";

        stopsBox.style.display =
            "none";

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

        wrapper.appendChild(stopsBox);
        wrapper.appendChild(toggle);

        return wrapper;
    }


    // =====================================================
    // HLAVNÍ ČASY
    // =====================================================

    function createMainPart(
        leg
    ) {

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

        return main;
    }


    // =====================================================
    // PŘÍMÝ SPOJ
    // =====================================================

    function createDirectResult(
        connection
    ) {

        const route =
            getRouteInfo(connection.line);

        const card =
            document.createElement("div");

        card.className =
            "resultCard";

        card.style.borderLeft =
            `8px solid ${route.color}`;

        card.appendChild(
            createHeader(
                connection.line,
                connection.destination,
                connection.isShortTrip
            )
        );

        card.appendChild(
            createMainPart(
                connection
            )
        );

        card.appendChild(
            createStops(
                connection.stops,
                route.color
            )
        );

        return card;
    }


    // =====================================================
    // INFORMACE O PŘESTUPU
    // =====================================================

    function createTransferInfo(
        connection
    ) {

        const box =
            document.createElement("div");

        box.className =
            "transferPart";

        const transferStop =
            connection.transfer.stop;

        const waiting =
            connection.transfer.departureMinutes -
            connection.transfer.arrivalMinutes;

        box.innerHTML = `

            <div class="transferTitle">
                Přestup: ${transferStop}
            </div>

            <div class="transferStop">

                <span>
                    Čekání:
                </span>

                <strong>
                    ${Math.max(0, waiting)} min
                </strong>

            </div>

        `;

        return box;
    }


    // =====================================================
    // DRUHÁ ČÁST PŘESTUPU
    // =====================================================

    function createSecondTransferPart(
        connection
    ) {

        const route =
            getRouteInfo(
                connection.secondLine
            );

        const wrapper =
            document.createElement("div");

        wrapper.className =
            "transferPart";


        // -----------------------------------------------
        // HLAVIČKA DRUHÉ LINKY
        // -----------------------------------------------

        const header =
            createHeader(
                connection.secondLine,
                connection.secondDestination,
                connection.secondIsShortTrip
            );

        wrapper.appendChild(
            header
        );


        // -----------------------------------------------
        // ČASY DRUHÉ ČÁSTI
        // -----------------------------------------------

        const main =
            document.createElement("div");

        main.className =
            "resultMain";

        main.innerHTML = `

            <div class="mainStop">

                <div class="mainTime">
                    ${connection.transfer.departure}
                </div>

                <div class="mainStopName">
                    ${connection.transfer.stop}
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

        wrapper.appendChild(main);


        // -----------------------------------------------
        // ZASTÁVKY DRUHÉ LINKY
        // -----------------------------------------------

        wrapper.appendChild(
            createStops(
                connection.secondStops,
                route.color
            )
        );

        return wrapper;
    }


    // =====================================================
    // PŘESTUPOVÝ SPOJ
    //
    // ZOBRAZENÍ:
    //
    // [🚌 1 → směr X]
    // 10:25
    // A
    // →
    // 10:28
    // Hlavní nádraží
    //
    // Přestup: Hlavní nádraží
    // Čekání: 3 min
    //
    // [🚌 2 → směr Y]
    // ...
    // =====================================================

    function createTransferResult(
        connection
    ) {

        const card =
            document.createElement("div");

        card.className =
            "resultCard";


        const firstRoute =
            getRouteInfo(
                connection.line
            );

        card.style.borderLeft =
            `8px solid ${firstRoute.color}`;


        // =================================================
        // PRVNÍ LINKA
        // =================================================

        const firstHeader =
            createHeader(
                connection.line,
                connection.destination,
                connection.isShortTrip
            );

        card.appendChild(
            firstHeader
        );


        // PRVNÍ ČÁST OD FROM DO PŘESTUPU

        const firstFromIndex =
            connection.stops.findIndex(
                stop =>
                    stop.name ===
                    connection.from
            );

        const firstToIndex =
            connection.stops.findIndex(
                stop =>
                    stop.name ===
                    connection.transfer.stop
            );


        const firstStops =
            connection.stops.slice(
                firstFromIndex,
                firstToIndex + 1
            );


        const firstLeg = {

            from:
                connection.from,

            to:
                connection.transfer.stop,

            departure:
                connection.departure,

            arrival:
                connection.transfer.arrival,

            departureMinutes:
                connection.departureMinutes,

            arrivalMinutes:
                connection.transfer.arrivalMinutes
        };


        card.appendChild(
            createMainPart(
                firstLeg
            )
        );


        card.appendChild(
            createStops(
                firstStops,
                firstRoute.color
            )
        );


        // =================================================
        // PŘESTUP
        // =================================================

        card.appendChild(
            createTransferInfo(
                connection
            )
        );


        // =================================================
        // DRUHÁ LINKA
        // =================================================

        card.appendChild(
            createSecondTransferPart(
                connection
            )
        );


        return card;
    }


    // =====================================================
    // VÝSLEDEK
    // =====================================================

    function createResult(
        connection
    ) {

        if (
            connection.type === "transfer"
        ) {

            return createTransferResult(
                connection
            );
        }

        return createDirectResult(
            connection
        );
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


            const modeInput =
                document.querySelector(
                    'input[name="mode"]:checked'
                );

            const mode =
                modeInput
                    ? modeInput.value
                    : "departure";


            // ---------------------------------------------
            // KONTROLA
            // ---------------------------------------------

            if (
                !from ||
                !to
            ) {

                resultsContainer.innerHTML = `

                    <div class="resultCard">

                        <div class="departureTime">
                            Vyber výchozí a cílovou zastávku.
                        </div>

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

                        <div class="departureTime">
                            Zastávky musí být rozdílné.
                        </div>

                    </div>

                `;

                return;
            }


            resultsContainer.innerHTML = `

                <div class="resultCard">

                    <div class="departureTime">
                        Vyhledávám spojení…
                    </div>

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
                        lineNumbers,
                        mode
                    );


                resultsContainer.innerHTML = "";


                if (
                    !connections ||
                    connections.length === 0
                ) {

                    resultsContainer.innerHTML = `

                        <div class="resultCard">

                            <div class="departureTime">
                                Spojení nenalezeno
                            </div>

                            <p>
                                ${from} → ${to}
                            </p>

                        </div>

                    `;

                    return;
                }


                // -----------------------------------------
                // VÝSLEDKY
                // -----------------------------------------

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

                    <div class="resultCard">

                        <div class="departureTime">
                            Chyba při vyhledávání
                        </div>

                        <p>
                            ${error.message}
                        </p>

                    </div>

                `;
            }
        }
    );

});
