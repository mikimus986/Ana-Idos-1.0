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

        console.log(
            "ROUTES:",
            routes
        );

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


        stopsList.innerHTML =
            "";


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
            "Načteno zastávek:",
            sortedStops.length
        );
    }


    await loadAllStops();


    // =====================================================
    // PROHOZENÍ ZASTÁVEK
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


    // =====================================================
    // VYTVOŘENÍ MODRÉHO POLE LINKY
    // =====================================================

    function createHeader(
        line,
        destination,
        isShortTrip
    ) {

        const route =
            getRouteInfo(line);


        const header =
            document.createElement(
                "div"
            );

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
    // VYTVOŘENÍ ZASTÁVEK
    // =====================================================

    function createStops(
        stops,
        color
    ) {

        const stopsBox =
            document.createElement(
                "div"
            );

        stopsBox.className =
            "resultStops";

        stopsBox.style.display =
            "none";


        if (
            !Array.isArray(stops)
        ) {
            return {
                stopsBox,
                toggle: null
            };
        }


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


            // TEČKA

            const dot =
                document.createElement(
                    "span"
                );

            dot.className =
                "stopDot";

            dot.style.backgroundColor =
                color;


            // NÁZEV

            const name =
                document.createElement(
                    "span"
                );

            name.className =
                "stopName";

            name.textContent =
                stop.name;


            // ČAS

            const time =
                document.createElement(
                    "span"
                );

            time.className =
                "stopTime";

            time.textContent =
                stop.time;


            row.appendChild(dot);
            row.appendChild(name);
            row.appendChild(time);

            stopsBox.appendChild(row);
        }


        // TLAČÍTKO

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


        return {
            stopsBox,
            toggle
        };
    }


    // =====================================================
    // HLAVNÍ ČASY JEDNOHO ÚSEKU
    // =====================================================

    function createMainPart(
        leg
    ) {

        const main =
            document.createElement(
                "div"
            );

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
    // PŘESTUPNÍ INFORMACE
    // =====================================================

    function createTransferInfo(
        firstLeg,
        secondLeg
    ) {

        const transfer =
            document.createElement(
                "div"
            );

        transfer.className =
            "transferPart";


        const transferStop =
            firstLeg.to;


        const waitingMinutes =
            Math.max(
                0,
                secondLeg.departureMinutes -
                firstLeg.arrivalMinutes
            );


        transfer.innerHTML = `

            <div class="transferTitle">
                Přestup: ${transferStop}
            </div>

            <div class="transferStop">

                <span>
                    Čekání:
                </span>

                <strong>
                    ${waitingMinutes} min
                </strong>

            </div>

        `;


        return transfer;
    }


    // =====================================================
    // JEDEN ÚSEK PŘESTUPNÍHO SPOJE
    // =====================================================

    function createTransferLeg(
        leg
    ) {

        const route =
            getRouteInfo(
                leg.line
            );


        const part =
            document.createElement(
                "div"
            );

        part.className =
            "transferLeg";


        // MODRÉ POLE

        const header =
            createHeader(
                leg.line,
                leg.destination,
                leg.isShortTrip
            );

        part.appendChild(
            header
        );


        // ČASY

        const main =
            createMainPart(
                leg
            );

        part.appendChild(
            main
        );


        // ZASTÁVKY

        const stops =
            createStops(
                leg.stops,
                route.color
            );


        part.appendChild(
            stops.stopsBox
        );


        if (stops.toggle) {
            part.appendChild(
                stops.toggle
            );
        }


        return part;
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
            document.createElement(
                "div"
            );

        card.className =
            "resultCard";


        card.style.borderLeft =
            `8px solid ${route.color}`;


        // MODRÉ POLE

        const header =
            createHeader(
                connection.line,
                connection.destination,
                connection.isShortTrip
            );


        card.appendChild(
            header
        );


        // ČASY

        card.appendChild(
            createMainPart(
                connection
            )
        );


        // ZASTÁVKY

        const stops =
            createStops(
                connection.stops,
                route.color
            );


        card.appendChild(
            stops.stopsBox
        );


        if (stops.toggle) {

            card.appendChild(
                stops.toggle
            );
        }


        return card;
    }


    // =====================================================
    // PŘESTUPNÍ SPOJ
    // =====================================================

    function createTransferResult(
        connection
    ) {

        const legs =
            Array.isArray(
                connection.legs
            )
                ? connection.legs
                : [];


        if (
            legs.length < 2
        ) {

            console.warn(
                "Přestupní spoj nemá dostatek úseků:",
                connection
            );

            return createDirectResult(
                connection
            );
        }


        const firstLeg =
            legs[0];


        const card =
            document.createElement(
                "div"
            );

        card.className =
            "resultCard";


        const firstRoute =
            getRouteInfo(
                firstLeg.line
            );


        card.style.borderLeft =
            `8px solid ${firstRoute.color}`;


        // =================================================
        // ÚSEKY
        // =================================================

        for (
            let i = 0;
            i < legs.length;
            i++
        ) {

            const leg =
                legs[i];


            // Pokud to není první úsek,
            // vložíme nejdříve přestup.

            if (i > 0) {

                const previousLeg =
                    legs[i - 1];


                card.appendChild(
                    createTransferInfo(
                        previousLeg,
                        leg
                    )
                );
            }


            card.appendChild(
                createTransferLeg(
                    leg
                )
            );
        }


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
            "transfer" &&
            Array.isArray(
                connection.legs
            ) &&
            connection.legs.length >= 2
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


            // =================================================
            // REŽIM
            // =================================================

            const modeInput =
                document.querySelector(
                    'input[name="mode"]:checked'
                );


            const mode =
                modeInput
                    ? modeInput.value
                    : "departure";


            // =================================================
            // KONTROLA
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
                            String(
                                route.line
                            )
                    );


                console.log(
                    "VYHLEDÁVÁNÍ:",
                    {
                        from,
                        to,
                        afterTime,
                        dayType,
                        mode,
                        lineNumbers
                    }
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


                // =================================================
                // ŽÁDNÉ SPOJENÍ
                // =================================================

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
