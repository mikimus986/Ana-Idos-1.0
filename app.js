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

        routes =
            await response.json();

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


    // =====================================================
    // NAČTENÍ ZASTÁVEK
    // =====================================================

    async function loadAllStops() {

        if (!stopsList) {
            return;
        }

        const allStops =
            new Set();


        for (
            const route
            of routes
        ) {

            try {

                const timetable =
                    await window.searchTimetable
                        .loadTimetable(
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

                    if (
                        !direction.stops
                    ) {
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
                    `Linku ${route.line} se nepodařilo načíst:`,
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
    // VÝCHOZÍ DATUM
    // =====================================================

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


    // =====================================================
    // VYTVOŘENÍ ŘÁDKU ZASTÁVKY
    // =====================================================

    function createStopRow(
        stop,
        color
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


        return row;
    }


    // =====================================================
    // ZASTÁVKY
    // =====================================================

    function createStopsBox(
        stops,
        color
    ) {

        const stopsBox =
            document.createElement("div");

        stopsBox.className =
            "resultStops";

        stopsBox.style.display =
            "none";


        for (
            const stop
            of stops || []
        ) {

            stopsBox.appendChild(
                createStopRow(
                    stop,
                    color
                )
            );
        }


        return stopsBox;
    }


    // =====================================================
    // TLAČÍTKO ZASTÁVKY
    // =====================================================

    function createStopsToggle(
        stopsBox
    ) {

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


        return toggle;
    }


    // =====================================================
    // HLAVIČKA LINKY
    // =====================================================

    function createRouteHeader(
        route,
        direction
    ) {

        const header =
            document.createElement("div");

        header.className =
            "resultHeader";

        header.style.backgroundColor =
            route.color;


        const icon =
            document.createElement("span");

        icon.className =
            "routeIcon";

        icon.textContent =
            route.icon;


        const number =
            document.createElement("span");

        number.className =
            "routeNumber";

        number.textContent =
            route.line;


        if (direction) {

            const directionText =
                document.createElement("span");

            directionText.className =
                "routeDirection";

            directionText.textContent =
                `→ ${direction}`;

            header.appendChild(
                icon
            );

            header.appendChild(
                number
            );

            header.appendChild(
                directionText
            );

        } else {

            header.appendChild(
                icon
            );

            header.appendChild(
                number
            );
        }


        return header;
    }


    // =====================================================
    // HLAVNÍ ČÁST SPOJE
    // =====================================================

    function createMainPart(
        departure,
        from,
        arrival,
        to
    ) {

        const main =
            document.createElement("div");

        main.className =
            "resultMain";


        main.innerHTML = `

            <div class="mainStop">

                <div class="mainTime">
                    ${departure}
                </div>

                <div class="mainStopName">
                    ${from}
                </div>

            </div>


            <div class="routeArrow">
                →
            </div>


            <div class="mainStop">

                <div class="mainTime">
                    ${arrival}
                </div>

                <div class="mainStopName">
                    ${to}
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
            getRouteInfo(
                connection.line
            );


        const card =
            document.createElement("div");

        card.className =
            "resultCard";


        card.style.borderLeft =
            `8px solid ${route.color}`;


        // -----------------------------------------------
        // HLAVIČKA
        // -----------------------------------------------

        const header =
            createRouteHeader(
                route,
                connection.destination
            );

        card.appendChild(
            header
        );


        // -----------------------------------------------
        // ČASY
        // -----------------------------------------------

        card.appendChild(
            createMainPart(
                connection.departure,
                connection.from,
                connection.arrival,
                connection.to
            )
        );


        // -----------------------------------------------
        // ZASTÁVKY
        // -----------------------------------------------

        const stopsBox =
            createStopsBox(
                connection.stops,
                route.color
            );


        card.appendChild(
            stopsBox
        );


        card.appendChild(
            createStopsToggle(
                stopsBox
            )
        );


        return card;
    }


    // =====================================================
    // JEDEN ÚSEK PŘESTUPNÍHO SPOJE
    // =====================================================

    function createTransferLeg(
        route,
        departure,
        from,
        arrival,
        to,
        stops
    ) {

        const part =
            document.createElement("div");

        part.className =
            "transferPart";


        // -----------------------------------------------
        // HLAVIČKA
        // -----------------------------------------------

        const header =
            createRouteHeader(
                route,
                route.destination
            );

        part.appendChild(
            header
        );


        // -----------------------------------------------
        // ČASY
        // -----------------------------------------------

        part.appendChild(
            createMainPart(
                departure,
                from,
                arrival,
                to
            )
        );


        // -----------------------------------------------
        // ZASTÁVKY
        // -----------------------------------------------

        const stopsBox =
            createStopsBox(
                stops,
                route.color
            );


        part.appendChild(
            stopsBox
        );


        part.appendChild(
            createStopsToggle(
                stopsBox
            )
        );


        return part;
    }


    // =====================================================
    // PŘESTUPOVÝ SPOJ
    // =====================================================

    function createTransferResult(
        connection
    ) {

        const firstRoute =
            getRouteInfo(
                connection.line
            );


        const secondRoute =
            getRouteInfo(
                connection.secondLine
            );


        const card =
            document.createElement("div");

        card.className =
            "resultCard";


        card.style.borderLeft =
            `8px solid ${firstRoute.color}`;


        // =================================================
        // PRVNÍ LINKA
        // =================================================

        const firstPart =
            createTransferLeg(

                firstRoute,

                connection.departure,

                connection.from,

                connection.transfer.arrival,

                connection.transfer.stop,

                connection.stops
            );


        card.appendChild(
            firstPart
        );


        // =================================================
        // PŘESTUP
        // =================================================

        const transferBox =
            document.createElement("div");

        transferBox.className =
            "transferStop";


        transferBox.innerHTML = `

            <strong>
                Přestup: ${connection.transfer.stop}
            </strong>

            <br>

            ${firstRoute.icon}
            ${firstRoute.line}
            ${connection.transfer.arrival}

            &nbsp; → &nbsp;

            ${secondRoute.icon}
            ${secondRoute.line}
            ${connection.transfer.departure}

            <br>

            <small>
                Čekání ${connection.transfer.wait} min
            </small>

        `;


        card.appendChild(
            transferBox
        );


        // =================================================
        // DRUHÁ LINKA
        // =================================================

        const secondPart =
            createTransferLeg(

                secondRoute,

                connection.transfer.departure,

                connection.transfer.stop,

                connection.arrival,

                connection.to,

                connection.secondStops
            );


        card.appendChild(
            secondPart
        );


        return card;
    }


    // =====================================================
    // VYTVOŘENÍ VÝSLEDKU
    // =====================================================

    function createResult(
        connection
    ) {

        if (
            connection.type ===
            "transfer"
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
                            Chybí zastávka
                        </div>

                        <p>
                            Zadejte výchozí a cílovou
                            zastávku.
                        </p>

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
                            Chyba
                        </div>

                        <p>
                            Výchozí a cílová zastávka
                            musí být rozdílné.
                        </p>

                    </div>

                `;

                return;
            }


            // ---------------------------------------------
            // VYHLEDÁVÁNÍ
            // ---------------------------------------------

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


                const modeElement =
                    document.querySelector(
                        'input[name="mode"]:checked'
                    );


                const mode =
                    modeElement
                        ? modeElement.value
                        : "departure";


                const lineNumbers =
                    routes.map(
                        route =>
                            String(
                                route.line
                            )
                    );


                const connections =
                    await window.searchTimetable
                        .findConnections(

                            from,

                            to,

                            afterTime,

                            dayType,

                            lineNumbers,

                            mode

                        );


                resultsContainer.innerHTML =
                    "";


                // -----------------------------------------
                // ŽÁDNÝ VÝSLEDEK
                // -----------------------------------------

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
                                ${from}
                                →
                                ${to}
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
