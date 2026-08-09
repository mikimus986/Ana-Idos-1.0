// app.js

document.addEventListener("DOMContentLoaded", async () => {

    // =========================================================
    // HTML PRVKY
    // =========================================================

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


    // =========================================================
    // KONTROLA
    // =========================================================

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


    // =========================================================
    // ROUTES.JSON
    // =========================================================

    let routes = [];


    try {

        const response =
            await fetch(
                "data/routes.json"
            );


        if (!response.ok) {

            throw new Error(
                `routes.json: HTTP ${response.status}`
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
    }


    // =========================================================
    // INFORMACE O LINCE
    // =========================================================

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


        console.warn(
            "Linka není v routes.json:",
            line
        );


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


    // =========================================================
    // NAČTENÍ VŠECH ZASTÁVEK
    // =========================================================

    async function loadAllStops() {

        if (!stopsList) {

            console.warn(
                "Nenalezen datalist #stops."
            );

            return;
        }


        const allStops =
            new Set();


        for (
            const route of routes
        ) {

            try {

                const timetable =
                    await window.searchTimetable
                        .loadTimetable(
                            route.line
                        );


                if (
                    !timetable ||
                    !Array.isArray(
                        timetable.directions
                    )
                ) {
                    continue;
                }


                for (
                    const direction
                    of timetable.directions
                ) {

                    if (
                        !Array.isArray(
                            direction.stops
                        )
                    ) {
                        continue;
                    }


                    for (
                        const stop
                        of direction.stops
                    ) {

                        allStops.add(
                            String(stop)
                        );
                    }
                }

            } catch (error) {

                console.warn(
                    `Nepodařilo se načíst linku ${route.line}:`,
                    error
                );
            }
        }


        // Vymazání původních možností

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
                document.createElement(
                    "option"
                );


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


    // =========================================================
    // PROHOZENÍ ZASTÁVEK
    // =========================================================

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


    // =========================================================
    // DNEŠNÍ DATUM
    // =========================================================

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


    // =========================================================
    // TYP DNE
    // =========================================================

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

            date =
                new Date();
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


    // =========================================================
    // FORMÁTOVÁNÍ ČASU
    // =========================================================

    function formatTime(value) {

        if (!value) {
            return "";
        }


        const text =
            String(value);


        const parts =
            text.split(":");


        if (
            parts.length !== 2
        ) {
            return text;
        }


        return (
            String(parts[0]).padStart(2, "0") +
            ":" +
            String(parts[1]).padStart(2, "0")
        );
    }


    // =========================================================
    // VYTVOŘENÍ JEDNÉ ZASTÁVKY
    // =========================================================

    function createStopRow(
        stop,
        color
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
            formatTime(
                stop.time
            );


        row.appendChild(
            dot
        );

        row.appendChild(
            name
        );

        row.appendChild(
            time
        );


        return row;
    }


    // =========================================================
    // TLAČÍTKO PRO ZOBRAZENÍ ZASTÁVEK
    // =========================================================

    function addStopsToggle(
        card,
        stopsBox
    ) {

        stopsBox.style.display =
            "none";


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


        card.appendChild(
            stopsBox
        );


        card.appendChild(
            toggle
        );
    }


    // =========================================================
    // VYTVOŘENÍ PŘÍMÉHO SPOJE
    // =========================================================

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


        // =====================================================
        // HLAVIČKA
        // =====================================================

        const header =
            document.createElement(
                "div"
            );


        header.className =
            "resultHeader";


        header.style.backgroundColor =
            route.color;


        const icon =
            document.createElement(
                "span"
            );


        icon.className =
            "routeIcon";


        icon.textContent =
            route.icon || "🚌";


        const number =
            document.createElement(
                "span"
            );


        number.className =
            "routeNumber";


        number.textContent =
            connection.isShortTrip
                ? `${route.line} S`
                : route.line;


        header.appendChild(
            icon
        );


        header.appendChild(
            number
        );


        card.appendChild(
            header
        );


        // =====================================================
        // SMĚR
        // =====================================================

        const direction =
            document.createElement(
                "div"
            );


        direction.className =
            "routeDirection";


        direction.innerHTML =
            `<strong>Směr:</strong> `;


        const destination =
            document.createElement(
                "span"
            );


        destination.textContent =
            connection.destination ||
            connection.to;


        direction.appendChild(
            destination
        );


        card.appendChild(
            direction
        );


        // =====================================================
        // ČASY
        // =====================================================

        const main =
            document.createElement(
                "div"
            );


        main.className =
            "resultMain";


        const fromStop =
            document.createElement(
                "div"
            );


        fromStop.className =
            "mainStop";


        fromStop.innerHTML = `
            <div class="mainTime">
                ${formatTime(connection.departure)}
            </div>

            <div class="mainStopName">
                ${connection.from}
            </div>
        `;


        const arrow =
            document.createElement(
                "div"
            );


        arrow.className =
            "routeArrow";


        arrow.textContent =
            "→";


        const toStop =
            document.createElement(
                "div"
            );


        toStop.className =
            "mainStop";


        toStop.innerHTML = `
            <div class="mainTime">
                ${formatTime(connection.arrival)}
            </div>

            <div class="mainStopName">
                ${connection.to}
            </div>
        `;


        main.appendChild(
            fromStop
        );

        main.appendChild(
            arrow
        );

        main.appendChild(
            toStop
        );


        card.appendChild(
            main
        );


        // =====================================================
        // ZASTÁVKY
        // =====================================================

        const stopsBox =
            document.createElement(
                "div"
            );


        stopsBox.className =
            "resultStops";


        for (
            const stop
            of connection.stops || []
        ) {

            stopsBox.appendChild(
                createStopRow(
                    stop,
                    route.color
                )
            );
        }


        addStopsToggle(
            card,
            stopsBox
        );


        return card;
    }


    // =========================================================
    // VYTVOŘENÍ PŘESTUPNÍHO SPOJE
    // =========================================================

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
            "8px solid #777";


        // =====================================================
        // NADPIS
        // =====================================================

        const title =
            document.createElement(
                "div"
            );


        title.className =
            "transferTitle";


        title.textContent =
            "Přestupní spoj";


        card.appendChild(
            title
        );


        // =====================================================
        // HLAVNÍ ČASY
        // =====================================================

        const main =
            document.createElement(
                "div"
            );


        main.className =
            "resultMain";


        main.innerHTML = `
            <div class="mainStop">

                <div class="mainTime">
                    ${formatTime(connection.departure)}
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
                    ${formatTime(connection.arrival)}
                </div>

                <div class="mainStopName">
                    ${connection.to}
                </div>

            </div>
        `;


        card.appendChild(
            main
        );


        // =====================================================
        // JEDNOTLIVÉ ÚSEKY
        // =====================================================

        const legsBox =
            document.createElement(
                "div"
            );


        legsBox.className =
            "transferLegs";


        for (
            let i = 0;
            i < connection.legs.length;
            i++
        ) {

            const leg =
                connection.legs[i];


            const route =
                getRouteInfo(
                    leg.line
                );


            // -----------------------------------------------
            // ÚSEK
            // -----------------------------------------------

            const legBox =
                document.createElement(
                    "div"
                );


            legBox.className =
                "transferLeg";


            legBox.style.borderLeft =
                `5px solid ${route.color}`;


            // -----------------------------------------------
            // HLAVIČKA LINKY
            // -----------------------------------------------

            const legHeader =
                document.createElement(
                    "div"
                );


            legHeader.className =
                "transferLegHeader";


            const legIcon =
                document.createElement(
                    "span"
                );


            legIcon.textContent =
                route.icon || "🚌";


            const legLine =
                document.createElement(
                    "strong"
                );


            legLine.textContent =
                leg.isShortTrip
                    ? `${route.line} S`
                    : route.line;


            const legDirection =
                document.createElement(
                    "span"
                );


            legDirection.textContent =
                `Směr: ${
                    leg.destination ||
                    leg.to
                }`;


            legHeader.appendChild(
                legIcon
            );


            legHeader.appendChild(
                legLine
            );


            legHeader.appendChild(
                legDirection
            );


            legBox.appendChild(
                legHeader
            );


            // -----------------------------------------------
            // ČASY ÚSEKU
            // -----------------------------------------------

            const legTimes =
                document.createElement(
                    "div"
                );


            legTimes.className =
                "transferLegTimes";


            legTimes.innerHTML = `
                <strong>
                    ${formatTime(leg.departure)}
                </strong>

                →
                
                <strong>
                    ${formatTime(leg.arrival)}
                </strong>

                <span>
                    ${leg.from}
                    →
                    ${leg.to}
                </span>
            `;


            legBox.appendChild(
                legTimes
            );


            // -----------------------------------------------
            // ZASTÁVKY ÚSEKU
            // -----------------------------------------------

            const stopsBox =
                document.createElement(
                    "div"
                );


            stopsBox.className =
                "resultStops";


            for (
                const stop
                of leg.stops || []
            ) {

                stopsBox.appendChild(
                    createStopRow(
                        stop,
                        route.color
                    )
                );
            }


            addStopsToggle(
                legBox,
                stopsBox
            );


            // -----------------------------------------------
            // PŘESTUPNÍ ZASTÁVKA
            // -----------------------------------------------

            if (
                i <
                connection.legs.length - 1
            ) {

                const transfer =
                    document.createElement(
                        "div"
                    );


                transfer.className =
                    "transferStop";


                transfer.innerHTML = `
                    <strong>
                        Přestup:
                    </strong>
                    ${leg.to}
                `;


                legBox.appendChild(
                    transfer
                );
            }


            legsBox.appendChild(
                legBox
            );
        }


        card.appendChild(
            legsBox
        );


        return card;
    }


    // =========================================================
    // VYTVOŘENÍ VÝSLEDKU
    // =========================================================

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


    // =========================================================
    // VYHLEDÁVÁNÍ
    // =========================================================

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


            const mode =
                document.querySelector(
                    'input[name="mode"]:checked'
                )?.value ||
                "departure";


            // =================================================
            // KONTROLA ZASTÁVEK
            // =================================================

            if (
                !from ||
                !to
            ) {

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
                        <strong>
                            Výchozí a cílová zastávka
                            musí být rozdílné.
                        </strong>
                    </div>
                `;

                return;
            }


            // =================================================
            // KONTROLA, ŽE ZASTÁVKY EXISTUJÍ
            // =================================================

            if (
                stopsList
            ) {

                const knownStops =
                    [...stopsList.options]
                        .map(
                            option =>
                                option.value
                        );


                const fromExists =
                    knownStops.some(
                        stop =>
                            stop.toLowerCase() ===
                            from.toLowerCase()
                    );


                const toExists =
                    knownStops.some(
                        stop =>
                            stop.toLowerCase() ===
                            to.toLowerCase()
                    );


                if (
                    !fromExists ||
                    !toExists
                ) {

                    resultsContainer.innerHTML = `
                        <div class="resultCard">

                            <strong>
                                Zastávka nebyla nalezena.
                            </strong>

                            <p>
                                Zkontroluj název zastávky
                                nebo ji vyber z nabídky.
                            </p>

                        </div>
                    `;

                    return;
                }
            }


            // =================================================
            // NAČÍTÁNÍ
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
                    "Vyhledávání:",
                    {
                        from,
                        to,
                        afterTime,
                        dayType,
                        mode,
                        lineNumbers
                    }
                );


                // =================================================
                // SEARCH.JS
                // =================================================

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


                // =================================================
                // ŽÁDNÉ VÝSLEDKY
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
                                Zkus jiný čas nebo jiné datum.
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

                    const result =
                        createResult(
                            connection
                        );


                    resultsContainer.appendChild(
                        result
                    );
                }


                console.log(
                    "Nalezená spojení:",
                    connections
                );

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
