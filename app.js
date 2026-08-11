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
    // ROUTES
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
    // VŠECHNY ZASTÁVKY
    // =====================================================

    async function loadAllStops() {

        if (!stopsList) {
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


        for (const stop of sortedStops) {

            const option =
                document.createElement("option");

            option.value =
                stop;

            stopsList.appendChild(option);
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
    // DATUM
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
    // MINUTY
    // =====================================================

    function timeToMinutes(time) {

        if (!time) {
            return 0;
        }

        const parts =
            String(time).split(":");

        if (parts.length !== 2) {
            return 0;
        }

        return (
            Number(parts[0]) * 60 +
            Number(parts[1])
        );
    }


    // =====================================================
    // VYTVOŘENÍ MODRÉHO POLE LINKY
    // =====================================================

    function createRouteHeader(
        line,
        destination
    ) {

        const route =
            getRouteInfo(line);


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


        const number =
            document.createElement("span");

        number.className =
            "routeNumber";

        number.textContent =
            `${route.line} → ${destination}`;


        header.appendChild(icon);
        header.appendChild(number);


        return header;
    }


    // =====================================================
    // VYTVOŘENÍ JEDNÉ ČÁSTI SPOJE
    // =====================================================

    function createTripPart(
        connection
    ) {

        const wrapper =
            document.createElement("div");

        wrapper.className =
            "transferPart";


        // -------------------------------------------------
        // HLAVIČKA
        // -------------------------------------------------

        wrapper.appendChild(
            createRouteHeader(
                connection.line,
                connection.destination
            )
        );


        // -------------------------------------------------
        // ČASY
        // -------------------------------------------------

        const main =
            document.createElement("div");

        main.className =
            "resultMain";


        const fromStop =
            document.createElement("div");

        fromStop.className =
            "mainStop";


        const departure =
            document.createElement("div");

        departure.className =
            "mainTime";

        departure.textContent =
            connection.departure;


        const fromName =
            document.createElement("div");

        fromName.className =
            "mainStopName";

        fromName.textContent =
            connection.from;


        fromStop.appendChild(
            departure
        );

        fromStop.appendChild(
            fromName
        );


        const arrow =
            document.createElement("div");

        arrow.className =
            "routeArrow";

        arrow.textContent =
            "→";


        const toStop =
            document.createElement("div");

        toStop.className =
            "mainStop";


        const arrival =
            document.createElement("div");

        arrival.className =
            "mainTime";

        arrival.textContent =
            connection.arrival;


        const toName =
            document.createElement("div");

        toName.className =
            "mainStopName";

        toName.textContent =
            connection.to;


        toStop.appendChild(
            arrival
        );

        toStop.appendChild(
            toName
        );


        main.appendChild(
            fromStop
        );

        main.appendChild(
            arrow
        );

        main.appendChild(
            toStop
        );


        wrapper.appendChild(
            main
        );


        // -------------------------------------------------
        // ZASTÁVKY
        // -------------------------------------------------

        const stopsBox =
            document.createElement("div");

        stopsBox.className =
            "resultStops";

        stopsBox.style.display =
            "none";


        if (
            Array.isArray(
                connection.stops
            )
        ) {

            for (
                const stop
                of connection.stops
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
                    getRouteInfo(
                        connection.line
                    ).color;


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


                stopsBox.appendChild(
                    row
                );
            }
        }


        wrapper.appendChild(
            stopsBox
        );


        // -------------------------------------------------
        // TLAČÍTKO
        // -------------------------------------------------

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


        wrapper.appendChild(
            toggle
        );


        return wrapper;
    }


    // =====================================================
    // PŘESTUPOVÁ ŠIPKA
    // =====================================================

    function createTransferInfo(
        transfer
    ) {

        const box =
            document.createElement("div");

        box.className =
            "transferStop";


        const title =
            document.createElement("div");

        title.style.fontWeight =
            "700";

        title.style.fontSize =
            "15px";

        title.textContent =
            `Přestup: ${transfer.stop}`;


        const waiting =
            document.createElement("div");

        waiting.style.marginTop =
            "5px";

        waiting.textContent =
            `Čekání ${transfer.waiting} min`;


        box.appendChild(
            title
        );

        box.appendChild(
            waiting
        );


        // šipka
        const arrow =
            document.createElement("div");

        arrow.style.textAlign =
            "center";

        arrow.style.fontSize =
            "25px";

        arrow.style.lineHeight =
            "30px";

        arrow.textContent =
            "↓";


        const wrapper =
            document.createElement("div");

        wrapper.className =
            "transferPart";


        wrapper.appendChild(
            box
        );

        wrapper.appendChild(
            arrow
        );


        return wrapper;
    }


    // =====================================================
    // PŘÍMÝ SPOJ
    // =====================================================

    function createDirectResult(
        connection
    ) {

        const card =
            document.createElement("div");

        card.className =
            "resultCard";


        const route =
            getRouteInfo(
                connection.line
            );


        card.style.borderLeft =
            `8px solid ${route.color}`;


        card.appendChild(
            createTripPart(
                connection
            )
        );


        return card;
    }


    // =====================================================
    // PŘESTUPNÍ SPOJ
    // =====================================================

    function createTransferResult(
        connection
    ) {

        const card =
            document.createElement("div");

        card.className =
            "resultCard";


        // -------------------------------------------------
        // PRVNÍ ČÁST
        // -------------------------------------------------

        const first =
            connection.first ||
            connection.legs?.[0];


        const second =
            connection.second ||
            connection.legs?.[1];


        if (!first || !second) {

            console.warn(
                "Přestupní spoj nemá first/second:",
                connection
            );

            return createDirectResult(
                connection
            );
        }


        const firstRoute =
            getRouteInfo(
                first.line
            );


        card.style.borderLeft =
            `8px solid ${firstRoute.color}`;


        card.appendChild(
            createTripPart(
                first
            )
        );


        // -------------------------------------------------
        // PŘESTUP
        // -------------------------------------------------

        let transferStop =
            connection.transferStop ||
            connection.transfer?.stop ||
            first.to ||
            second.from;


        let waiting =
            connection.waiting;


        if (
            waiting === undefined ||
            waiting === null
        ) {

            waiting =
                timeToMinutes(
                    second.departure
                ) -
                timeToMinutes(
                    first.arrival
                );
        }


        card.appendChild(
            createTransferInfo({
                stop:
                    transferStop,

                waiting:
                    waiting
            })
        );


        // -------------------------------------------------
        // DRUHÁ ČÁST
        // -------------------------------------------------

        card.appendChild(
            createTripPart(
                second
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

        /*
         * Přestup může search.js vracet
         * jako:
         *
         * type: "transfer"
         *
         * nebo:
         *
         * type: "connection"
         *
         * s first/second
         *
         * nebo:
         *
         * legs: [ první, druhý ]
         */

        if (
            connection.type === "transfer" ||
            connection.type === "connection" ||
            Array.isArray(
                connection.legs
            ) ||
            connection.first ||
            connection.second
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


            // -------------------------------------------------
            // REŽIM
            // -------------------------------------------------

            const selectedMode =
                document.querySelector(
                    'input[name="mode"]:checked'
                );


            const mode =
                selectedMode
                    ? selectedMode.value
                    : "departure";


            // -------------------------------------------------
            // KONTROLA
            // -------------------------------------------------

            if (!from || !to) {

                resultsContainer.innerHTML = `
                    <div class="resultCard">

                        <div class="departureTime">
                            Vyhledávání
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


            // -------------------------------------------------
            // NAČÍTÁNÍ
            // -------------------------------------------------

            resultsContainer.innerHTML = `
                <div class="resultCard">

                    <div class="departureTime">
                        Vyhledávám spojení…
                    </div>

                    <p>
                        ${from} → ${to}
                    </p>

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


                const connections =
                    await window.searchTimetable.findConnections(
                        from,
                        to,
                        afterTime,
                        dayType,
                        lineNumbers,
                        mode
                    );


                resultsContainer.innerHTML =
                    "";


                // -------------------------------------------------
                // ŽÁDNÉ SPOJENÍ
                // -------------------------------------------------

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
                                Z ${from} do ${to}
                                nebylo nalezeno žádné
                                vhodné spojení.
                            </p>

                        </div>
                    `;

                    return;
                }


                // -------------------------------------------------
                // ODSTRANĚNÍ DUPLICITNÍCH
                // -------------------------------------------------

                const unique =
                    [];

                const seen =
                    new Set();


                for (
                    const connection
                    of connections
                ) {

                    let key;


                    if (
                        connection.type ===
                            "transfer" ||
                        connection.type ===
                            "connection" ||
                        connection.first ||
                        connection.second ||
                        Array.isArray(
                            connection.legs
                        )
                    ) {

                        const first =
                            connection.first ||
                            connection.legs?.[0];

                        const second =
                            connection.second ||
                            connection.legs?.[1];


                        key = [
                            "transfer",

                            first?.line,

                            first?.departure,

                            first?.arrival,

                            second?.line,

                            second?.departure,

                            second?.arrival,

                            connection.transferStop ||
                            connection.transfer?.stop ||
                            first?.to ||
                            second?.from
                        ].join("|");

                    } else {

                        key = [
                            "direct",

                            connection.line,

                            connection.departure,

                            connection.arrival
                        ].join("|");
                    }


                    if (
                        seen.has(key)
                    ) {
                        continue;
                    }


                    seen.add(key);

                    unique.push(
                        connection
                    );
                }


                // -------------------------------------------------
                // SEŘAZENÍ
                // -------------------------------------------------

                unique.sort(
                    (a, b) => {

                        function getDeparture(
                            connection
                        ) {

                            const first =
                                connection.first ||
                                connection.legs?.[0];

                            return timeToMinutes(
                                first
                                    ? first.departure
                                    : connection.departure
                            );
                        }


                        return (
                            getDeparture(a) -
                            getDeparture(b)
                        );
                    }
                );


                // -------------------------------------------------
                // VYKRESLENÍ
                // -------------------------------------------------

                for (
                    const connection
                    of unique
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
