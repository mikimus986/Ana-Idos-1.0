// app.js

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        const fromInput =
            document.getElementById("from");

        const toInput =
            document.getElementById("to");

        const dateInput =
            document.getElementById("date");

        const timeInput =
            document.getElementById("time");

        const searchButton =
            document.getElementById("searchButton");

        const swapButton =
            document.getElementById("swapButton");

        const resultsContainer =
            document.getElementById("results");

        const stopsList =
            document.getElementById("stops");


        // =====================================================
        // KONTROLA
        // =====================================================

        if (
            !fromInput ||
            !toInput ||
            !searchButton ||
            !resultsContainer
        ) {

            console.error(
                "Chybí některý HTML prvek."
            );

            return;
        }


        if (
            !window.searchTimetable
        ) {

            console.error(
                "search.js nebyl načten."
            );

            return;
        }


        // =====================================================
        // ROUTES.JSON
        // =====================================================

        let routes = [];


        try {

            const response =
                await fetch(
                    "data/routes.json"
                );


            if (!response.ok) {
                throw new Error(
                    `routes.json HTTP ${response.status}`
                );
            }


            routes =
                await response.json();


            console.log(
                "Načtené linky:",
                routes
            );

        } catch (error) {

            console.error(
                "Nepodařilo se načíst routes.json:",
                error
            );

            resultsContainer.innerHTML = `
                <div class="resultCard">
                    <strong>
                        Nepodařilo se načíst seznam linek.
                    </strong>
                </div>
            `;

            return;
        }


        // =====================================================
        // INFORMACE O LINCE
        // =====================================================

        function getRouteInfo(line) {

            const found =
                routes.find(
                    route =>
                        String(route.line)
                            .trim() ===
                        String(line)
                            .trim()
                );


            if (found) {
                return found;
            }


            return {

                line:
                    String(line),

                icon:
                    "🚌",

                color:
                    "#2196F3",

                type:
                    "bus"
            };
        }


        // =====================================================
        // ZASTÁVKY DO DATALISTU
        // =====================================================

        async function loadAllStops() {

            if (!stopsList) {
                return;
            }


            const allStops =
                new Set();


            for (
                const route of routes
            ) {

                try {

                    const timetable =
                        await window
                            .searchTimetable
                            .loadTimetable(
                                route.line
                            );


                    for (
                        const direction
                        of timetable.directions || []
                    ) {

                        for (
                            const stop
                            of direction.stops || []
                        ) {

                            allStops.add(
                                stop
                            );
                        }
                    }

                } catch (error) {

                    console.warn(
                        `Linka ${route.line} se nepodařila načíst.`,
                        error
                    );
                }
            }


            stopsList.innerHTML = "";


            const sorted =
                [...allStops].sort(
                    (a, b) =>
                        a.localeCompare(
                            b,
                            "cs"
                        )
                );


            for (
                const stop of sorted
            ) {

                const option =
                    document.createElement(
                        "option"
                    );

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

                    const temp =
                        fromInput.value;

                    fromInput.value =
                        toInput.value;

                    toInput.value =
                        temp;
                }
            );
        }


        // =====================================================
        // DNEŠNÍ DATUM
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
        // VÝCHOZÍ ČAS
        // =====================================================

        if (
            timeInput &&
            !timeInput.value
        ) {

            const now =
                new Date();


            timeInput.value =
                String(
                    now.getHours()
                ).padStart(2, "0") +
                ":" +
                String(
                    now.getMinutes()
                ).padStart(2, "0");
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
        // POČET PŘESTUPŮ
        // =====================================================

        function getTransferCount(
            connection
        ) {

            if (
                connection.type ===
                "direct"
            ) {
                return 0;
            }


            if (
                Array.isArray(
                    connection.legs
                )
            ) {

                return Math.max(
                    0,
                    connection.legs.length - 1
                );
            }


            return 0;
        }


        // =====================================================
        // VYTVOŘENÍ PŘÍMÉHO VÝSLEDKU
        // =====================================================

        function createDirectResult(
            connection
        ) {

            const route =
                getRouteInfo(
                    connection.line
                );


            const card =
                document.createElement(
                    "div"
                );

            card.className =
                "resultCard";


            card.style.borderLeft =
                `8px solid ${route.color}`;


            // =================================================
            // HLAVIČKA
            // =================================================

            const header =
                document.createElement(
                    "div"
                );

            header.className =
                "resultHeader";


            header.style.backgroundColor =
                route.color;


            header.innerHTML = `

                <span class="routeIcon">
                    ${route.icon}
                </span>

                <span class="routeNumber">
                    ${route.line}${connection.isShortTrip ? " S" : ""}
                </span>

            `;


            card.appendChild(
                header
            );


            // =================================================
            // SMĚR
            // =================================================

            const direction =
                document.createElement(
                    "div"
                );

            direction.className =
                "routeDirection";


            direction.innerHTML = `

                <strong>Směr:</strong>
                ${connection.destination || ""}

            `;


            card.appendChild(
                direction
            );


            // =================================================
            // ČASY
            // =================================================

            const main =
                document.createElement(
                    "div"
                );

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


            // =================================================
            // ZASTÁVKY
            // =================================================

            addStopsBox(
                card,
                connection.stops,
                route.color
            );


            return card;
        }


        // =====================================================
        // VYTVOŘENÍ PŘESTUPNÍHO VÝSLEDKU
        // =====================================================

        function createTransferResult(
            connection
        ) {

            const card =
                document.createElement(
                    "div"
                );

            card.className =
                "resultCard transferCard";


            card.style.borderLeft =
                "8px solid #555";


            const title =
                document.createElement(
                    "div"
                );


            title.className =
                "transferTitle";


            title.innerHTML = `

                <strong>
                    ${getTransferCount(connection)} ${
                        getTransferCount(connection) === 1
                            ? "přestup"
                            : "přestupů"
                    }
                </strong>

            `;


            card.appendChild(
                title
            );


            // =================================================
            // HLAVNÍ ČASY
            // =================================================

            const main =
                document.createElement(
                    "div"
                );

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


            // =================================================
            // JEDNOTLIVÉ ÚSEKY
            // =================================================

            for (
                const leg
                of connection.legs
            ) {

                const route =
                    getRouteInfo(
                        leg.line
                    );


                const legBox =
                    document.createElement(
                        "div"
                    );

                legBox.className =
                    "transferLeg";


                legBox.style.borderLeft =
                    `6px solid ${route.color}`;


                legBox.innerHTML = `

                    <div class="transferLegHeader">

                        <span>
                            ${route.icon}
                        </span>

                        <strong>
                            ${route.line}${leg.isShortTrip ? " S" : ""}
                        </strong>

                        <span>
                            Směr: ${leg.destination || ""}
                        </span>

                    </div>


                    <div class="transferLegTimes">

                        ${leg.departure}
                        ${leg.from}

                        →
                        
                        ${leg.arrival}
                        ${leg.to}

                    </div>

                `;


                card.appendChild(
                    legBox
                );


                addStopsBox(
                    legBox,
                    leg.stops,
                    route.color
                );
            }


            return card;
        }


        // =====================================================
        // ZASTÁVKY
        // =====================================================

        function addStopsBox(
            parent,
            stops,
            color
        ) {

            if (
                !Array.isArray(stops) ||
                stops.length === 0
            ) {
                return;
            }


            const stopsBox =
                document.createElement(
                    "div"
                );

            stopsBox.className =
                "resultStops";


            stopsBox.style.display =
                "none";


            for (
                const stop
                of stops
            ) {

                const row =
                    document.createElement(
                        "div"
                    );

                row.className =
                    "stopRow";


                const dot =
                    document.createElement(
                        "span"
                    );

                dot.className =
                    "stopDot";


                dot.style.backgroundColor =
                    color;


                const name =
                    document.createElement(
                        "span"
                    );

                name.className =
                    "stopName";

                name.textContent =
                    stop.name;


                const time =
                    document.createElement(
                        "span"
                    );

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


            parent.appendChild(
                stopsBox
            );


            // =================================================
            // TLAČÍTKO
            // =================================================

            const toggle =
                document.createElement(
                    "button"
                );


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


            parent.appendChild(
                toggle
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


                // =================================================
                // ODJEZDY / PŘÍJEZDY
                // =================================================

                const mode =
                    document.querySelector(
                        'input[name="mode"]:checked'
                    )?.value ||
                    "departure";


                // =================================================
                // KONTROLA
                // =================================================

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


                // =================================================
                // VYHLEDÁVÁNÍ
                // =================================================

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
                                String(
                                    route.line
                                )
                        );


                    console.log(
                        "Hledám:",
                        from,
                        "→",
                        to,
                        "čas:",
                        afterTime,
                        "režim:",
                        mode,
                        "den:",
                        dayType
                    );


                    const connections =
                        await window
                            .searchTimetable
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


                    // =================================================
                    // ŽÁDNÝ VÝSLEDEK
                    // =================================================

                    if (
                        !connections ||
                        connections.length === 0
                    ) {

                        resultsContainer.innerHTML = `

                            <div class="resultCard">

                                <strong>
                                    Žádné spojení nebylo nalezeno.
                                </strong>

                                <p>
                                    ${from}
                                    →
                                    ${to}
                                </p>

                                <p>
                                    ${mode === "departure"
                                        ? `Od ${afterTime}`
                                        : `Do ${afterTime}`
                                    }
                                </p>

                            </div>

                        `;

                        return;
                    }


                    // =================================================
                    // VÝSLEDKY
                    // =================================================

                    for (
                        const connection
                        of connections
                    ) {

                        let card;


                        if (
                            connection.type ===
                            "direct"
                        ) {

                            card =
                                createDirectResult(
                                    connection
                                );

                        } else {

                            card =
                                createTransferResult(
                                    connection
                                );
                        }


                        resultsContainer.appendChild(
                            card
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

    }
);
