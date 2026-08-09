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


    // =========================================================
    // KONTROLA
    // =========================================================

    if (
        !fromInput ||
        !toInput ||
        !searchButton ||
        !resultsContainer
    ) {
        console.error("Chybí HTML prvky.");
        return;
    }

    if (!window.searchTimetable) {
        console.error("search.js nebyl načten.");
        return;
    }


    // =========================================================
    // ROUTES.JSON
    // =========================================================

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

    } catch (error) {

        console.error(
            "Nelze načíst routes.json:",
            error
        );
    }


    // =========================================================
    // INFORMACE O LINCE
    // =========================================================

    function getRouteInfo(line) {

        const found =
            routes.find(route =>
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


    // =========================================================
    // NAČTENÍ ZASTÁVEK
    // =========================================================

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

                        if (
                            typeof stop === "string"
                        ) {
                            allStops.add(stop);
                        } else if (
                            stop &&
                            stop.name
                        ) {
                            allStops.add(stop.name);
                        }
                    }
                }

            } catch (error) {

                console.warn(
                    `Chyba linky ${route.line}:`,
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


    // =========================================================
    // PROHOZENÍ
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
    // DATUM
    // =========================================================

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

            date = new Date();
        }

        const day =
            date.getDay();

        return (
            day === 0 ||
            day === 6
        )
            ? "weekends"
            : "weekdays";
    }


    // =========================================================
    // ČAS
    // =========================================================

    function formatTime(value) {

        if (!value) {
            return "";
        }

        const text =
            String(value);

        const parts =
            text.split(":");

        if (parts.length !== 2) {
            return text;
        }

        return (
            String(parts[0]).padStart(2, "0") +
            ":" +
            String(parts[1]).padStart(2, "0")
        );
    }


    // =========================================================
    // MINUTY
    // =========================================================

    function timeToMinutes(time) {

        if (!time) {
            return 0;
        }

        const parts =
            String(time).split(":");

        return (
            Number(parts[0]) * 60 +
            Number(parts[1])
        );
    }


    // =========================================================
    // ZASTÁVKA
    // =========================================================

    function getStopName(stop) {

        if (
            typeof stop === "string"
        ) {
            return stop;
        }

        if (
            stop &&
            stop.name
        ) {
            return stop.name;
        }

        return "";
    }


    // =========================================================
    // NAJDI PRVNÍ SPOLEČNOU ZASTÁVKU
    // =========================================================

    function findFirstCommonStop(
        firstLeg,
        secondLeg
    ) {

        if (
            !Array.isArray(firstLeg.stops) ||
            !Array.isArray(secondLeg.stops)
        ) {
            return null;
        }


        const secondNames =
            new Set(
                secondLeg.stops.map(
                    stop =>
                        getStopName(stop)
                            .toLowerCase()
                )
            );


        /*
         * Jdeme od začátku první linky.
         *
         * První nalezená společná zastávka
         * je automaticky první použitelný
         * společný bod pro přestup.
         */

        for (
            let i = 0;
            i < firstLeg.stops.length;
            i++
        ) {

            const firstStop =
                firstLeg.stops[i];

            const firstName =
                getStopName(firstStop);

            if (!firstName) {
                continue;
            }

            if (
                secondNames.has(
                    firstName.toLowerCase()
                )
            ) {

                const secondIndex =
                    secondLeg.stops.findIndex(
                        stop =>
                            getStopName(stop)
                                .toLowerCase() ===
                            firstName.toLowerCase()
                    );


                if (
                    secondIndex === -1
                ) {
                    continue;
                }


                return {
                    name: firstName,
                    firstIndex: i,
                    secondIndex: secondIndex
                };
            }
        }


        return null;
    }


    // =========================================================
    // UPRAV PŘESTUP NA PRVNÍ SPOLEČNOU ZASTÁVKU
    // =========================================================

    function normalizeTransfer(
        connection
    ) {

        if (
            !connection ||
            connection.type !== "transfer" ||
            !Array.isArray(connection.legs) ||
            connection.legs.length < 2
        ) {
            return connection;
        }


        /*
         * Pro jednoduchý přestup máme
         * první a druhou linku.
         */

        const firstLeg =
            connection.legs[0];

        const secondLeg =
            connection.legs[1];


        const common =
            findFirstCommonStop(
                firstLeg,
                secondLeg
            );


        if (!common) {
            return connection;
        }


        const firstStop =
            firstLeg.stops[
                common.firstIndex
            ];


        const secondStop =
            secondLeg.stops[
                common.secondIndex
            ];


        const transferTime =
            getStopName(firstStop);


        /*
         * První linka končí v místě přestupu.
         */

        firstLeg.to =
            transferTime;


        firstLeg.arrival =
            firstStop.time;


        /*
         * Druhá linka začíná v místě přestupu.
         */

        secondLeg.from =
            transferTime;


        secondLeg.departure =
            secondStop.time;


        connection.transferStop =
            transferTime;


        /*
         * Začátek a konec celého spojení
         */

        connection.from =
            firstLeg.from;

        connection.to =
            secondLeg.to;

        connection.departure =
            firstLeg.departure;

        connection.arrival =
            secondLeg.arrival;


        return connection;
    }


    // =========================================================
    // ODSTRANĚNÍ DUPLICITNÍCH PŘESTUPŮ
    // =========================================================

    function removeDuplicateTransfers(
        connections
    ) {

        const result = [];

        const seen = new Set();


        for (
            const connection
            of connections
        ) {

            if (
                connection.type !==
                "transfer"
            ) {

                result.push(
                    connection
                );

                continue;
            }


            if (
                !connection.legs ||
                connection.legs.length < 2
            ) {

                continue;
            }


            const first =
                connection.legs[0];

            const second =
                connection.legs[1];


            /*
             * Spoje se stejným:
             *
             * první linka
             * druhá linka
             * odjezd
             * příjezd
             * první společná zastávka
             *
             * jsou pouze jeden výsledek.
             */

            const key = [
                first.line,
                second.line,
                first.departure,
                second.arrival,
                connection.transferStop
            ].join("|");


            if (
                seen.has(key)
            ) {
                continue;
            }


            seen.add(key);

            result.push(
                connection
            );
        }


        return result;
    }


    // =========================================================
    // ZASTÁVKOVÝ ŘÁDEK
    // =========================================================

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
            getStopName(stop);


        const time =
            document.createElement("span");

        time.className =
            "stopTime";

        time.textContent =
            formatTime(
                stop.time
            );


        row.appendChild(dot);
        row.appendChild(name);
        row.appendChild(time);


        return row;
    }


    // =========================================================
    // ROZBALENÍ ZASTÁVEK
    // =========================================================

    function addStopsToggle(
        card,
        stopsBox
    ) {

        stopsBox.style.display =
            "none";


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
            stopsBox
        );

        card.appendChild(
            toggle
        );
    }


    // =========================================================
    // PŘÍMÝ SPOJ
    // =========================================================

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


        // -------------------------------
        // HLAVIČKA
        // -------------------------------

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
            route.icon || "🚌";


        const line =
            document.createElement("span");

        line.className =
            "routeNumber";

        line.textContent =
            connection.isShortTrip
                ? `${route.line} S`
                : route.line;


        header.appendChild(icon);
        header.appendChild(line);


        card.appendChild(header);


        // -------------------------------
        // SMĚR
        // -------------------------------

        const direction =
            document.createElement("div");

        direction.className =
            "routeDirection";

        direction.innerHTML =
            `<strong>Směr:</strong> `;


        const destination =
            document.createElement("span");

        destination.textContent =
            connection.destination ||
            connection.to;


        direction.appendChild(
            destination
        );


        card.appendChild(
            direction
        );


        // -------------------------------
        // ČASY
        // -------------------------------

        const main =
            document.createElement("div");

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


        card.appendChild(main);


        // -------------------------------
        // ZASTÁVKY
        // -------------------------------

        const stopsBox =
            document.createElement("div");

        stopsBox.className =
            "resultStops";


        const fromIndex =
            connection.stops
                ? connection.stops.findIndex(
                    stop =>
                        getStopName(stop) ===
                        connection.from
                )
                : -1;


        const toIndex =
            connection.stops
                ? connection.stops.findIndex(
                    stop =>
                        getStopName(stop) ===
                        connection.to
                )
                : -1;


        if (
            fromIndex !== -1 &&
            toIndex !== -1
        ) {

            const start =
                Math.min(
                    fromIndex,
                    toIndex
                );

            const end =
                Math.max(
                    fromIndex,
                    toIndex
                );


            for (
                let i = start;
                i <= end;
                i++
            ) {

                stopsBox.appendChild(
                    createStopRow(
                        connection.stops[i],
                        route.color
                    )
                );
            }

        } else {

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
        }


        addStopsToggle(
            card,
            stopsBox
        );


        return card;
    }


    // =========================================================
    // PŘESTUPNÍ SPOJ
    // STEJNÝ DESIGN JAKO PŘÍMÝ SPOJ
    // =========================================================

    function createTransferResult(
        connection
    ) {

        const firstLeg =
            connection.legs[0];

        const secondLeg =
            connection.legs[1];


        const firstRoute =
            getRouteInfo(
                firstLeg.line
            );

        const secondRoute =
            getRouteInfo(
                secondLeg.line
            );


        const card =
            document.createElement("div");

        card.className =
            "resultCard";


        /*
         * Barva první linky.
         */

        card.style.borderLeft =
            `8px solid ${firstRoute.color}`;


        // =====================================================
        // HLAVIČKA
        // =====================================================

        const header =
            document.createElement("div");

        header.className =
            "resultHeader";


        header.style.background =
            `linear-gradient(
                90deg,
                ${firstRoute.color} 0%,
                ${firstRoute.color} 50%,
                ${secondRoute.color} 50%,
                ${secondRoute.color} 100%
            )`;


        const firstIcon =
            document.createElement("span");

        firstIcon.className =
            "routeIcon";

        firstIcon.textContent =
            firstRoute.icon || "🚌";


        const firstLine =
            document.createElement("span");

        firstLine.className =
            "routeNumber";

        firstLine.textContent =
            firstLeg.isShortTrip
                ? `${firstRoute.line} S`
                : firstRoute.line;


        const separator =
            document.createElement("span");

        separator.textContent =
            " → ";


        const secondIcon =
            document.createElement("span");

        secondIcon.className =
            "routeIcon";

        secondIcon.textContent =
            secondRoute.icon || "🚌";


        const secondLine =
            document.createElement("span");

        secondLine.className =
            "routeNumber";

        secondLine.textContent =
            secondLeg.isShortTrip
                ? `${secondRoute.line} S`
                : secondRoute.line;


        header.appendChild(firstIcon);
        header.appendChild(firstLine);
        header.appendChild(separator);
        header.appendChild(secondIcon);
        header.appendChild(secondLine);


        card.appendChild(header);


        // =====================================================
        // SMĚR
        // =====================================================

        const direction =
            document.createElement("div");

        direction.className =
            "routeDirection";


        direction.innerHTML = `
            <strong>Směr:</strong>
            ${firstLeg.destination || firstLeg.to}
            →
            ${secondLeg.destination || secondLeg.to}
        `;


        card.appendChild(
            direction
        );


        // =====================================================
        // ČASY
        // =====================================================

        const main =
            document.createElement("div");

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
        // PŘESTUP
        // =====================================================

        const transfer =
            document.createElement("div");

        transfer.className =
            "transferStop";


        transfer.innerHTML = `
            <strong>Přestup:</strong>
            ${connection.transferStop}
        `;


        card.appendChild(
            transfer
        );


        // =====================================================
        // ZASTÁVKY
        // =====================================================

        const stopsBox =
            document.createElement("div");

        stopsBox.className =
            "resultStops";


        // -----------------------------------------------------
        // 1. LINKA
        // -----------------------------------------------------

        const firstTitle =
            document.createElement("div");

        firstTitle.className =
            "transferSectionTitle";

        firstTitle.innerHTML = `
            ${firstRoute.icon}
            <strong>
                Linka ${firstRoute.line}
            </strong>
            –
            ${firstLeg.destination || firstLeg.to}
        `;


        stopsBox.appendChild(
            firstTitle
        );


        for (
            const stop
            of firstLeg.stops || []
        ) {

            const name =
                getStopName(stop);


            /*
             * U první linky zobrazíme pouze
             * úsek od začátku po přestup.
             */

            if (
                name ===
                connection.transferStop
            ) {

                stopsBox.appendChild(
                    createStopRow(
                        stop,
                        firstRoute.color
                    )
                );

                break;
            }


            stopsBox.appendChild(
                createStopRow(
                    stop,
                    firstRoute.color
                )
            );
        }


        // -----------------------------------------------------
        // 2. LINKA
        // -----------------------------------------------------

        const secondTitle =
            document.createElement("div");

        secondTitle.className =
            "transferSectionTitle";


        secondTitle.innerHTML = `
            ${secondRoute.icon}
            <strong>
                Linka ${secondRoute.line}
            </strong>
            –
            ${secondLeg.destination || secondLeg.to}
        `;


        stopsBox.appendChild(
            secondTitle
        );


        let secondStarted =
            false;


        for (
            const stop
            of secondLeg.stops || []
        ) {

            const name =
                getStopName(stop);


            if (
                !secondStarted &&
                name.toLowerCase() !==
                String(
                    connection.transferStop
                ).toLowerCase()
            ) {
                continue;
            }


            secondStarted =
                true;


            stopsBox.appendChild(
                createStopRow(
                    stop,
                    secondRoute.color
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


            // -------------------------------------------------
            // KONTROLA
            // -------------------------------------------------

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


            // -------------------------------------------------
            // NAČÍTÁNÍ
            // -------------------------------------------------

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


                let connections =
                    await window.searchTimetable.findConnections(
                        from,
                        to,
                        afterTime,
                        dayType,
                        lineNumbers,
                        mode
                    );


                // =================================================
                // PŘESTUPY → PRVNÍ SPOLEČNÁ ZASTÁVKA
                // =================================================

                connections =
                    connections.map(
                        connection => {

                            if (
                                connection.type ===
                                "transfer"
                            ) {

                                return normalizeTransfer(
                                    connection
                                );
                            }

                            return connection;
                        }
                    );


                // =================================================
                // ODSTRANĚNÍ DUPLIKÁTŮ
                // =================================================

                connections =
                    removeDuplicateTransfers(
                        connections
                    );


                // =================================================
                // PŘÍMÉ SPOJENÍ MÁ PŘEDNOST
                // =================================================

                const direct =
                    connections.filter(
                        connection =>
                            connection.type !==
                            "transfer"
                    );


                const transfers =
                    connections.filter(
                        connection =>
                            connection.type ===
                            "transfer"
                    );


                /*
                 * Pokud existuje přímé spojení,
                 * přestupy se zde NEZOBRAZÍ.
                 *
                 * Pokud search.js později označí
                 * přestup jako rychlejší,
                 * může ho ponechat.
                 */

                if (
                    direct.length > 0
                ) {

                    const fastestDirect =
                        Math.min(
                            ...direct.map(
                                connection =>
                                    timeToMinutes(
                                        connection.arrival
                                    ) -
                                    timeToMinutes(
                                        connection.departure
                                    )
                            )
                        );


                    const fasterTransfers =
                        transfers.filter(
                            connection => {

                                const duration =
                                    timeToMinutes(
                                        connection.arrival
                                    ) -
                                    timeToMinutes(
                                        connection.departure
                                    );


                                return (
                                    duration <
                                    fastestDirect
                                );
                            }
                        );


                    connections =
                        [
                            ...direct,
                            ...fasterTransfers
                        ];
                }


                // =================================================
                // ŘAZENÍ PODLE ODJEZDU
                // =================================================

                connections.sort(
                    (a, b) =>
                        timeToMinutes(
                            a.departure
                        ) -
                        timeToMinutes(
                            b.departure
                        )
                );


                resultsContainer.innerHTML =
                    "";


                // =================================================
                // NIC NENALEZENO
                // =================================================

                if (
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

                        </div>
                    `;

                    return;
                }


                // =================================================
                // VYKRESLENÍ
                // =================================================

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
